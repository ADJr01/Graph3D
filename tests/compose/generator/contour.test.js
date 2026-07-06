import { describe, it, expect } from 'vitest';
import { traceContours } from '../../../src/compose/generator/contour.js';

/** Builds a row-major (rows+1)x(cols+1) vertex grid: vertex(row,col) = [col, heights[row][col], row]. */
function buildGrid(heights) {
  const rowCount = heights.length;
  const colCount = heights[0].length;
  const positions = new Float32Array(rowCount * colCount * 3);
  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < colCount; col++) {
      const i = (row * colCount + col) * 3;
      positions[i] = col;
      positions[i + 1] = heights[row][col];
      positions[i + 2] = row;
    }
  }
  return { positions, rows: rowCount - 1, cols: colCount - 1 };
}

describe('traceContours', () => {
  it('returns no paths when a level never crosses the grid', () => {
    const { positions, rows, cols } = buildGrid([
      [0, 1, 2],
      [1, 2, 3],
    ]);
    expect(traceContours(positions, rows, cols, [100])).toEqual([]);
  });

  it('traces a single segment through one cell', () => {
    // tl=0, tr=10, bl=10, br=20 — level 5 crosses top and left edges only.
    const { positions, rows, cols } = buildGrid([
      [0, 10],
      [10, 20],
    ]);
    const result = traceContours(positions, rows, cols, [5]);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe(5);
    const points = Array.from(result[0].positions);
    expect(points).toHaveLength(6); // 2 points

    // top edge (tl=0 -> tr=10) crosses at t=0.5: [0.5, 5, 0]
    // left edge (tl=0 -> bl=10) crosses at t=0.5: [0, 5, 0.5]
    const asPairs = [
      [points[0], points[1], points[2]],
      [points[3], points[4], points[5]],
    ];
    expect(asPairs).toContainEqual([0.5, 5, 0]);
    expect(asPairs).toContainEqual([0, 5, 0.5]);
  });

  it('stitches segments spanning two adjacent cells into one continuous path', () => {
    // Hand-traced: row0 = [0,5,10], row1 = [10,15,20], level=7.
    const { positions, rows, cols } = buildGrid([
      [0, 5, 10],
      [10, 15, 20],
    ]);
    const result = traceContours(positions, rows, cols, [7]);
    expect(result).toHaveLength(1);

    const points = [];
    const flat = result[0].positions;
    for (let i = 0; i < flat.length; i += 3) points.push([flat[i], flat[i + 1], flat[i + 2]]);

    expect(points).toHaveLength(3);
    expect(points[0][0]).toBeCloseTo(0);
    expect(points[0][2]).toBeCloseTo(0.7);
    expect(points[1][0]).toBeCloseTo(1);
    expect(points[1][2]).toBeCloseTo(0.2);
    expect(points[2][0]).toBeCloseTo(1.4);
    expect(points[2][2]).toBeCloseTo(0);
    for (const p of points) expect(p[1]).toBeCloseTo(7);
  });

  it('traces multiple levels independently', () => {
    const { positions, rows, cols } = buildGrid([
      [0, 10],
      [10, 20],
    ]);
    const result = traceContours(positions, rows, cols, [5, 15]);
    expect(result.map((r) => r.level).sort((a, b) => a - b)).toEqual([5, 15]);
  });

  it('throws TypeError when levels is not an array of finite numbers', () => {
    const { positions, rows, cols } = buildGrid([[0, 1], [1, 2]]);
    expect(() => traceContours(positions, rows, cols, 5)).toThrow(TypeError);
    expect(() => traceContours(positions, rows, cols, [NaN])).toThrow(TypeError);
    expect(() => traceContours(positions, rows, cols, ['x'])).toThrow(TypeError);
  });
});
