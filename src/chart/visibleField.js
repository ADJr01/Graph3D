/**
 * Writes per-datum visibility onto `chart.selection()` when `chart.visible()`
 * has an accessor configured — a constant or per-datum predicate, written
 * as-is (`Selection.attr('visible', ...)`, Prompt 75, already supports both
 * the meshes and instanced backends). No-op if `.visible()` was never called.
 *
 * Mirrors `chart/opacityField.js` exactly (CLAUDE.md §1.1 DRY) — the
 * simplest of Prompt 141's per-datum style fields, a direct passthrough
 * with no domain-fitting (`applyColorField`) or read-then-multiply
 * (`applySizeField`).
 * @param {{visible: () => ((datum:*, index:number) => boolean)|null, selection: () => import('../compose/index.js').Selection}} chart
 *   Any `GraphChart` subclass — duck-typed to its `visible()`/`selection()` getters.
 */
export function applyVisibleField(chart) {
  const visibleAccessor = chart.visible();
  if (!visibleAccessor) return;
  chart.selection().attr('visible', visibleAccessor);
}
