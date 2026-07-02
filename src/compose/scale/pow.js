import { continuous } from './continuous.js';
import { linearish } from './linearish.js';

/**
 * Creates a power scale: like `scale.linear()`, but maps domain values
 * through `x ** exponent` (sign-preserving, so negative domain values stay
 * negative) before interpolating into the range. `ticks()`/`tickFormat()`/
 * `nice()` operate on the raw domain, exactly like `scale.linear()` — only
 * the value mapping itself is powered.
 * @param {number} [exponentInit=2]
 * @returns {import('./continuous.js').ContinuousScale & {
 *   ticks: (count?: number) => number[],
 *   tickFormat: (count?: number, specifier?: string) => (value: number) => string,
 *   exponent: (value?: number) => (number|object),
 * }}
 * @example
 * const s = scale.pow().exponent(2).domain([0, 10]).range([0, 1]);
 * s(5); // 0.25
 */
export function pow(exponentInit = 2) {
  let exponent = exponentInit;

  function transform(x) {
    return x < 0 ? -((-x) ** exponent) : x ** exponent;
  }
  function untransform(x) {
    const inv = 1 / exponent;
    return x < 0 ? -((-x) ** inv) : x ** inv;
  }

  const s = linearish(continuous(transform, untransform));

  /**
   * Get (no args) or set (chainable) the exponent — 2 by default.
   * @param {number} [value]
   * @returns {number|object}
   */
  s.exponent = function (value) {
    if (arguments.length === 0) return exponent;
    exponent = Number(value);
    return s;
  };

  s.copy = function () {
    return pow(exponent).domain(s.domain()).range(s.range()).clamp(s.clamp());
  };

  return s;
}

/**
 * Creates a square-root scale — `scale.pow()` fixed at `exponent(0.5)`.
 * @returns {ReturnType<typeof pow>}
 * @example
 * const s = scale.sqrt().domain([0, 100]).range([0, 1]);
 * s(25); // 0.5
 */
export function sqrt() {
  return pow(0.5);
}
