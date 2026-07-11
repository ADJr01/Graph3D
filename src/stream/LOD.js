import { transform } from '../compose/index.js';
import { loop } from '../core/Graph3DLoop.js';

/**
 * Validates a `levels` array — CLAUDE.md §1.5 Fail Fast, checked once at
 * construction rather than failing confusingly deep inside the first
 * re-LOD check.
 * @param {*} levels
 * @throws {TypeError} If `levels` isn't a non-empty array of `{maxDistance, maxPoints}`.
 */
function assertLevels(levels) {
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new TypeError(`LOD: levels must be a non-empty array of {maxDistance, maxPoints}, received ${JSON.stringify(levels)}.`);
  }
  for (const level of levels) {
    if (!level || typeof level.maxDistance !== 'number' || !(level.maxDistance > 0)) {
      throw new TypeError(`LOD: each level's maxDistance must be a positive number, received ${JSON.stringify(level)}.`);
    }
    if (!Number.isInteger(level.maxPoints) || level.maxPoints < 1) {
      throw new TypeError(`LOD: each level's maxPoints must be a positive integer, received ${JSON.stringify(level)}.`);
    }
  }
}

/**
 * Picks the applicable level for `distance` — `levels` must already be
 * sorted ascending by `maxDistance`; the first one `distance` still fits
 * under wins (closer camera → the earlier, higher-detail levels). Beyond
 * every threshold, the farthest (most aggressive) level applies.
 * @param {{maxDistance: number, maxPoints: number}[]} levels Pre-sorted ascending by `maxDistance`.
 * @param {number} distance
 * @returns {{maxDistance: number, maxPoints: number}}
 */
function pickLevel(levels, distance) {
  for (const level of levels) {
    if (distance <= level.maxDistance) return level;
  }
  return levels[levels.length - 1];
}

/**
 * Camera-distance-driven level-of-detail, as a standalone engine for any
 * duck-typed chart-like target (`.data()`/`.update()`/`.scene`) — the same
 * algorithm `GraphChart.enableLOD()` (Prompt 163, `chart/GraphChart.js`)
 * runs inline for its own instances (`chart/` never imports `stream/`,
 * CLAUDE.md §1.4, so that method can't delegate here; see its own doc
 * comment). Use this class directly when driving LOD on something other
 * than a `GraphChart` — e.g. a raw `GraphInstancedObject` wrapped in a
 * minimal adapter.
 *
 * Every frame (`core/Graph3DLoop`), checks `camera`'s distance to
 * `chart.scene.position` and, when it crosses into a different `levels`
 * bucket, re-decimates the dataset snapshotted at construction time down to
 * that bucket's `maxPoints` (`compose/transform`'s existing
 * `transform.decimate` — CLAUDE.md §1.1 DRY, no second decimation algorithm
 * here) and re-binds it via `chart.data(subset, keyFn) + chart.update()`.
 *
 * @example
 * const lod = new LOD({
 *   chart,
 *   camera: scene.camera.three,
 *   levels: [
 *     { maxDistance: 20, maxPoints: 5000 },
 *     { maxDistance: 100, maxPoints: 500 },
 *   ],
 * });
 * lod.dispose(); // stops the per-frame check
 */
export class LOD {
  /** @type {{data: Function, update: Function, scene: object}} */
  #chart;
  /** @type {{position: {distanceTo: (v: object) => number}}} */
  #camera;
  /** @type {{maxDistance: number, maxPoints: number}[]} Sorted ascending by `maxDistance`. */
  #levels;
  /** @type {(datum:*, index:number) => *} */
  #keyFn;
  /** @type {Array} Snapshotted once at construction — never re-read from `chart`. */
  #fullData;
  /** @type {number|null} */
  #currentMaxPoints = null;
  /** @type {boolean} */
  #disposed = false;
  /** @type {() => void} */
  #tick;

  /**
   * @param {object} options
   * @param {{data: Function, update: Function, scene: object}} options.chart Duck-typed — needs `data()`/`data(arr, keyFn)`/`update()`/`scene.position`.
   * @param {{position: {distanceTo: (v: object) => number}}} options.camera Duck-typed to `.position.distanceTo`.
   * @param {{maxDistance: number, maxPoints: number}[]} options.levels
   * @param {(datum:*, index:number) => *} [options.keyFn] Must match whatever `keyFn` `chart`'s data was originally bound with, or re-decimated frames will misjoin. Defaults to identity.
   * @throws {TypeError} If `chart` doesn't expose `data()`/`update()`, `camera` doesn't expose `position.distanceTo`, or `levels` is invalid.
   * @example new LOD({ chart, camera: scene.camera.three, levels: [{ maxDistance: 50, maxPoints: 1000 }] });
   */
  constructor({ chart, camera, levels, keyFn = (d) => d } = {}) {
    if (!chart || typeof chart.data !== 'function' || typeof chart.update !== 'function' || !chart.scene) {
      throw new TypeError('LOD: chart must expose data()/update()/scene.');
    }
    if (!camera || !camera.position || typeof camera.position.distanceTo !== 'function') {
      throw new TypeError(`LOD: camera must expose position.distanceTo, received ${JSON.stringify(camera)}.`);
    }
    assertLevels(levels);
    if (typeof keyFn !== 'function') {
      throw new TypeError(`LOD: keyFn must be a function, received ${JSON.stringify(keyFn)}.`);
    }

    this.#chart = chart;
    this.#camera = camera;
    this.#levels = levels.slice().sort((a, b) => a.maxDistance - b.maxDistance);
    this.#keyFn = keyFn;
    this.#fullData = chart.data();

    this.#tick = () => this.#reLOD();
    loop.add(this.#tick);
    this.#reLOD();
  }

  /** @returns {number|null} The currently applied level's `maxPoints`, or `null` before the first check has run. */
  get currentMaxPoints() {
    return this.#currentMaxPoints;
  }

  #reLOD() {
    const distance = this.#camera.position.distanceTo(this.#chart.scene.position);
    const level = pickLevel(this.#levels, distance);
    if (level.maxPoints === this.#currentMaxPoints) return;
    this.#currentMaxPoints = level.maxPoints;
    this.#chart.data(transform.decimate(level.maxPoints)(this.#fullData), this.#keyFn);
    this.#chart.update();
  }

  /**
   * Stops the per-frame distance check. Idempotent.
   * @example lod.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    loop.remove(this.#tick);
  }
}
