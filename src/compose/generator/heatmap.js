import { accessorField } from './accessor.js';
import { buildBuffers } from './buffer.js';

const DEFAULT_CELL_SIZE = 0.8;

/**
 * Creates a chainable heatmap-cell generator: maps each datum to a fixed-size
 * box positioned at `[x, y, z]` — a grid cell, not a baseline-relative growth
 * shape like `generator.bar()` (no baseline concept applies to a heatmap
 * cell). `compute(data)` funnels through `buildBuffers` (CLAUDE.md §1.1 DRY).
 * @returns {{
 *   x: (accessorOrScale?: *) => (Function|object),
 *   y: (accessorOrScale?: *) => (Function|object),
 *   z: (accessorOrScale?: *) => (Function|object),
 *   width: (accessorOrScale?: *) => (Function|object),
 *   height: (accessorOrScale?: *) => (Function|object),
 *   depth: (accessorOrScale?: *) => (Function|object),
 *   compute: (data: Array) => { positions: Float32Array, scales: Float32Array, colors: (Float32Array|null), attributes: object },
 * }}
 * @example
 * const cells = generator.heatmap().x((d) => d.col).z((d) => d.row);
 * cells.compute([{ col: 0, row: 0 }, { col: 1, row: 0 }]);
 */
export function heatmap() {
  const gen = {};

  /** Get (no args) or set (chainable) the cell's x position accessor. Defaults to the datum's index. */
  gen.x = accessorField(gen, (d, i) => i);

  /** Get (no args) or set (chainable) the cell's y position accessor. Defaults to the datum itself. */
  gen.y = accessorField(gen, (d) => d);

  /** Get (no args) or set (chainable) the cell's z position accessor. Defaults to `0`. */
  gen.z = accessorField(gen, 0);

  /** Get (no args) or set (chainable) the cell's width (x-axis size). Default `0.8`. */
  gen.width = accessorField(gen, DEFAULT_CELL_SIZE);

  /** Get (no args) or set (chainable) the cell's height (y-axis size). Default `0.8`. */
  gen.height = accessorField(gen, DEFAULT_CELL_SIZE);

  /** Get (no args) or set (chainable) the cell's depth (z-axis size). Default `0.8`. */
  gen.depth = accessorField(gen, DEFAULT_CELL_SIZE);

  /**
   * Computes instanced-render-ready buffers for `data`.
   * @param {Array} data
   * @returns {{ positions: Float32Array, scales: Float32Array, colors: (Float32Array|null), attributes: object }}
   * @throws {TypeError} If `data` isn't an array.
   */
  gen.compute = function (data) {
    return buildBuffers(data, (d, i) => ({
      position: [gen.x()(d, i), gen.y()(d, i), gen.z()(d, i)],
      scale: [gen.width()(d, i), gen.height()(d, i), gen.depth()(d, i)],
    }));
  };

  return gen;
}
