import { continuous } from './continuous.js';

function assertLogDomain(arr) {
  const allPositive = arr.every((v) => Number(v) > 0);
  const allNegative = arr.every((v) => Number(v) < 0);
  if (!allPositive && !allNegative) {
    throw new TypeError(
      'scale.log: domain must be entirely positive or entirely negative ' +
        `(log is undefined at 0), received ${JSON.stringify(arr)}.`,
    );
  }
}

/**
 * "Nice" log-spaced tick magnitudes spanning `[magLo, magHi]` (both > 0):
 * one tick per power of `base` when the domain spans many decades, else
 * subdivided by every digit `1..base-1` within the one-or-few decades it
 * spans — e.g. base 10 over `[2, 8]` gives `[2,3,4,5,6,7,8]`, over
 * `[1, 1000]` gives `[1, 10, 100, 1000]`.
 * ponytail: skips d3-array's extra "too few ticks? fall back to linear
 * ticks in log space" refinement — add it if sparse decade-spanning ticks
 * ever prove too coarse for an axis.
 */
function logTickMagnitudes(magLo, magHi, count, base) {
  const i = Math.floor(Math.log(magLo) / Math.log(base));
  const j = Math.ceil(Math.log(magHi) / Math.log(base));
  const result = [];
  if (Number.isInteger(base) && j - i < count) {
    for (let p = i; p <= j; p++) {
      const power = base ** p;
      for (let k = 1; k < base; k++) {
        const t = k * power;
        if (t >= magLo && t <= magHi) result.push(t);
      }
    }
  } else {
    for (let p = i; p <= j; p++) {
      const t = base ** p;
      if (t >= magLo && t <= magHi) result.push(t);
    }
  }
  return result.length > 0 ? result : [magLo, magHi];
}

function isPowerOfBase(value, base) {
  if (value === 0) return false;
  const p = Math.log(Math.abs(value)) / Math.log(base);
  return Math.abs(p - Math.round(p)) < 1e-9;
}

/** Cleans up float noise (e.g. `0.30000000000000004`) via a high-precision round-trip. */
function formatLogNumber(value) {
  return String(Number(value.toPrecision(12)));
}

/**
 * Creates a log scale: maps a domain through a logarithm before
 * interpolating into the range. The domain must be entirely positive or
 * entirely negative — it never crosses (or touches) zero, where log is
 * undefined — enforced with a thrown `TypeError` rather than silently
 * producing `NaN`/`-Infinity` (CLAUDE.md §1.5, Fail Fast).
 * @param {number} [base=10]
 * @returns {import('./continuous.js').ContinuousScale & {
 *   ticks: (count?: number) => number[],
 *   tickFormat: (count?: number, specifier?: string) => (value: number) => string,
 *   base: (value?: number) => (number|object),
 * }}
 * @throws {TypeError} If `.domain()` is set to an array crossing or touching zero.
 * @example
 * const s = scale.log().domain([1, 100]).range([0, 1]);
 * s(10); // 0.5
 * s.ticks(); // [1, 10, 100]
 */
export function log(base = 10) {
  let currentBase = base;
  let negative = false;

  function logs(x) {
    return negative ? -Math.log(-x) / Math.log(currentBase) : Math.log(x) / Math.log(currentBase);
  }
  function pows(x) {
    return negative ? -(currentBase ** -x) : currentBase ** x;
  }

  const s = continuous(logs, pows);
  const setDomain = s.domain;

  s.domain = function (arr) {
    if (arguments.length === 0) return setDomain();
    assertLogDomain(arr);
    negative = Number(arr[0]) < 0;
    return setDomain(arr);
  };

  s.domain([1, 10]); // continuous()'s [0, 1] default would violate the log constraint above.

  /**
   * Get (no args) or set (chainable) the log base — 10 by default.
   * @param {number} [value]
   * @returns {number|object}
   */
  s.base = function (value) {
    if (arguments.length === 0) return currentBase;
    currentBase = Number(value);
    return s;
  };

  s.ticks = function (count = 10) {
    const d = s.domain();
    const descending = d[0] > d[d.length - 1];
    const lo = descending ? d[d.length - 1] : d[0];
    const hi = descending ? d[0] : d[d.length - 1];
    const magLo = negative ? -hi : lo;
    const magHi = negative ? -lo : hi;

    let result = logTickMagnitudes(magLo, magHi, count, currentBase);
    if (negative) result = result.map((v) => -v).reverse();
    if (descending) result.reverse();
    return result;
  };

  // ponytail: 's'/precision specifiers format every tick plainly here (no
  // domain-derived step exists for a log scale the way linear has one); only
  // the default 'f' gets the "blank the non-power ticks" axis-label behavior.
  s.tickFormat = function (_count = 10, specifier) {
    if (specifier != null && specifier !== 'f') {
      return (value) => formatLogNumber(value);
    }
    return (value) => (isPowerOfBase(value, currentBase) ? formatLogNumber(value) : '');
  };

  s.copy = function () {
    return log(currentBase).domain(s.domain()).range(s.range()).clamp(s.clamp());
  };

  return s;
}
