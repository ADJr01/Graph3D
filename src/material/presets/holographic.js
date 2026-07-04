import * as THREE from 'three';
import { assertPlainOptions, assertFiniteNumber } from '../validate.js';
import { WORLD_SPACE_VERTEX_SHADER } from './shaderChunks.js';

const FRAGMENT_SHADER = `
uniform float time;
uniform float intensity;
uniform float scanlineFrequency;
uniform vec3 color1;
uniform vec3 color2;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec2 vUv;

const float TAU = 6.28318530718;

void main() {
  float fresnel = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0), 2.0);
  vec3 iridescent = mix(color1, color2, fresnel);

  float phase = vUv.y * scanlineFrequency - time * 1.5;
  float scan = 0.6 + 0.4 * sin(phase * TAU);
  // Chromatic shift: phase-offset the scan band per channel for a thin RGB fringe.
  float scanR = 0.6 + 0.4 * sin((phase + 0.05) * TAU);
  float scanB = 0.6 + 0.4 * sin((phase - 0.05) * TAU);

  vec3 color = iridescent * intensity;
  color.r *= scanR;
  color.g *= scan;
  color.b *= scanB;

  float alpha = clamp(fresnel * 0.7 + 0.3, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`;

/**
 * Animated iridescent hologram look: a fresnel-driven `color1`→`color2` rim
 * blend, horizontal scanlines drifting over `time`, and a per-channel
 * chromatic shift on those scanlines. Works on both a single `GraphMesh` and
 * an instanced `GraphInstancedObject` target (`#ifdef USE_INSTANCING`).
 *
 * A custom `THREE.ShaderMaterial` — `time` starts at `0` and does nothing on
 * its own; pair with `GraphObjectMaterial.bindUniforms({ time: 'auto' })` to
 * animate it off the shared render loop.
 * @param {{
 *   intensity?: number,
 *   scanlineFrequency?: number,
 *   color1?: (string|number|THREE.Color),
 *   color2?: (string|number|THREE.Color),
 * } & THREE.ShaderMaterialParameters} [options]
 * @returns {THREE.ShaderMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @throws {TypeError} If `intensity` or `scanlineFrequency` is not a finite number.
 * @example
 * const mat = material.holographic({ color1: '#00eaff', color2: '#ff00e5' });
 * new GraphObjectMaterial(bar).applyShader(mat).bindUniforms({ time: 'auto' });
 */
export function holographic(options = {}) {
  assertPlainOptions('material.holographic', options);
  const {
    intensity = 1.2,
    scanlineFrequency = 12,
    color1 = '#00eaff',
    color2 = '#ff00e5',
    ...rest
  } = options;
  assertFiniteNumber('material.holographic', 'intensity', intensity);
  assertFiniteNumber('material.holographic', 'scanlineFrequency', scanlineFrequency);

  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      intensity: { value: intensity },
      scanlineFrequency: { value: scanlineFrequency },
      color1: { value: new THREE.Color(color1) },
      color2: { value: new THREE.Color(color2) },
    },
    vertexShader: WORLD_SPACE_VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    ...rest,
  });
}
