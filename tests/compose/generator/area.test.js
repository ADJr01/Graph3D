import { describe, it, expect } from 'vitest';
import { area } from '../../../src/compose/generator/area.js';

describe('generator.area defaults', () => {
  it('extrudes each point down to baseline 0: top edge + bottom edge per point', () => {
    const { positions } = area().compute([0, 10]);
    // 2 points -> 4 vertices (top0, bottom0, top1, bottom1)
    expect(Array.from(positions)).toEqual([
      0, 0, 0, // top0 (x=0,y=0,z=0)
      0, 0, 0, // bottom0 (x=0,y=baseline=0,z=0)
      1, 10, 0, // top1 (x=1,y=10,z=0)
      1, 0, 0, // bottom1 (x=1,y=baseline=0,z=0)
    ]);
  });

  it('builds 2 triangles (6 indices) per segment', () => {
    const { indices } = area().compute([0, 10, 5]);
    expect(indices).toHaveLength(2 * 6);
  });

  it('normals are unit length', () => {
    const { normals } = area().compute([3, 10, 5]);
    for (let i = 0; i < normals.length; i += 3) {
      const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
      expect(len).toBeCloseTo(1);
    }
  });
});

describe('generator.area baseline()', () => {
  it('getter returns the current baseline; default is 0', () => {
    expect(area().baseline()).toBe(0);
  });

  it('setter is chainable and updates the baseline', () => {
    const g = area();
    expect(g.baseline(-2)).toBe(g);
    expect(g.baseline()).toBe(-2);
  });

  it('extrudes down to the configured baseline', () => {
    const { positions } = area().baseline(-3).compute([5, 8]);
    expect(positions[1]).toBe(5); // top0 y
    expect(positions[4]).toBe(-3); // bottom0 y
    expect(positions[7]).toBe(8); // top1 y
    expect(positions[10]).toBe(-3); // bottom1 y
  });

  it('throws TypeError for a non-finite baseline', () => {
    expect(() => area().baseline(NaN)).toThrow(TypeError);
    expect(() => area().baseline('x')).toThrow(TypeError);
  });
});

describe('generator.area chainable accessors', () => {
  it('x()/y()/z() accept custom accessor functions', () => {
    const { positions } = area()
      .x((d) => d.t)
      .y((d) => d.v)
      .z(5)
      .compute([{ t: 0, v: 1 }, { t: 2, v: 3 }]);
    expect(positions[0]).toBe(0); // top0 x
    expect(positions[1]).toBe(1); // top0 y
    expect(positions[2]).toBe(5); // top0 z
    expect(positions[6]).toBe(2); // top1 x
    expect(positions[7]).toBe(3); // top1 y
  });
});

describe('generator.area curve()', () => {
  it('getter returns the current curve; default is "linear"', () => {
    expect(area().curve()).toBe('linear');
  });

  it('setter is chainable and updates the curve', () => {
    const g = area();
    expect(g.curve('catmullRom')).toBe(g);
    expect(g.curve()).toBe('catmullRom');
  });

  it('throws TypeError for an unknown curve name', () => {
    expect(() => area().curve('spline9000')).toThrow(TypeError);
  });

  it('catmullRom subdivides the top edge, doubling vertex count beyond the raw point count', () => {
    const data = [0, 3, 1, 4];
    const linearCount = area().compute(data).positions.length;
    const curvedCount = area().curve('catmullRom').compute(data).positions.length;
    expect(curvedCount).toBeGreaterThan(linearCount);
  });
});

describe('generator.area tension()', () => {
  it('getter returns the current tension; default is 0', () => {
    expect(area().tension()).toBe(0);
  });

  it('setter is chainable and updates the tension', () => {
    const g = area();
    expect(g.tension(0.5)).toBe(g);
    expect(g.tension()).toBe(0.5);
  });
});

describe('generator.area compute', () => {
  it('returns positions/indices/normals, matching generator.surface()\'s shape', () => {
    const result = area().compute([0, 1]);
    expect(Object.keys(result).sort()).toEqual(['indices', 'normals', 'positions']);
    expect(result.positions).toBeInstanceOf(Float32Array);
    expect(result.indices).toBeInstanceOf(Uint32Array);
    expect(result.normals).toBeInstanceOf(Float32Array);
  });

  it('throws TypeError for fewer than 2 points', () => {
    expect(() => area().compute([0])).toThrow(TypeError);
    expect(() => area().compute([])).toThrow(TypeError);
  });

  it('throws TypeError when data is not an array', () => {
    expect(() => area().compute('nope')).toThrow(TypeError);
  });
});
