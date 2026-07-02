import { describe, it, expect } from 'vitest';
import { warm, cool, rainbow, sinebow } from '../../../src/compose/palette/parametric.js';

describe('warm/cool', () => {
  it('sweep through distinct colors across t', () => {
    expect(warm(0)).not.toBe(warm(1));
    expect(cool(0)).not.toBe(cool(1));
  });
});

describe('rainbow', () => {
  it('is cyclic: t = 0 and t = 1 produce the same color', () => {
    expect(rainbow(0)).toBe(rainbow(1));
  });

  it('is brightest/most saturated at the midpoint', () => {
    expect(rainbow(0.5)).not.toBe(rainbow(0));
  });
});

describe('sinebow', () => {
  it('is cyclic: t = 0 and t = 1 produce the same color', () => {
    expect(sinebow(0)).toBe(sinebow(1));
  });

  it('varies across t', () => {
    expect(sinebow(0.25)).not.toBe(sinebow(0.75));
  });
});
