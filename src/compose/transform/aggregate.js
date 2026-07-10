/**
 * Creates a group-and-reduce middleware for `chart.use()` (Prompt 142) —
 * groups datums by `keyFn(datum, index)`, then collapses each group into one
 * output datum via `reducer(group, key)`. Groups appear in first-occurrence
 * order.
 * @param {(datum: *, index: number) => *} keyFn Grouping key, compared with `===`.
 * @param {(group: Array, key: *) => *} reducer Combines one group's datums into a single output datum.
 * @returns {(data: Array) => Array}
 * @throws {TypeError} If `keyFn` or `reducer` isn't a function.
 * @example
 * chart.data(rows).use(transform.aggregate(
 *   (d) => d.category,
 *   (group, key) => ({ category: key, total: group.reduce((sum, d) => sum + d.value, 0) }),
 * ));
 */
export function aggregate(keyFn, reducer) {
  if (typeof keyFn !== 'function') {
    throw new TypeError(`transform.aggregate: keyFn must be a function, received ${JSON.stringify(keyFn)}.`);
  }
  if (typeof reducer !== 'function') {
    throw new TypeError(`transform.aggregate: reducer must be a function, received ${JSON.stringify(reducer)}.`);
  }
  return (data) => {
    if (!Array.isArray(data)) {
      throw new TypeError(`transform.aggregate()(data): expected an array, received ${JSON.stringify(data)}.`);
    }
    const groups = new Map();
    data.forEach((d, i) => {
      const key = keyFn(d, i);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    });
    return Array.from(groups, ([key, group]) => reducer(group, key));
  };
}
