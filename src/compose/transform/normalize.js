/**
 * Creates a min-max normalization middleware for `chart.use()` (Prompt 142)
 * — rescales `field` across the whole dataset to `[0, 1]`. Returns new datum
 * objects (CLAUDE.md immutability — never mutates the input) with only
 * `field` replaced. If every datum shares the same value (`max === min`),
 * that field is set to `0` for all of them rather than dividing by zero.
 * @param {string} field The datum property to rescale.
 * @returns {(data: Array<object>) => Array<object>}
 * @throws {TypeError} If `field` isn't a non-empty string.
 * @example
 * chart.data(rows).use(transform.normalize('population'));
 */
export function normalize(field) {
  if (typeof field !== 'string' || field === '') {
    throw new TypeError(`transform.normalize: field must be a non-empty string, received ${JSON.stringify(field)}.`);
  }
  return (data) => {
    if (!Array.isArray(data)) {
      throw new TypeError(`transform.normalize()(data): expected an array, received ${JSON.stringify(data)}.`);
    }
    if (data.length === 0) return data;
    let min = Infinity;
    let max = -Infinity;
    for (const d of data) {
      const value = d[field];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const range = max - min;
    return data.map((d) => ({ ...d, [field]: range === 0 ? 0 : (d[field] - min) / range }));
  };
}
