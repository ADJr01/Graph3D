import { describe, it, expect } from 'vitest';
import { scale } from '../../../src/compose/scale/index.js';

describe('scale.linear', () => {
  it('is a chainable, callable D3-style scale', () => {
    const x = scale.linear().domain([0, 100]).range([0, 1]);
    expect(x(50)).toBeCloseTo(0.5);
    expect(x.invert(0.5)).toBeCloseTo(50);
  });

  it('produces independent instances on each call', () => {
    const a = scale.linear().domain([0, 10]);
    const b = scale.linear();
    expect(b.domain()).toEqual([0, 1]);
    expect(a.domain()).toEqual([0, 10]);
  });
});

describe('scale.linear ticks', () => {
  it('matches known D3 output', () => {
    const x = scale.linear().domain([0, 100]);
    expect(x.ticks(10)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it('defaults count to 10', () => {
    const x = scale.linear().domain([0, 1]);
    expect(x.ticks()).toEqual(x.ticks(10));
  });
});

describe('scale.linear tickFormat', () => {
  it('formats a tick value with precision derived from the domain', () => {
    const x = scale.linear().domain([0, 1]);
    expect(x.tickFormat()(0.3)).toBe('0.3');
  });

  it('supports the SI-prefix specifier', () => {
    const x = scale.linear().domain([0, 5000]);
    expect(x.tickFormat(10, 's')(1500)).toBe('1.5k');
  });
});

describe('scale.linear copy', () => {
  it('carries ticks/tickFormat onto the copy, independent of the original', () => {
    const x = scale.linear().domain([0, 100]);
    const y = x.copy();

    expect(typeof y.ticks).toBe('function');
    expect(y.ticks(10)).toEqual(x.ticks(10));

    y.domain([0, 10]);
    expect(x.domain()).toEqual([0, 100]);
  });
});
