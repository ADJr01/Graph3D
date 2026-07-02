import { sub, add, scale, lerp } from './vector.js';

// Vertices sampled per interior interval for the smooth curve types — enough
// to look continuous on screen without inflating the Line2 vertex stream.
const SEGMENTS_PER_INTERVAL = 16;

function hermite(p0, t0, p1, t1, u) {
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return [0, 1, 2].map((k) => h00 * p0[k] + h10 * t0[k] + h01 * p1[k] + h11 * t1[k]);
}

/**
 * Straight segments through every point, unsubdivided — the `'linear'` curve.
 * @param {Array<[number, number, number]>} points
 * @returns {Array<[number, number, number]>}
 */
export function sampleLinear(points) {
  return points.slice();
}

/**
 * Cardinal/Catmull-Rom spline through every point — the `'catmullRom'`
 * curve. `tension = 0` is the classic Catmull-Rom curve; `tension = 1`
 * flattens each segment toward a straight line (the endpoint tangents
 * collapse to the secant, which is exactly linear interpolation). Boundary
 * tangents extrapolate a phantom point by reflecting the first/last
 * interval — the standard open-curve boundary condition.
 * @param {Array<[number, number, number]>} points
 * @param {number} tension `0`-`1`.
 * @param {number} [segments] Samples per interior interval.
 * @returns {Array<[number, number, number]>}
 */
export function sampleCatmullRom(points, tension, segments = SEGMENTS_PER_INTERVAL) {
  const n = points.length;
  if (n < 3) return sampleLinear(points);
  const before = sub(scale(points[0], 2), points[1]);
  const after = sub(scale(points[n - 1], 2), points[n - 2]);
  const extended = [before, ...points, after];
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = extended[i];
    const p1 = extended[i + 1];
    const p2 = extended[i + 2];
    const p3 = extended[i + 3];
    const t1 = scale(sub(p2, p0), (1 - tension) / 2);
    const t2 = scale(sub(p3, p1), (1 - tension) / 2);
    const steps = i === n - 2 ? segments + 1 : segments;
    for (let s = 0; s < steps; s++) out.push(hermite(p1, t1, p2, t2, s / segments));
  }
  return out;
}

// Steffen's method (Astronomy & Astrophysics, 1990): a monotonicity-
// preserving per-axis tangent, cheaper than iterative Fritsch-Carlson but
// with the same no-overshoot guarantee.
function steffenTangents(values) {
  const n = values.length;
  const secants = [];
  for (let i = 0; i < n - 1; i++) secants.push(values[i + 1] - values[i]);
  const tangents = new Array(n);
  tangents[0] = secants[0];
  tangents[n - 1] = secants[n - 2];
  for (let i = 1; i < n - 1; i++) {
    const dPrev = secants[i - 1];
    const dNext = secants[i];
    if (dPrev === 0 || dNext === 0 || dPrev > 0 !== dNext > 0) {
      tangents[i] = 0;
    } else {
      const p = (dPrev + dNext) / 2;
      const sign = dPrev > 0 ? 1 : -1;
      tangents[i] = sign * Math.min(Math.abs(dPrev), Math.abs(dNext), 0.5 * Math.abs(p));
    }
  }
  return tangents;
}

/**
 * Monotone cubic interpolation (Steffen's method, applied independently to
 * each of x/y/z against the point index as the parameter) — the
 * `'monotone'` curve. Never overshoots between data points, unlike
 * `sampleCatmullRom`. Ignores `tension`: monotonicity constrains the
 * tangents, leaving no free parameter to tune.
 * @param {Array<[number, number, number]>} points
 * @param {number} [segments] Samples per interior interval.
 * @returns {Array<[number, number, number]>}
 */
export function sampleMonotone(points, segments = SEGMENTS_PER_INTERVAL) {
  const n = points.length;
  if (n < 3) return sampleLinear(points);
  const axes = [0, 1, 2].map((k) => steffenTangents(points.map((p) => p[k])));
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const t0 = [axes[0][i], axes[1][i], axes[2][i]];
    const t1 = [axes[0][i + 1], axes[1][i + 1], axes[2][i + 1]];
    const steps = i === n - 2 ? segments + 1 : segments;
    for (let s = 0; s < steps; s++) out.push(hermite(points[i], t0, points[i + 1], t1, s / segments));
  }
  return out;
}

function quadraticBezier(p0, c, p1, u) {
  const mu = 1 - u;
  return [0, 1, 2].map((k) => mu * mu * p0[k] + 2 * mu * u * c[k] + u * u * p1[k]);
}

/**
 * Rounds each interior point into a quadratic-Bezier corner spanning the
 * midpoints of its two neighboring segments — the `'bezier'` curve. The
 * corner's control point is the data point itself, pulled toward the
 * straight chord between those midpoints as `tension` rises from `0`
 * (full rounding) to `1` (flat corner cut). The first/last stretch (data
 * point to its nearest midpoint) stays straight, so the curve still
 * starts/ends exactly on the data — unlike `sampleCatmullRom`, this never
 * overshoots past a data point, at the cost of not passing through the
 * interior points exactly.
 * @param {Array<[number, number, number]>} points
 * @param {number} tension `0`-`1`.
 * @param {number} [segments] Samples per stub/corner piece.
 * @returns {Array<[number, number, number]>}
 */
export function sampleBezier(points, tension, segments = SEGMENTS_PER_INTERVAL) {
  const n = points.length;
  if (n < 3) return sampleLinear(points);

  const midpoints = [];
  for (let i = 0; i < n - 1; i++) midpoints.push(scale(add(points[i], points[i + 1]), 0.5));

  const out = [points[0]];
  for (let s = 1; s <= segments; s++) out.push(lerp(points[0], midpoints[0], s / segments));

  for (let i = 1; i < n - 1; i++) {
    const straightMid = scale(add(midpoints[i - 1], midpoints[i]), 0.5);
    const control = lerp(points[i], straightMid, tension);
    for (let s = 1; s <= segments; s++) {
      out.push(quadraticBezier(midpoints[i - 1], control, midpoints[i], s / segments));
    }
  }

  for (let s = 1; s <= segments; s++) out.push(lerp(midpoints[n - 2], points[n - 1], s / segments));
  return out;
}

const CURVE_SAMPLERS = {
  linear: (points) => sampleLinear(points),
  catmullRom: (points, tension, segments) => sampleCatmullRom(points, tension, segments),
  monotone: (points, tension, segments) => sampleMonotone(points, segments),
  bezier: (points, tension, segments) => sampleBezier(points, tension, segments),
};

/** The curve names `generator.line().curve()` accepts. */
export const CURVE_TYPES = Object.keys(CURVE_SAMPLERS);

/**
 * Dispatches to the named curve sampler — the single place `generator.line`
 * routes through, so `.curve()` validation and sampler selection live in
 * one spot (CLAUDE.md §1.1 DRY).
 * @param {string} type One of `CURVE_TYPES`.
 * @param {Array<[number, number, number]>} points
 * @param {number} tension
 * @param {number} [segments]
 * @returns {Array<[number, number, number]>}
 * @throws {TypeError} If `type` isn't a recognized curve name.
 */
export function sampleCurve(type, points, tension, segments = SEGMENTS_PER_INTERVAL) {
  const sampler = CURVE_SAMPLERS[type];
  if (!sampler) {
    throw new TypeError(
      `generator.line: unknown curve '${type}'. Expected one of ${CURVE_TYPES.map((t) => `'${t}'`).join(', ')}.`,
    );
  }
  return sampler(points, tension, segments);
}
