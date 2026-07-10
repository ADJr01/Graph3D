/**
 * Shared GLSL scaffolding every preset in `material/effects/presets/` is
 * injected into via `onBeforeCompile` (`EffectInjector.js`). One harness,
 * concatenated once per material regardless of how many effect slots
 * (`'hover'`, `'select'`) are baked into it — each slot gets its own
 * uniform/attribute names (suffixed `_<slot>`) so two slots active on the
 * same material's shader never collide (CLAUDE.md §1.1 DRY: one injector,
 * not one per slot).
 *
 * Anchored on `#include <begin_vertex>` (vertex) and `#include
 * <dithering_fragment>` (fragment) — both present in every built-in
 * material this library's `material.*` presets can produce (basic, lambert,
 * phong, standard, physical, toon), unlike material-specific chunks such as
 * `<normal_fragment_maps>` (physical-only) or `<uv_vertex>` (only present
 * when a map is bound). `dithering_fragment` runs after `gl_FragColor` is
 * fully assigned by the material's own lighting model, so every preset here
 * only ever *adds* to the final color (`gl_FragColor.rgb +=`/`*=`) instead
 * of fighting PBR lighting math.
 */

/**
 * @param {string} slot
 * @returns {string} The per-instance attribute name for `slot`'s animated
 *   0..1 blend factor — doubles as the "mask" the prompt calls for (an
 *   instance with `phase === 0` renders no effect at all; there is no
 *   separate mask attribute since phase alone already gates visibility).
 */
export function phaseAttributeName(slot) {
  return `effectPhase_${slot}`;
}

/**
 * @param {string} slot
 * @returns {string} The mesh-backend uniform name for `slot`'s phase (a
 *   single value — a mesh-backend material clone belongs to exactly one
 *   hovered/selected mesh, so no per-instance attribute is needed there).
 */
export function phaseUniformName(slot) {
  return `effectPhase_${slot}`;
}

/**
 * Hash/noise helpers shared by every preset that needs procedural texture
 * (`fire`, `crackers`, `ripple`) — extracted once the second preset needed
 * one (CLAUDE.md §1.1 DRY two-strike rule).
 */
export const NOISE_GLSL = `
float graph3dHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float graph3dNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = graph3dHash(i);
  float b = graph3dHash(i + vec2(1.0, 0.0));
  float c = graph3dHash(i + vec2(0.0, 1.0));
  float d = graph3dHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
`;

/** Shared, slot-independent uniform driving every preset's time-based animation (fire/pulse/ripple/crackers). Bound once per material by `EffectInjector`, mirroring `GraphObjectMaterial`'s own `bindAutoTime` convention. */
export const TIME_UNIFORM_NAME = 'graph3dEffectTime';

/** Declared exactly once per material's fragment shader (not per-slot — `uniform` redeclaration is a GLSL compile error), regardless of how many slots are active. */
export const GLOBAL_FRAGMENT_HEADER = `uniform float ${TIME_UNIFORM_NAME};\n`;

/**
 * Builds the full vertex/fragment injection for one active slot, ready to
 * concatenate with every other active slot's own injection. `presetDef`'s
 * `uniformDecls`/`fragmentChunk`/`vertexChunk` all receive `slot` so they can
 * suffix their own uniform names (`uColor_hover` vs `uColor_select`) — two
 * slots active on the same material never collide.
 * @param {string} slot
 * @param {{needsLocalPosition?: boolean, uniformDecls: (slot: string) => string, vertexChunk?: (slot: string) => string, fragmentChunk: (slot: string) => string}} presetDef
 * @returns {{vertexHeader: string, vertexMain: string, fragmentHeader: string, fragmentMain: string}}
 */
export function buildSlotInjection(slot, presetDef) {
  const phaseAttr = phaseAttributeName(slot);
  const phaseUniform = phaseUniformName(slot);
  const localVarying = `vEffectLocalPos_${slot}`;

  const vertexHeader = `
#ifdef USE_INSTANCING
attribute float ${phaseAttr};
#else
uniform float ${phaseUniform};
#endif
varying float vEffectPhase_${slot};
${presetDef.needsLocalPosition ? `varying vec3 ${localVarying};` : ''}
`;

  const vertexMain = `
#ifdef USE_INSTANCING
vEffectPhase_${slot} = ${phaseAttr};
#else
vEffectPhase_${slot} = ${phaseUniform};
#endif
${presetDef.needsLocalPosition ? `${localVarying} = position;` : ''}
${presetDef.vertexChunk ? presetDef.vertexChunk(slot) : ''}
`;

  const fragmentHeader = `
varying float vEffectPhase_${slot};
${presetDef.needsLocalPosition ? `varying vec3 ${localVarying};` : ''}
${presetDef.uniformDecls(slot)}
`;

  const fragmentMain = `
if (vEffectPhase_${slot} > 0.001) {
  ${presetDef.fragmentChunk(slot)}
}
`;

  return { vertexHeader, vertexMain, fragmentHeader, fragmentMain };
}
