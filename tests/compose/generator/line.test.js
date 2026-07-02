import { describe, it, expect } from 'vitest';
import { line } from '../../../src/compose/generator/line.js';
import { band } from '../../../src/compose/scale/band.js';

describe('generator.line defaults', () => {
  it('works on a plain array of numbers: x = index, y = value, z = 0', () => {
    const { positions } = line().compute([0, 10]);
    expect(Array.from(positions)).toEqual([0, 0, 0, 1, 10, 0]);
  });

  it('defaults to the linear curve (no subdivision)', () => {
    const { positions } = line().compute([0, 1, 2, 3]);
    expect(positions).toHaveLength(4 * 3);
  });
});

describe('generator.line chainable accessors', () => {
  it('x()/y()/z() accept custom accessor functions', () => {
    const { positions } = line()
      .x((d) => d.t)
      .y((d) => d.v)
      .z(5)
      .compute([{ t: 0, v: 1 }, { t: 2, v: 3 }]);
    expect(Array.from(positions)).toEqual([0, 1, 5, 2, 3, 5]);
  });

  it('x() accepts a scale directly, since scales are callable', () => {
    const xScale = band().domain(['a', 'b']).range([0, 10]);
    const { positions } = line()
      .x((d) => xScale(d.key))
      .y((d) => d.value)
      .compute([{ key: 'a', value: 1 }, { key: 'b', value: 1 }]);
    expect(positions[0]).toBe(xScale('a'));
    expect(positions[3]).toBe(xScale('b'));
  });
});

describe('generator.line curve()', () => {
  it('getter returns the current curve; default is "linear"', () => {
    expect(line().curve()).toBe('linear');
  });

  it('setter is chainable and updates the curve', () => {
    const g = line();
    expect(g.curve('catmullRom')).toBe(g);
    expect(g.curve()).toBe('catmullRom');
  });

  it('throws TypeError for an unknown curve name', () => {
    expect(() => line().curve('spline9000')).toThrow(TypeError);
  });

  it('catmullRom/monotone/bezier subdivide beyond the raw point count', () => {
    const data = [0, 3, 1, 4];
    const linearCount = line().compute(data).positions.length;
    for (const curveType of ['catmullRom', 'monotone', 'bezier']) {
      const count = line().curve(curveType).compute(data).positions.length;
      expect(count).toBeGreaterThan(linearCount);
    }
  });
});

describe('generator.line tension()', () => {
  it('getter returns the current tension; default is 0', () => {
    expect(line().tension()).toBe(0);
  });

  it('setter is chainable and updates the tension', () => {
    const g = line();
    expect(g.tension(0.5)).toBe(g);
    expect(g.tension()).toBe(0.5);
  });
});

describe('generator.line compute', () => {
  it('returns only positions, ready for Line2.setPositions', () => {
    const result = line().compute([0, 1]);
    expect(Object.keys(result)).toEqual(['positions']);
    expect(result.positions).toBeInstanceOf(Float32Array);
  });

  it('throws TypeError for fewer than 2 points', () => {
    expect(() => line().compute([0])).toThrow(TypeError);
    expect(() => line().compute([])).toThrow(TypeError);
  });

  it('throws TypeError when data is not an array', () => {
    expect(() => line().compute('nope')).toThrow(TypeError);
  });
});
