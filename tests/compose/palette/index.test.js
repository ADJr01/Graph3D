import { describe, it, expect } from 'vitest';
import { palette } from '../../../src/compose/palette/index.js';

const HEX_RE = /^#[0-9a-f]{6}$/;

const CONTINUOUS_NAMES = [
  'viridis', 'inferno', 'magma', 'plasma', 'cividis', 'turbo',
  'warm', 'cool', 'rainbow', 'sinebow',
  'spectral', 'RdYlBu', 'RdBu', 'BrBG', 'PiYG',
  'blues', 'greens', 'oranges', 'purples', 'reds', 'greys',
];

const CATEGORICAL_NAMES = [
  'category10', 'tableau10', 'accent', 'dark2', 'paired', 'pastel', 'set1', 'set2', 'set3',
];

const BUILDER_NAMES = ['interpolateRGB', 'interpolateHSL', 'interpolateLAB', 'fromCSS'];

describe('palette namespace', () => {
  it('exposes exactly the 30 named palettes plus the 4 custom builders from Prompts 61-63', () => {
    expect(Object.keys(palette).sort()).toEqual(
      [...CONTINUOUS_NAMES, ...CATEGORICAL_NAMES, ...BUILDER_NAMES].sort(),
    );
  });

  it.each(BUILDER_NAMES)('%s is a palette-builder function', (name) => {
    expect(typeof palette[name]).toBe('function');
  });

  it.each(CONTINUOUS_NAMES)('%s is a (t) => "#rrggbb" function with a 256-step .colors array', (name) => {
    const p = palette[name];
    expect(typeof p).toBe('function');
    expect(p(0)).toMatch(HEX_RE);
    expect(p(0.5)).toMatch(HEX_RE);
    expect(p(1)).toMatch(HEX_RE);
    expect(p.colors).toHaveLength(256);
    for (const c of p.colors) expect(c).toMatch(HEX_RE);
  });

  it.each(CATEGORICAL_NAMES)('%s is a cycling function with its raw D3 array on .colors', (name) => {
    const p = palette[name];
    expect(typeof p).toBe('function');
    expect(Array.isArray(p.colors)).toBe(true);
    expect(p('some-value')).toBe(p.colors[0]);
    for (const c of p.colors) expect(c).toMatch(HEX_RE);
  });
});
