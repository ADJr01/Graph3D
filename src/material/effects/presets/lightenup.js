/**
 * `lightenup` — brightness/exposure lift with a soft bloom-friendly rim.
 * Reuses THREE's own `vNormal`/`vViewPosition` varyings (already declared
 * by every built-in material's fragment shader by the time
 * `dithering_fragment` runs) for the fresnel rim instead of adding new
 * varyings — no `needsLocalPosition` needed here.
 * @type {import('../registry.js').EffectPresetDefinition}
 */
export const lightenup = {
  name: 'lightenup',
  defaultOptions: { lift: 0.35, rimStrength: 0.6, rimPower: 2.5 },
  schema: { lift: 'number', rimStrength: 'number', rimPower: 'number' },
  needsLocalPosition: false,
  uniformDecls: (slot) => `
uniform float uLift_${slot};
uniform float uRimStrength_${slot};
uniform float uRimPower_${slot};
`,
  buildUniforms: (slot, options) => ({
    [`uLift_${slot}`]: { value: options.lift },
    [`uRimStrength_${slot}`]: { value: options.rimStrength },
    [`uRimPower_${slot}`]: { value: options.rimPower },
  }),
  fragmentChunk: (slot) => `
  float rim_${slot} = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), uRimPower_${slot});
  gl_FragColor.rgb = gl_FragColor.rgb * (1.0 + uLift_${slot} * vEffectPhase_${slot}) + rim_${slot} * uRimStrength_${slot} * vEffectPhase_${slot};
`,
};
