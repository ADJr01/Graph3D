/**
 * Minimal named-event registry — `on(event, handler)` accumulates handlers
 * (registration order), `emit(event, ...args)` calls every handler for that
 * event. The third copy of this exact shape in the codebase after
 * `GraphChart.on()` (fixed `'enter'/'update'/'exit'` vocabulary) and
 * `Selection.on()` (open vocabulary, dispatched externally) — neither is
 * reusable as-is (one's chart-shaped, the other's keyed to hit-node
 * membership across a module-level registry), so `Brush`/`Lasso` needing the
 * identical "fixed vocabulary, accumulate, call in order" bookkeeping is
 * what justifies extracting it here (CLAUDE.md §1.1 DRY two-strike rule).
 * @param {string[]} validEvents
 * @returns {{on: (event: string, handler: Function) => void, emit: (event: string, ...args: *) => void}}
 * @example
 * const emitter = createEventEmitter(['start', 'end']);
 * emitter.on('start', () => console.log('started'));
 * emitter.emit('start');
 */
export function createEventEmitter(validEvents) {
  const events = new Set(validEvents);
  /** @type {Map<string, Function[]>} */
  const handlers = new Map();

  return {
    /**
     * @param {string} event
     * @param {Function} handler
     * @throws {TypeError} If `event` isn't one of `validEvents`, or `handler` isn't a function.
     */
    on(event, handler) {
      if (!events.has(event)) {
        throw new TypeError(`event must be one of ${[...events].join(', ')}, received ${JSON.stringify(event)}.`);
      }
      if (typeof handler !== 'function') {
        throw new TypeError(`handler must be a function, received ${JSON.stringify(handler)}.`);
      }
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(handler);
    },

    /** @param {string} event @param {...*} args */
    emit(event, ...args) {
      for (const handler of handlers.get(event) ?? []) handler(...args);
    },
  };
}

/**
 * Fires `chart.dispatch(event, payload)` (`GraphChart`'s own interaction-event
 * surface, Prompt 156) — duck-type-guarded since every `interact/` class only
 * ever requires a registered `chart` to expose `selection()` (a bare test
 * double might not have `.dispatch()`, though a real `GraphChart` always
 * does). Extracted here once a third call site (`PointerRouter`, `Brush`,
 * `Lasso`) needed the identical one-line guard (CLAUDE.md §1.1 DRY two-strike
 * rule) — `KeyboardNav` uses it too, for four total.
 * @param {*} chart
 * @param {string} event
 * @param {*} payload
 * @example dispatchToChart(hit.chart, 'select', { ...hit, domEvent });
 */
export function dispatchToChart(chart, event, payload) {
  if (typeof chart.dispatch === 'function') chart.dispatch(event, payload);
}
