import { describe, it, expect } from 'vitest';
import { scale } from '../../../src/compose/scale/index.js';

describe('scale.band', () => {
  it('divides the range evenly with no padding', () => {
    const s = scale.band().domain(['a', 'b', 'c']).range([0, 300]);
    expect(s('a')).toBeCloseTo(0);
    expect(s('b')).toBeCloseTo(100);
    expect(s('c')).toBeCloseTo(200);
    expect(s.bandwidth()).toBeCloseTo(100);
  });

  it('paddingInner shrinks bandwidth and spreads bands apart', () => {
    const s = scale.band().domain(['a', 'b']).range([0, 100]).paddingInner(0.5);
    // step = 100 / (2 - 0.5) = 66.67; bandwidth = step * 0.5
    expect(s.bandwidth()).toBeCloseTo(33.33, 1);
    expect(s('b') - s('a')).toBeCloseTo(66.67, 1);
  });

  it('paddingOuter insets the first and last band from the edges', () => {
    const withOuter = scale.band().domain(['a', 'b']).range([0, 100]).paddingOuter(1);
    const withoutOuter = scale.band().domain(['a', 'b']).range([0, 100]);
    expect(withOuter('a')).toBeGreaterThan(withoutOuter('a'));
  });

  it('padding(value) sets paddingInner (clamped to 1) and paddingOuter together', () => {
    const s = scale.band().domain(['a', 'b']).range([0, 100]).padding(0.5);
    expect(s.paddingInner()).toBeCloseTo(0.5);
    expect(s.paddingOuter()).toBeCloseTo(0.5);
    const clamped = scale.band().domain(['a', 'b']).range([0, 100]).padding(2);
    expect(clamped.paddingInner()).toBe(1);
    expect(clamped.paddingOuter()).toBe(2);
  });

  it('align shifts leftover space between the start and end of the range', () => {
    const start = scale.band().domain(['a']).range([0, 100]).paddingOuter(1).align(0);
    const end = scale.band().domain(['a']).range([0, 100]).paddingOuter(1).align(1);
    expect(start('a')).toBeLessThan(end('a'));
  });

  it('copy is independent', () => {
    const s = scale.band().domain(['a', 'b']).range([0, 100]).paddingInner(0.5);
    const c = s.copy();
    c.paddingInner(0);
    expect(s.paddingInner()).toBeCloseTo(0.5);
  });
});

describe('scale.point', () => {
  it('spaces domain values evenly with zero bandwidth', () => {
    const s = scale.point().domain(['a', 'b', 'c']).range([0, 200]);
    expect(s('a')).toBeCloseTo(0);
    expect(s('b')).toBeCloseTo(100);
    expect(s('c')).toBeCloseTo(200);
    expect(s.bandwidth()).toBe(0);
  });

  it('padding aliases paddingOuter and does not expose paddingInner', () => {
    const s = scale.point().domain(['a', 'b']).range([0, 100]);
    expect(s.paddingInner).toBeUndefined();
    const padded = scale.point().domain(['a', 'b']).range([0, 100]).padding(1);
    expect(padded.paddingOuter()).toBe(1);
  });

  it('copy is independent', () => {
    const s = scale.point().domain(['a', 'b']).range([0, 100]).paddingOuter(1);
    const c = s.copy();
    c.paddingOuter(0);
    expect(s.paddingOuter()).toBe(1);
  });
});
