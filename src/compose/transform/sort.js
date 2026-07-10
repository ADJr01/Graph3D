/**
 * Creates a sorting middleware for `chart.use()` (Prompt 142) — the same
 * comparator shape as `chart.sort()` (Prompt 132), exposed as a composable
 * `transform` entry so it can be interleaved with `smooth`/`decimate`/
 * `aggregate`/`normalize` in one `.use()` pipeline instead of only running
 * last via the dedicated setter. Never mutates the input array.
 * @param {(a: *, b: *) => number} compareFn
 * @returns {(data: Array) => Array}
 * @throws {TypeError} If `compareFn` isn't a function.
 * @example
 * chart.data(rows).use(transform.sort((a, b) => a.value - b.value));
 */
export function sort(compareFn) {
  if (typeof compareFn !== 'function') {
    throw new TypeError(`transform.sort: compareFn must be a function, received ${JSON.stringify(compareFn)}.`);
  }
  return (data) => {
    if (!Array.isArray(data)) {
      throw new TypeError(`transform.sort()(data): expected an array, received ${JSON.stringify(data)}.`);
    }
    return data.slice().sort(compareFn);
  };
}
