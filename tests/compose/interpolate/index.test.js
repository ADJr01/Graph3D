import { describe, it, expect } from 'vitest';
import {
  interpolate,
  interpolateArray,
  interpolateObject,
} from '../../../src/compose/interpolate/index.js';

describe('interpolate dispatch', () => {
  it('dispatches numbers to interpolateNumber', () => {
    expect(interpolate(0, 10)(0.5)).toBe(5);
  });

  it('dispatches colors (hex strings) to interpolateRgb', () => {
    expect(interpolate('#ff0000', '#0000ff')(0.5)).toBe('#800080');
  });

  it('dispatches arrays element-wise, recursing into interpolate', () => {
    expect(interpolate([0, 0], [10, 20])(0.5)).toEqual([5, 10]);
  });

  it('dispatches plain objects key-wise, recursing into interpolate', () => {
    expect(interpolate({ x: 0, y: 0 }, { x: 10, y: 20 })(0.5)).toEqual({ x: 5, y: 10 });
  });

  it('throws TypeError for mismatched or unsupported shapes', () => {
    expect(() => interpolate(0, '#fff')).toThrow(TypeError);
    expect(() => interpolate(true, false)).toThrow(TypeError);
  });
});

describe('interpolateArray', () => {
  it("keeps b's length, passing through indices a lacks", () => {
    const i = interpolateArray([0, 0], [10, 20, 30]);
    expect(i(0.5)).toEqual([5, 10, 30]);
  });

  it('recurses into nested interpolatable values', () => {
    const i = interpolateArray([{ x: 0 }], [{ x: 10 }]);
    expect(i(0.5)).toEqual([{ x: 5 }]);
  });
});

describe('interpolateObject', () => {
  it('interpolates shared keys and passes through keys unique to b', () => {
    const i = interpolateObject({ x: 0 }, { x: 10, y: 20 });
    expect(i(0.5)).toEqual({ x: 5, y: 20 });
  });

  it('drops keys unique to a', () => {
    const i = interpolateObject({ x: 0, z: 99 }, { x: 10 });
    expect(i(0.5)).toEqual({ x: 5 });
  });
});
