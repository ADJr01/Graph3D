import { describe, it, expect } from 'vitest';
import { grid } from '../../../src/compose/layout/grid.js';

describe('layout.grid config', () => {
  it('exposes rows/cols/cellWidth/cellDepth/count', () => {
    const g = grid({ rows: 2, cols: 3, cellWidth: 5, cellDepth: 4 });
    expect(g.rows).toBe(2);
    expect(g.cols).toBe(3);
    expect(g.cellWidth).toBe(5);
    expect(g.cellDepth).toBe(4);
    expect(g.count).toBe(6);
  });

  it('defaults cellWidth/cellDepth to 1', () => {
    const g = grid({ rows: 1, cols: 1 });
    expect(g.cellWidth).toBe(1);
    expect(g.cellDepth).toBe(1);
  });

  it('throws TypeError for non-positive-integer rows/cols', () => {
    expect(() => grid({ rows: 0, cols: 3 })).toThrow(TypeError);
    expect(() => grid({ rows: 1.5, cols: 3 })).toThrow(TypeError);
    expect(() => grid({ rows: 2, cols: -1 })).toThrow(TypeError);
    expect(() => grid({ rows: 2 })).toThrow(TypeError);
  });

  it('throws TypeError for non-positive cellWidth/cellDepth', () => {
    expect(() => grid({ rows: 1, cols: 1, cellWidth: 0 })).toThrow(TypeError);
    expect(() => grid({ rows: 1, cols: 1, cellDepth: -2 })).toThrow(TypeError);
  });
});

describe('layout.grid(index)', () => {
  it('lays out a single cell at the origin', () => {
    const g = grid({ rows: 1, cols: 1 });
    expect(g(0)).toEqual({ x: 0, y: 0, z: 0, row: 0, col: 0 });
  });

  it('fills row-major, left-to-right then next row', () => {
    const g = grid({ rows: 2, cols: 2, cellWidth: 10, cellDepth: 10 });
    expect(g(0)).toEqual({ x: -5, y: 0, z: -5, row: 0, col: 0 });
    expect(g(1)).toEqual({ x: 5, y: 0, z: -5, row: 0, col: 1 });
    expect(g(2)).toEqual({ x: -5, y: 0, z: 5, row: 1, col: 0 });
    expect(g(3)).toEqual({ x: 5, y: 0, z: 5, row: 1, col: 1 });
  });

  it('centers an uneven grid on the origin', () => {
    const g = grid({ rows: 1, cols: 3, cellWidth: 2, cellDepth: 2 });
    expect(g(0).x).toBe(-2);
    expect(g(1).x).toBe(0);
    expect(g(2).x).toBe(2);
  });

  it('throws TypeError for an out-of-range or non-integer index', () => {
    const g = grid({ rows: 2, cols: 2 });
    expect(() => g(-1)).toThrow(TypeError);
    expect(() => g(4)).toThrow(TypeError);
    expect(() => g(1.5)).toThrow(TypeError);
  });
});
