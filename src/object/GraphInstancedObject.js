import * as THREE from 'three';
import { GraphObject } from './GraphObject.js';
// Imports core/GraphDisposal.js directly, not '../scene/index.js' — see
// GraphObject.js's identical note on why object/ must not import that barrel.
import { disposeMaterial } from '../core/GraphDisposal.js';
import { loop } from '../core/Graph3DLoop.js';
import { Octree } from './Octree.js';

// instanceMatrix/instanceColor live directly on the mesh (Prompt 37), not in
// geometry.attributes — defineAttribute() must not shadow those names.
const RESERVED_ATTRIBUTE_NAMES = new Set(['instanceMatrix', 'instanceColor']);

// WebGL vertex attributes cap out at 4 components (vec4); anything wider
// wouldn't map to a single shader input anyway.
const MAX_ATTRIBUTE_ITEM_SIZE = 4;

// A fully degenerate (all-zero) transform collapses an instance's geometry to
// a single point, making it a no-op to rasterize — the cheapest way to "hide"
// a culled instance without touching mesh.count (which would shift every
// other instance's index and break setInstanceCount/pick semantics). Shared
// and never mutated: setMatrixAt copies its elements, it never keeps a
// reference to this object.
const ZERO_MATRIX = new THREE.Matrix4();
ZERO_MATRIX.elements.fill(0);

// Generous enough for any chart built from this library's normalized/example
// data ranges. Positions outside these bounds may not reliably surface from
// pick()/culling's octree queries — widen via options.octreeBounds for
// charts using larger world-space coordinates.
const DEFAULT_OCTREE_BOUNDS = new THREE.Box3(
  new THREE.Vector3(-10_000, -10_000, -10_000),
  new THREE.Vector3(10_000, 10_000, 10_000),
);

/**
 * Primary rendering primitive for any chart with more than ~50 datums.
 * Wraps a single `THREE.InstancedMesh` and exposes a per-instance mutation
 * API (position/rotation/scale/color/matrix/user data, plus custom
 * shader-driving attributes via `defineAttribute`) instead of one
 * `THREE.Mesh` per datum. Every instance also gets a stable `instanceId`
 * attribute and can be hit-tested via `pick(raycaster)`. Optional per-instance
 * frustum culling is available via `enableInstanceCulling`.
 *
 * An internal `Octree` tracks every positioned instance's world position and
 * bounding radius, updated incrementally by `setInstanceMatrix`/
 * `setInstancePosition`/`setInstanceRotation`/`setInstanceScale` — `pick()`
 * and culling both query it for candidates instead of brute-force testing
 * every instance, which is what makes both fast at million-instance scale.
 * An instance that has never had its transform set has no octree entry yet
 * (nothing to pick or cull — it's still at its degenerate default matrix).
 *
 * `geometry` and `material` are consumed exclusively by this instance — they
 * are disposed alongside it in `dispose()`, so do not share the same
 * geometry/material objects across multiple `GraphInstancedObject`s.
 *
 * Per-instance setters (`setInstance*`) write directly into the underlying
 * `InstancedBufferAttribute`s but do not upload to the GPU. Call
 * `commitMatrix()`/`commitColor()`/`commitAttribute()` once after a batch of
 * writes to flag the attributes for upload — this keeps a chart's `update()`
 * loop to a single GPU sync per frame instead of one per datum.
 *
 * @example
 * const bars = new GraphInstancedObject({
 *   scene: graphScene.three,
 *   name: 'bars',
 *   geometry: new THREE.BoxGeometry(),
 *   material: new THREE.MeshStandardMaterial(),
 *   count: 100_000,
 * });
 * bars.setInstancePosition(0, 1, 2, 3).setInstanceColor(0, 'crimson');
 * bars.commitMatrix();
 * bars.commitColor();
 */
export class GraphInstancedObject extends GraphObject {
  /** @type {THREE.InstancedMesh} */
  #mesh;

  /** @type {number} allocated instance slots — setInstanceCount grows this via #growCapacity */
  #capacity;

  /** @type {Array<*>} per-instance user data, parallel to the instance buffers */
  #instanceUserData;

  /** @type {boolean} */
  #disposed = false;

  /** @type {Octree} spatial index of every positioned instance's (position, radius) */
  #octree;

  /** @type {Set<number>} indices with a live octree entry — lets #syncOctree tell insert from update */
  #octreePositioned = new Set();

  /** @type {Map<number, THREE.Matrix4>} real transform captured for indices currently hidden via setInstanceVisible(i, false), restored on setInstanceVisible(i, true) */
  #hiddenMatrices = new Map();

  /** @type {number} geometry.boundingSphere.radius, cached once at construction */
  #geometryBoundingRadius;

  /** @type {THREE.Mesh} throwaway mesh reused for per-candidate raycasts in pick() */
  #pickMeshScratch = new THREE.Mesh();

  // Scratch objects reused across setInstance* calls to avoid per-call allocation
  // on what is meant to be a hot, per-datum path.
  /** @type {THREE.Matrix4} */
  #matrixScratch = new THREE.Matrix4();
  /** @type {THREE.Vector3} */
  #positionScratch = new THREE.Vector3();
  /** @type {THREE.Quaternion} */
  #quaternionScratch = new THREE.Quaternion();
  /** @type {THREE.Vector3} */
  #scaleScratch = new THREE.Vector3();
  /** @type {THREE.Color} */
  #colorScratch = new THREE.Color();
  /** @type {THREE.Frustum} */
  #frustumScratch = new THREE.Frustum();
  /** @type {THREE.Matrix4} */
  #projScreenMatrixScratch = new THREE.Matrix4();

  /** @type {boolean} */
  #cullingEnabled = false;
  /** @type {THREE.Camera|null} */
  #cullingCamera = null;
  /** @type {number} recompute the cull pass every Nth call to updateCulling() */
  #cullingInterval = 1;
  /** @type {number} */
  #cullingFrameCount = 0;
  /** @type {(function(): void)|null} the exact reference passed to loop.add/remove */
  #cullingLoopCallback = null;
  /** @type {THREE.Matrix4[]|null} each instance's real transform, captured at enable time */
  #cullingBaseMatrices = null;

  /**
   * @param {{ scene: THREE.Scene, name: string, geometry: THREE.BufferGeometry,
   *   material: THREE.Material|THREE.Material[], count: number, octreeBounds?: THREE.Box3 }} options
   * @throws {TypeError} If `geometry` is not a `THREE.BufferGeometry`.
   * @throws {TypeError} If `material` is not a `THREE.Material` (or array of them).
   * @throws {TypeError} If `count` is not a positive integer.
   * @throws {TypeError} If `octreeBounds` is provided but not a `THREE.Box3`.
   * @example
   * new GraphInstancedObject({ scene, name: 'bars', geometry, material, count: 1000 });
   */
  constructor({ scene, name, geometry, material, count, octreeBounds = DEFAULT_OCTREE_BOUNDS } = {}) {
    if (!(geometry instanceof THREE.BufferGeometry)) {
      throw new TypeError('GraphInstancedObject: geometry must be a THREE.BufferGeometry instance.');
    }
    const materials = Array.isArray(material) ? material : [material];
    if (materials.length === 0 || materials.some((m) => !(m instanceof THREE.Material))) {
      throw new TypeError(
        'GraphInstancedObject: material must be a THREE.Material instance or a non-empty array of them.',
      );
    }
    if (!Number.isInteger(count) || count <= 0) {
      throw new TypeError(
        `GraphInstancedObject: count must be a positive integer, received ${JSON.stringify(count)}.`,
      );
    }

    const mesh = new THREE.InstancedMesh(geometry, material, count);
    // Per-instance transforms are expected to change every frame for
    // animated/live-updating charts; DynamicDrawUsage avoids THREE's static-draw
    // GPU upload path, which assumes infrequent writes.
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Stable per-instance id, independent of the instance's current slot —
    // the foundation for a future GPU color-id picking pass.
    const idArray = new Float32Array(count);
    for (let i = 0; i < count; i++) idArray[i] = i;
    geometry.setAttribute('instanceId', new THREE.InstancedBufferAttribute(idArray, 1));

    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();

    super({ scene, name, three: mesh });

    this.#mesh = mesh;
    this.#capacity = count;
    this.#instanceUserData = new Array(count);
    this.#geometryBoundingRadius = geometry.boundingSphere.radius;
    this.#octree = new Octree({ bounds: octreeBounds });
    this.#pickMeshScratch.geometry = geometry;
    this.#pickMeshScratch.material = material;
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  /**
   * This batch's material, as a lazy accessor so the return type can change
   * without touching call sites. Currently the raw `THREE.Material` (or
   * array) — Phase 6 will wrap it in a `GraphObjectMaterial`, but `object/`
   * cannot import from `material/` (a higher layer, per CLAUDE.md §1.4), so
   * that wrapping has to be added once `material/` exists, not here.
   * @returns {THREE.Material|THREE.Material[]}
   * @throws {Error} If called after `dispose()`.
   * @example bars.material.color.set('crimson');
   */
  get material() {
    this.#assertNotDisposed('material');
    return this.#mesh.material;
  }

  /**
   * Number of instance slots currently allocated. `setInstanceCount` may
   * render anywhere from 0 up to this many, and grows it automatically
   * (reallocating at the next power of two) when asked to render more.
   * @returns {number}
   */
  get capacity() {
    return this.#capacity;
  }

  /**
   * Number of instance slots currently rendered (`THREE.InstancedMesh.count`)
   * — always `<= capacity`. Slots at or beyond this index aren't drawn even
   * if allocated. Complements `capacity`/`setInstanceCount`; exists for
   * callers (e.g. `GraphScene.selectAll`, the join system's slot allocator)
   * that need to know how much of the batch is "live" right now.
   * @returns {number}
   * @throws {Error} If called after `dispose()`.
   * @example bars.count; // 42
   */
  get count() {
    this.#assertNotDisposed('count');
    return this.#mesh.count;
  }

  /** @returns {true} */
  get isInstanced() {
    return true;
  }

  // ── Bulk state ─────────────────────────────────────────────────────────────

  /**
   * Set how many of the allocated instance slots are actually rendered. If
   * `n` exceeds the current `capacity`, first grows capacity to the next
   * power of two at or above `n` (`THREE.MathUtils.ceilPowerOfTwo`),
   * reallocating `instanceMatrix`/`instanceColor` and every geometry-level
   * per-instance attribute (`instanceId`, plus any defined via
   * `defineAttribute`) and copying every existing instance's data across.
   * Existing instance indices — and their octree entries — keep their
   * meaning across a grow; nothing is remapped.
   * @param {number} n
   * @returns {this}
   * @throws {TypeError} If `n` is not a non-negative integer.
   * @throws {Error} If called after `dispose()`.
   * @example bars.setInstanceCount(42); // grows capacity first if 42 > bars.capacity
   */
  setInstanceCount(n) {
    this.#assertNotDisposed('setInstanceCount');
    if (!Number.isInteger(n) || n < 0) {
      throw new TypeError(
        `GraphInstancedObject.setInstanceCount: n must be a non-negative integer, received ${JSON.stringify(n)}.`,
      );
    }
    if (n > this.#capacity) {
      this.#growCapacity(THREE.MathUtils.ceilPowerOfTwo(n));
    }
    this.#mesh.count = n;
    return this;
  }

  // ── Per-instance transform ───────────────────────────────────────────────────

  /**
   * Set the full transform matrix for one instance directly.
   * @param {number} i
   * @param {THREE.Matrix4} matrix4
   * @returns {this}
   * @throws {RangeError} If `i` is out of bounds.
   * @throws {TypeError} If `matrix4` is not a `THREE.Matrix4`.
   * @throws {Error} If called after `dispose()`.
   * @example bars.setInstanceMatrix(0, new THREE.Matrix4().makeTranslation(1, 0, 0));
   */
  setInstanceMatrix(i, matrix4) {
    this.#assertNotDisposed('setInstanceMatrix');
    this.#assertIndex('setInstanceMatrix', i);
    if (!(matrix4 instanceof THREE.Matrix4)) {
      throw new TypeError('GraphInstancedObject.setInstanceMatrix: matrix4 must be a THREE.Matrix4 instance.');
    }
    this.#mesh.setMatrixAt(i, matrix4);
    matrix4.decompose(this.#positionScratch, this.#quaternionScratch, this.#scaleScratch);
    this.#syncOctree(i, this.#positionScratch, Math.max(this.#scaleScratch.x, this.#scaleScratch.y, this.#scaleScratch.z));
    return this;
  }

  /**
   * Set one instance's position, preserving its current rotation and scale.
   * @param {number} i
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {this}
   * @throws {RangeError} If `i` is out of bounds.
   * @throws {TypeError} If `x`, `y`, or `z` is not a finite number.
   * @throws {Error} If called after `dispose()`.
   * @example bars.setInstancePosition(0, 1, 2, 3);
   */
  setInstancePosition(i, x, y, z) {
    this.#assertNotDisposed('setInstancePosition');
    this.#assertIndex('setInstancePosition', i);
    this.#assertFiniteNumbers('setInstancePosition', x, y, z);
    this.#writePosition(i, x, y, z);
    return this;
  }

  /**
   * Set one instance's rotation, preserving its current position and scale.
   * @param {number} i
   * @param {THREE.Euler} euler
   * @returns {this}
   * @throws {RangeError} If `i` is out of bounds.
   * @throws {TypeError} If `euler` is not a `THREE.Euler`.
   * @throws {Error} If called after `dispose()`.
   * @example bars.setInstanceRotation(0, new THREE.Euler(0, Math.PI / 2, 0));
   */
  setInstanceRotation(i, euler) {
    this.#assertNotDisposed('setInstanceRotation');
    this.#assertIndex('setInstanceRotation', i);
    if (!(euler instanceof THREE.Euler)) {
      throw new TypeError('GraphInstancedObject.setInstanceRotation: euler must be a THREE.Euler instance.');
    }
    this.#mesh.getMatrixAt(i, this.#matrixScratch);
    this.#matrixScratch.decompose(this.#positionScratch, this.#quaternionScratch, this.#scaleScratch);
    this.#quaternionScratch.setFromEuler(euler);
    this.#matrixScratch.compose(this.#positionScratch, this.#quaternionScratch, this.#scaleScratch);
    this.#mesh.setMatrixAt(i, this.#matrixScratch);
    this.#syncOctree(i, this.#positionScratch, Math.max(this.#scaleScratch.x, this.#scaleScratch.y, this.#scaleScratch.z));
    return this;
  }

  /**
   * Set one instance's scale, preserving its current position and rotation.
   * @param {number} i
   * @param {number} sx
   * @param {number} sy
   * @param {number} sz
   * @returns {this}
   * @throws {RangeError} If `i` is out of bounds.
   * @throws {TypeError} If `sx`, `sy`, or `sz` is not a finite number.
   * @throws {Error} If called after `dispose()`.
   * @example bars.setInstanceScale(0, 1, 2, 1);
   */
  setInstanceScale(i, sx, sy, sz) {
    this.#assertNotDisposed('setInstanceScale');
    this.#assertIndex('setInstanceScale', i);
    this.#assertFiniteNumbers('setInstanceScale', sx, sy, sz);
    this.#writeScale(i, sx, sy, sz);
    return this;
  }

  /**
   * Read one instance's current position — a fresh `THREE.Vector3` (mutating
   * it has no effect on the instance). Exists for read-modify-write callers
   * (e.g. `Selection.attr('position.x', ...)`, Prompt 75) that need to change
   * one component without disturbing the others.
   * @param {number} i
   * @returns {THREE.Vector3}
   * @throws {RangeError} If `i` is out of bounds.
   * @throws {Error} If called after `dispose()`.
   * @example const p = bars.getInstancePosition(0);
   */
  getInstancePosition(i) {
    this.#assertNotDisposed('getInstancePosition');
    this.#assertIndex('getInstancePosition', i);
    this.#mesh.getMatrixAt(i, this.#matrixScratch);
    this.#matrixScratch.decompose(this.#positionScratch, this.#quaternionScratch, this.#scaleScratch);
    return this.#positionScratch.clone();
  }

  /**
   * Read one instance's current rotation — a fresh `THREE.Euler` (mutating it
   * has no effect on the instance).
   * @param {number} i
   * @returns {THREE.Euler}
   * @throws {RangeError} If `i` is out of bounds.
   * @throws {Error} If called after `dispose()`.
   * @example const r = bars.getInstanceRotation(0);
   */
  getInstanceRotation(i) {
    this.#assertNotDisposed('getInstanceRotation');
    this.#assertIndex('getInstanceRotation', i);
    this.#mesh.getMatrixAt(i, this.#matrixScratch);
    this.#matrixScratch.decompose(this.#positionScratch, this.#quaternionScratch, this.#scaleScratch);
    return new THREE.Euler().setFromQuaternion(this.#quaternionScratch);
  }

  /**
   * Read one instance's current scale — a fresh `THREE.Vector3` (mutating it
   * has no effect on the instance).
   * @param {number} i
   * @returns {THREE.Vector3}
   * @throws {RangeError} If `i` is out of bounds.
   * @throws {Error} If called after `dispose()`.
   * @example const s = bars.getInstanceScale(0);
   */
  getInstanceScale(i) {
    this.#assertNotDisposed('getInstanceScale');
    this.#assertIndex('getInstanceScale', i);
    this.#mesh.getMatrixAt(i, this.#matrixScratch);
    this.#matrixScratch.decompose(this.#positionScratch, this.#quaternionScratch, this.#scaleScratch);
    return this.#scaleScratch.clone();
  }

  // ── Per-instance visibility ────────────────────────────────────────────────

  /**
   * Show or hide one instance without shifting any other instance's index
   * (unlike `setInstanceCount`). Hiding captures the instance's real
   * transform and swaps in the same degenerate zero matrix
   * `enableInstanceCulling` uses to cull instances out of the frustum;
   * showing restores the captured transform. Call `commitMatrix()` after a
   * batch of calls to upload the change.
   * @param {number} i
   * @param {boolean} visible
   * @returns {this}
   * @throws {RangeError} If `i` is out of bounds.
   * @throws {TypeError} If `visible` is not a boolean.
   * @throws {Error} If called after `dispose()`.
   * @example bars.setInstanceVisible(0, false).commitMatrix();
   */
  setInstanceVisible(i, visible) {
    this.#assertNotDisposed('setInstanceVisible');
    this.#assertIndex('setInstanceVisible', i);
    if (typeof visible !== 'boolean') {
      throw new TypeError(`GraphInstancedObject.setInstanceVisible: expected a boolean, received ${JSON.stringify(visible)}.`);
    }
    if (visible) {
      const restored = this.#hiddenMatrices.get(i);
      if (restored !== undefined) {
        this.#mesh.setMatrixAt(i, restored);
        this.#hiddenMatrices.delete(i);
      }
    } else if (!this.#hiddenMatrices.has(i)) {
      const captured = new THREE.Matrix4();
      this.#mesh.getMatrixAt(i, captured);
      this.#hiddenMatrices.set(i, captured);
      this.#mesh.setMatrixAt(i, ZERO_MATRIX);
    }
    return this;
  }

  // ── Bulk transform (typed-array, zero-allocation) ─────────────────────────

  /**
   * Overwrite every instance's position in one pass, preserving each
   * instance's current rotation and scale. Reuses this object's scratch
   * matrix/vector/quaternion across the whole array — no per-instance
   * allocation — so chart `update()` should call this instead of looping
   * `setInstancePosition` over tens of thousands of instances.
   * @param {Float32Array} positions - Flat `[x0, y0, z0, x1, y1, z1, ...]`, length `capacity * 3`.
   * @returns {this}
   * @throws {TypeError} If `positions` is not a `Float32Array` of length `capacity * 3`.
   * @throws {Error} If called after `dispose()`.
   * @example bars.setAllPositions(new Float32Array([0, 0, 0, 1, 0, 0])); // capacity === 2
   */
  setAllPositions(positions) {
    this.#assertNotDisposed('setAllPositions');
    this.#assertTypedArray('setAllPositions', positions, this.#capacity * 3);
    for (let i = 0; i < this.#capacity; i++) {
      const o = i * 3;
      this.#writePosition(i, positions[o], positions[o + 1], positions[o + 2]);
    }
    return this;
  }

  /**
   * Overwrite every instance's scale in one pass, preserving each instance's
   * current position and rotation. Reuses this object's scratch matrix/
   * vector/quaternion across the whole array — no per-instance allocation.
   * @param {Float32Array} scales - Flat `[sx0, sy0, sz0, sx1, sy1, sz1, ...]`, length `capacity * 3`.
   * @returns {this}
   * @throws {TypeError} If `scales` is not a `Float32Array` of length `capacity * 3`.
   * @throws {Error} If called after `dispose()`.
   * @example bars.setAllScales(new Float32Array([1, 2, 1, 1, 3, 1])); // capacity === 2
   */
  setAllScales(scales) {
    this.#assertNotDisposed('setAllScales');
    this.#assertTypedArray('setAllScales', scales, this.#capacity * 3);
    for (let i = 0; i < this.#capacity; i++) {
      const o = i * 3;
      this.#writeScale(i, scales[o], scales[o + 1], scales[o + 2]);
    }
    return this;
  }

  // ── Per-instance color ─────────────────────────────────────────────────────

  /**
   * Set one instance's color. Accepts anything `THREE.Color.set()` accepts
   * (a `THREE.Color`, a hex number, or a CSS color string).
   * @param {number} i
   * @param {THREE.Color|number|string} color
   * @returns {this}
   * @throws {RangeError} If `i` is out of bounds.
   * @throws {Error} If called after `dispose()`.
   * @example bars.setInstanceColor(0, 'crimson');
   */
  setInstanceColor(i, color) {
    this.#assertNotDisposed('setInstanceColor');
    this.#assertIndex('setInstanceColor', i);
    this.#colorScratch.set(color);
    this.#mesh.setColorAt(i, this.#colorScratch);
    return this;
  }

  /**
   * Overwrite every instance's color in one pass via a direct typed-array
   * copy into the underlying `InstancedBufferAttribute` — no per-instance
   * `THREE.Color` allocation, unlike looping `setInstanceColor`. Values are
   * written as-is (same raw RGB floats `THREE.Color.toArray()` produces),
   * so build `colors` with `THREE.Color` up front if conversion from
   * hex/CSS strings is needed.
   * @param {Float32Array} colors - Flat `[r0, g0, b0, r1, g1, b1, ...]`, length `capacity * 3`.
   * @returns {this}
   * @throws {TypeError} If `colors` is not a `Float32Array` of length `capacity * 3`.
   * @throws {Error} If called after `dispose()`.
   * @example bars.setAllColors(new Float32Array([1, 0, 0, 0, 1, 0])); // capacity === 2
   */
  setAllColors(colors) {
    this.#assertNotDisposed('setAllColors');
    this.#assertTypedArray('setAllColors', colors, this.#capacity * 3);
    if (this.#mesh.instanceColor === null) {
      this.#mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.#capacity * 3), 3);
    }
    this.#mesh.instanceColor.array.set(colors);
    return this;
  }

  // ── Custom per-instance attributes ────────────────────────────────────────

  /**
   * Whether a per-instance attribute named `name` already exists — either
   * built-in (`instanceId`) or previously defined via `defineAttribute`.
   * Lets a caller (e.g. `Selection.attr`, Prompt 75) avoid `defineAttribute`'s
   * "already exists" throw when it may run more than once for the same name.
   * @param {string} name
   * @returns {boolean}
   * @throws {Error} If called after `dispose()`.
   * @example if (!bars.hasAttribute('pulsePhase')) bars.defineAttribute('pulsePhase', 1);
   */
  hasAttribute(name) {
    this.#assertNotDisposed('hasAttribute');
    return this.#mesh.geometry.getAttribute(name) instanceof THREE.InstancedBufferAttribute;
  }

  /**
   * Define a new per-instance attribute backed by an `InstancedBufferAttribute`,
   * for driving custom vertex-shader effects per datum (e.g. a per-bar pulse
   * phase, a per-point category id).
   * @param {string} name
   * @param {number} itemSize - Components per instance, 1-4 (maps to a
   *   `float`/`vec2`/`vec3`/`vec4` shader attribute).
   * @returns {this}
   * @throws {TypeError} If `name` is not a non-empty string.
   * @throws {TypeError} If `itemSize` is not an integer in [1, 4].
   * @throws {Error} If an attribute named `name` already exists (built-in or custom).
   * @throws {Error} If called after `dispose()`.
   * @example bars.defineAttribute('pulsePhase', 1);
   */
  defineAttribute(name, itemSize) {
    this.#assertNotDisposed('defineAttribute');
    if (typeof name !== 'string' || name.length === 0) {
      throw new TypeError(
        `GraphInstancedObject.defineAttribute: name must be a non-empty string, received ${JSON.stringify(name)}.`,
      );
    }
    if (!Number.isInteger(itemSize) || itemSize < 1 || itemSize > MAX_ATTRIBUTE_ITEM_SIZE) {
      throw new TypeError(
        `GraphInstancedObject.defineAttribute: itemSize must be an integer between 1 and ${MAX_ATTRIBUTE_ITEM_SIZE}, received ${JSON.stringify(itemSize)}.`,
      );
    }
    if (RESERVED_ATTRIBUTE_NAMES.has(name) || this.#mesh.geometry.getAttribute(name)) {
      throw new Error(`GraphInstancedObject.defineAttribute: an attribute named '${name}' already exists.`);
    }
    const attribute = new THREE.InstancedBufferAttribute(
      new Float32Array(this.#capacity * itemSize),
      itemSize,
    );
    attribute.setUsage(THREE.DynamicDrawUsage);
    this.#mesh.geometry.setAttribute(name, attribute);
    return this;
  }

  /**
   * Write one instance's value into a custom attribute defined via `defineAttribute`.
   * @param {number} i
   * @param {string} name
   * @param {number|number[]|Float32Array} value - A single number when `itemSize`
   *   is 1, otherwise an array/typed array of exactly `itemSize` numbers.
   * @returns {this}
   * @throws {RangeError} If `i` is out of bounds.
   * @throws {Error} If no attribute named `name` was defined.
   * @throws {TypeError} If `value` doesn't match the attribute's `itemSize`.
   * @throws {Error} If called after `dispose()`.
   * @example bars.setInstanceAttribute(0, 'pulsePhase', Math.random());
   */
  setInstanceAttribute(i, name, value) {
    this.#assertNotDisposed('setInstanceAttribute');
    this.#assertIndex('setInstanceAttribute', i);
    const attribute = this.#mesh.geometry.getAttribute(name);
    if (!(attribute instanceof THREE.InstancedBufferAttribute)) {
      throw new Error(
        `GraphInstancedObject.setInstanceAttribute: no attribute named '${name}' — call defineAttribute() first.`,
      );
    }
    if (attribute.itemSize === 1) {
      this.#assertFiniteNumbers('setInstanceAttribute', value);
      attribute.setX(i, value);
    } else {
      if (
        (!Array.isArray(value) && !ArrayBuffer.isView(value)) ||
        value.length !== attribute.itemSize
      ) {
        throw new TypeError(
          `GraphInstancedObject.setInstanceAttribute: expected an array of ${attribute.itemSize} numbers ` +
            `for attribute '${name}', received ${JSON.stringify(value)}.`,
        );
      }
      attribute.set(value, i * attribute.itemSize);
    }
    return this;
  }

  // ── Picking ────────────────────────────────────────────────────────────────

  /**
   * Cast a ray and return the instance index of the closest hit, or `null`
   * if the ray hits none of the currently rendered instances (respects
   * `setInstanceCount`).
   *
   * Queries the internal octree for candidate instances first, then raycasts
   * the real geometry only against those — accurate down to the exact
   * geometry hit, but touching far fewer instances than a brute-force test
   * of every one once the octree is doing its job.
   * @param {THREE.Raycaster} raycaster
   * @returns {number|null} The instance index, or `null` on a miss.
   * @throws {TypeError} If `raycaster` is not a `THREE.Raycaster`.
   * @throws {Error} If called after `dispose()`.
   * @example const hitIndex = bars.pick(raycaster); // 42, or null
   */
  pick(raycaster) {
    this.#assertNotDisposed('pick');
    if (!(raycaster instanceof THREE.Raycaster)) {
      throw new TypeError('GraphInstancedObject.pick: raycaster must be a THREE.Raycaster instance.');
    }

    const candidates = this.#octree.queryRay(raycaster.ray);
    const intersections = [];
    for (const index of candidates) {
      if (index >= this.#mesh.count) continue;
      this.#mesh.getMatrixAt(index, this.#matrixScratch);
      this.#pickMeshScratch.matrixWorld.multiplyMatrices(this.#mesh.matrixWorld, this.#matrixScratch);
      const hits = [];
      this.#pickMeshScratch.raycast(raycaster, hits);
      for (const hit of hits) {
        hit.instanceId = index;
        intersections.push(hit);
      }
    }
    if (intersections.length === 0) return null;
    intersections.sort((a, b) => a.distance - b.distance);
    return intersections[0].instanceId;
  }

  // ── Frustum culling ────────────────────────────────────────────────────────

  /**
   * Enable per-instance frustum culling against `camera`. Captures every
   * instance's current transform as its restore point, then each time
   * `updateCulling()` runs — auto-wired here to the shared `loop`, throttled
   * to every `everyNthFrame`-th call — queries the internal octree for which
   * instances are inside the frustum *right now*. Instances outside get a
   * degenerate (zero) matrix; instances inside are restored to their
   * captured transform, kept in sync as `setInstanceMatrix`/`Position`/
   * `Rotation`/`Scale` are called while culling is active — so unlike a
   * frozen precompute, moving a visible instance after enabling culling is
   * reflected on the next pass without re-enabling.
   *
   * While an instance is culled, its matrix is degenerate — avoid calling
   * `setInstancePosition`/`Rotation`/`Scale` on a possibly-culled index
   * (`disableInstanceCulling()` first if you need to).
   * @param {{ camera: THREE.Camera, everyNthFrame?: number }} options
   * @returns {this}
   * @throws {TypeError} If `camera` is not a `THREE.Camera`.
   * @throws {TypeError} If `everyNthFrame` is not a positive integer.
   * @throws {Error} If called after `dispose()`.
   * @example bars.enableInstanceCulling({ camera: graphScene.camera.three, everyNthFrame: 3 });
   */
  enableInstanceCulling({ camera, everyNthFrame = 1 } = {}) {
    this.#assertNotDisposed('enableInstanceCulling');
    if (!(camera instanceof THREE.Camera)) {
      throw new TypeError(
        'GraphInstancedObject.enableInstanceCulling: camera must be a THREE.Camera instance.',
      );
    }
    if (!Number.isInteger(everyNthFrame) || everyNthFrame < 1) {
      throw new TypeError(
        `GraphInstancedObject.enableInstanceCulling: everyNthFrame must be a positive integer, received ${JSON.stringify(everyNthFrame)}.`,
      );
    }
    this.disableInstanceCulling();

    this.#cullingBaseMatrices = [];
    for (let i = 0; i < this.#capacity; i++) {
      const matrix = new THREE.Matrix4();
      this.#mesh.getMatrixAt(i, matrix);
      this.#cullingBaseMatrices.push(matrix);
    }

    this.#cullingCamera = camera;
    this.#cullingInterval = everyNthFrame;
    this.#cullingFrameCount = 0;
    this.#cullingEnabled = true;
    this.#cullingLoopCallback = () => this.updateCulling();
    loop.add(this.#cullingLoopCallback);
    this.#applyCulling();
    return this;
  }

  /**
   * Disable frustum culling and restore every instance to its captured
   * transform. No-op if culling was never enabled.
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example bars.disableInstanceCulling();
   */
  disableInstanceCulling() {
    this.#assertNotDisposed('disableInstanceCulling');
    if (!this.#cullingEnabled) return this;
    loop.remove(this.#cullingLoopCallback);
    for (let i = 0; i < this.#capacity; i++) {
      this.#mesh.setMatrixAt(i, this.#cullingBaseMatrices[i]);
    }
    this.#mesh.instanceMatrix.needsUpdate = true;
    this.#cullingEnabled = false;
    this.#cullingCamera = null;
    this.#cullingLoopCallback = null;
    this.#cullingBaseMatrices = null;
    this.#cullingFrameCount = 0;
    return this;
  }

  /**
   * Advance the culling throttle by one frame; only re-tests the frustum and
   * rewrites the instance matrix array every `everyNthFrame`-th call. Called
   * automatically once per real frame while culling is enabled (wired to the
   * shared `loop` by `enableInstanceCulling`) — exposed publicly so a custom
   * render loop can drive it manually instead. No-op if culling is disabled.
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example bars.updateCulling();
   */
  updateCulling() {
    this.#assertNotDisposed('updateCulling');
    if (!this.#cullingEnabled) return this;
    this.#cullingFrameCount++;
    if (this.#cullingFrameCount % this.#cullingInterval !== 0) return this;
    this.#applyCulling();
    return this;
  }

  // ── Per-instance user data ─────────────────────────────────────────────────

  /**
   * Attach an arbitrary datum to one instance (e.g. the source data-bound
   * object), for later retrieval by picking/tooltips.
   * @param {number} i
   * @param {*} datum
   * @returns {this}
   * @throws {RangeError} If `i` is out of bounds.
   * @throws {Error} If called after `dispose()`.
   * @example bars.setInstanceUserData(0, { category: 'Q1', value: 42 });
   */
  setInstanceUserData(i, datum) {
    this.#assertNotDisposed('setInstanceUserData');
    this.#assertIndex('setInstanceUserData', i);
    this.#instanceUserData[i] = datum;
    return this;
  }

  /**
   * Read the datum previously attached via `setInstanceUserData`.
   * @param {number} i
   * @returns {*} The stored datum, or `undefined` if never set.
   * @throws {RangeError} If `i` is out of bounds.
   * @throws {Error} If called after `dispose()`.
   * @example bars.getInstanceUserData(0); // { category: 'Q1', value: 42 }
   */
  getInstanceUserData(i) {
    this.#assertNotDisposed('getInstanceUserData');
    this.#assertIndex('getInstanceUserData', i);
    return this.#instanceUserData[i];
  }

  // ── Commit (GPU upload) ────────────────────────────────────────────────────

  /**
   * Flag the instance matrix buffer for GPU upload. Call once after a batch
   * of `setInstanceMatrix`/`setInstancePosition`/`setInstanceRotation`/
   * `setInstanceScale` calls, not after each one.
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example bars.commitMatrix();
   */
  commitMatrix() {
    this.#assertNotDisposed('commitMatrix');
    this.#mesh.instanceMatrix.needsUpdate = true;
    return this;
  }

  /**
   * Flag the instance color buffer for GPU upload. Call once after a batch
   * of `setInstanceColor` calls, not after each one. No-op if no instance
   * color has ever been set.
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example bars.commitColor();
   */
  commitColor() {
    this.#assertNotDisposed('commitColor');
    if (this.#mesh.instanceColor) this.#mesh.instanceColor.needsUpdate = true;
    return this;
  }

  /**
   * Flag a custom attribute (defined via `defineAttribute`) for GPU upload.
   * Call once after a batch of `setInstanceAttribute` calls for that
   * attribute, not after each one.
   * @param {string} name
   * @returns {this}
   * @throws {Error} If no attribute named `name` was defined.
   * @throws {Error} If called after `dispose()`.
   * @example bars.commitAttribute('pulsePhase');
   */
  commitAttribute(name) {
    this.#assertNotDisposed('commitAttribute');
    const attribute = this.#mesh.geometry.getAttribute(name);
    if (!(attribute instanceof THREE.InstancedBufferAttribute)) {
      throw new Error(
        `GraphInstancedObject.commitAttribute: no attribute named '${name}' — call defineAttribute() first.`,
      );
    }
    attribute.needsUpdate = true;
    return this;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Release the instance matrix/color GPU buffers, dispose `geometry` and
   * `material`, and unregister via `GraphObject.dispose()`. Idempotent.
   * @example bars.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    // Unregister from the shared RAF loop first — otherwise the next frame
    // would invoke a callback closing over a now-disposed mesh.
    if (this.#cullingLoopCallback) loop.remove(this.#cullingLoopCallback);
    // WebGLRenderer frees instanceMatrix/instanceColor GPU buffers in response
    // to this event — they live directly on the mesh, not in geometry.attributes,
    // so geometry.dispose() alone would leak them.
    this.#mesh.dispatchEvent({ type: 'dispose' });
    this.#mesh.geometry.dispose();
    disposeMaterial(this.#mesh.material);
    super.dispose();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Reallocate every capacity-scoped GPU resource — `instanceMatrix`,
   * `instanceColor`, and every geometry-level per-instance attribute
   * (`instanceId` plus any defined via `defineAttribute`) — at `newCapacity`,
   * copying each existing instance's data across. Static per-vertex geometry
   * data (position/normal/uv/index) is untouched. The octree is untouched
   * too: every existing instance keeps its current index, so its octree
   * entry (if any) stays valid without remapping.
   * @param {number} newCapacity
   */
  #growCapacity(newCapacity) {
    const oldMesh = this.#mesh;
    const oldGeometry = oldMesh.geometry;
    const oldCapacity = this.#capacity;

    const newGeometry = oldGeometry.clone();
    for (const name of Object.keys(newGeometry.attributes)) {
      const oldAttribute = oldGeometry.getAttribute(name);
      if (!oldAttribute.isInstancedBufferAttribute) continue;

      const itemSize = oldAttribute.itemSize;
      const grownArray = new Float32Array(newCapacity * itemSize);
      if (name === 'instanceId') {
        // Every slot needs a stable id, not just the ones carried over.
        for (let i = 0; i < newCapacity; i++) grownArray[i] = i;
      } else {
        grownArray.set(oldAttribute.array);
      }
      const grownAttribute = new THREE.InstancedBufferAttribute(grownArray, itemSize);
      grownAttribute.setUsage(oldAttribute.usage);
      newGeometry.setAttribute(name, grownAttribute);
    }

    const newMesh = new THREE.InstancedMesh(newGeometry, oldMesh.material, newCapacity);
    newMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    newMesh.instanceMatrix.array.set(oldMesh.instanceMatrix.array);
    if (oldMesh.instanceColor !== null) {
      newMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(newCapacity * 3).fill(1), 3);
      newMesh.instanceColor.array.set(oldMesh.instanceColor.array);
    }
    newMesh.count = oldMesh.count;

    // Every instance's data now lives in newMesh/newGeometry — safe to
    // release the old GPU buffers: instanceMatrix/instanceColor via the old
    // mesh's own 'dispose' event (mirrors dispose()), everything else
    // (instanceId, custom attributes, position/normal/uv/index) via the old
    // geometry's, since it's being fully discarded in favor of the clone.
    oldMesh.dispatchEvent({ type: 'dispose' });
    oldGeometry.dispose();

    this._replaceThree(newMesh);
    this.#mesh = newMesh;
    this.#pickMeshScratch.geometry = newGeometry;
    this.#instanceUserData.length = newCapacity;
    if (this.#cullingEnabled) {
      // New slots have no captured transform yet; a degenerate default keeps
      // them consistent with an instance that has never been positioned —
      // #applyCulling never marks them visible until the octree gets an
      // entry for them, at which point #syncOctree recaptures the real one.
      for (let i = oldCapacity; i < newCapacity; i++) this.#cullingBaseMatrices.push(new THREE.Matrix4());
    }
    this.#capacity = newCapacity;
  }

  /**
   * Decompose/recompose instance `i`'s matrix around a new position,
   * preserving its current rotation and scale. Shared by `setInstancePosition`
   * and `setAllPositions` so the decompose/compose/octree-sync sequence has
   * one authoritative implementation.
   * @param {number} i @param {number} x @param {number} y @param {number} z
   */
  #writePosition(i, x, y, z) {
    this.#mesh.getMatrixAt(i, this.#matrixScratch);
    this.#matrixScratch.decompose(this.#positionScratch, this.#quaternionScratch, this.#scaleScratch);
    this.#positionScratch.set(x, y, z);
    this.#matrixScratch.compose(this.#positionScratch, this.#quaternionScratch, this.#scaleScratch);
    this.#mesh.setMatrixAt(i, this.#matrixScratch);
    this.#syncOctree(i, this.#positionScratch, Math.max(this.#scaleScratch.x, this.#scaleScratch.y, this.#scaleScratch.z));
  }

  /**
   * Decompose/recompose instance `i`'s matrix around a new scale, preserving
   * its current position and rotation. Shared by `setInstanceScale` and
   * `setAllScales`.
   * @param {number} i @param {number} sx @param {number} sy @param {number} sz
   */
  #writeScale(i, sx, sy, sz) {
    this.#mesh.getMatrixAt(i, this.#matrixScratch);
    this.#matrixScratch.decompose(this.#positionScratch, this.#quaternionScratch, this.#scaleScratch);
    this.#scaleScratch.set(sx, sy, sz);
    this.#matrixScratch.compose(this.#positionScratch, this.#quaternionScratch, this.#scaleScratch);
    this.#mesh.setMatrixAt(i, this.#matrixScratch);
    this.#syncOctree(i, this.#positionScratch, Math.max(sx, sy, sz));
  }

  /** @param {string} method @param {*} array @param {number} expectedLength @throws {TypeError} */
  #assertTypedArray(method, array, expectedLength) {
    if (!(array instanceof Float32Array) || array.length !== expectedLength) {
      const received = array instanceof Float32Array ? `Float32Array(${array.length})` : JSON.stringify(array);
      throw new TypeError(
        `GraphInstancedObject.${method}: expected a Float32Array of length ${expectedLength}, received ${received}.`,
      );
    }
  }

  /** Query the octree for which instances are inside the current camera frustum right now. */
  #applyCulling() {
    const camera = this.#cullingCamera;
    camera.updateMatrixWorld();
    this.#projScreenMatrixScratch.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.#frustumScratch.setFromProjectionMatrix(this.#projScreenMatrixScratch);

    const visible = new Set(this.#octree.queryFrustum(this.#frustumScratch));
    for (let i = 0; i < this.#capacity; i++) {
      this.#mesh.setMatrixAt(i, visible.has(i) ? this.#cullingBaseMatrices[i] : ZERO_MATRIX);
    }
    this.#mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Insert-or-update this instance's entry in the octree (id = instance
   * index), and — if culling is currently enabled — keep its captured
   * restore transform in sync too, so a visible instance that moves is
   * culled/restored correctly on the next pass instead of snapping back to
   * a stale position.
   * @param {number} i @param {THREE.Vector3} position @param {number} maxScale
   */
  #syncOctree(i, position, maxScale) {
    const radius = this.#geometryBoundingRadius * maxScale;
    if (this.#octreePositioned.has(i)) {
      this.#octree.remove(i);
    } else {
      this.#octreePositioned.add(i);
    }
    this.#octree.insert(i, position, radius);

    if (this.#cullingEnabled) {
      this.#mesh.getMatrixAt(i, this.#cullingBaseMatrices[i]);
    }
  }

  /** @param {string} method @param {number} i @throws {RangeError} */
  #assertIndex(method, i) {
    if (!Number.isInteger(i) || i < 0 || i >= this.#capacity) {
      throw new RangeError(
        `GraphInstancedObject.${method}: index ${i} is out of bounds for capacity ${this.#capacity}.`,
      );
    }
  }

  /** @param {string} method @param {...number} values @throws {TypeError} */
  #assertFiniteNumbers(method, ...values) {
    if (values.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
      throw new TypeError(
        `GraphInstancedObject.${method}: expected finite numbers, received [${values.join(', ')}].`,
      );
    }
  }

  /** @param {string} method @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`GraphInstancedObject.${method}: object '${this.name}' has been disposed.`);
    }
  }
}
