import * as THREE from 'three';

// A leaf subdivides once it holds more than this many items — small enough
// that a leaf's linear item scan stays cheap, large enough to avoid
// pointlessly deep trees for lightly-populated regions.
const DEFAULT_MAX_ITEMS_PER_NODE = 8;

// Caps subdivision at 8^8 ≈ 16M leaf cells in the finest level, comfortably
// covering the "millions of datums" charts this backs without unbounded recursion.
const DEFAULT_MAX_DEPTH = 8;

/**
 * One node of the tree: either a leaf (holds items directly) or an internal
 * node (holds exactly 8 children, one per octant, and no items of its own).
 */
class OctreeNode {
  /** @param {THREE.Box3} bounds */
  constructor(bounds) {
    /** @type {THREE.Box3} */
    this.bounds = bounds;
    /** @type {THREE.Vector3} cached so childFor() doesn't recompute it per insert */
    this.center = bounds.getCenter(new THREE.Vector3());
    /** @type {OctreeNode[]|null} exactly 8 entries once subdivided, else null */
    this.children = null;
    /** @type {{id: string|number, position: THREE.Vector3, radius: number}[]} only populated on leaves */
    this.items = [];
    /**
     * Largest radius of any item in this node's subtree — a monotonically
     * growing high-water mark (never shrunk on remove; over-inclusive is
     * safe, it just costs a slightly wider prune test). Query pruning
     * expands this node's bounds by this amount before testing, so an
     * item whose sphere straddles a cell boundary is never silently missed.
     * @type {number}
     */
    this.maxRadius = 0;
  }
}

/**
 * Spatial index over id → (position, radius) entries, for fast
 * frustum/ray/radius/AABB queries on instanced data — the shared backbone
 * for both picking and frustum culling on charts with millions of datums.
 *
 * Queries return candidate ids whose bounding sphere intersects the query
 * shape; callers do their own precise hit-testing (e.g. a real raycast)
 * against just those candidates instead of every datum.
 *
 * @example
 * const octree = new Octree({ bounds: new THREE.Box3(new THREE.Vector3(-50,-50,-50), new THREE.Vector3(50,50,50)) });
 * octree.insert(0, new THREE.Vector3(1, 2, 3), 0.5);
 * const hits = octree.queryRay(raycaster.ray);
 * octree.remove(0);
 */
export class Octree {
  /** @type {OctreeNode} */
  #root;

  /** @type {Map<string|number, OctreeNode>} id → the leaf node currently holding it */
  #idToNode = new Map();

  /** @type {number} */
  #maxItemsPerNode;

  /** @type {number} */
  #maxDepth;

  /** @type {THREE.Sphere} scratch reused across item tests within a single query call */
  #sphereScratch = new THREE.Sphere();

  /**
   * @param {{ bounds: THREE.Box3, maxItemsPerNode?: number, maxDepth?: number }} options
   * @throws {TypeError} If `bounds` is not a `THREE.Box3`.
   * @throws {TypeError} If `maxItemsPerNode` or `maxDepth` is not a positive integer.
   * @example new Octree({ bounds: new THREE.Box3(min, max) });
   */
  constructor({ bounds, maxItemsPerNode = DEFAULT_MAX_ITEMS_PER_NODE, maxDepth = DEFAULT_MAX_DEPTH } = {}) {
    if (!(bounds instanceof THREE.Box3)) {
      throw new TypeError('Octree: bounds must be a THREE.Box3 instance.');
    }
    if (!Number.isInteger(maxItemsPerNode) || maxItemsPerNode < 1) {
      throw new TypeError(
        `Octree: maxItemsPerNode must be a positive integer, received ${JSON.stringify(maxItemsPerNode)}.`,
      );
    }
    if (!Number.isInteger(maxDepth) || maxDepth < 1) {
      throw new TypeError(`Octree: maxDepth must be a positive integer, received ${JSON.stringify(maxDepth)}.`);
    }
    this.#maxItemsPerNode = maxItemsPerNode;
    this.#maxDepth = maxDepth;
    this.#root = new OctreeNode(bounds.clone());
  }

  // ── Mutation ───────────────────────────────────────────────────────────────

  /**
   * Insert an item. `id` must not already be present.
   * @param {string|number} id
   * @param {THREE.Vector3} position
   * @param {number} [radius=0] - Bounding-sphere radius used by queries.
   * @throws {TypeError} If `id` is not a string/number, `position` is not a
   *   `THREE.Vector3`, or `radius` is not a finite number >= 0.
   * @throws {Error} If `id` is already present.
   * @example octree.insert(42, new THREE.Vector3(1, 2, 3), 0.5);
   */
  insert(id, position, radius = 0) {
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new TypeError(`Octree.insert: id must be a string or number, received ${JSON.stringify(id)}.`);
    }
    if (!(position instanceof THREE.Vector3)) {
      throw new TypeError('Octree.insert: position must be a THREE.Vector3 instance.');
    }
    if (typeof radius !== 'number' || !Number.isFinite(radius) || radius < 0) {
      throw new TypeError(
        `Octree.insert: radius must be a finite number >= 0, received ${JSON.stringify(radius)}.`,
      );
    }
    if (this.#idToNode.has(id)) {
      throw new Error(`Octree.insert: id '${id}' already exists — remove() it first.`);
    }
    this.#insertInto(this.#root, { id, position: position.clone(), radius }, 0);
  }

  /**
   * Remove a previously inserted item.
   * @param {string|number} id
   * @throws {Error} If no item with `id` is present.
   * @example octree.remove(42);
   */
  remove(id) {
    const node = this.#idToNode.get(id);
    if (!node) {
      throw new Error(`Octree.remove: no item with id '${id}' found.`);
    }
    const index = node.items.findIndex((item) => item.id === id);
    node.items.splice(index, 1);
    this.#idToNode.delete(id);
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /**
   * @param {THREE.Frustum} frustum
   * @returns {Array<string|number>} ids whose bounding sphere intersects the frustum.
   * @throws {TypeError} If `frustum` is not a `THREE.Frustum`.
   * @example octree.queryFrustum(camera.frustum);
   */
  queryFrustum(frustum) {
    if (!(frustum instanceof THREE.Frustum)) {
      throw new TypeError('Octree.queryFrustum: frustum must be a THREE.Frustum instance.');
    }
    return this.#query(
      (box) => frustum.intersectsBox(box),
      (sphere) => frustum.intersectsSphere(sphere),
    );
  }

  /**
   * @param {THREE.Ray} ray
   * @returns {Array<string|number>} ids whose bounding sphere the ray intersects.
   * @throws {TypeError} If `ray` is not a `THREE.Ray`.
   * @example octree.queryRay(raycaster.ray);
   */
  queryRay(ray) {
    if (!(ray instanceof THREE.Ray)) {
      throw new TypeError('Octree.queryRay: ray must be a THREE.Ray instance.');
    }
    return this.#query(
      (box) => ray.intersectsBox(box),
      (sphere) => ray.intersectsSphere(sphere),
    );
  }

  /**
   * @param {THREE.Vector3} point
   * @param {number} radius
   * @returns {Array<string|number>} ids whose bounding sphere intersects the query sphere.
   * @throws {TypeError} If `point` is not a `THREE.Vector3`, or `radius` is not a finite number >= 0.
   * @example octree.queryRadius(new THREE.Vector3(0, 0, 0), 10);
   */
  queryRadius(point, radius) {
    if (!(point instanceof THREE.Vector3)) {
      throw new TypeError('Octree.queryRadius: point must be a THREE.Vector3 instance.');
    }
    if (typeof radius !== 'number' || !Number.isFinite(radius) || radius < 0) {
      throw new TypeError(
        `Octree.queryRadius: radius must be a finite number >= 0, received ${JSON.stringify(radius)}.`,
      );
    }
    const querySphere = new THREE.Sphere(point, radius);
    return this.#query(
      (box) => querySphere.intersectsBox(box),
      (sphere) => querySphere.intersectsSphere(sphere),
    );
  }

  /**
   * @param {THREE.Box3} box
   * @returns {Array<string|number>} ids whose bounding sphere intersects the box.
   * @throws {TypeError} If `box` is not a `THREE.Box3`.
   * @example octree.queryAABB(new THREE.Box3(min, max));
   */
  queryAABB(box) {
    if (!(box instanceof THREE.Box3)) {
      throw new TypeError('Octree.queryAABB: box must be a THREE.Box3 instance.');
    }
    return this.#query(
      (testBox) => box.intersectsBox(testBox),
      (sphere) => box.intersectsSphere(sphere),
    );
  }

  /**
   * Flat dump of every node in the tree — depth, bounds, and leaf item
   * count — for debug visualization only (`Graph3D.devtools.octreeDebugOverlay`,
   * Prompt 178). Not read by any query path.
   * @returns {{bounds: THREE.Box3, depth: number, itemCount: number, isLeaf: boolean}[]}
   * @example octree.dumpBounds().filter((node) => node.isLeaf && node.itemCount > 0);
   */
  dumpBounds() {
    const result = [];
    this.#collectBounds(this.#root, 0, result);
    return result;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * @param {OctreeNode} node @param {{id, position, radius}} item @param {number} depth
   */
  #insertInto(node, item, depth) {
    node.maxRadius = Math.max(node.maxRadius, item.radius);
    if (node.children === null) {
      node.items.push(item);
      this.#idToNode.set(item.id, node);
      if (node.items.length > this.#maxItemsPerNode && depth < this.#maxDepth) {
        this.#subdivide(node, depth);
      }
      return;
    }
    this.#insertInto(this.#childFor(node, item.position), item, depth + 1);
  }

  /** @param {OctreeNode} node @param {number} depth */
  #subdivide(node, depth) {
    node.children = this.#makeOctants(node.bounds);
    const items = node.items;
    node.items = [];
    for (const item of items) {
      this.#insertInto(this.#childFor(node, item.position), item, depth + 1);
    }
  }

  /** @param {OctreeNode} node @param {number} depth @param {Array} result */
  #collectBounds(node, depth, result) {
    const isLeaf = node.children === null;
    result.push({ bounds: node.bounds.clone(), depth, itemCount: isLeaf ? node.items.length : 0, isLeaf });
    if (!isLeaf) {
      for (const child of node.children) this.#collectBounds(child, depth + 1, result);
    }
  }

  /** @param {THREE.Box3} bounds @returns {OctreeNode[]} */
  #makeOctants(bounds) {
    const { min, max } = bounds;
    const center = bounds.getCenter(new THREE.Vector3());
    const octants = new Array(8);
    for (let i = 0; i < 8; i++) {
      const octantMin = new THREE.Vector3(
        i & 1 ? center.x : min.x,
        i & 2 ? center.y : min.y,
        i & 4 ? center.z : min.z,
      );
      const octantMax = new THREE.Vector3(
        i & 1 ? max.x : center.x,
        i & 2 ? max.y : center.y,
        i & 4 ? max.z : center.z,
      );
      octants[i] = new OctreeNode(new THREE.Box3(octantMin, octantMax));
    }
    return octants;
  }

  /** @param {OctreeNode} node @param {THREE.Vector3} position @returns {OctreeNode} */
  #childFor(node, position) {
    let index = 0;
    if (position.x >= node.center.x) index |= 1;
    if (position.y >= node.center.y) index |= 2;
    if (position.z >= node.center.z) index |= 4;
    return node.children[index];
  }

  /**
   * Shared traversal: prunes any subtree whose radius-expanded bounds the
   * query shape doesn't touch, then item-tests every candidate in the
   * leaves that remain.
   * @param {(box: THREE.Box3) => boolean} boxTest
   * @param {(sphere: THREE.Sphere) => boolean} sphereTest
   * @returns {Array<string|number>}
   */
  #query(boxTest, sphereTest) {
    const results = [];
    this.#collect(this.#root, boxTest, sphereTest, results);
    return results;
  }

  /**
   * @param {OctreeNode} node @param {(box: THREE.Box3) => boolean} boxTest
   * @param {(sphere: THREE.Sphere) => boolean} sphereTest @param {Array<string|number>} results
   */
  #collect(node, boxTest, sphereTest, results) {
    const expanded = node.bounds.clone().expandByScalar(node.maxRadius);
    if (!boxTest(expanded)) return;

    if (node.children === null) {
      for (const item of node.items) {
        this.#sphereScratch.set(item.position, item.radius);
        if (sphereTest(this.#sphereScratch)) results.push(item.id);
      }
      return;
    }
    for (const child of node.children) this.#collect(child, boxTest, sphereTest, results);
  }
}
