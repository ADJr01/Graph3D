import * as THREE from 'three';

// Read-only sentinels — never mutated, only cloned or read component-wise.
const DOWN = new THREE.Vector3(0, -1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3(0, 0, 0);

/**
 * Default options per behavior, also documenting each behavior's shape.
 * `attract`/`repel` share a "radial force" model (pull/push toward/away from
 * `target`, linearly fading to zero past `radius`) — `repel` is `attract`
 * with the sign flipped, not a separate formula (DRY).
 */
export const BEHAVIOR_DEFAULTS = {
  gravity: { strength: 9.8, direction: DOWN },
  wind: { strength: 1, direction: RIGHT },
  attract: { strength: 5, target: ORIGIN, radius: 10 },
  repel: { strength: 5, target: ORIGIN, radius: 10 },
  curl: { strength: 1, scale: 1 },
  swirl: { strength: 1, center: ORIGIN, axis: UP },
};

export const BEHAVIOR_NAMES = Object.keys(BEHAVIOR_DEFAULTS);

// ── CPU-path force math (mirrors the GLSL in behaviorShaders.js) ──────────

function frac(x) {
  return x - Math.floor(x);
}

function hash13(x, y, z) {
  const hx = frac(x * 0.3183099 + 0.1) * 17;
  const hy = frac(y * 0.3183099 + 0.1) * 17;
  const hz = frac(z * 0.3183099 + 0.1) * 17;
  return frac(hx * hy * hz * (hx + hy + hz));
}

function noise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  let fx = x - ix;
  let fy = y - iy;
  let fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const lerp = (a, b, t) => a + (b - a) * t;
  const n000 = hash13(ix, iy, iz);
  const n100 = hash13(ix + 1, iy, iz);
  const n010 = hash13(ix, iy + 1, iz);
  const n110 = hash13(ix + 1, iy + 1, iz);
  const n001 = hash13(ix, iy, iz + 1);
  const n101 = hash13(ix + 1, iy, iz + 1);
  const n011 = hash13(ix, iy + 1, iz + 1);
  const n111 = hash13(ix + 1, iy + 1, iz + 1);
  const nx00 = lerp(n000, n100, fx);
  const nx10 = lerp(n010, n110, fx);
  const nx01 = lerp(n001, n101, fx);
  const nx11 = lerp(n011, n111, fx);
  const nxy0 = lerp(nx00, nx10, fy);
  const nxy1 = lerp(nx01, nx11, fy);
  return lerp(nxy0, nxy1, fz);
}

/** @param {number} x @param {number} y @param {number} z @param {THREE.Vector3} out */
function potential(x, y, z, out) {
  out.set(noise3(x + 37, y + 17, z), noise3(x, y + 41, z + 23), noise3(x + 13, y, z + 53));
}

const CURL_EPSILON = 0.1;
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _p3 = new THREE.Vector3();
const _p4 = new THREE.Vector3();
const _p5 = new THREE.Vector3();

/**
 * Curl of a 3-component value-noise potential field, via central finite
 * differences — the standard "curl noise" construction (divergence-free by
 * definition, giving smooth swirly turbulence rather than fake trig
 * wiggling). A simplified/hash-based noise, not full gradient/simplex noise
 * — see `skipping_list.md`.
 * @param {number} x @param {number} y @param {number} z
 * @param {THREE.Vector3} out
 */
function curlNoise(x, y, z, out) {
  potential(x - CURL_EPSILON, y, z, _p0);
  potential(x + CURL_EPSILON, y, z, _p1);
  potential(x, y - CURL_EPSILON, z, _p2);
  potential(x, y + CURL_EPSILON, z, _p3);
  potential(x, y, z - CURL_EPSILON, _p4);
  potential(x, y, z + CURL_EPSILON, _p5);
  const inv2e = 1 / (2 * CURL_EPSILON);
  out.set(
    (_p3.z - _p2.z) * inv2e - (_p5.y - _p4.y) * inv2e,
    (_p5.x - _p4.x) * inv2e - (_p1.z - _p0.z) * inv2e,
    (_p1.y - _p0.y) * inv2e - (_p3.x - _p2.x) * inv2e,
  );
}

const _radialDelta = new THREE.Vector3();

/**
 * @param {THREE.Vector3} position
 * @param {THREE.Vector3} target
 * @param {number} radius
 * @param {number} strength - Sign flips `attract` into `repel`.
 * @param {THREE.Vector3} out
 */
function radialForce(position, target, radius, strength, out) {
  _radialDelta.copy(target).sub(position);
  const dist = _radialDelta.length();
  if (dist < 1e-4 || dist > radius) {
    out.set(0, 0, 0);
    return;
  }
  out.copy(_radialDelta).normalize().multiplyScalar(strength * (1 - dist / radius));
}

const _swirlDelta = new THREE.Vector3();
const _tmp = new THREE.Vector3();

/**
 * CPU-path per-behavior acceleration contributions, mirroring the GLSL
 * behavior blocks in `behaviorShaders.js`. Each writes into `out` (does not
 * accumulate) — callers add contributions themselves.
 * @type {Record<string, (position: THREE.Vector3, opts: Object, out: THREE.Vector3) => void>}
 */
export const CPU_BEHAVIOR_ACCEL = {
  gravity: (position, opts, out) => out.copy(opts.direction).multiplyScalar(opts.strength),
  wind: (position, opts, out) => out.copy(opts.direction).multiplyScalar(opts.strength),
  attract: (position, opts, out) => radialForce(position, opts.target, opts.radius, opts.strength, out),
  repel: (position, opts, out) => radialForce(position, opts.target, opts.radius, -opts.strength, out),
  curl: (position, opts, out) => {
    curlNoise(position.x * opts.scale, position.y * opts.scale, position.z * opts.scale, out);
    out.multiplyScalar(opts.strength);
  },
  swirl: (position, opts, out) => {
    _swirlDelta.copy(position).sub(opts.center);
    out.crossVectors(opts.axis, _swirlDelta).multiplyScalar(opts.strength);
  },
};

/**
 * Sums every currently-active behavior's acceleration contribution for one
 * particle (CPU path).
 * @param {Map<string, Object>} behaviors
 * @param {THREE.Vector3} position
 * @param {THREE.Vector3} out
 */
export function accumulateCPUAcceleration(behaviors, position, out) {
  out.set(0, 0, 0);
  for (const [name, opts] of behaviors) {
    CPU_BEHAVIOR_ACCEL[name](position, opts, _tmp);
    out.add(_tmp);
  }
}
