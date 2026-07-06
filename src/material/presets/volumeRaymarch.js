import * as THREE from 'three';
import { assertPlainOptions, assertFiniteNumber } from '../validate.js';
import { wrapDisposeWithCleanup } from './lifecycle.js';
import { paletteTexture as buildPaletteTexture } from '../texture/procedural.js';

const DEFAULT_STEPS = 64;
const MAX_STEPS = 256;
const DEFAULT_DENSITY_SCALE = 1;
const DEFAULT_OPACITY = 1;

// Local-space cube spans [-0.5, 0.5]^3 (GraphObjectFactory.createBars'
// default unit BoxGeometry) — its diagonal is the longest a ray can travel
// while still inside the box.
const CUBE_DIAGONAL = Math.sqrt(3);

/**
 * Ray-marched volume material (Prompt 139's "opt-in heavier shader"):
 * samples a 3D scalar-field texture (`data`, a `Float32Array` of exactly
 * `resolution ** 3` density values, expected pre-normalized to `[0, 1]` —
 * `VolumeChart` does this itself, not reimplemented here) along each view
 * ray through a unit cube (`[-0.5, 0.5]^3` local space — the exact shape
 * `GraphObjectFactory.createBars`'s default `BoxGeometry(1,1,1)` already
 * produces, CLAUDE.md §1.1 DRY: no new geometry factory needed), accumulating
 * front-to-back alpha-composited color from a `palette.*` gradient (the same
 * `paletteTexture` lookup `material.dataDriven` already established).
 *
 * Requires WebGL2 (`sampler3D`/GLSL3, via `THREE.GLSL3`) — Three.js's own
 * shader compiler surfaces a clear error on WebGL1 hardware; no separate
 * capability probe or fallback is built here (CLAUDE.md §1.3 YAGNI — this is
 * an explicitly "opt-in heavier" feature, not a default rendering path any
 * chart falls back to).
 * ponytail: only renders front faces from outside the cube — a camera
 * positioned inside the volume sees nothing; see skipping_list.md's
 * "material.volumeRaymarch only renders front faces" entry.
 * @param {{
 *   data: Float32Array,
 *   resolution: number,
 *   palette: ((t: number) => string) & { colors: string[] },
 *   steps?: number,
 *   densityScale?: number,
 *   opacity?: number,
 * } & THREE.ShaderMaterialParameters} options - `data`, `resolution`, and `palette` are required.
 * @returns {THREE.ShaderMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @throws {TypeError} If `data` isn't a `Float32Array` of exactly `resolution ** 3` values.
 * @throws {TypeError} If `resolution` isn't a positive integer.
 * @throws {TypeError} If `palette` is not a palette function with a `.colors` array.
 * @throws {TypeError} If `steps` isn't an integer between `1` and `256`.
 * @throws {TypeError} If `densityScale`/`opacity` is not a finite number.
 * @example
 * const mat = material.volumeRaymarch({ data: densityGrid, resolution: 32, palette: palette.viridis, steps: 96 });
 */
export function volumeRaymarch(options) {
  assertPlainOptions('material.volumeRaymarch', options);
  const { data, resolution, palette, steps = DEFAULT_STEPS, densityScale = DEFAULT_DENSITY_SCALE, opacity = DEFAULT_OPACITY, ...rest } = options;

  if (!Number.isInteger(resolution) || resolution < 1) {
    throw new TypeError(`material.volumeRaymarch: resolution must be a positive integer, received ${JSON.stringify(resolution)}.`);
  }
  if (!(data instanceof Float32Array) || data.length !== resolution ** 3) {
    throw new TypeError(
      `material.volumeRaymarch: data must be a Float32Array of resolution**3 (${resolution ** 3}) values, received length ${data instanceof Float32Array ? data.length : JSON.stringify(data)}.`,
    );
  }
  if (typeof palette !== 'function' || !Array.isArray(palette.colors) || palette.colors.length === 0) {
    throw new TypeError(
      `material.volumeRaymarch: palette must be a compose/palette function with a precomputed .colors array, received ${JSON.stringify(palette)}.`,
    );
  }
  if (!Number.isInteger(steps) || steps < 1 || steps > MAX_STEPS) {
    throw new TypeError(`material.volumeRaymarch: steps must be an integer between 1 and ${MAX_STEPS}, received ${JSON.stringify(steps)}.`);
  }
  assertFiniteNumber('material.volumeRaymarch', 'densityScale', densityScale);
  assertFiniteNumber('material.volumeRaymarch', 'opacity', opacity);

  const densityTexture = new THREE.Data3DTexture(data, resolution, resolution, resolution);
  densityTexture.format = THREE.RedFormat;
  densityTexture.type = THREE.FloatType;
  densityTexture.minFilter = THREE.LinearFilter;
  densityTexture.magFilter = THREE.LinearFilter;
  densityTexture.wrapS = THREE.ClampToEdgeWrapping;
  densityTexture.wrapT = THREE.ClampToEdgeWrapping;
  densityTexture.wrapR = THREE.ClampToEdgeWrapping;
  densityTexture.unpackAlignment = 1;
  densityTexture.needsUpdate = true;

  const paletteTexture = buildPaletteTexture(palette);

  const vertexShader = `
varying vec3 vLocalPosition;
void main() {
  vLocalPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

  const fragmentShader = `
precision highp sampler3D;

// Three.js auto-injects cameraPosition (and modelViewMatrix/projectionMatrix,
// used in the vertex stage above) into every shader stage, but not
// modelMatrix on its own — declared explicitly here since this is the only
// uniform of the two actually missing.
uniform mat4 modelMatrix;

uniform sampler3D densityTexture;
uniform sampler2D paletteTexture;
uniform int steps;
uniform float densityScale;
uniform float opacity;

varying vec3 vLocalPosition;
out vec4 fragColor;

const int MAX_STEPS = ${MAX_STEPS};
const float BOX_HALF = 0.5;
// The ray's starting point is the fragment's own (perspective-interpolated)
// surface position — exactly ON the cube boundary in theory, but GPU
// perspective-correct varying interpolation isn't bit-exact, so it can land
// a hair outside. Without this tolerance, the very first bounds check below
// fails before a single sample is ever taken, silently rendering nothing.
const float BOX_BOUNDARY_EPSILON = 0.001;
const float ALPHA_SATURATED = 0.995;
const float DENSITY_EPSILON = 0.001;

void main() {
  vec3 cameraLocal = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  vec3 rayDir = normalize(vLocalPosition - cameraLocal);
  float stepSize = ${CUBE_DIAGONAL} / float(steps);

  vec3 pos = vLocalPosition;
  vec3 accumulatedColor = vec3(0.0);
  float accumulatedAlpha = 0.0;
  float boxLimit = BOX_HALF + BOX_BOUNDARY_EPSILON;

  for (int i = 0; i < MAX_STEPS; i++) {
    if (i >= steps) break;
    if (abs(pos.x) > boxLimit || abs(pos.y) > boxLimit || abs(pos.z) > boxLimit) break;

    vec3 uv = pos + vec3(BOX_HALF);
    float density = clamp(texture(densityTexture, uv).r * densityScale, 0.0, 1.0);
    if (density > DENSITY_EPSILON) {
      vec3 sampleColor = texture(paletteTexture, vec2(density, 0.5)).rgb;
      float sampleAlpha = density * (1.0 - accumulatedAlpha);
      accumulatedColor += sampleColor * sampleAlpha;
      accumulatedAlpha += sampleAlpha;
      if (accumulatedAlpha > ALPHA_SATURATED) break;
    }
    pos += rayDir * stepSize;
  }

  if (accumulatedAlpha < DENSITY_EPSILON) discard;
  fragColor = vec4(accumulatedColor, accumulatedAlpha * opacity);
}
`;

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: {
      densityTexture: { value: densityTexture },
      paletteTexture: { value: paletteTexture },
      steps: { value: steps },
      densityScale: { value: densityScale },
      opacity: { value: opacity },
    },
    vertexShader,
    fragmentShader,
    ...rest,
  });

  // densityTexture/paletteTexture are allocated by this factory, not passed
  // in by the caller — this material is the sole owner, so its dispose()
  // must free both (disposeMaterial()/GraphMesh.dispose() only walk the
  // material's own top-level properties, never .uniforms — same reasoning
  // as material.dataDriven's identical paletteTexture cleanup).
  return wrapDisposeWithCleanup(material, () => {
    densityTexture.dispose();
    paletteTexture.dispose();
  });
}
