import { bandCenter } from '../compose/scale/index.js';

/**
 * Fits a scaled axis field's domain to `data`, via that field's own
 * accessor — continuous scales (anything exposing `.invert`, e.g.
 * `scale.linear`) get `[min, max]`; ordinal-like scales (`.band`/`.point`/
 * `.ordinal`, no `.invert`) get the raw per-datum values, since their own
 * `domain()` setter already dedupes (`ordinal.js`). No-op if the field has
 * no scale attached. Manual min/max loop rather than `Math.min(...values)` —
 * this project's north star is million-datum charts, and spreading that many
 * arguments risks a stack overflow.
 *
 * Extracted from `GraphChart` (Prompt 129) once `LineChart` (Prompt 133)
 * needed the exact same fitting — `GraphChart`'s own version was a private
 * method, unreachable by a sibling subclass (CLAUDE.md §1.1 DRY two-strike
 * rule: second consumer, so it moves to a shared module instead of being
 * duplicated).
 * @param {{accessor: (datum:*, index:number) => *, scale: object|null}} field
 * @param {Array} data
 */
export function applyAxisScaleDomain(field, data) {
  const { accessor: fieldAccessor, scale } = field;
  if (!scale) return;
  if (typeof scale.invert === 'function') {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < data.length; i++) {
      const v = fieldAccessor(data[i], i);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    scale.domain([min, max]);
  } else {
    const values = new Array(data.length);
    for (let i = 0; i < data.length; i++) values[i] = fieldAccessor(data[i], i);
    scale.domain(values);
  }
}

/**
 * Composes an axis field's accessor with its scale (if any) into the single
 * `(datum, index) => value` function a generator's `x`/`y`/`z` setter expects.
 * Adds `bandCenter(scale)` so a band scale's data lands at the band's center
 * — matching `Axis`'s tick/label placement — rather than its start edge;
 * a no-op for every other scale type (CLAUDE.md §1.1 DRY two-strike rule:
 * `Axis.js` was the first caller of this offset, this is the second).
 * @param {{accessor: (datum:*, index:number) => *, scale: object|null}} field
 * @returns {(datum:*, index:number) => *}
 */
export function resolveAxisAccessor(field) {
  const { accessor: fieldAccessor, scale } = field;
  return scale ? (d, i) => scale(fieldAccessor(d, i)) + bandCenter(scale) : fieldAccessor;
}
