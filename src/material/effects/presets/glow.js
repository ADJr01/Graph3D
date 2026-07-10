import * as THREE from 'three';
import { TIME_UNIFORM_NAME } from '../harness.js';

/**
 * `glow` — emissive halo pulse. Adds a soft, breathing emissive boost in
 * `color` while the effect is active, brightest at `vEffectPhase`'s peak.
 * @type {import('../registry.js').EffectPresetDefinition}
 */
export const glow = {
  name: 'glow',
  defaultOptions: { color: '#66ccff', intensity: 1.2, speed: 3 },
  schema: { color: 'color', intensity: 'number', speed: 'number' },
  needsLocalPosition: false,
  uniformDecls: (slot) => `
uniform vec3 uColor_${slot};
uniform float uIntensity_${slot};
uniform float uSpeed_${slot};
`,
  buildUniforms: (slot, options) => ({
    [`uColor_${slot}`]: { value: new THREE.Color(options.color) },
    [`uIntensity_${slot}`]: { value: options.intensity },
    [`uSpeed_${slot}`]: { value: options.speed },
  }),
  fragmentChunk: (slot) => `
  float pulse_${slot} = 0.6 + 0.4 * sin(${TIME_UNIFORM_NAME} * uSpeed_${slot});
  gl_FragColor.rgb += uColor_${slot} * uIntensity_${slot} * pulse_${slot} * vEffectPhase_${slot};
`,
};
