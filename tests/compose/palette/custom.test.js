import { describe, it, expect } from 'vitest';
import { interpolateRGB, interpolateHSL, interpolateLAB, fromCSS } from '../../../src/compose/palette/custom.js';

describe('interpolateRGB', () => {
  it('interpolates through RGB space with a 256-step .colors array', () => {
    const p = interpolateRGB(['#000000', '#ffffff']);
    expect(p(0)).toBe('#000000');
    expect(p(1)).toBe('#ffffff');
    expect(p(0.5)).toBe('#808080');
    expect(p.colors).toHaveLength(256);
  });

  it('throws TypeError for fewer than 2 colors', () => {
    expect(() => interpolateRGB(['#000000'])).toThrow(TypeError);
  });
});

describe('interpolateHSL', () => {
  it('takes the shortest hue path, matching interpolateHsl', () => {
    const p = interpolateHSL(['#ff0000', '#00ff00']);
    expect(p(0)).toBe('#ff0000');
    expect(p(1)).toBe('#00ff00');
    expect(p(0.5)).not.toBe('#808000');
  });
});

describe('interpolateLAB', () => {
  it('round-trips endpoints exactly', () => {
    const p = interpolateLAB(['#336699', '#cc3300']);
    expect(p(0)).toBe('#336699');
    expect(p(1)).toBe('#cc3300');
  });
});

describe('fromCSS', () => {
  it('accepts hex strings', () => {
    const p = fromCSS(['#000000', '#ffffff']);
    expect(p(0.5)).toBe('#808080');
  });

  it('normalizes rgb()/rgba() to hex', () => {
    const p = fromCSS(['rgb(0, 0, 0)', 'rgba(255, 255, 255, 0.5)']);
    expect(p(0)).toBe('#000000');
    expect(p(1)).toBe('#ffffff');
  });

  it('normalizes hsl()/hsla() to hex', () => {
    const p = fromCSS(['hsl(0, 100%, 50%)', 'hsla(120, 100%, 50%, 1)']);
    expect(p(0)).toBe('#ff0000');
    expect(p(1)).toBe('#00ff00');
  });

  it('supports percentage-form rgb() channels', () => {
    const p = fromCSS(['rgb(0%, 0%, 0%)', 'rgb(100%, 100%, 100%)']);
    expect(p(0)).toBe('#000000');
    expect(p(1)).toBe('#ffffff');
  });

  it('throws TypeError for an unsupported CSS syntax', () => {
    expect(() => fromCSS(['steelblue', '#ffffff'])).toThrow(TypeError);
  });

  it('throws TypeError for fewer than 2 colors', () => {
    expect(() => fromCSS(['#000000'])).toThrow(TypeError);
  });
});
