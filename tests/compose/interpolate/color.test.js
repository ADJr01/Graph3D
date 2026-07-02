import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  isColorLike,
  interpolateRgb,
  interpolateHsl,
  interpolateLab,
} from '../../../src/compose/interpolate/color.js';

describe('isColorLike', () => {
  it('accepts hex strings, both 3 and 6 digit', () => {
    expect(isColorLike('#f00')).toBe(true);
    expect(isColorLike('#ff0000')).toBe(true);
  });

  it('accepts duck-typed {r,g,b} objects, e.g. THREE.Color', () => {
    expect(isColorLike(new THREE.Color(1, 0, 0))).toBe(true);
    expect(isColorLike({ r: 1, g: 0, b: 0 })).toBe(true);
  });

  it('rejects non-colors', () => {
    expect(isColorLike('red')).toBe(false);
    expect(isColorLike(0xff0000)).toBe(false);
    expect(isColorLike(null)).toBe(false);
    expect(isColorLike([1, 0, 0])).toBe(false);
  });
});

describe('interpolateRgb', () => {
  it('interpolates hex strings and returns a hex string', () => {
    const i = interpolateRgb('#ff0000', '#0000ff');
    expect(i(0)).toBe('#ff0000');
    expect(i(1)).toBe('#0000ff');
    expect(i(0.5)).toBe('#800080');
  });

  it('interpolates THREE.Color instances and returns a THREE.Color', () => {
    const a = new THREE.Color(1, 0, 0);
    const b = new THREE.Color(0, 0, 1);
    const mid = interpolateRgb(a, b)(0.5);
    expect(mid).toBeInstanceOf(THREE.Color);
    expect(mid.r).toBeCloseTo(0.5);
    expect(mid.g).toBeCloseTo(0);
    expect(mid.b).toBeCloseTo(0.5);
  });

  it('throws TypeError for non-color arguments', () => {
    expect(() => interpolateRgb('red', '#fff')).toThrow(TypeError);
    expect(() => interpolateRgb(0xff0000, 0x0000ff)).toThrow(TypeError);
  });
});

describe('interpolateHsl', () => {
  it('takes the shortest hue path', () => {
    // red (h=0) -> green (h=120): shortest path increases hue.
    const i = interpolateHsl('#ff0000', '#00ff00');
    expect(i(0)).toBe('#ff0000');
    expect(i(1)).toBe('#00ff00');
  });
});

describe('interpolateLab', () => {
  it('round-trips endpoints exactly', () => {
    const i = interpolateLab('#336699', '#cc3300');
    expect(i(0)).toBe('#336699');
    expect(i(1)).toBe('#cc3300');
  });
});
