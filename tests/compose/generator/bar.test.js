import { describe, it, expect } from 'vitest';
import { bar } from '../../../src/compose/generator/bar.js';
import { band } from '../../../src/compose/scale/band.js';

describe('generator.bar defaults', () => {
  it('works on a plain array of numbers: x = index, y = value, baseline = 0', () => {
    const { positions, scales } = bar().compute([3, 5]);
    // bar 0: x=0, y=3, baseline=0 -> center y = 1.5, height = 3
    expect(positions[0]).toBe(0);
    expect(positions[1]).toBe(1.5);
    expect(positions[2]).toBe(0);
    expect(scales[1]).toBeCloseTo(3);
    // bar 1: x=1, y=5 -> center y = 2.5, height = 5
    expect(positions[3]).toBe(1);
    expect(positions[4]).toBe(2.5);
    expect(scales[4]).toBeCloseTo(5);
  });

  it('defaults width/depth to 0.8 and baseline to 0', () => {
    const { scales } = bar().compute([3]);
    expect(scales[0]).toBeCloseTo(0.8);
    expect(scales[2]).toBeCloseTo(0.8);
  });
});

describe('generator.bar chainable accessors', () => {
  it('x()/y() accept custom accessor functions', () => {
    const { positions } = bar()
      .x((d) => d.category)
      .y((d) => d.value)
      .compute([{ category: 7, value: 4 }]);
    expect(positions[0]).toBe(7);
    expect(positions[1]).toBe(2); // (4 + 0) / 2
  });

  it('x() accepts a scale directly, since scales are callable', () => {
    const xScale = band().domain(['a', 'b']).range([0, 10]);
    const { positions } = bar()
      .x((d) => xScale(d.key))
      .y((d) => d.value)
      .compute([{ key: 'a', value: 1 }, { key: 'b', value: 1 }]);
    expect(positions[0]).toBe(xScale('a'));
    expect(positions[3]).toBe(xScale('b'));
  });

  it('width/depth/baseline are chainable and overridable', () => {
    const { scales, positions } = bar()
      .width(2)
      .depth(3)
      .baseline(1)
      .compute([5]);
    expect(scales[0]).toBe(2);
    expect(scales[2]).toBe(3);
    // y=5, baseline=1 -> center = 3, height = 4
    expect(positions[1]).toBe(3);
    expect(scales[1]).toBe(4);
  });

  it('getters return the current resolved accessor', () => {
    const g = bar().width(1.5);
    expect(g.width()({}, 0)).toBe(1.5);
  });

  it('handles negative values by growing the bar downward from baseline', () => {
    const { positions, scales } = bar().baseline(0).compute([-4]);
    expect(positions[1]).toBe(-2); // (-4 + 0) / 2
    expect(scales[1]).toBeCloseTo(4); // |y - baseline|
  });
});

describe('generator.bar compute output shape', () => {
  it('returns positions/scales/colors/attributes ready for GraphInstancedObject.setAll*', () => {
    const result = bar().compute([1, 2, 3]);
    expect(result.positions).toBeInstanceOf(Float32Array);
    expect(result.positions).toHaveLength(9);
    expect(result.scales).toBeInstanceOf(Float32Array);
    expect(result.scales).toHaveLength(9);
    expect(result.colors).toBeNull();
    expect(result.attributes).toEqual({});
  });

  it('throws TypeError when data is not an array', () => {
    expect(() => bar().compute('nope')).toThrow(TypeError);
  });
});
