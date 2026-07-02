import { describe, it, expect } from 'vitest';
import { color } from '../../../src/compose/color/index.js';

describe('color.quantize', () => {
  it('splits the domain into equal-width buckets', () => {
    const s = color.quantize().domain([0, 100]).range(['#000', '#888', '#fff']);
    expect(s(10)).toBe('#000');
    expect(s(50)).toBe('#888');
    expect(s(90)).toBe('#fff');
  });

  it('clamps out-of-domain values to the nearest bucket', () => {
    const s = color.quantize().domain([0, 100]).range(['#000', '#fff']);
    expect(s(-50)).toBe('#000');
    expect(s(150)).toBe('#fff');
  });

  it('defaults to domain [0, 1]', () => {
    const s = color.quantize();
    expect(s.domain()).toEqual([0, 1]);
  });

  it('throws TypeError for an empty range', () => {
    expect(() => color.quantize().range([])).toThrow(TypeError);
  });

  it('copy is independent', () => {
    const s = color.quantize().domain([0, 100]).range(['#000', '#fff']);
    const c = s.copy();
    c.domain([0, 10]);
    expect(s.domain()).toEqual([0, 100]);
  });
});

describe('color.quantile', () => {
  it('buckets by data distribution rather than equal domain width', () => {
    const s = color.quantile().domain([1, 2, 3, 9, 10, 11]).range(['#000', '#fff']);
    expect(s(2)).toBe('#000');
    expect(s(10)).toBe('#fff');
  });

  it('quantiles() exposes the computed bucket boundaries', () => {
    const s = color.quantile().domain([1, 2, 3, 4]).range(['#000', '#fff']);
    expect(s.quantiles()).toHaveLength(1);
  });

  it('throws TypeError for an empty range', () => {
    expect(() => color.quantile().domain([1, 2, 3]).range([])).toThrow(TypeError);
  });

  it('copy is independent', () => {
    const s = color.quantile().domain([1, 2, 3, 9, 10, 11]).range(['#000', '#fff']);
    const c = s.copy();
    c.domain([1, 2]);
    expect(s.domain()).toEqual([1, 2, 3, 9, 10, 11]);
  });
});

describe('color.threshold', () => {
  it('buckets by explicit boundaries', () => {
    const s = color.threshold().domain([0, 10]).range(['#000', '#888', '#fff']);
    expect(s(-1)).toBe('#000');
    expect(s(5)).toBe('#888');
    expect(s(20)).toBe('#fff');
  });

  it('defaults to domain [0.5] / range [0, 1]', () => {
    const s = color.threshold();
    expect(s(0)).toBe(0);
    expect(s(1)).toBe(1);
  });

  it('throws TypeError for an empty range', () => {
    expect(() => color.threshold().range([])).toThrow(TypeError);
  });

  it('copy is independent', () => {
    const s = color.threshold().domain([10]).range(['#000', '#fff']);
    const c = s.copy();
    c.domain([5]);
    expect(s.domain()).toEqual([10]);
  });
});
