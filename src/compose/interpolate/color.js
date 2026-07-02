const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Whether `value` is a color this module can interpolate: a `'#rgb'`/`'#rrggbb'`
 * hex string, or a duck-typed `{ r, g, b }` object (matches `THREE.Color`,
 * whose channels are 0–1 floats) — checked structurally so this module never
 * imports `three` (compose/ works on plain values, per CLAUDE.md §1.4).
 * @param {*} value
 * @returns {boolean}
 */
export function isColorLike(value) {
  if (typeof value === 'string') return HEX_RE.test(value);
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.r === 'number' &&
    typeof value.g === 'number' &&
    typeof value.b === 'number'
  );
}

function hexToRgb(hex) {
  let digits = hex.slice(1);
  if (digits.length === 3) {
    digits = [...digits].map((c) => c + c).join('');
  }
  const num = parseInt(digits, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function rgbToHex({ r, g, b }) {
  const toHex = (v) => clampByte(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Normalizes any color-like value to 0–255 RGB channels, remembering enough
 * to format the interpolated result back in the same representation.
 * @param {string|{r: number, g: number, b: number}} value
 * @returns {{ rgb: {r: number, g: number, b: number}, format: 'hex'|'object', Ctor?: Function }}
 */
function parseColor(value) {
  if (typeof value === 'string') {
    return { rgb: hexToRgb(value), format: 'hex' };
  }
  return {
    rgb: { r: value.r * 255, g: value.g * 255, b: value.b * 255 },
    format: 'object',
    Ctor: value.constructor,
  };
}

/**
 * Formats 0–255 RGB channels back into the representation `parsed` came
 * from — a hex string, or a new instance of the original color's own
 * constructor (e.g. `THREE.Color`), constructed with 0–1 float channels.
 * @param {{r: number, g: number, b: number}} rgb
 * @param {{ format: 'hex'|'object', Ctor?: Function }} parsed
 * @returns {string|object}
 */
function formatColor(rgb, parsed) {
  if (parsed.format === 'hex') return rgbToHex(rgb);
  return new parsed.Ctor(rgb.r / 255, rgb.g / 255, rgb.b / 255);
}

function assertColorPair(method, a, b) {
  if (!isColorLike(a) || !isColorLike(b)) {
    throw new TypeError(
      `${method}: both arguments must be a hex color string ('#rgb'/'#rrggbb') or an ` +
        `{r,g,b} color object, received ${JSON.stringify(a)} and ${JSON.stringify(b)}.`,
    );
  }
}

function rgbToHsl({ r, g, b }) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h, s, l };
}

function hue2rgb(p, q, tIn) {
  let t = tIn;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb({ h, s, l }) {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  return {
    r: hue2rgb(p, q, hk + 1 / 3) * 255,
    g: hue2rgb(p, q, hk) * 255,
    b: hue2rgb(p, q, hk - 1 / 3) * 255,
  };
}

// sRGB <-> CIE Lab (D65 white point), for the perceptual interpolation variant.
const WHITE_D65 = { x: 0.95047, y: 1, z: 1.08883 };
const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(v) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return c * 255;
}

function rgbToXyz({ r, g, b }) {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  return {
    x: rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375,
    y: rl * 0.2126729 + gl * 0.715152 + bl * 0.072175,
    z: rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041,
  };
}

function xyzToRgb({ x, y, z }) {
  return {
    r: linearToSrgb(x * 3.2404542 + y * -1.5371385 + z * -0.4985314),
    g: linearToSrgb(x * -0.969266 + y * 1.8760108 + z * 0.041556),
    b: linearToSrgb(x * 0.0556434 + y * -0.2040259 + z * 1.0572252),
  };
}

function labF(t) {
  return t > LAB_EPSILON ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116;
}

function labFInverse(t) {
  return t ** 3 > LAB_EPSILON ? t ** 3 : (116 * t - 16) / LAB_KAPPA;
}

function xyzToLab({ x, y, z }) {
  const fx = labF(x / WHITE_D65.x);
  const fy = labF(y / WHITE_D65.y);
  const fz = labF(z / WHITE_D65.z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function labToXyz({ l, a, b }) {
  const fy = (l + 16) / 116;
  return {
    x: WHITE_D65.x * labFInverse(fy + a / 500),
    y: WHITE_D65.y * labFInverse(fy),
    z: WHITE_D65.z * labFInverse(fy - b / 200),
  };
}

function rgbToLab(rgb) {
  return xyzToLab(rgbToXyz(rgb));
}

function labToRgb(lab) {
  return xyzToRgb(labToXyz(lab));
}

/**
 * Interpolates two colors through RGB space (straight per-channel lerp).
 * The default color space used by the generic `interpolate()` dispatcher.
 * @param {string|{r: number, g: number, b: number}} a
 * @param {string|{r: number, g: number, b: number}} b
 * @returns {(t: number) => (string|object)} Same representation as `a`.
 * @throws {TypeError} If either argument isn't a hex string or `{r,g,b}` object.
 * @example interpolateRgb('#ff0000', '#0000ff')(0.5); // '#800080'
 */
export function interpolateRgb(a, b) {
  assertColorPair('interpolateRgb', a, b);
  const pa = parseColor(a);
  const pb = parseColor(b);
  return (t) =>
    formatColor(
      {
        r: pa.rgb.r + (pb.rgb.r - pa.rgb.r) * t,
        g: pa.rgb.g + (pb.rgb.g - pa.rgb.g) * t,
        b: pa.rgb.b + (pb.rgb.b - pa.rgb.b) * t,
      },
      pa,
    );
}

/**
 * Interpolates two colors through HSL space, taking the shortest path around
 * the hue wheel. Tends to pass through more saturated intermediate colors
 * than {@link interpolateRgb}.
 * @param {string|{r: number, g: number, b: number}} a
 * @param {string|{r: number, g: number, b: number}} b
 * @returns {(t: number) => (string|object)} Same representation as `a`.
 * @throws {TypeError} If either argument isn't a hex string or `{r,g,b}` object.
 * @example interpolateHsl('#ff0000', '#00ff00')(0.5); // yellow-ish
 */
export function interpolateHsl(a, b) {
  assertColorPair('interpolateHsl', a, b);
  const pa = parseColor(a);
  const pb = parseColor(b);
  const hsl0 = rgbToHsl(pa.rgb);
  const hsl1 = rgbToHsl(pb.rgb);
  let dh = hsl1.h - hsl0.h;
  if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  return (t) =>
    formatColor(
      hslToRgb({
        h: (hsl0.h + dh * t + 360) % 360,
        s: hsl0.s + (hsl1.s - hsl0.s) * t,
        l: hsl0.l + (hsl1.l - hsl0.l) * t,
      }),
      pa,
    );
}

/**
 * Interpolates two colors through perceptually-uniform CIE Lab space, so
 * equal steps in `t` look like more equal steps in color to the human eye
 * than {@link interpolateRgb} — at the cost of one XYZ/Lab round trip.
 * @param {string|{r: number, g: number, b: number}} a
 * @param {string|{r: number, g: number, b: number}} b
 * @returns {(t: number) => (string|object)} Same representation as `a`.
 * @throws {TypeError} If either argument isn't a hex string or `{r,g,b}` object.
 * @example interpolateLab('#ff0000', '#0000ff')(0.5);
 */
export function interpolateLab(a, b) {
  assertColorPair('interpolateLab', a, b);
  const pa = parseColor(a);
  const pb = parseColor(b);
  const lab0 = rgbToLab(pa.rgb);
  const lab1 = rgbToLab(pb.rgb);
  return (t) =>
    formatColor(
      labToRgb({
        l: lab0.l + (lab1.l - lab0.l) * t,
        a: lab0.a + (lab1.a - lab0.a) * t,
        b: lab0.b + (lab1.b - lab0.b) * t,
      }),
      pa,
    );
}
