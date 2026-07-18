import { describe, it, expect } from 'vitest';
import { scale, bandCenter } from '../../../src/compose/scale/index.js';

describe('bandCenter', () => {
  it('returns half the bandwidth for a band scale', () => {
    const s = scale.band().domain(['a', 'b', 'c']).range([0, 300]);
    expect(bandCenter(s)).toBeCloseTo(s.bandwidth() / 2);
    expect(bandCenter(s)).toBeCloseTo(50);
  });

  it('returns 0 for a point scale, since bandwidth() is always 0', () => {
    const s = scale.point().domain(['a', 'b', 'c']).range([0, 200]);
    expect(s.bandwidth()).toBe(0);
    expect(bandCenter(s)).toBe(0);
  });

  it('returns 0 for a linear scale, which has no bandwidth method', () => {
    const s = scale.linear().domain([0, 1]).range([0, 100]);
    expect(bandCenter(s)).toBe(0);
  });

  it('returns 0 for null or undefined input', () => {
    expect(bandCenter(null)).toBe(0);
    expect(bandCenter(undefined)).toBe(0);
  });
});
