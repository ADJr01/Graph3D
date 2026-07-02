import { describe, it, expect } from 'vitest';
import { color } from '../../../src/compose/color/index.js';

describe('color.sequential', () => {
  it('maps a domain onto a palette array, clamped to the palette ends', () => {
    const s = color.sequential(['#000000', '#ffffff'], [0, 100]);
    expect(s(0)).toBe('#000000');
    expect(s(50)).toBe('#808080');
    expect(s(100)).toBe('#ffffff');
    expect(s(-50)).toBe('#000000');
    expect(s(150)).toBe('#ffffff');
  });

  it('accepts a t => color interpolator function directly', () => {
    const s = color.sequential((t) => `t=${t}`, [0, 10]);
    expect(s(5)).toBe('t=0.5');
  });

  it('defaults to domain [0, 1]', () => {
    const s = color.sequential(['#000000', '#ffffff']);
    expect(s.domain()).toEqual([0, 1]);
  });

  it('domain() gets/sets and returns the scale for chaining', () => {
    const s = color.sequential(['#000000', '#ffffff']);
    expect(s.domain([0, 10])).toBe(s);
    expect(s.domain()).toEqual([0, 10]);
  });

  it('throws TypeError for a palette that is neither a function nor an array of >= 2 colors', () => {
    expect(() => color.sequential(['#000000'])).toThrow(TypeError);
    expect(() => color.sequential('nope')).toThrow(TypeError);
  });

  it('copy is independent', () => {
    const s = color.sequential(['#000000', '#ffffff'], [0, 100]);
    const c = s.copy();
    c.domain([0, 10]);
    expect(s.domain()).toEqual([0, 100]);
  });
});

describe('color.diverging', () => {
  it('maps [low, mid, high] onto the palette ends and midpoint', () => {
    const s = color.diverging(['#0000ff', '#ffffff', '#ff0000'], [-10, 0, 10]);
    expect(s(-10)).toBe('#0000ff');
    expect(s(0)).toBe('#ffffff');
    expect(s(10)).toBe('#ff0000');
  });

  it('clamps beyond the domain', () => {
    const s = color.diverging(['#0000ff', '#ffffff', '#ff0000'], [-10, 0, 10]);
    expect(s(-100)).toBe('#0000ff');
    expect(s(100)).toBe('#ff0000');
  });

  it('defaults to domain [-1, 0, 1]', () => {
    const s = color.diverging(['#0000ff', '#ffffff', '#ff0000']);
    expect(s.domain()).toEqual([-1, 0, 1]);
  });

  it('throws TypeError for a non-3-element domain', () => {
    expect(() => color.diverging(['#000', '#fff'], [0, 1])).toThrow(TypeError);
    const s = color.diverging(['#0000ff', '#ffffff', '#ff0000']);
    expect(() => s.domain([0, 1])).toThrow(TypeError);
  });

  it('copy is independent', () => {
    const s = color.diverging(['#0000ff', '#ffffff', '#ff0000'], [-10, 0, 10]);
    const c = s.copy();
    c.domain([-1, 0, 1]);
    expect(s.domain()).toEqual([-10, 0, 10]);
  });
});
