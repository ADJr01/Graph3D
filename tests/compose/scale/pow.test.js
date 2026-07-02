import { describe, it, expect } from 'vitest';
import { scale } from '../../../src/compose/scale/index.js';

describe('scale.pow', () => {
  it('defaults to exponent 2', () => {
    const s = scale.pow();
    expect(s.exponent()).toBe(2);
  });

  it('maps through x ** exponent before interpolating', () => {
    const s = scale.pow().exponent(2).domain([0, 10]).range([0, 1]);
    expect(s(0)).toBeCloseTo(0);
    expect(s(5)).toBeCloseTo(0.25); // (5/10)^2
    expect(s(10)).toBeCloseTo(1);
  });

  it('preserves sign for a negative domain', () => {
    const s = scale.pow().exponent(2).domain([-10, 10]).range([-1, 1]);
    expect(s(-5)).toBeCloseTo(-0.25);
    expect(s(5)).toBeCloseTo(0.25);
  });

  it('inverts correctly', () => {
    const s = scale.pow().exponent(2).domain([0, 10]).range([0, 1]);
    expect(s.invert(0.25)).toBeCloseTo(5);
  });

  it('exponent(value) is chainable and changes the mapping', () => {
    const s = scale.pow().domain([0, 10]).range([0, 1]);
    expect(s.exponent(3)).toBe(s);
    expect(s(5)).toBeCloseTo(0.125); // (5/10)^3
  });

  it('ticks/tickFormat operate on the raw (untransformed) domain', () => {
    const s = scale.pow().domain([0, 100]);
    expect(s.ticks(10)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(s.tickFormat()(50)).toBe('50');
  });

  it('copy carries the exponent and is independent', () => {
    const s = scale.pow().exponent(3).domain([0, 10]);
    const c = s.copy();
    expect(c.exponent()).toBe(3);
    c.exponent(2);
    expect(s.exponent()).toBe(3);
  });
});

describe('scale.sqrt', () => {
  it('is scale.pow fixed at exponent 0.5', () => {
    const s = scale.sqrt();
    expect(s.exponent()).toBe(0.5);
  });

  it('maps through sqrt before interpolating', () => {
    const s = scale.sqrt().domain([0, 100]).range([0, 1]);
    expect(s(25)).toBeCloseTo(0.5); // sqrt(25/100) = 0.5
    expect(s(100)).toBeCloseTo(1);
  });
});
