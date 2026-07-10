import * as THREE from 'three';
import { TIME_UNIFORM_NAME } from '../harness.js';

/**
 * `pulse` — rhythmic emissive beat, synced to a shared clock (not the
 * datum's own scale animation — `EffectInjector` bakes one shared material
 * per chart, so "scale-synced" per the prompt's own wording is interpreted
 * as "on the same rhythm as `StateMachine`'s default hover scale," both
 * driven by the same shared time uniform, rather than literally reading
 * back the instance's current scale value in the shader).
 * @type {import('../registry.js').EffectPresetDefinition}
 */
export const pulse = {
  name: 'pulse',
  defaultOptions: { color: '#ff5577', intensity: 1.5, speed: 4 },
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
  float beat_${slot} = 0.5 + 0.5 * sin(${TIME_UNIFORM_NAME} * uSpeed_${slot});
  gl_FragColor.rgb += uColor_${slot} * beat_${slot} * uIntensity_${slot} * vEffectPhase_${slot};
`,
};
