import { interpolateRgb, interpolateHsl, interpolateLab, hex, hsl } from '../interpolate/color.js';
import { ramp } from './ramp.js';

function assertColors(method, colors) {
  if (!Array.isArray(colors) || colors.length < 2) {
    throw new TypeError(`palette.${method}: expected an array of at least 2 colors, received ${JSON.stringify(colors)}.`);
  }
}

/**
 * Builds a palette that interpolates through `colors` in straight RGB space
 * — a thin `ramp()` wrapper that pins the per-segment interpolator to
 * `interpolateRgb` instead of the generic dispatcher, reusing the same
 * piecewise engine rather than duplicating ramp math (CLAUDE.md §1.1 DRY).
 * @param {string[]} colors Anchor colors, low to high; at least 2.
 * @returns {(t: number) => string} With `.colors`, a precomputed 256-step array.
 * @throws {TypeError} If `colors` has fewer than 2 entries.
 * @example palette.interpolateRGB(['#000000', '#ffffff'])(0.5); // '#808080'
 */
export function interpolateRGB(colors) {
  assertColors('interpolateRGB', colors);
  return ramp(colors, interpolateRgb);
}

/**
 * Builds a palette that interpolates through `colors` in HSL space, taking
 * the shortest hue path each segment. See {@link interpolateRGB}.
 * @param {string[]} colors Anchor colors, low to high; at least 2.
 * @returns {(t: number) => string} With `.colors`, a precomputed 256-step array.
 * @throws {TypeError} If `colors` has fewer than 2 entries.
 * @example palette.interpolateHSL(['#ff0000', '#00ff00'])(0.5);
 */
export function interpolateHSL(colors) {
  assertColors('interpolateHSL', colors);
  return ramp(colors, interpolateHsl);
}

/**
 * Builds a palette that interpolates through `colors` in perceptually-uniform
 * CIE Lab space. See {@link interpolateRGB}.
 * @param {string[]} colors Anchor colors, low to high; at least 2.
 * @returns {(t: number) => string} With `.colors`, a precomputed 256-step array.
 * @throws {TypeError} If `colors` has fewer than 2 entries.
 * @example palette.interpolateLAB(['#ff0000', '#0000ff'])(0.5);
 */
export function interpolateLAB(colors) {
  assertColors('interpolateLAB', colors);
  return ramp(colors, interpolateLab);
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_RE = /^rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*(?:,\s*[\d.]+\s*)?\)$/i;
const HSL_RE = /^hsla?\(\s*([\d.]+)(?:deg)?\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*[\d.]+\s*)?\)$/i;

function channel(value) {
  return value.endsWith('%') ? (parseFloat(value) / 100) * 255 : parseFloat(value);
}

// ponytail: covers hex/rgb()/hsl() CSS syntax via the existing hex()/hsl()
// formatters (no new color math). Named keywords ('steelblue') aren't
// resolved — add a keyword table if a consumer needs them.
function toHex(css) {
  if (HEX_RE.test(css)) return css;
  const rgbMatch = css.match(RGB_RE);
  if (rgbMatch) return hex(channel(rgbMatch[1]), channel(rgbMatch[2]), channel(rgbMatch[3]));
  const hslMatch = css.match(HSL_RE);
  if (hslMatch) return hsl(parseFloat(hslMatch[1]), parseFloat(hslMatch[2]) / 100, parseFloat(hslMatch[3]) / 100);
  throw new TypeError(
    `palette.fromCSS: unsupported CSS color syntax "${css}". Supported: hex ('#rgb'/'#rrggbb'), ` +
      "rgb()/rgba(), hsl()/hsla().",
  );
}

/**
 * Builds a palette from CSS color strings — hex, `rgb()`/`rgba()`, or
 * `hsl()`/`hsla()` — by normalizing each to hex (reusing the `hex()`/`hsl()`
 * formatters, CLAUDE.md §1.1 DRY) and delegating to `ramp()`.
 * @param {string[]} colors CSS color strings, low to high; at least 2.
 * @returns {(t: number) => string} With `.colors`, a precomputed 256-step array.
 * @throws {TypeError} If `colors` has fewer than 2 entries, or a string isn't
 *   a supported CSS color syntax.
 * @example palette.fromCSS(['rgb(0, 0, 0)', 'hsl(0, 100%, 50%)'])(1); // '#ff0000'
 */
export function fromCSS(colors) {
  assertColors('fromCSS', colors);
  return ramp(colors.map(toHex));
}
