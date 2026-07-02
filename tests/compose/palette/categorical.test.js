import { describe, it, expect } from 'vitest';
import {
  category10, tableau10, accent, dark2, paired, pastel, set1, set2, set3,
} from '../../../src/compose/palette/categorical.js';

const HEX_RE = /^#[0-9a-f]{6}$/;

const NAMED = { category10, tableau10, accent, dark2, paired, pastel, set1, set2, set3 };

describe('categorical palettes', () => {
  it.each(Object.keys(NAMED))('%s exposes the raw D3-compatible array on .colors', (name) => {
    const p = NAMED[name];
    expect(Array.isArray(p.colors)).toBe(true);
    expect(p.colors.length).toBeGreaterThan(1);
    for (const c of p.colors) expect(c).toMatch(HEX_RE);
  });

  it('cycles colors by first-seen value, matching color.categorical', () => {
    expect(category10('a')).toBe(category10.colors[0]);
    expect(category10('b')).toBe(category10.colors[1]);
    expect(category10('a')).toBe(category10.colors[0]);
  });

  it('wraps around once the scheme is exhausted', () => {
    const values = accent.colors.map((_, i) => `v${i}`);
    values.forEach((v, i) => expect(accent(v)).toBe(accent.colors[i]));
    expect(accent('vNext')).toBe(accent.colors[0]);
  });
});
