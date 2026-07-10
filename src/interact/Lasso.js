import * as THREE from 'three';
import { createEventEmitter, dispatchToChart } from './eventEmitter.js';
import { matchedIndicesForChart } from './regionSelect.js';

const EVENTS = ['lassoStart', 'lasso', 'lassoEnd', 'select'];

/**
 * Ray-casting point-in-polygon test — a screen point is inside `points` if a
 * ray cast from it crosses the polygon's edges an odd number of times.
 * Standard, ~10-line algorithm; no dependency for something this small
 * (CLAUDE.md §1.2 KISS, same call as `registry.js`'s Levenshtein distance).
 * @param {number} x @param {number} y @param {{x: number, y: number}[]} points
 * @returns {boolean}
 */
function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const { x: xi, y: yi } = points[i];
    const { x: xj, y: yj } = points[j];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * Free-form screen-space polygon → a real `Selection` per registered chart
 * with at least one datum inside it (Prompt 152) — same drag lifecycle,
 * per-chart `'select'` firing, and "no visual rendering of its own" scope
 * split as `Brush` (see that file's doc comment); the only real difference
 * is the containment test (`pointInPolygon` vs an AABB) and that a drag
 * accumulates a point path instead of two corners.
 *
 * Also fires `chart.dispatch('lassoStart', ...)` on every registered chart
 * when the drag begins, and `chart.dispatch('lassoEnd', ...)` on each chart
 * that gets a `'select'` below (Prompt 156's chart-level event surface,
 * `scatterChart.on('lassoEnd', fn)`) — alongside, not instead of, this
 * lasso's own `on('lassoStart'|'select', ...)`.
 *
 * @example
 * const lasso = new Lasso({ camera: scene.camera.three, domElement: canvas });
 * lasso.register(scatterChart);
 * lasso.on('lasso', (points) => drawPolygonOverlay(points));
 * lasso.on('select', (selection) => selection.attr('color', 'gold'));
 */
export class Lasso {
  /** @type {THREE.Camera} */
  #camera;

  /** @type {{width: number, height: number, addEventListener: Function, removeEventListener: Function}} */
  #domElement;

  /** @type {Set<import('../chart/GraphChart.js').GraphChart>} */
  #charts = new Set();

  /** @type {ReturnType<typeof createEventEmitter>} */
  #emitter = createEventEmitter(EVENTS);

  /** @type {{x: number, y: number}[]|null} */
  #points = null;

  /** @type {(event: PointerEvent) => void} */
  #onPointerDown;
  /** @type {(event: PointerEvent) => void} */
  #onPointerMove;
  /** @type {(event: PointerEvent) => void} */
  #onPointerUp;

  /** @type {boolean} */
  #disposed = false;

  /**
   * @param {{ camera: THREE.Camera, domElement: {width: number, height: number} }} options
   * @throws {TypeError} If `camera` is not a `THREE.Camera`, or `domElement` lacks `addEventListener`/`removeEventListener`.
   * @example new Lasso({ camera: scene.camera.three, domElement: canvas });
   */
  constructor({ camera, domElement } = {}) {
    if (!(camera instanceof THREE.Camera)) {
      throw new TypeError('Lasso: camera must be a THREE.Camera instance.');
    }
    if (!domElement || typeof domElement.addEventListener !== 'function' || typeof domElement.removeEventListener !== 'function') {
      throw new TypeError('Lasso: domElement must expose addEventListener/removeEventListener.');
    }
    this.#camera = camera;
    this.#domElement = domElement;

    this.#onPointerDown = (event) => this.#handlePointerDown(event);
    this.#onPointerMove = (event) => this.#handlePointerMove(event);
    this.#onPointerUp = (event) => this.#handlePointerUp(event);
    domElement.addEventListener('pointerdown', this.#onPointerDown);
    domElement.addEventListener('pointermove', this.#onPointerMove);
    domElement.addEventListener('pointerup', this.#onPointerUp);
  }

  /**
   * Add a chart to the set tested on drag-end. No-op if already registered.
   * @param {import('../chart/GraphChart.js').GraphChart} chart Duck-typed to `selection()`.
   * @returns {this}
   * @throws {TypeError} If `chart` doesn't expose a `selection()` method.
   * @throws {Error} If called after `dispose()`.
   * @example lasso.register(scatterChart);
   */
  register(chart) {
    this.#assertNotDisposed('register');
    if (!chart || typeof chart.selection !== 'function') {
      throw new TypeError('Lasso.register: chart must expose a selection() method.');
    }
    this.#charts.add(chart);
    return this;
  }

  /**
   * Remove a chart from the set tested on drag-end. No-op if not registered.
   * @param {import('../chart/GraphChart.js').GraphChart} chart
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example lasso.unregister(scatterChart);
   */
  unregister(chart) {
    this.#assertNotDisposed('unregister');
    this.#charts.delete(chart);
    return this;
  }

  /**
   * Registers a handler for one of this lasso's events: `'lassoStart'`
   * (drag begins, called with the origin point `{x, y}`), `'lasso'` (fires
   * on every `pointermove` while dragging, called with the point path so
   * far), `'lassoEnd'` (drag ends, called with the final point path), or
   * `'select'` (called once per registered chart with ≥1 matching datum,
   * `(selection, chart)`).
   * @param {'lassoStart'|'lasso'|'lassoEnd'|'select'} event
   * @param {Function} handler
   * @returns {this}
   * @throws {TypeError} If `event` isn't recognized, or `handler` isn't a function.
   * @example lasso.on('select', (selection) => selection.attr('color', 'gold'));
   */
  on(event, handler) {
    this.#assertNotDisposed('on');
    this.#emitter.on(event, handler);
    return this;
  }

  /**
   * Removes the registered pointer listeners and clears registered charts.
   * Idempotent.
   * @example lasso.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#domElement.removeEventListener('pointerdown', this.#onPointerDown);
    this.#domElement.removeEventListener('pointermove', this.#onPointerMove);
    this.#domElement.removeEventListener('pointerup', this.#onPointerUp);
    this.#charts.clear();
    this.#points = null;
  }

  /** @param {PointerEvent} event */
  #handlePointerDown(event) {
    this.#points = [{ x: event.offsetX, y: event.offsetY }];
    this.#emitter.emit('lassoStart', { ...this.#points[0] });
    for (const chart of this.#charts) dispatchToChart(chart, 'lassoStart', { chart, origin: { ...this.#points[0] }, domEvent: event });
  }

  /** @param {PointerEvent} event */
  #handlePointerMove(event) {
    if (this.#points === null) return;
    this.#points.push({ x: event.offsetX, y: event.offsetY });
    this.#emitter.emit('lasso', [...this.#points]);
  }

  /** @param {PointerEvent} event */
  #handlePointerUp(event) {
    if (this.#points === null) return;
    this.#points.push({ x: event.offsetX, y: event.offsetY });
    const points = this.#points;
    this.#points = null;
    this.#emitter.emit('lassoEnd', [...points]);

    if (points.length < 3) return; // no enclosed area — nothing can match
    const containsFn = (x, y) => pointInPolygon(x, y, points);
    for (const chart of this.#charts) {
      const matched = matchedIndicesForChart(chart, this.#camera, this.#domElement, containsFn);
      if (matched.size === 0) continue;
      const selection = chart.selection().filter((_datum, index) => matched.has(index));
      this.#emitter.emit('select', selection, chart);
      dispatchToChart(chart, 'lassoEnd', { chart, selection, domEvent: event });
    }
  }

  /** @param {string} method @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`Lasso.${method}: this lasso has been disposed.`);
    }
  }
}
