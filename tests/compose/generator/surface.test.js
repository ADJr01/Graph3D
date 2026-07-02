import { describe, it, expect } from 'vitest';
import { surface } from '../../../src/compose/generator/surface.js';

describe('generator.surface values[][] grid', () => {
  it('builds a mesh directly from a fixed 2D grid, ignoring resolution', () => {
    const grid = [
      [0, 1],
      [2, 3],
    ];
    const { positions, indices, normals } = surface().values(grid).compute();
    expect(positions).toHaveLength(4 * 3); // 2x2 vertices
    expect(indices).toHaveLength(2 * 3); // 1 cell = 2 triangles
    expect(normals).toHaveLength(4 * 3);
  });

  it('maps grid rows/cols across xDomain/zDomain, y = the raw value', () => {
    const grid = [
      [0, 1],
      [2, 3],
    ];
    const { positions } = surface().values(grid).xDomain([0, 10]).zDomain([0, 20]).compute();
    // row 0, col 0 -> x=0, z=0, y=0
    expect(positions[0]).toBe(0);
    expect(positions[1]).toBe(0);
    expect(positions[2]).toBe(0);
    // row 0, col 1 -> x=10, z=0, y=1
    expect(positions[3]).toBe(10);
    expect(positions[4]).toBe(1);
    expect(positions[5]).toBe(0);
    // row 1, col 0 -> x=0, z=20, y=2
    expect(positions[6]).toBe(0);
    expect(positions[7]).toBe(2);
    expect(positions[8]).toBe(20);
  });

  it('throws TypeError for a grid smaller than 2x2', () => {
    expect(() => surface().values([[0]]).compute()).toThrow(TypeError);
  });
});

describe('generator.surface (x, z) => y function', () => {
  it('samples resolution+1 points per axis over xDomain/zDomain', () => {
    const flat = surface()
      .values(() => 0)
      .resolution(4)
      .compute();
    expect(flat.positions).toHaveLength(5 * 5 * 3); // (resolution+1)^2 vertices
    expect(flat.indices).toHaveLength(4 * 4 * 6); // resolution^2 cells * 2 triangles * 3
  });

  it('samples x/z within the configured domains', () => {
    const seen = [];
    surface()
      .values((x, z) => {
        seen.push([x, z]);
        return 0;
      })
      .xDomain([-1, 1])
      .zDomain([-2, 2])
      .resolution(2)
      .compute();
    for (const [x, z] of seen) {
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(1);
      expect(z).toBeGreaterThanOrEqual(-2);
      expect(z).toBeLessThanOrEqual(2);
    }
    expect(seen).toContainEqual([-1, -2]);
    expect(seen).toContainEqual([1, 2]);
  });

  it('defaults xDomain/zDomain to [0, 1] and resolution to 32', () => {
    const g = surface();
    expect(g.xDomain()).toEqual([0, 1]);
    expect(g.zDomain()).toEqual([0, 1]);
    expect(g.resolution()).toBe(32);
  });
});

describe('generator.surface normals', () => {
  it('a flat surface has unit +y normals everywhere', () => {
    const { normals } = surface()
      .values(() => 0)
      .resolution(2)
      .compute();
    for (let i = 0; i < normals.length; i += 3) {
      expect(normals[i]).toBeCloseTo(0, 5);
      expect(normals[i + 1]).toBeCloseTo(1, 5);
      expect(normals[i + 2]).toBeCloseTo(0, 5);
    }
  });
});

describe('generator.surface chainable setters', () => {
  it('xDomain/zDomain/resolution are chainable', () => {
    const g = surface();
    expect(g.xDomain([0, 5])).toBe(g);
    expect(g.zDomain([0, 5])).toBe(g);
    expect(g.resolution(8)).toBe(g);
  });

  it('values() is chainable and getter returns the current source', () => {
    const g = surface();
    const source = () => 0;
    expect(g.values(source)).toBe(g);
    expect(g.values()).toBe(source);
  });

  it('throws TypeError for an invalid xDomain/zDomain', () => {
    expect(() => surface().xDomain([0])).toThrow(TypeError);
    expect(() => surface().xDomain('nope')).toThrow(TypeError);
    expect(() => surface().zDomain(null)).toThrow(TypeError);
  });

  it('throws TypeError for a non-positive-integer resolution', () => {
    expect(() => surface().resolution(0)).toThrow(TypeError);
    expect(() => surface().resolution(1.5)).toThrow(TypeError);
    expect(() => surface().resolution(-2)).toThrow(TypeError);
  });
});

describe('generator.surface compute validation', () => {
  it('throws TypeError when values() was never called', () => {
    expect(() => surface().compute()).toThrow(TypeError);
  });
});
