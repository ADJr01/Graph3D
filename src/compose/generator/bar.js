import { accessorField } from './accessor.js';
import { buildBuffers } from './buffer.js';

// Leaves visible gaps between adjacent unit-spaced bars by default, matching
// the look of D3's scaleBand default padding.
const DEFAULT_WIDTH = 0.8;
const DEFAULT_DEPTH = 0.8;
const DEFAULT_BASELINE = 0;

/**
 * Creates a chainable bar generator: maps each datum to a 3D bar centered at
 * `[x, (y + baseline) / 2, 0]` with `scale = [width, |y - baseline|, depth]`
 * — a box straddling `baseline` up (or down, for negative values) to `y`.
 * `compute(data)` funnels through `buildBuffers` (CLAUDE.md §1.1 DRY), so no
 * flatten loop is re-implemented here.
 * @returns {{
 *   x: (accessorOrScale?: *) => (Function|object),
 *   y: (accessorOrScale?: *) => (Function|object),
 *   width: (accessorOrScale?: *) => (Function|object),
 *   depth: (accessorOrScale?: *) => (Function|object),
 *   baseline: (accessorOrScale?: *) => (Function|object),
 *   compute: (data: Array) => { positions: Float32Array, scales: Float32Array, colors: (Float32Array|null), attributes: object },
 * }}
 * @example
 * const bars = generator.bar().y((d) => d.value);
 * bars.compute([{ value: 3 }, { value: 5 }]);
 * @example
 * // x/y also accept a scale directly, since scales are callable (d) => value:
 * generator.bar().x(scale.band().domain(['a', 'b']).range([0, 10])).y((d) => d.value);
 */
export function bar() {
  const gen = {};

  /**
   * Get (no args) or set (chainable) the bar's x position accessor.
   * Defaults to the datum's index. Accepts a constant, a `(datum, index) =>
   * value` accessor, or a scale (scales are callable `(value) => range`).
   */
  gen.x = accessorField(gen, (d, i) => i);

  /**
   * Get (no args) or set (chainable) the bar's y-value accessor — the value
   * the bar's top (or bottom, if negative) reaches. Defaults to the datum
   * itself, so `bar().compute([3, 5, 2])` works on a plain number array.
   */
  gen.y = accessorField(gen, (d) => d);

  /** Get (no args) or set (chainable) the bar's width (x-axis size). Default `0.8`. */
  gen.width = accessorField(gen, DEFAULT_WIDTH);

  /** Get (no args) or set (chainable) the bar's depth (z-axis size). Default `0.8`. */
  gen.depth = accessorField(gen, DEFAULT_DEPTH);

  /** Get (no args) or set (chainable) the y-value the bar grows from. Default `0`. */
  gen.baseline = accessorField(gen, DEFAULT_BASELINE);

  /**
   * Computes instanced-render-ready buffers for `data`.
   * @param {Array} data
   * @returns {{ positions: Float32Array, scales: Float32Array, colors: (Float32Array|null), attributes: object }}
   * @throws {TypeError} If `data` isn't an array.
   */
  gen.compute = function (data) {
    return buildBuffers(data, (d, i) => {
      const x = gen.x()(d, i);
      const y = gen.y()(d, i);
      const baseline = gen.baseline()(d, i);
      const width = gen.width()(d, i);
      const depth = gen.depth()(d, i);
      return {
        position: [x, (y + baseline) / 2, 0],
        scale: [width, Math.abs(y - baseline), depth],
      };
    });
  };

  return gen;
}
