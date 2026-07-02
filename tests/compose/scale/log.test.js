import { describe, it, expect } from 'vitest';
import { scale } from '../../../src/compose/scale/index.js';

describe('scale.log', () => {
  it('defaults to base 10, domain [1, 10]', () => {
    const s = scale.log();
    expect(s.base()).toBe(10);
    expect(s.domain()).toEqual([1, 10]);
  });

  it('maps logarithmically', () => {
    const s = scale.log().domain([1, 100]).range([0, 1]);
    expect(s(1)).toBeCloseTo(0);
    expect(s(10)).toBeCloseTo(0.5);
    expect(s(100)).toBeCloseTo(1);
  });

  it('inverts correctly', () => {
    const s = scale.log().domain([1, 100]).range([0, 1]);
    expect(s.invert(0.5)).toBeCloseTo(10);
  });

  it('supports an entirely negative domain, preserving order', () => {
    const s = scale.log().domain([-100, -1]).range([0, 1]);
    expect(s(-100)).toBeCloseTo(0);
    expect(s(-10)).toBeCloseTo(0.5);
    expect(s(-1)).toBeCloseTo(1);
  });

  it('supports a custom base', () => {
    const s = scale.log(2).domain([1, 8]).range([0, 1]);
    expect(s(2)).toBeCloseTo(1 / 3);
    expect(s(8)).toBeCloseTo(1);
  });

  it('throws TypeError when the domain crosses zero', () => {
    expect(() => scale.log().domain([-1, 1])).toThrow(TypeError);
  });

  it('throws TypeError when the domain touches zero', () => {
    expect(() => scale.log().domain([0, 10])).toThrow(TypeError);
  });

  it('base(value) is chainable and changes the mapping', () => {
    const s = scale.log().domain([1, 8]).range([0, 1]);
    expect(s.base(2)).toBe(s);
    expect(s(8)).toBeCloseTo(1);
  });

  describe('ticks', () => {
    it('gives one tick per power of the base when decades outnumber the requested count', () => {
      const s = scale.log().domain([1, 1000]);
      expect(s.ticks(2)).toEqual([1, 10, 100, 1000]);
    });

    it('subdivides by digit within a single decade', () => {
      const s = scale.log().domain([2, 8]);
      expect(s.ticks()).toEqual([2, 3, 4, 5, 6, 7, 8]);
    });

    it('mirrors ticks for a negative domain', () => {
      const s = scale.log().domain([-1000, -1]);
      expect(s.ticks(2)).toEqual([-1000, -100, -10, -1]);
    });
  });

  describe('tickFormat', () => {
    it('labels only powers of the base by default', () => {
      const s = scale.log().domain([1, 1000]);
      const f = s.tickFormat();
      expect(f(1)).toBe('1');
      expect(f(10)).toBe('10');
      expect(f(5)).toBe('');
    });

    it('labels every tick plainly when a non-fixed specifier is given', () => {
      const s = scale.log().domain([2, 8]);
      const f = s.tickFormat(10, 's');
      expect(f(3)).toBe('3');
    });
  });
});
