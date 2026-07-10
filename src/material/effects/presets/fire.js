import { TIME_UNIFORM_NAME, NOISE_GLSL } from '../harness.js';

/**
 * `fire` — animated noise-driven flame ramp rising along local Y, with a
 * touch of heat distortion (the noise term also nudges the ramp's
 * horizontal falloff, standing in for full refraction-style distortion
 * without a second render pass).
 * @type {import('../registry.js').EffectPresetDefinition}
 */
export const fire = {
  name: 'fire',
  defaultOptions: { intensity: 1.4, speed: 1.5, scale: 4 },
  schema: { intensity: 'number', speed: 'number', scale: 'number' },
  needsLocalPosition: true,
  uniformDecls: (slot) => `
uniform float uIntensity_${slot};
uniform float uSpeed_${slot};
uniform float uScale_${slot};
${NOISE_GLSL}
`,
  buildUniforms: (slot, options) => ({
    [`uIntensity_${slot}`]: { value: options.intensity },
    [`uSpeed_${slot}`]: { value: options.speed },
    [`uScale_${slot}`]: { value: options.scale },
  }),
  fragmentChunk: (slot) => `
  vec3 localPos_${slot} = vEffectLocalPos_${slot};
  float rise_${slot} = fract(localPos_${slot}.y * uScale_${slot} * 0.25 - ${TIME_UNIFORM_NAME} * uSpeed_${slot});
  float flicker_${slot} = graph3dNoise(localPos_${slot}.xz * uScale_${slot} + vec2(0.0, ${TIME_UNIFORM_NAME} * uSpeed_${slot} * 2.0));
  float ramp_${slot} = clamp((1.0 - rise_${slot}) * (0.5 + 0.5 * flicker_${slot}), 0.0, 1.0);
  vec3 flameColor_${slot} = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.85, 0.2), ramp_${slot});
  gl_FragColor.rgb += flameColor_${slot} * ramp_${slot} * uIntensity_${slot} * vEffectPhase_${slot};
`,
};
