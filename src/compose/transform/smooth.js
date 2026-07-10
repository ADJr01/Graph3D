/**
 * Creates a moving-average smoothing middleware for `chart.use()` (Prompt
 * 142) — operates on a plain `number[]` (no per-datum field, per the
 * project's own decision: charts whose default `y` accessor is the identity
 * function already bind bare numbers directly, so this is the common case,
 * not a limitation). Each output value is the average of up to `window`
 * neighbors centered on it; the window shrinks at the array's edges rather
 * than wrapping or padding, so the output array is always the same length
 * as the input.
 * @param {number} window Positive integer neighbor count (e.g. `5` averages
 *   each value with its 2 neighbors on each side). `1` is a no-op.
 * @returns {(data: number[]) => number[]}
 * @throws {TypeError} If `window` isn't a positive integer.
 * @example
 * chart.data(rawSamples).use(transform.smooth(5));
 */
export function smooth(window) {
  if (!Number.isInteger(window) || window < 1) {
    throw new TypeError(`transform.smooth: window must be a positive integer, received ${JSON.stringify(window)}.`);
  }
  const half = Math.floor(window / 2);
  return (data) => {
    if (!Array.isArray(data)) {
      throw new TypeError(`transform.smooth()(data): expected an array, received ${JSON.stringify(data)}.`);
    }
    return data.map((_, i) => {
      const start = Math.max(0, i - half);
      const end = Math.min(data.length, i + half + 1);
      let sum = 0;
      for (let j = start; j < end; j++) sum += data[j];
      return sum / (end - start);
    });
  };
}
