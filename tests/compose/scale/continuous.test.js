import { describe, it, expect } from 'vitest';
import { continuous } from '../../../src/compose/scale/continuous.js';

// ── domain / range ───────────────────────────────────────────────────────────

describe('continuous domain/range', () => {
  it('defaults to [0, 1] -> [0, 1]', () => {
    const s = continuous();
    expect(s.domain()).toEqual([0, 1]);
    expect(s.range()).toEqual([0, 1]);
    expect(s(0.5)).toBe(0.5);
  });

  it('domain(arr)/range(arr) set and return the scale for chaining', () => {
    const s = continuous();
    expect(s.domain([0, 100])).toBe(s);
    expect(s.range([0, 1])).toBe(s);
    expect(s.domain()).toEqual([0, 100]);
    expect(s.range()).toEqual([0, 1]);
  });

  it('throws TypeError for a domain/range shorter than 2', () => {
    const s = continuous();
    expect(() => s.domain([1])).toThrow(TypeError);
    expect(() => s.range([1])).toThrow(TypeError);
    expect(() => s.domain('nope')).toThrow(TypeError);
  });

  it('maps values linearly, including extrapolation beyond the domain', () => {
    const s = continuous().domain([0, 100]).range([0, 1]);
    expect(s(50)).toBeCloseTo(0.5);
    expect(s(150)).toBeCloseTo(1.5);
    expect(s(-50)).toBeCloseTo(-0.5);
  });

  it('supports piecewise (>2-stop) domains and ranges', () => {
    const s = continuous().domain([0, 50, 100]).range([0, 10, 0]);
    expect(s(0)).toBe(0);
    expect(s(25)).toBeCloseTo(5);
    expect(s(50)).toBe(10);
    expect(s(75)).toBeCloseTo(5);
    expect(s(100)).toBe(0);
  });
});

// ── clamp ──────────────────────────────────────────────────────────────────

describe('continuous clamp', () => {
  it('defaults to false (no clamping)', () => {
    const s = continuous().domain([0, 100]).range([0, 1]);
    expect(s.clamp()).toBe(false);
    expect(s(150)).toBeCloseTo(1.5);
  });

  it('clamp(true) restricts output to the range bounds and returns the scale', () => {
    const s = continuous().domain([0, 100]).range([0, 1]);
    expect(s.clamp(true)).toBe(s);
    expect(s(150)).toBe(1);
    expect(s(-50)).toBe(0);
  });
});

// ── invert ─────────────────────────────────────────────────────────────────

describe('continuous invert', () => {
  it('maps a range value back to its domain value', () => {
    const s = continuous().domain([0, 100]).range([0, 1]);
    expect(s.invert(0.5)).toBeCloseTo(50);
    expect(s.invert(0)).toBe(0);
    expect(s.invert(1)).toBe(100);
  });

  it('throws TypeError when the range is non-numeric', () => {
    const s = continuous().domain([0, 100]).range(['#ff0000', '#0000ff']);
    expect(() => s.invert(0.5)).toThrow(TypeError);
  });
});

// ── non-numeric range (routed through interpolate) ──────────────────────────

describe('continuous with a color range', () => {
  it('maps through the interpolate module so hex color ranges work', () => {
    const s = continuous().domain([0, 100]).range(['#ff0000', '#0000ff']);
    expect(s(0)).toBe('#ff0000');
    expect(s(100)).toBe('#0000ff');
    expect(s(50)).toBe('#800080');
  });

  it('accepts a custom per-segment interpolator, used by palette.interpolateRGB/HSL/LAB', () => {
    const customInterpolator = () => () => '#123456';
    const s = continuous(undefined, undefined, customInterpolator).domain([0, 1]).range(['#ff0000', '#0000ff']);
    expect(s(0.5)).toBe('#123456');
  });
});

// ── copy ───────────────────────────────────────────────────────────────────

describe('continuous copy', () => {
  it('returns an independent scale with the same domain/range/clamp state', () => {
    const s = continuous().domain([0, 100]).range([0, 1]).clamp(true);
    const c = s.copy();

    expect(c).not.toBe(s);
    expect(c.domain()).toEqual([0, 100]);
    expect(c.range()).toEqual([0, 1]);
    expect(c.clamp()).toBe(true);

    c.domain([0, 10]);
    expect(s.domain()).toEqual([0, 100]);
  });
});

// ── nice ───────────────────────────────────────────────────────────────────

describe('continuous nice', () => {
  it('rounds the domain outward to round numbers, matching D3 parity', () => {
    const s = continuous().domain([1.1, 10.9]);
    expect(s.nice()).toBe(s);
    expect(s.domain()).toEqual([1, 11]);
  });

  it('handles a descending domain, preserving direction', () => {
    const s = continuous().domain([10.9, 1.1]);
    s.nice();
    expect(s.domain()).toEqual([11, 1]);
  });
});
