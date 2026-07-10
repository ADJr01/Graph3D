import * as THREE from 'three';
import { createEventEmitter, dispatchToChart } from './eventEmitter.js';
import { matchedIndicesForChart } from './regionSelect.js';

const EVENTS = ['brushStart', 'brush', 'brushEnd', 'select'];

/**
 * Draggable axis-aligned screen-space rectangle → a real `Selection` per
 * registered chart with at least one datum inside it (Prompt 152). Attaches
 * real `pointerdown`/`pointermove`/`pointerup` listeners to `domElement` and
 * tracks a drag gesture; on release, projects every registered chart's
 * datums to screen space (`interact/regionSelect.js`, shared with `Lasso`)
 * and tests each against the final rectangle.
 *
 * Deliberately does not render the drag rectangle itself — same scope split
 * as `Picker` not rendering a cursor, `PointerRouter` not rendering a
 * tooltip: `interact/` detects, callers decide what (if anything) to draw.
 * Listen for `'brush'` (fires on every `pointermove` while dragging, with
 * the rectangle so far) to draw a live overlay.
 *
 * A `Selection` can't span multiple charts' backends (`Selection.merge()`
 * throws across different charts/`GraphInstancedObject`s — `compose/selection/combinators.js`),
 * so `'select'` fires once per chart that has ≥1 match, not once per drag —
 * a single-chart setup collapses to exactly one `'select'` call, matching
 * the prompt's own "emit `select` with a real `Selection`" wording.
 *
 * Also fires `chart.dispatch('brushStart', ...)` on every registered chart
 * when the drag begins, and `chart.dispatch('brushEnd', ...)` on each chart
 * that gets a `'select'` above (Prompt 156's chart-level event surface,
 * `barChart.on('brushEnd', fn)`) — alongside, not instead of, this brush's
 * own `on('brushStart'|'select', ...)`.
 *
 * @example
 * const brush = new Brush({ camera: scene.camera.three, domElement: canvas });
 * brush.register(barChart).register(scatterChart);
 * brush.on('select', (selection, chart) => selection.attr('color', 'gold'));
 */
export class Brush {
  /** @type {THREE.Camera} */
  #camera;

  /** @type {{width: number, height: number, addEventListener: Function, removeEventListener: Function}} */
  #domElement;

  /** @type {Set<import('../chart/GraphChart.js').GraphChart>} */
  #charts = new Set();

  /** @type {ReturnType<typeof createEventEmitter>} */
  #emitter = createEventEmitter(EVENTS);

  /** @type {{x: number, y: number}|null} drag origin, in domElement-local pixel coordinates */
  #origin = null;

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
   * @example new Brush({ camera: scene.camera.three, domElement: canvas });
   */
  constructor({ camera, domElement } = {}) {
    if (!(camera instanceof THREE.Camera)) {
      throw new TypeError('Brush: camera must be a THREE.Camera instance.');
    }
    if (!domElement || typeof domElement.addEventListener !== 'function' || typeof domElement.removeEventListener !== 'function') {
      throw new TypeError('Brush: domElement must expose addEventListener/removeEventListener.');
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
   * @example brush.register(barChart);
   */
  register(chart) {
    this.#assertNotDisposed('register');
    if (!chart || typeof chart.selection !== 'function') {
      throw new TypeError('Brush.register: chart must expose a selection() method.');
    }
    this.#charts.add(chart);
    return this;
  }

  /**
   * Remove a chart from the set tested on drag-end. No-op if not registered.
   * @param {import('../chart/GraphChart.js').GraphChart} chart
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example brush.unregister(barChart);
   */
  unregister(chart) {
    this.#assertNotDisposed('unregister');
    this.#charts.delete(chart);
    return this;
  }

  /**
   * Registers a handler for one of this brush's events: `'brushStart'`
   * (drag begins, called with the origin `{x, y}`), `'brush'` (fires on
   * every `pointermove` while dragging, called with the current rectangle
   * `{x, y, width, height}`), `'brushEnd'` (drag ends, called with the final
   * rectangle), or `'select'` (called once per registered chart with ≥1
   * matching datum, `(selection, chart)`).
   * @param {'brushStart'|'brush'|'brushEnd'|'select'} event
   * @param {Function} handler
   * @returns {this}
   * @throws {TypeError} If `event` isn't recognized, or `handler` isn't a function.
   * @example brush.on('select', (selection, chart) => selection.attr('color', 'gold'));
   */
  on(event, handler) {
    this.#assertNotDisposed('on');
    this.#emitter.on(event, handler);
    return this;
  }

  /**
   * Removes the registered pointer listeners and clears registered charts.
   * Idempotent.
   * @example brush.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#domElement.removeEventListener('pointerdown', this.#onPointerDown);
    this.#domElement.removeEventListener('pointermove', this.#onPointerMove);
    this.#domElement.removeEventListener('pointerup', this.#onPointerUp);
    this.#charts.clear();
    this.#origin = null;
  }

  /** @param {PointerEvent} event */
  #handlePointerDown(event) {
    this.#origin = { x: event.offsetX, y: event.offsetY };
    this.#emitter.emit('brushStart', { ...this.#origin });
    for (const chart of this.#charts) dispatchToChart(chart, 'brushStart', { chart, origin: { ...this.#origin }, domEvent: event });
  }

  /** @param {PointerEvent} event */
  #handlePointerMove(event) {
    if (this.#origin === null) return;
    this.#emitter.emit('brush', this.#rectFor(event.offsetX, event.offsetY));
  }

  /** @param {PointerEvent} event */
  #handlePointerUp(event) {
    if (this.#origin === null) return;
    const rect = this.#rectFor(event.offsetX, event.offsetY);
    this.#origin = null;
    this.#emitter.emit('brushEnd', rect);

    const containsFn = (x, y) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
    for (const chart of this.#charts) {
      const matched = matchedIndicesForChart(chart, this.#camera, this.#domElement, containsFn);
      if (matched.size === 0) continue;
      const selection = chart.selection().filter((_datum, index) => matched.has(index));
      this.#emitter.emit('select', selection, chart);
      dispatchToChart(chart, 'brushEnd', { chart, selection, domEvent: event });
    }
  }

  /** @param {number} x @param {number} y @returns {{x: number, y: number, width: number, height: number}} The normalized (positive width/height) rectangle from `#origin` to `(x, y)`. */
  #rectFor(x, y) {
    const { x: ox, y: oy } = this.#origin;
    return { x: Math.min(ox, x), y: Math.min(oy, y), width: Math.abs(x - ox), height: Math.abs(y - oy) };
  }

  /** @param {string} method @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`Brush.${method}: this brush has been disposed.`);
    }
  }
}
