/**
 * Coordinated multi-view filtering: `link(source, target, { transform })`
 * wires `source`'s `'select'` event — emitted by `Brush`/`Lasso` (Prompt 152)
 * with `(selection, chart)`, and, as of Prompt 156, by a plain `GraphChart`'s
 * own `dispatch('select', payload)` too, with a *different* shape:
 * `payload.datum` (a single hit), not a `Selection`. `#selectedDataFrom`
 * (below) normalizes both into a plain array before `transform` ever sees it,
 * so whenever a selection is made in `source`, `target`'s data is re-filtered
 * and re-rendered to match either way. Calling `link()` again with a
 * different `target` links the same `source` to a second (third, ...) chart,
 * which is how one source ends up filtering several targets ("B/C") — no
 * separate multi-target API is needed; calling it again with a different
 * `target` *and* `source` — e.g. `link(chartB, chartC)` after `link(chartA,
 * chartB)` — is how a selection **propagates** through a chain, since
 * `chartB` re-rendering from `link()`'s first call doesn't stop it from also
 * being a `source` in its own right for a second.
 *
 * `target`'s full dataset is captured once, at `link()` time (via
 * `target.data()`) — every subsequent `'select'` re-filters from that
 * captured snapshot, not from whatever `target.data()` currently holds, so
 * repeated filtering (e.g. narrowing a brush, then widening it) always
 * measures against the original rows instead of compounding on the previous
 * filter's output.
 *
 * `interact/` operates on `chart/`'s public API only (CLAUDE.md §1.4) — both
 * `source` and `target` are duck-typed (`on()`; `data()`/`render()`), never
 * imported as concrete classes, matching `Picker`/`StateMachine`'s existing
 * convention.
 *
 * @param {{on: (event: string, handler: Function) => void}} source Anything emitting `'select'` — a `Brush`/`Lasso` (`(selection, chart)`, `Selection` has `.data()`) or a `GraphChart` (`(payload)`, `payload.datum` is a single hit).
 * @param {{data: (arr?: Array, keyFn?: Function) => *, render: () => *}} target The chart to filter.
 * @param {{transform?: (selectedData: Array) => (datum: *) => boolean}} [options] `transform` maps the array of currently-selected data in `source` to a predicate applied to `target`'s captured dataset. Defaults to reference membership (`selectedData.includes(datum)`) — the common case where `source` and `target` render different views over the *same* row objects.
 * @returns {void}
 * @throws {TypeError} If `source` doesn't expose `on()`, `target` doesn't expose `data()`/`render()`, or `transform` is given and isn't a function.
 * @example
 * const brush = new Brush({ camera, domElement });
 * brush.register(scatterChart);
 * link(brush, barChart, {
 *   transform: (selected) => {
 *     const categories = new Set(selected.map((d) => d.category));
 *     return (d) => categories.has(d.category);
 *   },
 * });
 * @example
 * // A plain chart click as the source (Prompt 156) — propagating A -> B -> C.
 * link(chartA, chartB);
 * link(chartB, chartC);
 */
export function link(source, target, options = {}) {
  if (!source || typeof source.on !== 'function') {
    throw new TypeError('CrossFilter.link: source must expose an on(event, handler) method.');
  }
  if (!target || typeof target.data !== 'function' || typeof target.render !== 'function') {
    throw new TypeError('CrossFilter.link: target must expose data()/render() methods.');
  }
  const { transform = defaultTransform } = options;
  if (typeof transform !== 'function') {
    throw new TypeError(`CrossFilter.link: transform must be a function, received ${JSON.stringify(transform)}.`);
  }

  const baseData = target.data();
  source.on('select', (selectionOrHit) => {
    const predicate = transform(selectedDataFrom(selectionOrHit));
    target.data(baseData.filter(predicate));
    target.render();
  });
}

/**
 * Normalizes `source`'s `'select'` payload into a plain array of selected
 * data, regardless of which shape fired it: a real `Selection` (`Brush`/
 * `Lasso`, `(selection, chart)`) via its own `.data()`, or a `GraphChart`
 * interaction-event payload (`dispatch('select', payload)`, Prompt 156) via
 * its single `payload.datum`.
 * @param {*} selectionOrHit
 * @returns {Array}
 */
function selectedDataFrom(selectionOrHit) {
  return typeof selectionOrHit.data === 'function' ? selectionOrHit.data() : [selectionOrHit.datum];
}

/**
 * @param {Array} selectedData
 * @returns {(datum: *) => boolean}
 */
function defaultTransform(selectedData) {
  return (datum) => selectedData.includes(datum);
}
