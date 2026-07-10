/**
 * Creates a decimation middleware for `chart.use()` (Prompt 142) — reduces
 * an oversized dataset to roughly `target` datums via uniform stride
 * sampling, so a chart doesn't pay for (or visually clutter with) more
 * instances than it can usefully show. A no-op when `data` is already at or
 * under `target`.
 * @param {number} target Positive integer — the desired output length.
 * @returns {(data: Array) => Array}
 * @throws {TypeError} If `target` isn't a positive integer.
 * @example
 * chart.data(hugeSeries).use(transform.decimate(500));
 */
export function decimate(target) {
  if (!Number.isInteger(target) || target < 1) {
    throw new TypeError(`transform.decimate: target must be a positive integer, received ${JSON.stringify(target)}.`);
  }
  return (data) => {
    if (!Array.isArray(data)) {
      throw new TypeError(`transform.decimate()(data): expected an array, received ${JSON.stringify(data)}.`);
    }
    if (data.length <= target) return data;
    const stride = data.length / target;
    return Array.from({ length: target }, (_, i) => data[Math.floor(i * stride)]);
  };
}
