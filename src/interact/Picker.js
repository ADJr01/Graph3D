import * as THREE from 'three';
import { loop } from '../core/Graph3DLoop.js';

/**
 * Centralized hit-testing across every chart registered with it: casts one
 * ray per `pickAt(x, y)` call and returns the closest hit across all
 * registered charts. Dispatches per chart on its live backend's own shape
 * (`Selection.backend`, Prompt 134's escape hatch) rather than re-deriving a
 * second spatial index — the octree-accelerated
 * `GraphInstancedObject.pickDetailed()` (Prompt 147) for an instanced
 * backend, a plain `THREE.Raycaster.intersectObjects` for the low-count
 * meshes backend (mirrors `ScatterChart.pick()`/`PieChart.pick()`, Prompts
 * 134/139, generalized to work for any chart type without a per-type
 * `.pick()` override — most chart types don't have one).
 *
 * Repeated `pickAt()` calls at the exact same `(x, y)` within the same
 * rendered frame reuse the cached result instead of re-raycasting every
 * registered chart — cheap for a hover-highlight loop that reads the
 * current pick more than once per frame. The cache is invalidated by the
 * next `loop` (Prompt 20's shared RAF manager) frame — never a second
 * `requestAnimationFrame` (CLAUDE.md §2 anti-patterns table).
 *
 * A registered chart with `chart.pickingEnabled(false)` (Prompt 156) is
 * skipped entirely — never raycast, never a candidate for the closest hit —
 * for a static "backdrop" chart nobody interacts with.
 *
 * @example
 * const picker = new Picker({ camera: scene.camera.three, domElement: canvas });
 * picker.register(barChart).register(scatterChart);
 * canvas.addEventListener('pointermove', (event) => {
 *   const hit = picker.pickAt(event.offsetX, event.offsetY);
 *   if (hit) console.log(hit.chart, hit.datum);
 * });
 */
export class Picker {
  /** @type {THREE.Camera} */
  #camera;

  /** @type {{width: number, height: number}} Only `.width`/`.height` are read — duck-typed to a canvas. */
  #domElement;

  /** @type {Set<import('../chart/GraphChart.js').GraphChart>} */
  #charts = new Set();

  /** @type {THREE.Raycaster} */
  #raycaster = new THREE.Raycaster();

  /** @type {THREE.Vector2} scratch reused across pickAt() calls to avoid per-call allocation */
  #ndcScratch = new THREE.Vector2();

  /** @type {string|null} `"x,y"` of the last computed pick, cleared on the next `loop` frame. */
  #cacheKey = null;

  /**
   * @type {{chart: *, mesh: THREE.Object3D, instanceIndex: number|null,
   *   datum: *, worldPoint: THREE.Vector3}|null|undefined}
   */
  #cacheResult;

  /** @type {(function(): void)|null} The exact one-shot `loop.add` callback in flight, if any. */
  #invalidateCallback = null;

  /** @type {boolean} */
  #disposed = false;

  /**
   * @param {{ camera: THREE.Camera, domElement: {width: number, height: number} }} options
   * @throws {TypeError} If `camera` is not a `THREE.Camera`, or `domElement` is falsy.
   * @example new Picker({ camera: scene.camera.three, domElement: canvas });
   */
  constructor({ camera, domElement } = {}) {
    if (!(camera instanceof THREE.Camera)) {
      throw new TypeError('Picker: camera must be a THREE.Camera instance.');
    }
    if (!domElement) {
      throw new TypeError('Picker: domElement is required.');
    }
    this.#camera = camera;
    this.#domElement = domElement;
  }

  /**
   * The camera this picker rays against — exposed so `PointerRouter`
   * (Prompt 154) can unproject a drag gesture's pointer position through the
   * same camera, rather than requiring a second copy passed to its own
   * constructor (CLAUDE.md §1.1 DRY — one source of truth for "which camera
   * this interaction session uses").
   * @returns {THREE.Camera}
   * @example picker.camera.position;
   */
  get camera() {
    return this.#camera;
  }

  /**
   * The canvas-shaped element `pickAt(x, y)` treats `x`/`y` as pixel
   * coordinates within — exposed for the identical reason `camera` is: so
   * `PointerRouter`'s drag gesture (Prompt 154) can compute NDC coordinates
   * against the same `width`/`height` `pickAt()` itself uses, without a
   * second copy passed to its own constructor.
   * @returns {{width: number, height: number}}
   * @example picker.domElement.width;
   */
  get domElement() {
    return this.#domElement;
  }

  /**
   * Add a chart to the set `pickAt()` hit-tests against. No-op if already registered.
   * @param {import('../chart/GraphChart.js').GraphChart} chart Any `GraphChart` — duck-typed to its `selection()` method.
   * @returns {this}
   * @throws {TypeError} If `chart` doesn't expose a `selection()` method.
   * @throws {Error} If called after `dispose()`.
   * @example picker.register(barChart);
   */
  register(chart) {
    this.#assertNotDisposed('register');
    if (!chart || typeof chart.selection !== 'function') {
      throw new TypeError('Picker.register: chart must expose a selection() method.');
    }
    this.#charts.add(chart);
    return this;
  }

  /**
   * Remove a chart from the set `pickAt()` hit-tests against. No-op if not registered.
   * @param {import('../chart/GraphChart.js').GraphChart} chart
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example picker.unregister(barChart);
   */
  unregister(chart) {
    this.#assertNotDisposed('unregister');
    this.#charts.delete(chart);
    return this;
  }

  /**
   * Cast a ray from `(x, y)` — canvas-local pixel coordinates, top-left
   * origin, in the same physical-pixel space as `domElement.width`/
   * `.height` (e.g. `event.offsetX`/`event.offsetY` on the canvas itself,
   * not `clientX`/`clientY`) — through `camera`, and return the closest hit
   * across every registered chart, or `null` if none hit.
   * @param {number} x
   * @param {number} y
   * @returns {{chart: import('../chart/GraphChart.js').GraphChart, mesh: THREE.Object3D,
   *   instanceIndex: number|null, datum: *, worldPoint: THREE.Vector3}|null}
   *   `instanceIndex` is `null` for a hit on a non-instanced (meshes) backend.
   * @throws {TypeError} If `x` or `y` is not a finite number.
   * @throws {Error} If called after `dispose()`.
   * @example const hit = picker.pickAt(event.offsetX, event.offsetY);
   */
  pickAt(x, y) {
    this.#assertNotDisposed('pickAt');
    if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
      throw new TypeError(
        `Picker.pickAt: x and y must be finite numbers, received (${JSON.stringify(x)}, ${JSON.stringify(y)}).`,
      );
    }

    const key = `${x},${y}`;
    if (this.#cacheKey === key) return this.#cacheResult;

    const result = this.#computePick(x, y);
    this.#cacheKey = key;
    this.#cacheResult = result;
    this.#scheduleCacheInvalidate();
    return result;
  }

  /**
   * Release this picker's registered charts and pending cache-invalidation
   * callback. Idempotent. Registered charts themselves are not disposed —
   * `Picker` doesn't own them.
   * @example picker.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#invalidateCallback) {
      loop.remove(this.#invalidateCallback);
      this.#invalidateCallback = null;
    }
    this.#charts.clear();
    this.#cacheKey = null;
    this.#cacheResult = undefined;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * @param {number} x @param {number} y
   * @returns {{chart: *, mesh: THREE.Object3D, instanceIndex: number|null, datum: *, worldPoint: THREE.Vector3}|null}
   */
  #computePick(x, y) {
    const { width, height } = this.#domElement;
    this.#ndcScratch.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    this.#raycaster.setFromCamera(this.#ndcScratch, this.#camera);

    // A GraphMesh's raycast tests against THREE.Object3D.matrixWorld, which
    // is only ever recomputed by a real WebGLRenderer.render() call — a
    // pick requested between frames (e.g. from a pointermove handler) would
    // otherwise silently hit-test against a stale (possibly still-identity)
    // world transform. Deduped per scene: registered charts commonly share one.
    const updatedScenes = new Set();
    for (const chart of this.#charts) {
      if (!updatedScenes.has(chart.scene)) {
        chart.scene.updateMatrixWorld(true);
        updatedScenes.add(chart.scene);
      }
    }

    let closest = null;
    for (const chart of this.#charts) {
      // Prompt 156: chart.pickingEnabled(false) opts a chart out of every
      // pick entirely — duck-type-checked since a chart only needs
      // selection() to reach register() at all (a bare test double may lack
      // it, same convention as chart.draggable()'s own duck-check).
      if (typeof chart.pickingEnabled === 'function' && !chart.pickingEnabled()) continue;
      const hit = this.#pickChart(chart);
      if (hit !== null && (closest === null || hit.distance < closest.distance)) closest = hit;
    }
    if (closest === null) return null;
    const { chart, mesh, instanceIndex, datum, worldPoint } = closest;
    return { chart, mesh, instanceIndex, datum, worldPoint };
  }

  /**
   * Hit-tests one chart's live backend against `this.#raycaster` — the
   * octree path for an instanced backend, a plain raycast for a meshes
   * backend.
   * @param {import('../chart/GraphChart.js').GraphChart} chart
   * @returns {{chart: *, mesh: THREE.Object3D, instanceIndex: number|null,
   *   datum: *, worldPoint: THREE.Vector3, distance: number}|null}
   */
  #pickChart(chart) {
    const backend = chart.selection().backend;
    if (backend.type === 'instanced') {
      const hit = backend.object.pickDetailed(this.#raycaster);
      if (hit === null) return null;
      return {
        chart,
        mesh: backend.object.three,
        instanceIndex: hit.instanceIndex,
        datum: backend.object.getInstanceUserData(hit.instanceIndex),
        worldPoint: hit.point,
        distance: hit.distance,
      };
    }

    if (backend.meshes.length === 0) return null;
    const rawMeshes = backend.meshes.map((m) => m.three);
    const hits = this.#raycaster.intersectObjects(rawMeshes);
    if (hits.length === 0) return null;
    const [closestHit] = hits;
    const graphMesh = backend.meshes.find((m) => m.three === closestHit.object);
    return {
      chart,
      mesh: closestHit.object,
      instanceIndex: null,
      datum: graphMesh.getUserData('datum'),
      worldPoint: closestHit.point,
      distance: closestHit.distance,
    };
  }

  /** Schedules a one-shot `loop` callback that clears the pick cache on the next frame. */
  #scheduleCacheInvalidate() {
    if (this.#invalidateCallback) return;
    this.#invalidateCallback = () => {
      loop.remove(this.#invalidateCallback);
      this.#invalidateCallback = null;
      this.#cacheKey = null;
      this.#cacheResult = undefined;
    };
    loop.add(this.#invalidateCallback);
  }

  /** @param {string} method @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`Picker.${method}: this picker has been disposed.`);
    }
  }
}
