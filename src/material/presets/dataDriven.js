import * as THREE from 'three';
import { assertPlainOptions, assertPaletteFunction } from '../validate.js';
import { wrapDisposeWithCleanup } from './lifecycle.js';
import { paletteTexture as buildPaletteTexture } from '../texture/procedural.js';
import { INSTANCED_CLIP_POSITION } from './shaderChunks.js';

const GLSL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Data-driven instanced material: samples a per-instance scalar attribute
 * (`valueAttribute`, expected pre-normalized to `[0, 1]` — e.g. via
 * `scale.linear().domain([min, max])`, not reimplemented here) and looks the
 * result up in a `palette.*` gradient texture, producing per-instance color
 * with a single draw call. Unlit (no scene-light integration), consistent
 * with this phase's other custom-shader presets (`holographic`, `glow`).
 *
 * Also **completes the Prompt 77 `Selection.style` link**: `opacity` and
 * `emissiveIntensity`, when `perInstanceOpacity`/`perInstanceEmissiveIntensity`
 * is enabled, are read from the exact `'opacity'`/`'emissiveIntensity'`
 * per-instance attributes `Selection.attr`/`.style` already write on the
 * instanced backend (previously inert — no material read them). `color`
 * (THREE's native `instanceColor`) is read automatically whenever the target
 * object has one set, tinting the palette color — no option needed, since
 * THREE itself defines `USE_INSTANCING_COLOR` per-object, not per-material.
 * @param {{
 *   palette: ((t: number) => string) & { colors: string[] },
 *   valueAttribute?: string,
 *   perInstanceOpacity?: boolean,
 *   perInstanceEmissiveIntensity?: boolean,
 *   opacity?: number,
 *   emissiveIntensity?: number,
 * } & THREE.ShaderMaterialParameters} options - `palette` is required.
 * @returns {THREE.ShaderMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @throws {TypeError} If `palette` is not a palette function with a `.colors` array.
 * @throws {TypeError} If `valueAttribute` is not a valid GLSL identifier.
 * @throws {TypeError} If `perInstanceOpacity`/`perInstanceEmissiveIntensity` is not a boolean.
 * @throws {TypeError} If `opacity`/`emissiveIntensity` is not a finite number.
 * @example
 * const mat = material.dataDriven({ palette: palette.viridis, perInstanceOpacity: true });
 * selection.attr('value', (d) => magnitudeScale(d.value)).attr('opacity', (d) => d.confidence);
 */
export function dataDriven(options) {
  assertPlainOptions('material.dataDriven', options);
  const {
    palette,
    valueAttribute = 'value',
    perInstanceOpacity = false,
    perInstanceEmissiveIntensity = false,
    opacity = 1,
    emissiveIntensity = 1,
    ...rest
  } = options;

  assertPaletteFunction('material.dataDriven', palette);
  if (typeof valueAttribute !== 'string' || !GLSL_IDENTIFIER.test(valueAttribute)) {
    throw new TypeError(
      `material.dataDriven: valueAttribute must be a valid GLSL identifier, received ${JSON.stringify(valueAttribute)}.`,
    );
  }
  if (typeof perInstanceOpacity !== 'boolean') {
    throw new TypeError(`material.dataDriven: perInstanceOpacity must be a boolean, received ${JSON.stringify(perInstanceOpacity)}.`);
  }
  if (typeof perInstanceEmissiveIntensity !== 'boolean') {
    throw new TypeError(`material.dataDriven: perInstanceEmissiveIntensity must be a boolean, received ${JSON.stringify(perInstanceEmissiveIntensity)}.`);
  }
  if (typeof opacity !== 'number' || !Number.isFinite(opacity)) {
    throw new TypeError(`material.dataDriven: opacity must be a finite number, received ${JSON.stringify(opacity)}.`);
  }
  if (typeof emissiveIntensity !== 'number' || !Number.isFinite(emissiveIntensity)) {
    throw new TypeError(`material.dataDriven: emissiveIntensity must be a finite number, received ${JSON.stringify(emissiveIntensity)}.`);
  }

  const vertexShader = `
attribute float ${valueAttribute};
#ifdef USE_INSTANCE_OPACITY
attribute float opacity;
varying float vInstanceOpacity;
#endif
#ifdef USE_INSTANCE_EMISSIVE_INTENSITY
attribute float emissiveIntensity;
varying float vInstanceEmissiveIntensity;
#endif
#ifdef USE_INSTANCING_COLOR
varying vec3 vInstanceColor;
#endif

varying float vValue;

void main() {
  vValue = ${valueAttribute};
  #ifdef USE_INSTANCE_OPACITY
    vInstanceOpacity = opacity;
  #endif
  #ifdef USE_INSTANCE_EMISSIVE_INTENSITY
    vInstanceEmissiveIntensity = emissiveIntensity;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vInstanceColor = instanceColor;
  #endif
${INSTANCED_CLIP_POSITION}
}
`;

  const fragmentShader = `
uniform sampler2D paletteTexture;
uniform float opacity;
uniform float emissiveIntensity;

varying float vValue;
#ifdef USE_INSTANCE_OPACITY
varying float vInstanceOpacity;
#endif
#ifdef USE_INSTANCE_EMISSIVE_INTENSITY
varying float vInstanceEmissiveIntensity;
#endif
#ifdef USE_INSTANCING_COLOR
varying vec3 vInstanceColor;
#endif

void main() {
  vec3 color = texture2D(paletteTexture, vec2(clamp(vValue, 0.0, 1.0), 0.5)).rgb;
  #ifdef USE_INSTANCING_COLOR
    color *= vInstanceColor;
  #endif

  float finalOpacity = opacity;
  #ifdef USE_INSTANCE_OPACITY
    finalOpacity = vInstanceOpacity;
  #endif

  float finalEmissiveIntensity = emissiveIntensity;
  #ifdef USE_INSTANCE_EMISSIVE_INTENSITY
    finalEmissiveIntensity = vInstanceEmissiveIntensity;
  #endif

  gl_FragColor = vec4(color * finalEmissiveIntensity, finalOpacity);
}
`;

  const paletteTexture = buildPaletteTexture(palette);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    defines: {
      ...(perInstanceOpacity ? { USE_INSTANCE_OPACITY: '' } : {}),
      ...(perInstanceEmissiveIntensity ? { USE_INSTANCE_EMISSIVE_INTENSITY: '' } : {}),
    },
    uniforms: {
      paletteTexture: { value: paletteTexture },
      opacity: { value: opacity },
      emissiveIntensity: { value: emissiveIntensity },
    },
    vertexShader,
    fragmentShader,
    ...rest,
  });

  // paletteTexture is allocated by this factory, not passed in by the
  // caller (unlike crystal's envMap) — this material is the sole owner, so
  // its dispose() must free it too (disposeMaterial()/GraphMesh.dispose()
  // only walk the material's own top-level properties, never .uniforms).
  return wrapDisposeWithCleanup(material, () => paletteTexture.dispose());
}
