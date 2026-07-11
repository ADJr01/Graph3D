import * as THREE from 'three';
import { loop } from '../../core/Graph3DLoop.js';
import { assertPlainOptions, assertFiniteNumber, assertPaletteFunction } from '../validate.js';
import { wrapDisposeWithCleanup } from './lifecycle.js';
import { paletteTexture as buildPaletteTexture } from '../texture/procedural.js';
import { INSTANCED_CLIP_POSITION } from './shaderChunks.js';

/**
 * Keeps a `uNow` uniform (`performance.now()`, ms) current every frame off
 * the shared render loop — the live clock both `freshness` and `dataStream`
 * compare a per-instance `age` attribute against. `age` is a
 * `performance.now()` timestamp the *caller* stamps when a datum
 * enters/updates (e.g. `selection.attr('age', () => performance.now())` in
 * a `chart.stream()` consumer) — this material only ever reads it, matching
 * `dataDriven`'s "attribute already written elsewhere" contract. Extracted
 * once the second preset needed the identical uniform-driving loop
 * subscription (CLAUDE.md §1.1 DRY two-strike rule).
 * @param {THREE.ShaderMaterial} material - Must declare a `uNow` uniform.
 * @returns {() => void} Unsubscribe from the shared render loop.
 */
function driveNowUniform(material) {
  const tick = () => {
    material.uniforms.uNow.value = performance.now();
  };
  loop.add(tick);
  return () => loop.remove(tick);
}

/**
 * Streaming-aware "freshness" pulse: reads a per-instance `age` attribute
 * (a `performance.now()` ms timestamp) and fades `color` from full
 * intensity down to `baseOpacity` over `decayMs` milliseconds, so
 * newly-arrived/updated instances flash and settle instead of popping in
 * indistinguishably from data that's been sitting there a while. Unlit,
 * consistent with this layer's other custom-shader presets (`dataDriven`).
 * @param {number} decayMs - How long the pulse takes to fully decay, in milliseconds. Must be > 0.
 * @param {{
 *   color?: (string|number|THREE.Color),
 *   baseOpacity?: number,
 * } & THREE.ShaderMaterialParameters} [options]
 * @returns {THREE.ShaderMaterial}
 * @throws {TypeError} If `decayMs` is not a finite number greater than 0.
 * @throws {TypeError} If `options` is not a plain object, or `baseOpacity` is not a finite number.
 * @example
 * const mat = material.freshness(800, { color: '#39ff14' });
 * points.defineAttribute('age', 1);
 * selection.attr('age', () => performance.now()); // stamp on every enter/update join
 */
export function freshness(decayMs, options = {}) {
  assertFiniteNumber('material.freshness', 'decayMs', decayMs);
  if (decayMs <= 0) {
    throw new TypeError(`material.freshness: decayMs must be greater than 0, received ${decayMs}.`);
  }
  assertPlainOptions('material.freshness', options);
  const { color = '#ffffff', baseOpacity = 0.15, ...rest } = options;
  assertFiniteNumber('material.freshness', 'baseOpacity', baseOpacity);

  const vertexShader = `
attribute float age;
varying float vAge;
void main() {
  vAge = age;
${INSTANCED_CLIP_POSITION}
}
`;

  const fragmentShader = `
uniform float uNow;
uniform float decayMs;
uniform vec3 color;
uniform float baseOpacity;
varying float vAge;

void main() {
  float elapsedMs = max(uNow - vAge, 0.0);
  float t = clamp(1.0 - elapsedMs / decayMs, 0.0, 1.0);
  gl_FragColor = vec4(color, baseOpacity + (1.0 - baseOpacity) * t);
}
`;

  const material = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uNow: { value: performance.now() },
      decayMs: { value: decayMs },
      color: { value: new THREE.Color(color) },
      baseOpacity: { value: baseOpacity },
    },
    vertexShader,
    fragmentShader,
    ...rest,
  });

  const stopClock = driveNowUniform(material);
  return wrapDisposeWithCleanup(material, stopClock);
}

/**
 * Streaming-data "trail" preset: colors each instance by how long ago its
 * `age` attribute (same `performance.now()` ms timestamp `freshness` reads)
 * was stamped, sampling `palette` from full color at age=0 down to the
 * palette's far end as it approaches `trailLength` ms old, and
 * discarding the fragment entirely once it's older than that — a
 * comet-trail effect for live-streamed points/lines that fades and prunes
 * itself without the caller managing per-frame opacity by hand.
 * @param {{
 *   trailLength: number,
 *   palette: ((t: number) => string) & { colors: string[] },
 * } & THREE.ShaderMaterialParameters} options - `trailLength` (ms, > 0) and `palette` are both required.
 * @returns {THREE.ShaderMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @throws {TypeError} If `trailLength` is not a finite number greater than 0.
 * @throws {TypeError} If `palette` is not a palette function with a precomputed `.colors` array.
 * @example
 * const mat = material.dataStream({ trailLength: 2000, palette: palette.plasma });
 * points.defineAttribute('age', 1);
 * selection.attr('age', () => performance.now());
 */
export function dataStream(options) {
  assertPlainOptions('material.dataStream', options);
  const { trailLength, palette, ...rest } = options;
  assertFiniteNumber('material.dataStream', 'trailLength', trailLength);
  if (trailLength <= 0) {
    throw new TypeError(`material.dataStream: trailLength must be greater than 0, received ${trailLength}.`);
  }
  assertPaletteFunction('material.dataStream', palette);

  const vertexShader = `
attribute float age;
varying float vAge;
void main() {
  vAge = age;
${INSTANCED_CLIP_POSITION}
}
`;

  const fragmentShader = `
uniform sampler2D paletteTexture;
uniform float uNow;
uniform float trailLength;
varying float vAge;

void main() {
  float elapsedMs = max(uNow - vAge, 0.0);
  if (elapsedMs > trailLength) discard;
  float t = 1.0 - elapsedMs / trailLength;
  vec3 color = texture2D(paletteTexture, vec2(t, 0.5)).rgb;
  gl_FragColor = vec4(color, t);
}
`;

  const paletteTexture = buildPaletteTexture(palette);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      paletteTexture: { value: paletteTexture },
      uNow: { value: performance.now() },
      trailLength: { value: trailLength },
    },
    vertexShader,
    fragmentShader,
    ...rest,
  });

  const stopClock = driveNowUniform(material);
  return wrapDisposeWithCleanup(material, () => {
    stopClock();
    paletteTexture.dispose();
  });
}
