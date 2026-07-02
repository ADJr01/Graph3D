import { describe, it, expect } from 'vitest';
import { point } from '../../../src/compose/generator/point.js';
import { band } from '../../../src/compose/scale/band.js';

describe('generator.point defaults', () => {
  it('works on a plain array of numbers: x = index, y = value, z = 0', () => {
    const { positions, scales } = point().compute([3, 5]);
    expect(positions[0]).toBe(0);
    expect(positions[1]).toBe(3);
    expect(positions[2]).toBe(0);
    expect(positions[3]).toBe(1);
    expect(positions[4]).toBe(5);
    expect(scales[0]).toBeCloseTo(1);
    expect(scales[1]).toBeCloseTo(1);
    expect(scales[2]).toBeCloseTo(1);
  });

  it('defaults shape to "sphere"', () => {
    expect(point().shape()).toBe('sphere');
    expect(point().compute([1]).shape).toBe('sphere');
  });
});

describe('generator.point chainable accessors', () => {
  it('x()/y()/z() accept custom accessor functions', () => {
    const { positions } = point()
      .x((d) => d.t)
      .y((d) => d.v)
      .z(5)
      .compute([{ t: 0, v: 1 }]);
    expect(Array.from(positions)).toEqual([0, 1, 5]);
  });

  it('x() accepts a scale directly, since scales are callable', () => {
    const xScale = band().domain(['a', 'b']).range([0, 10]);
    const { positions } = point()
      .x((d) => xScale(d.key))
      .y((d) => d.value)
      .compute([{ key: 'a', value: 1 }, { key: 'b', value: 1 }]);
    expect(positions[0]).toBe(xScale('a'));
    expect(positions[3]).toBe(xScale('b'));
  });

  it('size() is chainable and scales all 3 axes uniformly', () => {
    const { scales } = point().size(0.3).compute([1]);
    expect(scales[0]).toBeCloseTo(0.3);
    expect(scales[1]).toBeCloseTo(0.3);
    expect(scales[2]).toBeCloseTo(0.3);
  });
});

describe('generator.point shape()', () => {
  it('setter is chainable and updates the shape', () => {
    const g = point();
    expect(g.shape('cube')).toBe(g);
    expect(g.shape()).toBe('cube');
  });

  it('accepts sphere/cube/cone/custom', () => {
    for (const shape of ['sphere', 'cube', 'cone', 'custom']) {
      expect(point().shape(shape).shape()).toBe(shape);
    }
  });

  it('throws TypeError for an unknown shape name', () => {
    expect(() => point().shape('donut')).toThrow(TypeError);
  });
});

describe('generator.point compute', () => {
  it('returns positions/scales/colors/attributes/shape ready for GraphInstancedObject.setAll*', () => {
    const result = point().shape('cone').compute([1, 2, 3]);
    expect(result.positions).toBeInstanceOf(Float32Array);
    expect(result.positions).toHaveLength(9);
    expect(result.scales).toBeInstanceOf(Float32Array);
    expect(result.scales).toHaveLength(9);
    expect(result.colors).toBeNull();
    expect(result.attributes).toEqual({});
    expect(result.shape).toBe('cone');
  });

  it('throws TypeError when data is not an array', () => {
    expect(() => point().compute('nope')).toThrow(TypeError);
  });
});
