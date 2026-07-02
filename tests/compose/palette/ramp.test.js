import { describe, it, expect } from 'vitest';
import { ramp, attachColors } from '../../../src/compose/palette/ramp.js';

describe('attachColors', () => {
  it('samples fn at 256 evenly spaced points across [0, 1] and attaches .colors', () => {
    const fn = attachColors((t) => (t < 0.5 ? '#000000' : '#ffffff'));
    expect(fn.colors).toHaveLength(256);
    expect(fn.colors[0]).toBe('#000000');
    expect(fn.colors[255]).toBe('#ffffff');
  });

  it('returns fn itself, mutated', () => {
    const original = (t) => t;
    const returned = attachColors(original);
    expect(returned).toBe(original);
  });
});

describe('ramp', () => {
  it('interpolates piecewise through anchor colors', () => {
    const p = ramp(['#000000', '#ffffff']);
    expect(p(0)).toBe('#000000');
    expect(p(1)).toBe('#ffffff');
    expect(p(0.5)).toBe('#808080');
  });

  it('supports more than 2 anchors', () => {
    const p = ramp(['#ff0000', '#00ff00', '#0000ff']);
    expect(p(0)).toBe('#ff0000');
    expect(p(0.5)).toBe('#00ff00');
    expect(p(1)).toBe('#0000ff');
  });

  it('clamps out-of-range t to the first/last anchor', () => {
    const p = ramp(['#000000', '#ffffff']);
    expect(p(-1)).toBe('#000000');
    expect(p(2)).toBe('#ffffff');
  });

  it('attaches a 256-step .colors array', () => {
    const p = ramp(['#000000', '#ffffff']);
    expect(p.colors).toHaveLength(256);
    expect(p.colors[0]).toBe('#000000');
    expect(p.colors[255]).toBe('#ffffff');
  });
});
