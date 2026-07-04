/**
 * GLSL for `ParticleSystem`'s two orthogonal axes: where a particle's
 * position comes from each frame (`gpuSim`: sampled from a ping-ponged
 * simulation texture via a static per-instance UV; `cpuSim`: a regular
 * per-instance attribute rewritten from JS each frame), and how its vertices
 * are placed (`billboard`: camera-facing quad via the view-space offset
 * trick `THREE.Sprite` itself uses internally; `mesh`: the supplied
 * geometry's own vertices, offset by the particle's world position, no
 * rotation). Four variants total, generated from shared fragments rather
 * than compiled with runtime `#ifdef`s — one readable string per variant
 * beats a maze of preprocessor branches for four fixed combinations.
 *
 * Both the GPU and CPU position sources carry age (`.w` of the position
 * data) and lifetime (`.w` of the velocity/lifetime data) through to the
 * fragment shader, which discards a fragment once `age >= lifetime` (or
 * `lifetime <= 0`, meaning "this slot has never been spawned into").
 */

const VARYINGS = /* glsl */ `
  varying vec3 vColor;
  varying float vAge;
  varying float vLifetime;
`;

const FRAGMENT_SHADER_BILLBOARD = /* glsl */ `
  ${VARYINGS}
  varying vec2 vUv;
  void main() {
    if (vLifetime <= 0.0 || vAge >= vLifetime) discard;
    if (distance(vUv, vec2(0.5)) > 0.5) discard;
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

const FRAGMENT_SHADER_MESH = /* glsl */ `
  ${VARYINGS}
  void main() {
    if (vLifetime <= 0.0 || vAge >= vLifetime) discard;
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

// `attribute`/`uniform` declarations must sit at global scope in GLSL — kept
// separate from the per-vertex `body` statements that read them, so the two
// vertex shader templates below can place each half correctly (previously
// both were spliced into `void main() { ... }` as one block, which is
// invalid GLSL; only ever caught by a real WebGL context, not jsdom's stub —
// see `skipping_list.md`).
const POSITION_LOOKUP_GPU = {
  declarations: /* glsl */ `
    attribute vec2 aParticleUV;
    uniform sampler2D tPosition;
    uniform sampler2D tVelocityLifetime;
  `,
  body: /* glsl */ `
    vec4 posAge = texture2D(tPosition, aParticleUV);
    vec4 velLife = texture2D(tVelocityLifetime, aParticleUV);
  `,
};

const POSITION_LOOKUP_CPU = {
  declarations: /* glsl */ `
    attribute vec3 aPosition;
    attribute float aAge;
    attribute float aLifetime;
  `,
  body: /* glsl */ `
    vec4 posAge = vec4(aPosition, aAge);
    vec4 velLife = vec4(0.0, 0.0, 0.0, aLifetime);
  `,
};

const VERTEX_SHADER_BILLBOARD = (positionLookup) => /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  ${positionLookup.declarations}
  ${VARYINGS}
  varying vec2 vUv;
  void main() {
    ${positionLookup.body}
    vColor = aColor;
    vAge = posAge.w;
    vLifetime = velLife.w;
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(posAge.xyz, 1.0);
    mvPosition.xy += position.xy * aSize;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const VERTEX_SHADER_MESH = (positionLookup) => /* glsl */ `
  attribute vec3 aColor;
  ${positionLookup.declarations}
  ${VARYINGS}
  void main() {
    ${positionLookup.body}
    vColor = aColor;
    vAge = posAge.w;
    vLifetime = velLife.w;
    vec4 mvPosition = modelViewMatrix * vec4(position + posAge.xyz, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

/**
 * @param {{ billboard: boolean, gpuSim: boolean }} options
 * @returns {{ vertexShader: string, fragmentShader: string }}
 */
export function buildParticleShaders({ billboard, gpuSim }) {
  const positionLookup = gpuSim ? POSITION_LOOKUP_GPU : POSITION_LOOKUP_CPU;
  return billboard
    ? { vertexShader: VERTEX_SHADER_BILLBOARD(positionLookup), fragmentShader: FRAGMENT_SHADER_BILLBOARD }
    : { vertexShader: VERTEX_SHADER_MESH(positionLookup), fragmentShader: FRAGMENT_SHADER_MESH };
}
