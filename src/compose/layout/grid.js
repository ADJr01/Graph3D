const DEFAULT_CELL_WIDTH = 1;
const DEFAULT_CELL_DEPTH = 1;

function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`layout.grid(): expected ${name} to be a positive integer, received ${JSON.stringify(value)}.`);
  }
}

function assertPositiveNumber(name, value) {
  if (typeof value !== 'number' || !(value > 0)) {
    throw new TypeError(`layout.grid(): expected ${name} to be a positive number, received ${JSON.stringify(value)}.`);
  }
}

/**
 * Creates a small-multiples grid layout: a row-major `index => { x, y, z, row, col }`
 * function that centers `rows * cols` cells on the origin in the x/z ground
 * plane (`y` is always `0` — grid cells hold whole sub-scenes, not
 * per-datum height data). Plain data in, plain numbers out — no Three.js
 * import (CLAUDE.md §1.4 SoC).
 * @param {{ rows: number, cols: number, cellWidth?: number, cellDepth?: number }} config
 *   `rows`/`cols` must be positive integers. `cellWidth`/`cellDepth` (x/z cell
 *   size) default to `1`.
 * @returns {((index: number) => { x: number, y: number, z: number, row: number, col: number }) & {
 *   rows: number, cols: number, cellWidth: number, cellDepth: number, count: number,
 * }}
 * @throws {TypeError} If `rows`/`cols` aren't positive integers, or
 *   `cellWidth`/`cellDepth` aren't positive numbers.
 * @example
 * const cell = layout.grid({ rows: 2, cols: 3, cellWidth: 5, cellDepth: 5 });
 * cell(0); // { x: -5, y: 0, z: -2.5, row: 0, col: 0 }
 * cell.count; // 6
 */
export function grid({ rows, cols, cellWidth = DEFAULT_CELL_WIDTH, cellDepth = DEFAULT_CELL_DEPTH } = {}) {
  assertPositiveInteger('rows', rows);
  assertPositiveInteger('cols', cols);
  assertPositiveNumber('cellWidth', cellWidth);
  assertPositiveNumber('cellDepth', cellDepth);

  const count = rows * cols;

  /**
   * Resolves the center position of cell `index` (row-major: fills a row
   * left-to-right before advancing to the next row).
   * @param {number} index
   * @returns {{ x: number, y: number, z: number, row: number, col: number }}
   * @throws {TypeError} If `index` is outside `[0, rows * cols)`.
   */
  const gridLayout = function (index) {
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw new TypeError(`layout.grid()(index): expected an integer in [0, ${count}), received ${JSON.stringify(index)}.`);
    }
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      x: (col - (cols - 1) / 2) * cellWidth,
      y: 0,
      z: (row - (rows - 1) / 2) * cellDepth,
      row,
      col,
    };
  };

  gridLayout.rows = rows;
  gridLayout.cols = cols;
  gridLayout.cellWidth = cellWidth;
  gridLayout.cellDepth = cellDepth;
  gridLayout.count = count;

  return gridLayout;
}
