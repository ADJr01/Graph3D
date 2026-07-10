import * as THREE from 'three';

/**
 * `neonEdge` — a glowing silhouette edge (a tighter, more saturated fresnel
 * than `lightenup`'s soft rim). Reuses THREE's built-in `vNormal`/
 * `vViewPosition` varyings, same approach and same "requires a lit
 * material, not `material.basic()`" caveat as `lightenup` — see that
 * preset's doc comment.
 * @type {import('../registry.js').EffectPresetDefinition}
 */
export const neonEdge = {
  name: 'neonEdge',
  defaultOptions: { color: '#00ffe0', intensity: 2, power: 4 },
  schema: { color: 'color', intensity: 'number', power: 'number' },
  needsLocalPosition: false,
  uniformDecls: (slot) => `
uniform vec3 uColor_${slot};
uniform float uIntensity_${slot};
uniform float uPower_${slot};
`,
  buildUniforms: (slot, options) => ({
    [`uColor_${slot}`]: { value: new THREE.Color(options.color) },
    [`uIntensity_${slot}`]: { value: options.intensity },
    [`uPower_${slot}`]: { value: options.power },
  }),
  fragmentChunk: (slot) => `
  float edge_${slot} = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), uPower_${slot});
  gl_FragColor.rgb += uColor_${slot} * edge_${slot} * uIntensity_${slot} * vEffectPhase_${slot};
`,
};
