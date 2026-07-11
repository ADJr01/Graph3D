import { buildBarnesHutOctree } from './octree.js';

// Barnes-Hut accuracy/speed trade-off: a tree cell is treated as a single
// mass once its width is small relative to the distance to it. Lower theta
// = more exact (more traversal); d3-force's default is the same value.
const DEFAULT_THETA = 0.9;
const DEFAULT_CHARGE_DISTANCE_MIN = 1;

function toFn(valueOrFn) {
  return typeof valueOrFn === 'function' ? valueOrFn : () => valueOrFn;
}

/**
 * Many-body force: every node repels (negative `strength`) or attracts
 * (positive) every other node, approximated in O(n log n) via a Barnes-Hut
 * octree instead of the naive O(n²) all-pairs sum.
 * @param {number} [strength] Force per node-pair; negative repels. Default `-30`.
 * @param {{ distanceMin?: number, distanceMax?: number, theta?: number }} [options]
 *   `distanceMin` (default `1`) softens the force at very short range so
 *   coincident nodes don't explode. `distanceMax` (default `Infinity`) caps
 *   the interaction range. `theta` (default `0.9`) is the Barnes-Hut
 *   accuracy threshold.
 * @returns {(nodes: object[], alpha: number) => void}
 * @example sim.force('charge', layout.force.charge(-30));
 */
export function forceCharge(strength = -30, { distanceMin = DEFAULT_CHARGE_DISTANCE_MIN, distanceMax = Infinity, theta = DEFAULT_THETA } = {}) {
  const distanceMinSq = distanceMin * distanceMin;
  const distanceMaxSq = distanceMax * distanceMax;

  return function chargeForce(nodes, alpha) {
    const points = nodes.map((node) => ({ x: node.x, y: node.y, z: node.z, mass: strength }));
    const tree = buildBarnesHutOctree(points);
    nodes.forEach((node, i) => {
      tree.accumulate(i, node.x, node.y, node.z, theta, (mass, dx, dy, dz, distSq) => {
        if (distSq >= distanceMaxSq) return;
        const clampedDistSq = Math.max(distSq, distanceMinSq);
        const dist = Math.sqrt(clampedDistSq);
        const factor = (mass * alpha) / clampedDistSq;
        node.__ax += (dx / dist) * factor;
        node.__ay += (dy / dist) * factor;
        node.__az += (dz / dist) * factor;
      });
    });
  };
}

/**
 * Spring force pulling each link's two endpoints toward a rest `distance` —
 * too far apart accelerates them together, too close pushes them apart.
 * @param {Array<{ source: (number|object), target: (number|object) }>} links
 *   `source`/`target` are either an index into the simulation's `nodes()`
 *   array or a direct node-object reference.
 * @param {{ distance?: (number|((link: object) => number)), strength?: (number|((link: object) => number)) }} [options]
 *   `distance` (default `30`) is the rest length. `strength` defaults to
 *   d3-force's `1 / min(linkCountOf(source), linkCountOf(target))`, so
 *   highly-connected nodes don't get dragged around by every single link.
 * @returns {(nodes: object[], alpha: number) => void}
 * @example sim.force('link', layout.force.link(links, { distance: 40 }));
 */
export function forceLink(links = [], { distance = 30, strength } = {}) {
  const distanceFn = toFn(distance);
  const resolve = (nodes, ref) => (typeof ref === 'number' ? nodes[ref] : ref);

  function defaultStrengthFn(nodes) {
    const linkCount = new Map();
    for (const link of links) {
      for (const endpoint of [resolve(nodes, link.source), resolve(nodes, link.target)]) {
        linkCount.set(endpoint, (linkCount.get(endpoint) || 0) + 1);
      }
    }
    return (link) => 1 / Math.min(linkCount.get(resolve(nodes, link.source)), linkCount.get(resolve(nodes, link.target)));
  }

  return function linkForce(nodes, alpha) {
    const strengthFn = strength === undefined ? defaultStrengthFn(nodes) : toFn(strength);
    for (const link of links) {
      const source = resolve(nodes, link.source);
      const target = resolve(nodes, link.target);
      if (!source || !target) {
        throw new TypeError(
          `layout.force.link: a link's source/target must resolve to a node in nodes(); received source=${JSON.stringify(link.source)}, target=${JSON.stringify(link.target)}.`,
        );
      }
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dz = target.z - source.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      const factor = (strengthFn(link) * alpha * (dist - distanceFn(link))) / dist;
      source.__ax += dx * factor;
      source.__ay += dy * factor;
      source.__az += dz * factor;
      target.__ax -= dx * factor;
      target.__ay -= dy * factor;
      target.__az -= dz * factor;
    }
  };
}

/**
 * Recentering force: nudges every node by the same vector so the whole
 * cluster's centroid moves toward `(x, y, z)` — a rigid shift that doesn't
 * distort the graph's shape (unlike pulling each node toward the target
 * individually).
 * @param {number} [x] @param {number} [y] @param {number} [z] Target centroid. Default origin.
 * @param {number} [strength] Default `1`.
 * @returns {(nodes: object[], alpha: number) => void}
 * @example sim.force('center', layout.force.center());
 */
export function forceCenter(x = 0, y = 0, z = 0, strength = 1) {
  return function centerForce(nodes, alpha) {
    if (nodes.length === 0) return;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const node of nodes) {
      cx += node.x;
      cy += node.y;
      cz += node.z;
    }
    cx /= nodes.length;
    cy /= nodes.length;
    cz /= nodes.length;
    const ax = (x - cx) * strength * alpha;
    const ay = (y - cy) * strength * alpha;
    const az = (z - cz) * strength * alpha;
    for (const node of nodes) {
      node.__ax += ax;
      node.__ay += ay;
      node.__az += az;
    }
  };
}

/**
 * Contact force pushing overlapping nodes apart until they're `radius`(a) +
 * `radius`(b) apart.
 * @param {(number|((node: object, index: number, nodes: object[]) => number))} [radius] Default `1`.
 * @param {number} [strength] Default `1`.
 * @returns {(nodes: object[], alpha: number) => void}
 * @example forceCollide((d) => d.r)
 */
export function forceCollide(radius = 1, strength = 1) {
  const radiusFn = toFn(radius);

  // ponytail: O(n²) all-pairs overlap check — collide is inherently
  // short-range, so this only matters for close pairs; swap in a spatial
  // grid/octree query if collide-heavy scenes exceed a few thousand nodes.
  return function collideForce(nodes, alpha) {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const ra = radiusFn(a, i, nodes);
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const rb = radiusFn(b, j, nodes);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const minDist = ra + rb;
        if (dist >= minDist) continue;
        const factor = ((minDist - dist) / dist) * strength * alpha * 0.5;
        a.__ax -= dx * factor;
        a.__ay -= dy * factor;
        a.__az -= dz * factor;
        b.__ax += dx * factor;
        b.__ay += dy * factor;
        b.__az += dz * factor;
      }
    }
  };
}

/**
 * Clustering force: pulls every node toward the centroid of every node
 * sharing its `keyFn`'s resolved group value — grouping nodes by category
 * (e.g. `NetworkChart.cluster((d) => d.group)`, Prompt 137) without needing
 * an explicit `.link` between every pair in the same group.
 * @param {(node: object) => *} keyFn Resolves each node's cluster identity.
 * @param {number} [strength] Default `0.3`.
 * @returns {(nodes: object[], alpha: number) => void}
 * @example sim.force('cluster', layout.force.cluster((d) => d.group));
 */
export function forceCluster(keyFn, strength = 0.3) {
  return function clusterForce(nodes, alpha) {
    const centroids = new Map();
    for (const node of nodes) {
      const key = keyFn(node);
      let centroid = centroids.get(key);
      if (!centroid) {
        centroid = { x: 0, y: 0, z: 0, count: 0 };
        centroids.set(key, centroid);
      }
      centroid.x += node.x;
      centroid.y += node.y;
      centroid.z += node.z;
      centroid.count += 1;
    }
    for (const centroid of centroids.values()) {
      centroid.x /= centroid.count;
      centroid.y /= centroid.count;
      centroid.z /= centroid.count;
    }
    for (const node of nodes) {
      const centroid = centroids.get(keyFn(node));
      node.__ax += (centroid.x - node.x) * strength * alpha;
      node.__ay += (centroid.y - node.y) * strength * alpha;
      node.__az += (centroid.z - node.z) * strength * alpha;
    }
  };
}

/**
 * Radial force pulling every node onto (or pushing it off) a sphere of
 * `radius` centered at `(x, y, z)`.
 * @param {(number|((node: object) => number))} radius
 * @param {number} [x] @param {number} [y] @param {number} [z] Sphere center. Default origin.
 * @param {number} [strength] Default `0.1`.
 * @returns {(nodes: object[], alpha: number) => void}
 * @example sim.force('radial', layout.force.radial(100));
 */
export function forceRadial(radius, x = 0, y = 0, z = 0, strength = 0.1) {
  const radiusFn = toFn(radius);
  return function radialForce(nodes, alpha) {
    for (const node of nodes) {
      const dx = node.x - x;
      const dy = node.y - y;
      const dz = node.z - z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      const factor = ((radiusFn(node) - dist) / dist) * strength * alpha;
      node.__ax += dx * factor;
      node.__ay += dy * factor;
      node.__az += dz * factor;
    }
  };
}
