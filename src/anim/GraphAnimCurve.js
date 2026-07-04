const BEZIER_NEWTON_ITERATIONS = 8;
const BEZIER_EPSILON = 1e-6;

// Lattice cells spanned by noise()'s t in [0, 1] — enough oscillation for the
// curve to read as "noisy" over a normalized animation progress.
const NOISE_FREQUENCY = 4;

// Reasonable "snappy" defaults for spring() — not physically load-bearing,
// just a sane starting point matching common UI-spring presets.
const DEFAULT_SPRING_STIFFNESS = 170;
const DEFAULT_SPRING_DAMPING = 26;

const BOUNCE_N1 = 7.5625;
const BOUNCE_D1 = 2.75;

const BACK_C1 = 1.70158;
const BACK_C2 = BACK_C1 * 1.525;
const BACK_C3 = BACK_C1 + 1;

const ELASTIC_C4 = (2 * Math.PI) / 3;
const ELASTIC_C5 = (2 * Math.PI) / 4.5;

/**
 * Reflects an `easeIn` curve into its `easeOut` — and, since reflection is
 * its own inverse, also reflects an `easeOut` back into its `easeIn`. Exact
 * for every Penner-style easing family (verified against easings.net's own
 * canonical formulas), so it's the single derivation authority here rather
 * than hand-writing `easeOut*`/`easeIn*` pairs twice (CLAUDE.md §1.1 DRY).
 * @param {(t: number) => number} fn
 * @returns {(t: number) => number}
 */
function reflect(fn) {
  return (t) => 1 - fn(1 - t);
}

/**
 * Derives the standard `easeInOut*` piecewise combinator from an `easeIn`
 * curve — exact for every family in {@link curve} except Back/Elastic, whose
 * `InOut` variants use a distinct overshoot/period constant (written out by
 * hand below).
 * @param {(t: number) => number} easeIn
 * @returns {(t: number) => number}
 */
function combine(easeIn) {
  return (t) => (t < 0.5 ? easeIn(2 * t) / 2 : 1 - easeIn(-2 * t + 2) / 2);
}

/**
 * Builds the `{easeIn<Name>, easeOut<Name>, easeInOut<Name>}` triple for one
 * easing family from a single seed `easeIn` formula (CLAUDE.md §1.1 DRY —
 * one formula per family, not three).
 * @param {string} name
 * @param {(t: number) => number} easeIn
 * @returns {Object<string, (t: number) => number>}
 */
function family(name, easeIn) {
  return {
    [`easeIn${name}`]: easeIn,
    [`easeOut${name}`]: reflect(easeIn),
    [`easeInOut${name}`]: combine(easeIn),
  };
}

/** easings.net's canonical `easeOutBounce` — the simplest closed form in the Bounce family; In/InOut are derived from it via {@link reflect}/{@link combine}. */
function easeOutBounceRaw(x) {
  let v = x;
  if (v < 1 / BOUNCE_D1) return BOUNCE_N1 * v * v;
  if (v < 2 / BOUNCE_D1) {
    v -= 1.5 / BOUNCE_D1;
    return BOUNCE_N1 * v * v + 0.75;
  }
  if (v < 2.5 / BOUNCE_D1) {
    v -= 2.25 / BOUNCE_D1;
    return BOUNCE_N1 * v * v + 0.9375;
  }
  v -= 2.625 / BOUNCE_D1;
  return BOUNCE_N1 * v * v + 0.984375;
}

/**
 * The `curve` namespace: every named easing this library ships, keyed
 * exactly as on easings.net (`easeIn<Family>`/`easeOut<Family>`/
 * `easeInOut<Family>`, plus `linear`). All are pure `(t: number) => number`
 * over `t ∈ [0, 1]`; Back/Elastic/Bounce intentionally overshoot outside
 * `[0, 1]` mid-curve (their `t=0`/`t=1` endpoints are still exact).
 * Quad/Cubic/Quart/Quint/Sine/Expo/Circ/Bounce are generated from one seed
 * formula each via {@link reflect}/{@link combine}; Back/Elastic are written
 * out directly because their `InOut` variant uses a different overshoot/
 * period constant than `In`/`Out` (CLAUDE.md §1.2 KISS — no combinator can
 * express that without becoming less readable than the direct formula).
 * @example curve.easeOutBounce(0.9);
 * @example curve.linear(0.5); // 0.5
 */
export const curve = {
  linear: (t) => t,
  ...family('Quad', (t) => t * t),
  ...family('Cubic', (t) => t * t * t),
  ...family('Quart', (t) => t * t * t * t),
  ...family('Quint', (t) => t * t * t * t * t),
  ...family('Sine', (t) => 1 - Math.cos((t * Math.PI) / 2)),
  ...family('Expo', (t) => (t === 0 ? 0 : 2 ** (10 * t - 10))),
  ...family('Circ', (t) => 1 - Math.sqrt(1 - t * t)),
  ...family('Bounce', reflect(easeOutBounceRaw)),
  easeInBack: (t) => BACK_C3 * t ** 3 - BACK_C1 * t ** 2,
  easeOutBack: (t) => 1 + BACK_C3 * (t - 1) ** 3 + BACK_C1 * (t - 1) ** 2,
  easeInOutBack: (t) =>
    t < 0.5
      ? ((2 * t) ** 2 * ((BACK_C2 + 1) * 2 * t - BACK_C2)) / 2
      : ((2 * t - 2) ** 2 * ((BACK_C2 + 1) * (2 * t - 2) + BACK_C2) + 2) / 2,
  easeInElastic: (t) =>
    t === 0 || t === 1 ? t : -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * ELASTIC_C4),
  easeOutElastic: (t) =>
    t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ELASTIC_C4) + 1,
  easeInOutElastic: (t) =>
    t === 0 || t === 1
      ? t
      : t < 0.5
        ? -(2 ** (20 * t - 10) * Math.sin((20 * t - 11.125) * ELASTIC_C5)) / 2
        : (2 ** (-20 * t + 10) * Math.sin((20 * t - 11.125) * ELASTIC_C5)) / 2 + 1,
};

/**
 * A damped-harmonic-oscillator easing: `t` is fed directly to the analytic
 * unit-step response of a spring with the given stiffness/damping (mass
 * fixed at 1), so — unlike the Penner curves above — it does not generally
 * land exactly on `1` at `t=1`; it settles wherever the physics puts it,
 * which is the point of using a spring.
 * @param {number} [stiffness] Positive spring constant. Higher = snappier.
 * @param {number} [damping] Non-negative damping coefficient. Higher = less bounce.
 * @returns {(t: number) => number}
 * @throws {TypeError} If `stiffness` isn't a positive number, or `damping` isn't a non-negative number.
 * @example spring(170, 26)(0.3);
 */
export function spring(stiffness = DEFAULT_SPRING_STIFFNESS, damping = DEFAULT_SPRING_DAMPING) {
  if (typeof stiffness !== 'number' || !(stiffness > 0)) {
    throw new TypeError(`spring: stiffness must be a positive number, received ${JSON.stringify(stiffness)}.`);
  }
  if (typeof damping !== 'number' || !(damping >= 0)) {
    throw new TypeError(`spring: damping must be a non-negative number, received ${JSON.stringify(damping)}.`);
  }
  const omega0 = Math.sqrt(stiffness);
  const zeta = damping / (2 * omega0);
  return (t) => {
    if (t <= 0) return 0;
    if (zeta < 1) {
      const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
      return (
        1 -
        Math.exp(-zeta * omega0 * t) *
          (Math.cos(omegaD * t) + ((zeta * omega0) / omegaD) * Math.sin(omegaD * t))
      );
    }
    if (zeta === 1) {
      return 1 - Math.exp(-omega0 * t) * (1 + omega0 * t);
    }
    const omegaD = omega0 * Math.sqrt(zeta * zeta - 1);
    return (
      1 -
      Math.exp(-zeta * omega0 * t) *
        (Math.cosh(omegaD * t) + ((zeta * omega0) / omegaD) * Math.sinh(omegaD * t))
    );
  };
}

/**
 * A CSS-`cubic-bezier`-compatible easing: cubic Bézier through `(0,0)`,
 * `(x1,y1)`, `(x2,y2)`, `(1,1)`, solved for `y` at a given `x = t` via
 * Newton-Raphson (bisection fallback for flat-derivative regions) — the
 * standard algorithm behind CSS's own `cubic-bezier()` timing functions.
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {(t: number) => number}
 * @throws {TypeError} If any control coordinate isn't a number.
 * @example bezier(0.25, 0.1, 0.25, 1)(0.5); // ease
 */
export function bezier(x1, y1, x2, y2) {
  for (const [name, value] of [
    ['x1', x1],
    ['y1', y1],
    ['x2', x2],
    ['y2', y2],
  ]) {
    if (typeof value !== 'number') {
      throw new TypeError(`bezier: ${name} must be a number, received ${JSON.stringify(value)}.`);
    }
  }
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const sampleDerivativeX = (t) => (3 * ax * t + 2 * bx) * t + cx;

  function solveT(x) {
    let t = x;
    for (let i = 0; i < BEZIER_NEWTON_ITERATIONS; i++) {
      const dx = sampleX(t) - x;
      if (Math.abs(dx) < BEZIER_EPSILON) return t;
      const derivative = sampleDerivativeX(t);
      if (Math.abs(derivative) < BEZIER_EPSILON) break;
      t -= dx / derivative;
    }
    let lo = 0;
    let hi = 1;
    let guess = x;
    while (hi - lo > BEZIER_EPSILON) {
      guess = (lo + hi) / 2;
      if (sampleX(guess) < x) lo = guess;
      else hi = guess;
    }
    return guess;
  }

  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleY(solveT(t));
  };
}

/** Deterministic integer hash (seed, lattice index) → `[0, 1)`, used by {@link noise}. */
function hashLattice(seed, i) {
  let h = Math.imul(i ^ seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * A deterministic 1D value-noise curve: smoothly interpolates between
 * seeded pseudo-random lattice values across `t ∈ [0, 1]` (smoothstep
 * blending). Same `seed` always produces the same curve — useful for
 * reproducible "organic" motion (camera shake, jitter).
 * @param {number} [seed]
 * @returns {(t: number) => number} Roughly in `[-1, 1]`.
 * @throws {TypeError} If `seed` isn't a finite number.
 * @example noise(1)(0.42);
 */
export function noise(seed = 0) {
  if (typeof seed !== 'number' || !Number.isFinite(seed)) {
    throw new TypeError(`noise: seed must be a finite number, received ${JSON.stringify(seed)}.`);
  }
  const seedInt = seed | 0;
  return (t) => {
    const x = t * NOISE_FREQUENCY;
    const i0 = Math.floor(x);
    const f = x - i0;
    const v0 = hashLattice(seedInt, i0) * 2 - 1;
    const v1 = hashLattice(seedInt, i0 + 1) * 2 - 1;
    const s = f * f * (3 - 2 * f);
    return v0 * (1 - s) + v1 * s;
  };
}

/**
 * Resolves an easing reference to a callable curve — the single entry point
 * every animation consumer (`GraphAnimTimeline`, `Transition`, ...) uses to
 * turn a curve name or raw function into `(t) => number` (CLAUDE.md §1.1 DRY).
 * @param {string|((t: number) => number)} nameOrFn A key of {@link curve}, or any `(t) => number` function.
 * @returns {(t: number) => number}
 * @throws {TypeError} If `nameOrFn` is a string not found in {@link curve}, or is neither a string nor a function.
 * @example resolve('easeInOutCubic')(0.5);
 * @example resolve((t) => t * t)(0.5); // 0.25
 */
export function resolve(nameOrFn) {
  if (typeof nameOrFn === 'function') return nameOrFn;
  if (typeof nameOrFn === 'string') {
    const found = curve[nameOrFn];
    if (found) return found;
    throw new TypeError(
      `resolve: unknown easing curve name '${nameOrFn}'. Available: ${Object.keys(curve).join(', ')}.`,
    );
  }
  throw new TypeError(
    `resolve: expected an easing name (string) or a (t) => number function, received ${JSON.stringify(nameOrFn)}.`,
  );
}
