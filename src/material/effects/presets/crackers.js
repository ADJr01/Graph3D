import * as THREE from 'three';
import { TIME_UNIFORM_NAME, NOISE_GLSL } from '../harness.js';

/**
 * `crackers` — spark bursts: bright, short-lived flickers scattered across
 * the surface, GPU-only (no particle system dependency). Implemented as a
 * thresholded, time-varying hash field over local-space position rather
 * than true ejected/displaced particles — a surface-space approximation of
 * "sparks," not a simulation. Documented as a deliberate scope choice (see
 * `skipping_list.md`): real ejected particles would need a second geometry
 * pass this prompt's "no particle system" constraint rules out anyway.
 * @type {import('../registry.js').EffectPresetDefinition}
 */
export const crackers = {
  name: 'crackers',
  defaultOptions: { color: '#fff2b0', intensity: 2, density: 18, speed: 8 },
  schema: { color: 'color', intensity: 'number', density: 'number', speed: 'number' },
  needsLocalPosition: true,
  uniformDecls: (slot) => `
uniform vec3 uColor_${slot};
uniform float uIntensity_${slot};
uniform float uDensity_${slot};
uniform float uSpeed_${slot};
${NOISE_GLSL}
`,
  buildUniforms: (slot, options) => ({
    [`uColor_${slot}`]: { value: new THREE.Color(options.color) },
    [`uIntensity_${slot}`]: { value: options.intensity },
    [`uDensity_${slot}`]: { value: options.density },
    [`uSpeed_${slot}`]: { value: options.speed },
  }),
  fragmentChunk: (slot) => `
  vec2 cell_${slot} = floor(vEffectLocalPos_${slot}.xy * uDensity_${slot});
  float burstSeed_${slot} = graph3dHash(cell_${slot} + floor(${TIME_UNIFORM_NAME} * uSpeed_${slot}));
  float spark_${slot} = step(0.96, burstSeed_${slot});
  gl_FragColor.rgb += uColor_${slot} * spark_${slot} * uIntensity_${slot} * vEffectPhase_${slot};
`,
};
