import * as THREE from 'three';
import { TIME_UNIFORM_NAME } from '../harness.js';

/**
 * `ripple` — a radial highlight wave expanding across the datum's local
 * surface from its own center, using local-space position (not world/UV —
 * works identically regardless of the datum's world transform or whether
 * its geometry has UVs).
 * @type {import('../registry.js').EffectPresetDefinition}
 */
export const ripple = {
  name: 'ripple',
  defaultOptions: { color: '#66ffcc', intensity: 1.3, frequency: 8, speed: 4 },
  schema: { color: 'color', intensity: 'number', frequency: 'number', speed: 'number' },
  needsLocalPosition: true,
  uniformDecls: (slot) => `
uniform vec3 uColor_${slot};
uniform float uIntensity_${slot};
uniform float uFrequency_${slot};
uniform float uSpeed_${slot};
`,
  buildUniforms: (slot, options) => ({
    [`uColor_${slot}`]: { value: new THREE.Color(options.color) },
    [`uIntensity_${slot}`]: { value: options.intensity },
    [`uFrequency_${slot}`]: { value: options.frequency },
    [`uSpeed_${slot}`]: { value: options.speed },
  }),
  fragmentChunk: (slot) => `
  float dist_${slot} = length(vEffectLocalPos_${slot}.xy);
  float wave_${slot} = sin(dist_${slot} * uFrequency_${slot} - ${TIME_UNIFORM_NAME} * uSpeed_${slot});
  float ring_${slot} = 1.0 - smoothstep(0.0, 0.2, abs(wave_${slot}));
  gl_FragColor.rgb += uColor_${slot} * ring_${slot} * uIntensity_${slot} * vEffectPhase_${slot};
`,
};
