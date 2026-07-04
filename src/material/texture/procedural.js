import * as THREE from 'three';
import { interpolateRgb } from '../../compose/interpolate/index.js';
import { assertPlainOptions, assertFiniteNumber } from '../validate.js';

const DEFAULT_SIZE = 256;

/** @param {string} callerName @param {*} value @throws {TypeError} */
function assertPositiveInteger(callerName, name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${callerName}: ${name} must be a positive integer, received ${JSON.stringify(value)}.`);
  }
}

/** @param {number} v @returns {number} */
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Hermite smoothstep, mirroring the shader builtin of the same name. */
function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * @param {(string|number|THREE.Color)} hex
 * @returns {[number, number, number, number]} 0–1 RGBA, alpha always 1.
 */
function colorToRGBA(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b, 1];
}

/**
 * Builds an RGBA `THREE.DataTexture` by sampling `pixelFn(u, v)` (normalized
 * `[0,1]` coordinates) at every texel — the single per-pixel-loop-and-upload
 * site every generator below goes through (CLAUDE.md §1.1 DRY).
 * @param {number} width
 * @param {number} height
 * @param {(u: number, v: number) => [number, number, number, number]} pixelFn Returns 0–1 RGBA.
 * @returns {THREE.DataTexture}
 */
function buildDataTexture(width, height, pixelFn) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const v = y / height;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const [r, g, b, a] = pixelFn(u, v);
      const i = (y * width + x) * 4;
      data[i] = Math.round(clamp01(r) * 255);
      data[i + 1] = Math.round(clamp01(g) * 255);
      data[i + 2] = Math.round(clamp01(b) * 255);
      data[i + 3] = Math.round(clamp01(a) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Deterministic 2D hash → `[0, 1)`. Not cryptographic — a standard
 * sin-fract shader trick, good enough for visual procedural variation, the
 * same authority `noise`/`voronoi`/`cellular` below all sample through
 * (CLAUDE.md §1.1 DRY). Unrelated to `anim/GraphAnimCurve`'s `noise()`: that
 * one is 1D and serves easing curves (a temporal domain), not 2D image data
 * — genuinely different domains, not a missed DRY opportunity.
 * @param {number} x @param {number} y @param {number} seed
 * @returns {number}
 */
function hash2(x, y, seed) {
  const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}

/** Smoothed (Hermite-interpolated) 2D value noise, `[0, 1)`. */
function valueNoise2D(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed);
  const v11 = hash2(x0 + 1, y0 + 1, seed);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = v00 + (v10 - v00) * sx;
  const bottom = v01 + (v11 - v01) * sx;
  return top + (bottom - top) * sy;
}

/**
 * Worley/cellular F1 (nearest feature point) and F2 (second-nearest)
 * distances at `(x, y)`, in the same normalized `[0,1]` units as `x`/`y` —
 * `voronoi` uses F1 alone (filled cells); `cellular` uses `F2 - F1` (thin
 * edges at cell boundaries). One shared feature-point search, not two
 * (CLAUDE.md §1.1 DRY).
 * @param {number} x @param {number} y @param {number} cellCount @param {number} seed
 * @returns {{ f1: number, f2: number }}
 */
function worleyF1F2(x, y, cellCount, seed) {
  const cellX = Math.floor(x * cellCount);
  const cellY = Math.floor(y * cellCount);
  let f1 = Infinity;
  let f2 = Infinity;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = cellX + ox;
      const cy = cellY + oy;
      const px = (cx + hash2(cx, cy, seed)) / cellCount;
      const py = (cy + hash2(cx, cy, seed + 1)) / cellCount;
      const d = Math.hypot(x - px, y - py);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1, f2 };
}

/**
 * Linear or radial two-color gradient.
 * @param {{ type?: ('linear'|'radial'), from?: (string|number|THREE.Color), to?: (string|number|THREE.Color), angle?: number, size?: number }} [options]
 * @returns {THREE.DataTexture}
 * @throws {TypeError} If `options` is not a plain object, `type` isn't `'linear'|'radial'`, `angle` isn't finite, or `size` isn't a positive integer.
 * @example texture.gradient({ from: '#1e293b', to: '#0ea5e9', angle: 45 });
 */
export function gradient(options = {}) {
  assertPlainOptions('texture.gradient', options);
  const { type = 'linear', from = '#000000', to = '#ffffff', angle = 0, size = DEFAULT_SIZE } = options;
  if (type !== 'linear' && type !== 'radial') {
    throw new TypeError(`texture.gradient: type must be 'linear' or 'radial', received ${JSON.stringify(type)}.`);
  }
  assertFiniteNumber('texture.gradient', 'angle', angle);
  assertPositiveInteger('texture.gradient', 'size', size);

  const mix = interpolateRgb(from, to);
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  return buildDataTexture(size, size, (u, v) => {
    const t = type === 'linear' ? (u - 0.5) * dx + (v - 0.5) * dy + 0.5 : Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2);
    return colorToRGBA(mix(clamp01(t)));
  });
}

/**
 * Smooth 2D value noise, mapped through a two-color gradient.
 * @param {{ scale?: number, seed?: number, size?: number, color1?: (string|number|THREE.Color), color2?: (string|number|THREE.Color) }} [options]
 * @returns {THREE.DataTexture}
 * @throws {TypeError} If `options` is not a plain object, `scale`/`seed` isn't finite, or `size` isn't a positive integer.
 * @example texture.noise({ scale: 6, color1: '#000000', color2: '#4ade80' });
 */
export function noise(options = {}) {
  assertPlainOptions('texture.noise', options);
  const { scale = 8, seed = 0, size = DEFAULT_SIZE, color1 = '#000000', color2 = '#ffffff' } = options;
  assertFiniteNumber('texture.noise', 'scale', scale);
  assertFiniteNumber('texture.noise', 'seed', seed);
  assertPositiveInteger('texture.noise', 'size', size);

  const mix = interpolateRgb(color1, color2);
  return buildDataTexture(size, size, (u, v) => colorToRGBA(mix(valueNoise2D(u * scale, v * scale, seed))));
}

/**
 * Filled Voronoi/Worley cells (F1 distance), mapped through a two-color gradient.
 * @param {{ cellCount?: number, seed?: number, size?: number, color1?: (string|number|THREE.Color), color2?: (string|number|THREE.Color) }} [options]
 * @returns {THREE.DataTexture}
 * @throws {TypeError} If `options` is not a plain object, `seed` isn't finite, or `cellCount`/`size` isn't a positive integer.
 * @example texture.voronoi({ cellCount: 10, color1: '#1e1b4b', color2: '#a78bfa' });
 */
export function voronoi(options = {}) {
  assertPlainOptions('texture.voronoi', options);
  const { cellCount = 8, seed = 0, size = DEFAULT_SIZE, color1 = '#000000', color2 = '#ffffff' } = options;
  assertPositiveInteger('texture.voronoi', 'cellCount', cellCount);
  assertFiniteNumber('texture.voronoi', 'seed', seed);
  assertPositiveInteger('texture.voronoi', 'size', size);

  const mix = interpolateRgb(color1, color2);
  return buildDataTexture(size, size, (u, v) => {
    const { f1 } = worleyF1F2(u, v, cellCount, seed);
    return colorToRGBA(mix(clamp01(f1 * cellCount)));
  });
}

/**
 * Voronoi cell *edges* (`F2 - F1`) — thin boundary lines between cells,
 * rather than `voronoi`'s filled-cell shading. Shares the same feature-point
 * search as `voronoi` (`worleyF1F2`).
 * @param {{ cellCount?: number, seed?: number, edgeWidth?: number, size?: number, color1?: (string|number|THREE.Color), color2?: (string|number|THREE.Color) }} [options]
 *   `color1` is the edge color, `color2` the cell-interior fill.
 * @returns {THREE.DataTexture}
 * @throws {TypeError} If `options` is not a plain object, `seed`/`edgeWidth` isn't finite, or `cellCount`/`size` isn't a positive integer.
 * @example texture.cellular({ cellCount: 12, color1: '#000000', color2: '#e2e8f0' });
 */
export function cellular(options = {}) {
  assertPlainOptions('texture.cellular', options);
  const { cellCount = 8, seed = 0, edgeWidth = 0.08, size = DEFAULT_SIZE, color1 = '#000000', color2 = '#ffffff' } = options;
  assertPositiveInteger('texture.cellular', 'cellCount', cellCount);
  assertFiniteNumber('texture.cellular', 'seed', seed);
  assertFiniteNumber('texture.cellular', 'edgeWidth', edgeWidth);
  assertPositiveInteger('texture.cellular', 'size', size);

  const mix = interpolateRgb(color1, color2);
  return buildDataTexture(size, size, (u, v) => {
    const { f1, f2 } = worleyF1F2(u, v, cellCount, seed);
    const edgeDistance = (f2 - f1) * cellCount;
    return colorToRGBA(mix(smoothstep(0, edgeWidth, edgeDistance)));
  });
}

/**
 * Alternating-square checkerboard.
 * @param {{ tiles?: number, size?: number, color1?: (string|number|THREE.Color), color2?: (string|number|THREE.Color) }} [options]
 * @returns {THREE.DataTexture}
 * @throws {TypeError} If `options` is not a plain object, or `tiles`/`size` isn't a positive integer.
 * @example texture.checkerboard({ tiles: 8, color1: '#000000', color2: '#ffffff' });
 */
export function checkerboard(options = {}) {
  assertPlainOptions('texture.checkerboard', options);
  const { tiles = 8, size = DEFAULT_SIZE, color1 = '#000000', color2 = '#ffffff' } = options;
  assertPositiveInteger('texture.checkerboard', 'tiles', tiles);
  assertPositiveInteger('texture.checkerboard', 'size', size);

  const rgba1 = colorToRGBA(color1);
  const rgba2 = colorToRGBA(color2);
  return buildDataTexture(size, size, (u, v) => {
    const cx = Math.floor(u * tiles);
    const cy = Math.floor(v * tiles);
    return (cx + cy) % 2 === 0 ? rgba1 : rgba2;
  });
}

/**
 * A grid of polka dots.
 * @param {{ tiles?: number, radius?: number, size?: number, color1?: (string|number|THREE.Color), color2?: (string|number|THREE.Color) }} [options]
 *   `color1` is the dot color, `color2` the background. `radius` is a fraction of one tile (`0`–`0.5`).
 * @returns {THREE.DataTexture}
 * @throws {TypeError} If `options` is not a plain object, `radius` isn't finite, or `tiles`/`size` isn't a positive integer.
 * @example texture.dots({ tiles: 10, radius: 0.3, color1: '#ef4444', color2: '#fff1f2' });
 */
export function dots(options = {}) {
  assertPlainOptions('texture.dots', options);
  const { tiles = 8, radius = 0.35, size = DEFAULT_SIZE, color1 = '#000000', color2 = '#ffffff' } = options;
  assertPositiveInteger('texture.dots', 'tiles', tiles);
  assertFiniteNumber('texture.dots', 'radius', radius);
  assertPositiveInteger('texture.dots', 'size', size);

  const mix = interpolateRgb(color1, color2);
  const aa = 0.05;
  return buildDataTexture(size, size, (u, v) => {
    const cellU = (u * tiles) % 1;
    const cellV = (v * tiles) % 1;
    const distance = Math.hypot(cellU - 0.5, cellV - 0.5);
    return colorToRGBA(mix(smoothstep(radius - aa, radius + aa, distance)));
  });
}

/**
 * Angled parallel stripes.
 * @param {{ tiles?: number, thickness?: number, angle?: number, size?: number, color1?: (string|number|THREE.Color), color2?: (string|number|THREE.Color) }} [options]
 *   `color1` is the stripe color, `color2` the background. `thickness` is a fraction of one stripe period (`0`–`1`).
 * @returns {THREE.DataTexture}
 * @throws {TypeError} If `options` is not a plain object, `thickness`/`angle` isn't finite, or `tiles`/`size` isn't a positive integer.
 * @example texture.lines({ tiles: 12, thickness: 0.3, angle: 45, color1: '#0f172a', color2: '#e2e8f0' });
 */
export function lines(options = {}) {
  assertPlainOptions('texture.lines', options);
  const { tiles = 8, thickness = 0.2, angle = 0, size = DEFAULT_SIZE, color1 = '#000000', color2 = '#ffffff' } = options;
  assertPositiveInteger('texture.lines', 'tiles', tiles);
  assertFiniteNumber('texture.lines', 'thickness', thickness);
  assertFiniteNumber('texture.lines', 'angle', angle);
  assertPositiveInteger('texture.lines', 'size', size);

  const mix = interpolateRgb(color1, color2);
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const aa = 0.02;

  return buildDataTexture(size, size, (u, v) => {
    const projected = (u * dx + v * dy) * tiles;
    const cell = projected - Math.floor(projected);
    const distanceToCenter = Math.min(cell, 1 - cell);
    return colorToRGBA(mix(smoothstep(thickness / 2 - aa, thickness / 2 + aa, distanceToCenter)));
  });
}

/**
 * Builds a 256×1 `THREE.DataTexture` lookup ramp from a `compose/palette`
 * function's precomputed `.colors` (see `compose/palette/ramp.js`'s
 * `attachColors` — the single place that 256-step array is ever built).
 * The lookup table `material.dataDriven` (Prompt 106) samples via a
 * per-instance scalar attribute.
 * @param {((t: number) => string) & { colors: string[] }} palette
 * @returns {THREE.DataTexture}
 * @throws {TypeError} If `palette` is not a palette function with a `.colors` array.
 * @example const tex = texture.paletteTexture(palette.viridis);
 */
export function paletteTexture(palette) {
  if (typeof palette !== 'function' || !Array.isArray(palette.colors) || palette.colors.length === 0) {
    throw new TypeError(
      `texture.paletteTexture: palette must be a compose/palette function with a precomputed .colors ` +
        `array (e.g. palette.viridis), received ${JSON.stringify(palette)}.`,
    );
  }
  const colors = palette.colors;
  const texture = buildDataTexture1D(colors.length, (i) => colorToRGBA(colors[i]));
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * A 1D (height-1) variant of `buildDataTexture`, indexed by integer step
 * rather than normalized `[0,1]` — `paletteTexture`'s exact lookup-table shape.
 * @param {number} steps
 * @param {(i: number) => [number, number, number, number]} pixelFn
 * @returns {THREE.DataTexture}
 */
function buildDataTexture1D(steps, pixelFn) {
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    const [r, g, b, a] = pixelFn(i);
    data[i * 4] = Math.round(clamp01(r) * 255);
    data[i * 4 + 1] = Math.round(clamp01(g) * 255);
    data[i * 4 + 2] = Math.round(clamp01(b) * 255);
    data[i * 4 + 3] = Math.round(clamp01(a) * 255);
  }
  const texture = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
