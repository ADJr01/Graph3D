import * as THREE from 'three';
import { assertPlainOptions, assertFiniteNumber } from '../validate.js';
import { WORLD_SPACE_VERTEX_SHADER } from './shaderChunks.js';

const FRAGMENT_SHADER = `
uniform vec3 color;
uniform float intensity;
uniform float power;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec2 vUv;

void main() {
  float fresnel = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0), power);
  gl_FragColor = vec4(color * intensity * fresnel, fresnel);
}
`;

/**
 * Soft additive rim-glow: brightest at the silhouette edge (a fresnel term),
 * fading to nothing facing the camera — a halo, not a flat emissive surface
 * (see `neon` for that). `intensity` deliberately allows values above `1.0`
 * for a bloom postfx pass (Phase 7) to catch. Additive-blended and
 * depth-write-disabled by default so it layers over the object it wraps
 * without occluding anything behind it.
 * @param {{ color?: (string|number|THREE.Color), intensity?: number, power?: number } & THREE.ShaderMaterialParameters} [options]
 * @returns {THREE.ShaderMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @throws {TypeError} If `intensity` or `power` is not a finite number.
 * @example material.glow({ color: '#66ccff', intensity: 2, power: 3 });
 */
export function glow(options = {}) {
  assertPlainOptions('material.glow', options);
  const { color = '#66ccff', intensity = 1.5, power = 2.5, ...rest } = options;
  assertFiniteNumber('material.glow', 'intensity', intensity);
  assertFiniteNumber('material.glow', 'power', power);

  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      color: { value: new THREE.Color(color) },
      intensity: { value: intensity },
      power: { value: power },
    },
    vertexShader: WORLD_SPACE_VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    ...rest,
  });
}
