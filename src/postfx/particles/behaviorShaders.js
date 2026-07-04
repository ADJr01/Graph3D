/**
 * GLSL construction for the GPU simulation path's *velocity* pass (see
 * `ParticleSystem`'s two-pass update: velocity is integrated first from the
 * active behaviors' accelerations, then position is integrated from the
 * freshly-updated velocity). Each behavior contributes a `vec3` acceleration
 * term; the shader is rebuilt (not just re-uniformed) whenever the *set* of
 * active behaviors changes, since GLSL structure — not just values — differs
 * per combination. Per-behavior tunable values (`strength`, `radius`, etc.)
 * are still ordinary uniforms, so changing them alone doesn't need a rebuild
 * (`ParticleSystem.configureBehavior` still rebuilds anyway — see its own
 * doc comment for why that's an acceptable simplification).
 *
 * Mirrors `behaviors.js`'s CPU math formula-for-formula (same hash/noise/curl
 * construction, same radial-force and swirl formulas) — but as actual GLSL
 * source, not shared code, since a fragment shader can't `import` JS. This
 * duplication is a genuine, unavoidable cross-language DRY exception (see
 * `skipping_list.md`).
 */

const CURL_NOISE_GLSL = /* glsl */ `
  float hash13(vec3 p) {
    vec3 h = fract(p * 0.3183099 + 0.1) * 17.0;
    return fract(h.x * h.y * h.z * (h.x + h.y + h.z));
  }
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);
    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);
    return mix(nxy0, nxy1, f.z);
  }
  vec3 potentialField(vec3 p) {
    return vec3(
      noise3(p + vec3(37.0, 17.0, 0.0)),
      noise3(p + vec3(0.0, 41.0, 23.0)),
      noise3(p + vec3(13.0, 0.0, 53.0))
    );
  }
  vec3 curlNoise(vec3 p) {
    const float e = 0.1;
    vec3 pX0 = potentialField(p - vec3(e, 0.0, 0.0));
    vec3 pX1 = potentialField(p + vec3(e, 0.0, 0.0));
    vec3 pY0 = potentialField(p - vec3(0.0, e, 0.0));
    vec3 pY1 = potentialField(p + vec3(0.0, e, 0.0));
    vec3 pZ0 = potentialField(p - vec3(0.0, 0.0, e));
    vec3 pZ1 = potentialField(p + vec3(0.0, 0.0, e));
    float inv2e = 1.0 / (2.0 * e);
    return vec3(
      (pY1.z - pY0.z) * inv2e - (pZ1.y - pZ0.y) * inv2e,
      (pZ1.x - pZ0.x) * inv2e - (pX1.z - pX0.z) * inv2e,
      (pX1.y - pX0.y) * inv2e - (pY1.x - pY0.x) * inv2e
    );
  }
`;

/**
 * @param {string} name
 * @param {Object} opts
 * @returns {{ uniforms: Object, declarations: string, accel: string, needsCurlNoise?: boolean }}
 * @throws {Error} If `name` isn't a known behavior.
 */
function buildBehaviorGLSL(name, opts) {
  const p = `b_${name}_`;
  switch (name) {
    case 'gravity':
    case 'wind':
      return {
        uniforms: {
          [`${p}strength`]: { value: opts.strength },
          [`${p}direction`]: { value: opts.direction },
        },
        declarations: `uniform float ${p}strength;\nuniform vec3 ${p}direction;`,
        accel: `accel += ${p}direction * ${p}strength;`,
      };
    case 'attract':
    case 'repel': {
      const sign = name === 'repel' ? -1.0 : 1.0;
      return {
        uniforms: {
          [`${p}strength`]: { value: opts.strength },
          [`${p}target`]: { value: opts.target },
          [`${p}radius`]: { value: opts.radius },
        },
        declarations: `uniform float ${p}strength;\nuniform vec3 ${p}target;\nuniform float ${p}radius;`,
        accel: /* glsl */ `
          {
            vec3 delta = ${p}target - posAge.xyz;
            float dist = length(delta);
            if (dist > 1e-4 && dist < ${p}radius) {
              accel += normalize(delta) * (${sign.toFixed(1)} * ${p}strength) * (1.0 - dist / ${p}radius);
            }
          }
        `,
      };
    }
    case 'curl':
      return {
        uniforms: {
          [`${p}strength`]: { value: opts.strength },
          [`${p}scale`]: { value: opts.scale },
        },
        declarations: `uniform float ${p}strength;\nuniform float ${p}scale;`,
        accel: `accel += curlNoise(posAge.xyz * ${p}scale) * ${p}strength;`,
        needsCurlNoise: true,
      };
    case 'swirl':
      return {
        uniforms: {
          [`${p}strength`]: { value: opts.strength },
          [`${p}center`]: { value: opts.center },
          [`${p}axis`]: { value: opts.axis },
        },
        declarations: `uniform float ${p}strength;\nuniform vec3 ${p}center;\nuniform vec3 ${p}axis;`,
        accel: `accel += cross(${p}axis, posAge.xyz - ${p}center) * ${p}strength;`,
      };
    default:
      throw new Error(`buildBehaviorGLSL: unknown behavior '${name}'.`);
  }
}

/**
 * Builds the complete velocity-pass fragment shader for the currently-active
 * behavior set. `delta`, `tPosition` (this frame's position+age), and
 * `tVelocity` (this frame's velocity+lifetime, read side) are always
 * present; a dead/never-spawned particle (`lifetime <= 0 || age >= lifetime`)
 * passes its velocity through unchanged.
 * @param {Map<string, Object>} behaviors
 * @returns {{ fragmentShader: string, uniforms: Object }}
 */
export function buildVelocityFragmentShader(behaviors) {
  let declarations = '';
  let accelLines = '';
  let needsCurlNoise = false;
  const uniforms = {};
  for (const [name, opts] of behaviors) {
    const built = buildBehaviorGLSL(name, opts);
    declarations += `${built.declarations}\n`;
    accelLines += `${built.accel}\n`;
    if (built.needsCurlNoise) needsCurlNoise = true;
    Object.assign(uniforms, built.uniforms);
  }

  const fragmentShader = /* glsl */ `
    uniform sampler2D tPosition;
    uniform sampler2D tVelocity;
    uniform float delta;
    ${declarations}
    ${needsCurlNoise ? CURL_NOISE_GLSL : ''}
    varying vec2 vUv;
    void main() {
      vec4 posAge = texture2D(tPosition, vUv);
      vec4 velLife = texture2D(tVelocity, vUv);
      float lifetime = velLife.w;
      float age = posAge.w;
      if (lifetime <= 0.0 || age >= lifetime) {
        gl_FragColor = velLife;
        return;
      }
      vec3 accel = vec3(0.0);
      ${accelLines}
      gl_FragColor = vec4(velLife.xyz + accel * delta, lifetime);
    }
  `;
  return { fragmentShader, uniforms };
}

/** Shared fullscreen-quad vertex shader for both simulation passes. */
export const SIMULATION_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The position pass: fixed regardless of active behaviors — it only ever
 * integrates position by the *already-updated* velocity (`tVelocity` here is
 * bound to the velocity pass's fresh output, not the previous frame's read
 * target — see `ParticleSystem.#updateGPU`).
 */
export const POSITION_SIM_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tPosition;
  uniform sampler2D tVelocity;
  uniform float delta;
  varying vec2 vUv;
  void main() {
    vec4 posAge = texture2D(tPosition, vUv);
    vec4 velLife = texture2D(tVelocity, vUv);
    float lifetime = velLife.w;
    float age = posAge.w;
    if (lifetime <= 0.0 || age >= lifetime) {
      gl_FragColor = vec4(posAge.xyz, max(age, lifetime));
      return;
    }
    gl_FragColor = vec4(posAge.xyz + velLife.xyz * delta, age + delta);
  }
`;
