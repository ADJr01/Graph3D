/**
 * Shared GLSL for custom `THREE.ShaderMaterial` presets that need a
 * world-space normal/view-direction pair (`holographic`, `crystal`, ...) —
 * extracted once the second preset needed it (CLAUDE.md §1.1 DRY two-strike
 * rule).
 *
 * Deliberately does NOT use THREE's built-in `normalMatrix` uniform — that
 * one is model-*view*-space (`transpose(inverse(modelViewMatrix))`), while
 * `vViewDir` below (`cameraPosition - worldPosition`) is world-space; mixing
 * the two would make `dot(vNormal, vViewDir)`/`reflect`/`refract` compute
 * against mismatched coordinate frames. Instead `vNormal` is built from
 * `modelMatrix` (and `instanceMatrix`, when instanced) directly, assuming
 * uniform scale — the same approximation already accepted for `holographic`,
 * documented in `skipping_list.md`.
 */

export const WORLD_SPACE_VARYINGS = `
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec2 vUv;
`;

export const WORLD_SPACE_VERTEX_MAIN = `
void main() {
  vUv = uv;

  #ifdef USE_INSTANCING
    vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vec3 worldNormal = mat3(modelMatrix) * mat3(instanceMatrix) * normal;
  #else
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec3 worldNormal = mat3(modelMatrix) * normal;
  #endif

  vNormal = normalize(worldNormal);
  vViewDir = normalize(cameraPosition - worldPosition.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

/** The full vertex shader — varyings + main(), concatenated for direct use as `vertexShader`. */
export const WORLD_SPACE_VERTEX_SHADER = WORLD_SPACE_VARYINGS + WORLD_SPACE_VERTEX_MAIN;
