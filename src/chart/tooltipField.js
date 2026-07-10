/**
 * Resolves what a tooltip should display for `datum` — the handler
 * `chart.tooltip(fn)` was given, or a "sensible default" if none was set: a
 * `"key: value"` line per own-enumerable property for a plain object datum,
 * or `String(datum)` otherwise.
 *
 * No hover-triggering exists yet — Phase 9's `interact/Tooltip.js` (Prompt
 * 151) owns the actual DOM element and pointer-driven show/hide. This only
 * defines *what content to show* once that lands, so it can import and reuse
 * this default formatter instead of reinventing one (CLAUDE.md §1.1 DRY —
 * building the mechanism ahead of its consumer would be scaffolding for
 * something that isn't there yet).
 * @param {{tooltip: () => ((datum:*, index:number) => *)|null}} chart
 *   Any `GraphChart` subclass — duck-typed to its `tooltip()` getter.
 * @param {*} datum
 * @param {number} index
 * @returns {*} The configured handler's return value, or the default formatted string.
 * @example resolveTooltipContent(chart, hitDatum, 0); // 'value: 42\ncategory: "a"'
 */
export function resolveTooltipContent(chart, datum, index) {
  const handler = chart.tooltip();
  if (handler) return handler(datum, index);
  if (datum !== null && typeof datum === 'object') {
    return Object.entries(datum)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');
  }
  return String(datum);
}
