import { color, palette } from '../compose/index.js';

/**
 * Writes per-datum colors onto `chart.selection()` when `chart.color()` has
 * an accessor configured, falling back to `palette.viridis` if no palette
 * was given. No-op if `.color()` was never called.
 *
 * Dispatches on the palette's shape (Prompt 139 fix — discovered via
 * `PieChart`'s own example, but affects every prior consumer of this
 * helper): a categorical palette (`palette.category10` and friends,
 * `.categorical === true`, `compose/palette/categorical.js`) is already a
 * complete key→color mapping — it's called directly with the raw datum
 * value, the same way `LineChart.series()` already calls
 * `palette.category10(key)` — since wrapping it in `color.sequential`'s
 * `[min, max]` domain-fitting (meant for a continuous ramp like
 * `palette.viridis`, which expects a `t` in `[0, 1]`) fed it a broken
 * numeric domain for non-numeric category keys and silently collapsed every
 * datum to the same color. Anything else (the default, or an explicit
 * continuous ramp) keeps the original `color.sequential` fit to `data`'s
 * `[min, max]`.
 *
 * Extracted out of `BarChart` (Prompt 132, the first `#colorField` consumer)
 * once `ScatterChart` (Prompt 134) needed the identical logic (CLAUDE.md
 * §1.1 DRY two-strike rule — second consumer).
 * @param {{color: () => {accessor: (Function|null), palette: *}, selection: () => import('../compose/index.js').Selection}} chart
 *   Any `GraphChart` subclass — duck-typed to its `color()`/`selection()` getters.
 * @param {Array} data
 */
export function applyColorField(chart, data) {
  const { accessor: colorAccessor, palette: userPalette } = chart.color();
  if (!colorAccessor) return;

  if (userPalette?.categorical) {
    chart.selection().attr('color', (d, i) => userPalette(colorAccessor(d, i)));
    return;
  }

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = colorAccessor(data[i], i);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const scale = color.sequential(userPalette ?? palette.viridis, [min, max]);
  chart.selection().attr('color', (d, i) => scale(colorAccessor(d, i)));
}
