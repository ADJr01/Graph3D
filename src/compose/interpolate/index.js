import { interpolateNumber } from './number.js';
import { interpolateRgb, isColorLike } from './color.js';

export { interpolateNumber } from './number.js';
export { interpolateRgb, interpolateHsl, interpolateLab, isColorLike } from './color.js';

/**
 * Element-wise array interpolation. Mirrors d3-interpolate: the result has
 * `b`'s length; indices past `a`'s length take `b`'s value at every `t`
 * (there's nothing in `a` to interpolate from).
 * @param {Array} a
 * @param {Array} b
 * @returns {(t: number) => Array}
 * @example interpolateArray([0, 0], [10, 20, 30])(0.5); // [5, 10, 30]
 */
export function interpolateArray(a, b) {
  const na = Math.min(a.length, b.length);
  const perIndex = new Array(na);
  for (let i = 0; i < na; i++) perIndex[i] = interpolate(a[i], b[i]);
  return (t) => {
    const out = new Array(b.length);
    let i = 0;
    for (; i < na; i++) out[i] = perIndex[i](t);
    for (; i < b.length; i++) out[i] = b[i];
    return out;
  };
}

/**
 * Key-wise plain-object interpolation (also covers `{x, y, z}` vectors,
 * which are just objects with numeric keys). Mirrors d3-interpolate: only
 * `b`'s keys appear in the result; keys shared with `a` are interpolated,
 * keys unique to `b` take `b`'s value at every `t`.
 * @param {object} a
 * @param {object} b
 * @returns {(t: number) => object}
 * @example interpolateObject({ x: 0, y: 0 }, { x: 10, y: 10 })(0.5); // { x: 5, y: 5 }
 */
export function interpolateObject(a, b) {
  const perKey = {};
  const passthroughKeys = [];
  for (const key of Object.keys(b)) {
    if (key in a) perKey[key] = interpolate(a[key], b[key]);
    else passthroughKeys.push(key);
  }
  return (t) => {
    const out = {};
    for (const key of Object.keys(perKey)) out[key] = perKey[key](t);
    for (const key of passthroughKeys) out[key] = b[key];
    return out;
  };
}

/**
 * The single interpolation authority for the library (CLAUDE.md §1.1 DRY) —
 * scales, keyframes, and transitions all build their `t => value` functions
 * through this dispatcher rather than writing local lerp code. Dispatches on
 * the type of `a`/`b`: both numbers, both colors (hex string or `{r,g,b}`,
 * e.g. `THREE.Color`), both arrays, or both plain objects — recursing into
 * arrays/objects element-wise.
 * @param {*} a Value at `t = 0`.
 * @param {*} b Value at `t = 1`.
 * @returns {(t: number) => *}
 * @throws {TypeError} If `a`/`b` are not the same interpolatable shape.
 * @example interpolate(0, 100)(0.5); // 50
 * @example interpolate('#ff0000', '#0000ff')(0.5); // '#800080'
 * @example interpolate({ x: 0 }, { x: 10 })(0.5); // { x: 5 }
 */
export function interpolate(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return interpolateNumber(a, b);
  if (isColorLike(a) && isColorLike(b)) return interpolateRgb(a, b);
  if (Array.isArray(a) && Array.isArray(b)) return interpolateArray(a, b);
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    return interpolateObject(a, b);
  }
  throw new TypeError(
    'interpolate: cannot interpolate between ' +
      `${JSON.stringify(a)} and ${JSON.stringify(b)}. Supported pairs: number/number, ` +
      'color/color (hex string or {r,g,b}), array/array, object/object.',
  );
}
