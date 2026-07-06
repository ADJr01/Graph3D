import { accessorField } from '../generator/accessor.js';

const DEFAULT_VALUE = (d) => d;
const DEFAULT_START_ANGLE = 0;
const DEFAULT_END_ANGLE = Math.PI * 2;
const DEFAULT_PAD_ANGLE = 0;

/**
 * Creates a chainable pie layout: turns per-datum values into proportional
 * angular `[startAngle, endAngle]` slices summing to a full sweep — the same
 * shape as `d3.pie()` (d3-shape parity, mirroring `layout.stack()`'s own
 * "callable factory" convention). `pie(data)` returns one entry per datum
 * (in the original `data` order, regardless of `.sort()`), each
 * `{ data, value, index, startAngle, endAngle, padAngle }` — ready for
 * `PieChart`/`generator.arc()` to extrude into wedges.
 * @returns {{
 *   value: (valueOrFn?: *) => (Function|object),
 *   sort: (compareFn?: ((a: *, b: *) => number)|null) => (((a: *, b: *) => number)|null|object),
 *   startAngle: (value?: number) => (number|object),
 *   endAngle: (value?: number) => (number|object),
 *   padAngle: (value?: number) => (number|object),
 * } & ((data: Array) => Array<{data: *, value: number, index: number, startAngle: number, endAngle: number, padAngle: number}>)}
 * @example
 * const p = layout.pie().value((d) => d.count);
 * p([{ count: 1 }, { count: 3 }]);
 * // [{ data: {count:1}, value: 1, index: 0, startAngle: 0, endAngle: Math.PI/2, padAngle: 0 },
 * //  { data: {count:3}, value: 3, index: 1, startAngle: Math.PI/2, endAngle: Math.PI*2, padAngle: 0 }]
 */
export function pie() {
  const pieGenerator = function (data) {
    if (!Array.isArray(data)) {
      throw new TypeError(`layout.pie()(data): expected an array of data, received ${JSON.stringify(data)}.`);
    }

    const value = pieGenerator.value();
    const sortFn = pieGenerator.sort();
    const start = pieGenerator.startAngle();
    const end = pieGenerator.endAngle();
    const pad = pieGenerator.padAngle();

    const order = data.map((_, i) => i);
    if (sortFn) order.sort((a, b) => sortFn(data[a], data[b]));

    const values = data.map((d, i) => Math.max(+value(d, i) || 0, 0));
    const total = values.reduce((sum, v) => sum + v, 0);
    const sweep = end - start - pad * data.length;

    const result = new Array(data.length);
    let angle = start;
    for (const i of order) {
      const sliceAngle = total > 0 ? (values[i] / total) * sweep : 0;
      const entryStart = angle;
      const entryEnd = angle + sliceAngle;
      result[i] = { data: data[i], value: values[i], index: i, startAngle: entryStart, endAngle: entryEnd, padAngle: pad };
      angle = entryEnd + pad;
    }
    return result;
  };

  /** Get (no args) or set (chainable) the per-datum value accessor. Default: the datum itself. */
  pieGenerator.value = accessorField(pieGenerator, DEFAULT_VALUE);

  let sortFn = null;
  /**
   * Get (no args) or set (chainable) the comparator ordering slices around
   * the sweep — operates on raw data, not the pie-output entries. `null`
   * (default) preserves `data`'s own order.
   * @param {((a: *, b: *) => number)|null} [compareFn]
   * @returns {((a: *, b: *) => number)|null|object}
   * @throws {TypeError} If `compareFn` is given and isn't a function or `null`.
   */
  pieGenerator.sort = function (compareFn) {
    if (arguments.length === 0) return sortFn;
    if (compareFn !== null && typeof compareFn !== 'function') {
      throw new TypeError(`layout.pie().sort: expected a function or null, received ${JSON.stringify(compareFn)}.`);
    }
    sortFn = compareFn;
    return pieGenerator;
  };

  let startAngle = DEFAULT_START_ANGLE;
  /** Get (no args) or set (chainable) the sweep's start angle, in radians. Default `0`. */
  pieGenerator.startAngle = function (value) {
    if (arguments.length === 0) return startAngle;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`layout.pie().startAngle: expected a finite number, received ${JSON.stringify(value)}.`);
    }
    startAngle = value;
    return pieGenerator;
  };

  let endAngle = DEFAULT_END_ANGLE;
  /** Get (no args) or set (chainable) the sweep's end angle, in radians. Default `2π`. */
  pieGenerator.endAngle = function (value) {
    if (arguments.length === 0) return endAngle;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`layout.pie().endAngle: expected a finite number, received ${JSON.stringify(value)}.`);
    }
    endAngle = value;
    return pieGenerator;
  };

  let padAngle = DEFAULT_PAD_ANGLE;
  /** Get (no args) or set (chainable) the gap angle, in radians, inserted between adjacent slices. Default `0`. */
  pieGenerator.padAngle = function (value) {
    if (arguments.length === 0) return padAngle;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`layout.pie().padAngle: expected a finite number, received ${JSON.stringify(value)}.`);
    }
    padAngle = value;
    return pieGenerator;
  };

  return pieGenerator;
}
