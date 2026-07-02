import { accessorField } from '../generator/accessor.js';

const DEFAULT_VALUE = (d, key) => d[key];

// Default order: keep series in the order `keys()` returned them.
function stackOrderNone(series) {
  return series.map((_, i) => i);
}

// Default offset: baseline at 0, each series stacked on top of the previous
// one in `order` — the plain d3.stackOffsetNone behavior.
function stackOffsetNone(series, order) {
  for (let i = 1; i < order.length; i++) {
    const below = series[order[i - 1]];
    const above = series[order[i]];
    for (let j = 0; j < above.length; j++) {
      const top = Number.isNaN(below[j][1]) ? below[j][0] : below[j][1];
      above[j][0] = top;
      above[j][1] += top;
    }
  }
}

/**
 * Creates a chainable stack layout: turns per-key values on each datum into
 * stacked `[y0, y1]` bands, one series per key — the same shape as
 * `d3.stack()` (d3-shape parity, for migration ease). `stack(data)` (the
 * returned function is itself callable, matching d3's convention) returns
 * one array per key in `keys()`; each series has `.key`/`.index` and holds
 * one `[y0, y1]` point per datum (`point.data` references the source
 * datum) — ready for `BarChart.stacked()` (Prompt 132) to turn into bar
 * `y`/`baseline` pairs via `generator.bar()`.
 * @returns {{
 *   keys: (keysOrFn?: (string[]|((data: Array) => string[]))) => (Function|object),
 *   value: (valueOrFn?: *) => (Function|object),
 *   order: (orderFn?: (series: Array[]) => number[]) => (Function|object),
 *   offset: (offsetFn?: (series: Array[], order: number[]) => void) => (Function|object),
 * } & ((data: Array) => Array[])}
 * @example
 * const s = layout.stack().keys(['a', 'b']);
 * s([{ a: 1, b: 2 }, { a: 3, b: 4 }]);
 * // [ [[0,1],[0,3]] (key 'a'), [[1,3],[3,7]] (key 'b') ]
 */
export function stack() {
  const stackGenerator = function (data) {
    if (!Array.isArray(data)) {
      throw new TypeError(`layout.stack()(data): expected an array of data, received ${JSON.stringify(data)}.`);
    }

    const keys = stackGenerator.keys()(data);
    const value = stackGenerator.value();

    const series = keys.map((key, keyIndex) => {
      const s = data.map((d, i) => {
        const point = [0, +value(d, key, i, data)];
        point.data = d;
        return point;
      });
      s.key = key;
      s.index = keyIndex;
      return s;
    });

    const order = stackGenerator.order()(series);
    order.forEach((seriesIndex, i) => {
      series[seriesIndex].index = i;
    });
    stackGenerator.offset()(series, order);

    return series;
  };

  /**
   * Get (no args) or set (chainable) the series keys — an array of property
   * names, or a `(data) => string[]` function computed from the data.
   * Default: no keys (empty series).
   */
  stackGenerator.keys = accessorField(stackGenerator, []);

  /**
   * Get (no args) or set (chainable) the per-datum value accessor. Called as
   * `(datum, key, index, data) => number`. Default reads `datum[key]`.
   */
  stackGenerator.value = accessorField(stackGenerator, DEFAULT_VALUE);

  let orderFn = stackOrderNone;
  /** Get (no args) or set (chainable) the series ordering: `(series) => number[]` of series indices. Default: `keys()` order. */
  stackGenerator.order = function (orderFn_) {
    if (arguments.length === 0) return orderFn;
    orderFn = orderFn_;
    return stackGenerator;
  };

  let offsetFn = stackOffsetNone;
  /** Get (no args) or set (chainable) the stacking offset: `(series, order) => void`, mutates `[y0,y1]` in place. Default: baseline-0 cumulative stacking. */
  stackGenerator.offset = function (offsetFn_) {
    if (arguments.length === 0) return offsetFn;
    offsetFn = offsetFn_;
    return stackGenerator;
  };

  return stackGenerator;
}
