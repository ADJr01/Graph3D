const E10 = Math.sqrt(50);
const E5 = Math.sqrt(10);
const E2 = Math.sqrt(2);

/**
 * D3's tick-spec search: finds the {@link https://github.com/d3/d3-array `d3-array`}
 * "round" step (1, 2, or 5 × 10ⁿ) whose grid best covers `[start, stop]` in
 * roughly `count` divisions, plus the two grid-line indices bounding the range.
 * @param {number} start
 * @param {number} stop
 * @param {number} count
 * @returns {[number, number, number]} `[i1, i2, inc]` — first index, last index, step
 *   (negative `inc` means the true step is `1 / -inc`, for sub-1 steps).
 */
function tickSpec(start, stop, count) {
  const step = (stop - start) / Math.max(0, count);
  const power = Math.floor(Math.log10(step));
  const error = step / 10 ** power;
  const factor = error >= E10 ? 10 : error >= E5 ? 5 : error >= E2 ? 2 : 1;
  let i1;
  let i2;
  let inc;
  if (power < 0) {
    inc = 10 ** -power / factor;
    i1 = Math.round(start * inc);
    i2 = Math.round(stop * inc);
    if (i1 / inc < start) i1++;
    if (i2 / inc > stop) i2--;
    inc = -inc;
  } else {
    inc = 10 ** power * factor;
    i1 = Math.round(start / inc);
    i2 = Math.round(stop / inc);
    if (i1 * inc < start) i1++;
    if (i2 * inc > stop) i2--;
  }
  if (i2 < i1 && count >= 0.5 && count < 2) return tickSpec(start, stop, count * 2);
  return [i1, i2, inc];
}

/**
 * The "nice" step size (1, 2, or 5 × 10ⁿ) that divides `[start, stop]` into
 * approximately `count` round increments — D3's tick algorithm. Shared by
 * `continuous().nice()` today and by `scale.linear().ticks()` (Prompt 56),
 * so both agree on what a "round" number is.
 * @param {number} start
 * @param {number} stop
 * @param {number} count
 * @returns {number} Positive step size, or the negative reciprocal of a sub-1 step.
 * @example tickIncrement(1.1, 10.9, 10); // -1 (i.e. a step of 1)
 */
export function tickIncrement(start, stop, count) {
  return tickSpec(+start, +stop, +count)[2];
}

/**
 * The actual step size (always a plain positive-or-negative number, unlike
 * {@link tickIncrement}'s negative-reciprocal encoding) between ticks that
 * divide `[start, stop]` into approximately `count` round increments.
 * @param {number} start
 * @param {number} stop
 * @param {number} count
 * @returns {number}
 * @example tickStep(0, 1, 10); // 0.1
 */
export function tickStep(start, stop, count) {
  const reverse = stop < start;
  const inc = reverse ? tickIncrement(stop, start, count) : tickIncrement(start, stop, count);
  return (reverse ? -1 : 1) * (inc < 0 ? 1 / -inc : inc);
}

/**
 * D3's linear tick generator: an array of "round" values (1/2/5×10ⁿ apart)
 * spanning `[start, stop]`, suitable as axis gridlines. Ticks are the grid
 * points nearest `[start, stop]` on the step computed by {@link tickIncrement}.
 * @param {number} start
 * @param {number} stop
 * @param {number} count Target tick count — the actual count may differ
 *   slightly so ticks land on round numbers.
 * @returns {number[]}
 * @example ticks(0, 1, 5); // [0, 0.2, 0.4, 0.6, 0.8, 1]
 */
export function ticks(start, stop, count) {
  if (start === stop) return count > 0 ? [start] : [];
  const reverse = stop < start;
  const [lo, hi] = reverse ? [stop, start] : [start, stop];
  const step = tickIncrement(lo, hi, count);
  if (step === 0 || !isFinite(step)) return [];

  let result;
  if (step > 0) {
    let r0 = Math.round(lo / step);
    let r1 = Math.round(hi / step);
    if (r0 * step < lo) r0++;
    if (r1 * step > hi) r1--;
    result = new Array(r1 - r0 + 1);
    for (let i = 0; i < result.length; i++) result[i] = (r0 + i) * step;
  } else {
    const inc = -step;
    let r0 = Math.round(lo * inc);
    let r1 = Math.round(hi * inc);
    if (r0 / inc < lo) r0++;
    if (r1 / inc > hi) r1--;
    result = new Array(r1 - r0 + 1);
    for (let i = 0; i < result.length; i++) result[i] = (r0 + i) / inc;
  }

  if (reverse) result.reverse();
  return result;
}
