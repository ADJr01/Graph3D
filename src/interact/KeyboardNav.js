import { StateMachine } from './StateMachine.js';
import { dispatchToChart } from './eventEmitter.js';

/**
 * Default per-datum description for the ARIA live region: a `"key: value"`
 * line per own-enumerable property for a plain object datum, or `String(datum)`
 * otherwise — the same convention `chart/tooltipField.js`'s `resolveTooltipContent`
 * default uses, kept as a small local copy rather than importing that internal
 * file: `interact/` may only import `chart/`'s public surface (`chart/index.js`,
 * CLAUDE.md §1.4), which doesn't re-export it, and the two serve different
 * purposes anyway (a tooltip's *configured* handler may return rich/markup
 * content unsuitable for a screen reader to read aloud, so this deliberately
 * never consults `chart.tooltip()`).
 * @param {*} datum
 * @returns {string}
 */
function defaultDescribe(datum) {
  if (datum !== null && typeof datum === 'object') {
    return Object.entries(datum).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(', ');
  }
  return String(datum);
}

/**
 * Builds the visually-hidden (but screen-reader-visible) `aria-live="polite"`
 * `<div>` `KeyboardNav` announces into — the standard "sr-only" pattern
 * (absolutely positioned, 1×1px, clipped, non-scrolling) rather than
 * `display:none`/`visibility:hidden`, either of which would also hide it from
 * assistive tech and defeat the entire point.
 * @returns {HTMLElement}
 */
function createLiveRegion() {
  const element = document.createElement('div');
  element.setAttribute('aria-live', 'polite');
  element.setAttribute('aria-atomic', 'true');
  Object.assign(element.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
  });
  document.body.appendChild(element);
  return element;
}

/**
 * Keyboard-driven accessible navigation across every registered chart's
 * datums (Prompt 154) — the keyboard counterpart to `PointerRouter`'s mouse
 * driving of the same `StateMachine` vocabulary, but deliberately a separate
 * class rather than folded into `PointerRouter`: a different event source
 * (`keydown`, not pointer events), a different registered-target shape (an
 * ordered list of charts to cycle through, not a `Picker` to ray-test), and a
 * DOM resource of its own (the ARIA live region) — the same "small, focused
 * file per concern" split `Brush`/`Lasso`/`regionSelect.js` already follow.
 *
 * - **Tab** (Shift+Tab to go backwards) advances a single roving focus
 *   cursor across every registered chart's current `data()`, in
 *   registration order, wrapping at both ends; the previously-focused datum
 *   (if any) returns to `'default'` and the newly-focused one becomes
 *   `'focused'` via that chart's own `StateMachine` (a fresh one per chart,
 *   cached the same way `PointerRouter.stateMachineFor` caches its own —
 *   see the "Scope" note below for what that means when both are used on the
 *   same chart). `preventDefault()` is called so the browser's own
 *   focus-shifting Tab behavior doesn't also fire.
 * - **Enter** selects the currently-focused datum (`'selected'`), replacing
 *   whatever this class had previously selected (`'default'` — or `'focused'`
 *   if it's still the focus cursor's current position — mirrors
 *   `PointerRouter`'s own non-Shift-click "single-select replaces" rule).
 *   A no-op if nothing is currently focused.
 * - **Escape** clears the current keyboard-driven selection (back to
 *   `'focused'` if it's still under the focus cursor, else `'default'`)
 *   without moving the focus cursor itself — matches the ARIA APG listbox/grid
 *   pattern (Escape drops a selection, Tab/arrow position is preserved so the
 *   user doesn't lose their place). A no-op if nothing is currently selected.
 * - Every Tab/Enter/Escape action also updates the ARIA live region's text
 *   (`describe(datum, chart)`, default a `"key: value"` summary) so a screen
 *   reader announces it.
 * - Tab also calls `chart.dispatch('focus', {chart, datum, domEvent})`; Enter
 *   calls `chart.dispatch('select', ...)` (and `'deselect'` on whatever chart
 *   held the previous selection, if different); Escape calls
 *   `chart.dispatch('deselect', ...)` (Prompt 156's chart-level event
 *   surface, `barChart.on('focus', fn)`) — alongside, not instead of, the
 *   `StateMachine`/live-region updates above.
 *
 * **Scope**: `KeyboardNav` keeps its own `StateMachine` cache, independent of
 * any `PointerRouter`'s — if both are used against the same chart, they don't
 * share "what's currently selected" bookkeeping (each only clears what it
 * itself selected), a known, documented gap (`skipping_list.md`), not a
 * silent bug — `PointerRouter` exposes no public API for "the current
 * cross-chart selection" that this class could read/clear instead.
 *
 * @example
 * const nav = new KeyboardNav({ domElement: canvas });
 * nav.register(barChart).register(scatterChart);
 * // Tab into the canvas, then Tab/Shift+Tab to move, Enter to select, Esc to clear.
 */
export class KeyboardNav {
  /** @type {{addEventListener: Function, removeEventListener: Function}} */
  #domElement;

  /** @type {(datum: *, chart: *) => string} */
  #describe;

  /** @type {import('../chart/GraphChart.js').GraphChart[]} Registration order, no duplicates. */
  #charts = [];

  /** @type {Map<import('../chart/GraphChart.js').GraphChart, StateMachine>} */
  #stateMachines = new Map();

  /** @type {HTMLElement} */
  #liveRegion;

  /** @type {number} Index into the flattened `{chart, datum}` list, `-1` if nothing is focused. */
  #focusIndex = -1;

  /** @type {import('../chart/GraphChart.js').GraphChart|null} */
  #focusedChart = null;

  /** @type {*} */
  #focusedDatum = null;

  /** @type {import('../chart/GraphChart.js').GraphChart|null} */
  #selectedChart = null;

  /** @type {*} */
  #selectedDatum = null;

  /** @type {(domEvent: *) => void} */
  #onKeyDown;

  /** @type {boolean} */
  #disposed = false;

  /**
   * @param {{ domElement: {addEventListener: Function, removeEventListener: Function},
   *   describe?: (datum: *, chart: *) => string }} options `domElement` also gets
   *   `tabIndex = 0` if it doesn't already have a non-negative one, so it can
   *   actually receive keyboard focus (a canvas has none by default). `describe`
   *   formats a datum for the ARIA live region; defaults to a `"key: value"` summary.
   * @throws {TypeError} If `domElement` doesn't expose `addEventListener`/`removeEventListener`, or `describe` is given and isn't a function.
   * @example new KeyboardNav({ domElement: canvas });
   */
  constructor({ domElement, describe = defaultDescribe } = {}) {
    if (!domElement || typeof domElement.addEventListener !== 'function' || typeof domElement.removeEventListener !== 'function') {
      throw new TypeError('KeyboardNav: domElement must expose addEventListener/removeEventListener.');
    }
    if (typeof describe !== 'function') {
      throw new TypeError(`KeyboardNav: describe must be a function, received ${JSON.stringify(describe)}.`);
    }
    if (!(domElement.tabIndex > -1)) domElement.tabIndex = 0;

    this.#domElement = domElement;
    this.#describe = describe;
    this.#liveRegion = createLiveRegion();
    this.#onKeyDown = (domEvent) => this.#handleKeyDown(domEvent);
    domElement.addEventListener('keydown', this.#onKeyDown);
  }

  /**
   * The live region element this instance announces into — exposed mainly
   * for tests/inspection (`nav.liveRegion.textContent`); callers don't
   * normally need to touch it directly.
   * @returns {HTMLElement}
   * @example nav.liveRegion.textContent; // 'value: 42, category: "a" (2 of 5)'
   */
  get liveRegion() {
    return this.#liveRegion;
  }

  /**
   * Adds a chart to the Tab cycle. No-op if already registered.
   * @param {import('../chart/GraphChart.js').GraphChart} chart Duck-typed to `selection()`/`data()`.
   * @returns {this}
   * @throws {TypeError} If `chart` doesn't expose `selection()`/`data()` methods.
   * @throws {Error} If called after `dispose()`.
   * @example nav.register(barChart);
   */
  register(chart) {
    this.#assertNotDisposed('register');
    if (!chart || typeof chart.selection !== 'function' || typeof chart.data !== 'function') {
      throw new TypeError('KeyboardNav.register: chart must expose selection()/data() methods.');
    }
    if (!this.#charts.includes(chart)) this.#charts.push(chart);
    return this;
  }

  /**
   * Removes a chart from the Tab cycle. No-op if not registered.
   * @param {import('../chart/GraphChart.js').GraphChart} chart
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example nav.unregister(barChart);
   */
  unregister(chart) {
    this.#assertNotDisposed('unregister');
    const index = this.#charts.indexOf(chart);
    if (index !== -1) this.#charts.splice(index, 1);
    return this;
  }

  /**
   * The `StateMachine` this instance drives for `chart`, creating one
   * (lazily, cached thereafter) on first access — mirrors
   * `PointerRouter.stateMachineFor` exactly, letting a caller configure
   * `.style('focused', ...)` (e.g. a focus ring) the same way it would
   * configure `'hovered'`/`'selected'` on a `PointerRouter`. See the class
   * doc comment's "Scope" note: this cache is independent of any
   * `PointerRouter`'s own.
   * @param {import('../chart/GraphChart.js').GraphChart} chart
   * @returns {StateMachine}
   * @throws {Error} If called after `dispose()`.
   * @example nav.stateMachineFor(barChart).style('focused', (s) => s.attr('scale.x', 1.1));
   */
  stateMachineFor(chart) {
    this.#assertNotDisposed('stateMachineFor');
    let stateMachine = this.#stateMachines.get(chart);
    if (!stateMachine) {
      stateMachine = new StateMachine(chart);
      this.#stateMachines.set(chart, stateMachine);
    }
    return stateMachine;
  }

  /**
   * Removes the `keydown` listener and the ARIA live region from the
   * document, and releases this instance's `StateMachine`s/focus/selection
   * bookkeeping. Idempotent. Does not reset any datum's current state —
   * charts/state machines may still be in use elsewhere after this instance
   * is gone.
   * @example nav.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#domElement.removeEventListener('keydown', this.#onKeyDown);
    this.#liveRegion.remove();
    this.#charts = [];
    this.#stateMachines.clear();
    this.#focusIndex = -1;
    this.#focusedChart = null;
    this.#focusedDatum = null;
    this.#selectedChart = null;
    this.#selectedDatum = null;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /** @param {*} domEvent */
  #handleKeyDown(domEvent) {
    if (domEvent.key === 'Tab') {
      domEvent.preventDefault();
      this.#moveFocus(domEvent.shiftKey ? -1 : 1, domEvent);
    } else if (domEvent.key === 'Enter') {
      this.#selectFocused(domEvent);
    } else if (domEvent.key === 'Escape') {
      this.#clearSelection(domEvent);
    }
  }

  /** @returns {{chart: import('../chart/GraphChart.js').GraphChart, datum: *}[]} Recomputed fresh on every call — a chart's `data()` may change between key presses. */
  #flattenEntries() {
    const entries = [];
    for (const chart of this.#charts) {
      for (const datum of chart.data()) entries.push({ chart, datum });
    }
    return entries;
  }

  /** @param {1|-1} direction @param {*} domEvent */
  #moveFocus(direction, domEvent) {
    const entries = this.#flattenEntries();
    if (entries.length === 0) return;

    if (this.#focusedChart) this.stateMachineFor(this.#focusedChart).setState(this.#focusedDatum, 'default');
    this.#focusIndex = ((this.#focusIndex + direction) % entries.length + entries.length) % entries.length;
    const { chart, datum } = entries[this.#focusIndex];
    this.stateMachineFor(chart).setState(datum, 'focused');
    this.#focusedChart = chart;
    this.#focusedDatum = datum;
    dispatchToChart(chart, 'focus', { chart, datum, domEvent });
    this.#announce(`${this.#describe(datum, chart)} (${this.#focusIndex + 1} of ${entries.length})`);
  }

  /** @param {*} domEvent */
  #selectFocused(domEvent) {
    if (!this.#focusedChart) return;
    const isSameAsSelected = this.#selectedChart === this.#focusedChart && this.#selectedDatum === this.#focusedDatum;
    if (this.#selectedChart && !isSameAsSelected) {
      this.stateMachineFor(this.#selectedChart).setState(this.#selectedDatum, 'default');
      dispatchToChart(this.#selectedChart, 'deselect', { chart: this.#selectedChart, datum: this.#selectedDatum, domEvent });
    }
    this.stateMachineFor(this.#focusedChart).setState(this.#focusedDatum, 'selected');
    this.#selectedChart = this.#focusedChart;
    this.#selectedDatum = this.#focusedDatum;
    dispatchToChart(this.#selectedChart, 'select', { chart: this.#selectedChart, datum: this.#selectedDatum, domEvent });
    this.#announce(`Selected ${this.#describe(this.#focusedDatum, this.#focusedChart)}`);
  }

  /** @param {*} domEvent */
  #clearSelection(domEvent) {
    if (!this.#selectedChart) return;
    const stillFocused = this.#selectedChart === this.#focusedChart && this.#selectedDatum === this.#focusedDatum;
    this.stateMachineFor(this.#selectedChart).setState(this.#selectedDatum, stillFocused ? 'focused' : 'default');
    dispatchToChart(this.#selectedChart, 'deselect', { chart: this.#selectedChart, datum: this.#selectedDatum, domEvent });
    this.#selectedChart = null;
    this.#selectedDatum = null;
    this.#announce('Selection cleared');
  }

  /** @param {string} text */
  #announce(text) {
    this.#liveRegion.textContent = text;
  }

  /** @param {string} method @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`KeyboardNav.${method}: this instance has been disposed.`);
    }
  }
}
