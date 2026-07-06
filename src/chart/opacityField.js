/**
 * Writes per-datum opacity onto `chart.selection()` when `chart.opacity()`
 * has an accessor configured — a constant or per-datum function, written as-is
 * (no palette/domain-fitting, unlike `applyColorField`). No-op if `.opacity()`
 * was never called.
 *
 * Extracted out of `ScatterChart` (Prompt 134, the first `#opacityAccessor`
 * consumer, private to that class) once `HeatmapChart` (Prompt 136) needed
 * the identical accessor + write (CLAUDE.md §1.1 DRY two-strike rule —
 * second consumer, so `.opacity()`'s storage moved onto `GraphChart` itself,
 * mirroring `.size()`/`.shape()`).
 * @param {{opacity: () => ((datum:*, index:number) => number)|null, selection: () => import('../compose/index.js').Selection}} chart
 *   Any `GraphChart` subclass — duck-typed to its `opacity()`/`selection()` getters.
 */
export function applyOpacityField(chart) {
  const opacityAccessor = chart.opacity();
  if (!opacityAccessor) return;
  chart.selection().attr('opacity', opacityAccessor);
}
