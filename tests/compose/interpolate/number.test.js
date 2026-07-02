import { describe, it, expect } from 'vitest';
import { interpolateNumber } from '../../../src/compose/interpolate/number.js';

describe('interpolateNumber', () => {
  it('linearly interpolates, including extrapolation beyond [0,1]', () => {
    const i = interpolateNumber(0, 100);
    expect(i(0)).toBe(0);
    expect(i(0.5)).toBe(50);
    expect(i(1)).toBe(100);
    expect(i(1.5)).toBe(150);
  });
});
