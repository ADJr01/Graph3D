import { continuous } from './continuous.js';
import { ticks as linearTicks } from './ticks.js';
import { siPrefixFor, precisionFixed, formatFixed, parseSpecifier } from './tickFormat.js';

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
 * `[1, 1000]` gives `[1, 10, 100, 1000]`. Mirrors d3-array's own
 * "too few ticks? fall back to ordinary linear ticks" refinement: a domain
 * confined to a thin slice of one decade (e.g. `[2, 3]`) can produce too few
 * digit-multiple ticks to be useful as axis gridlines.
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
    if (result.length * 2 < count) return linearTicks(magLo, magHi, count);
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
 * SI-prefix formatting for one log-scale tick value (e.g. `1000` → `'1k'`).
 * Unlike `tickFormat.js`'s domain-wide `'s'` formatter (one shared prefix for
 * every tick, appropriate when all ticks share an order of magnitude), each
 * log-scale tick picks its own prefix — consecutive power-of-base ticks
 * routinely span whole decades, so a single shared prefix would leave most
 * of them showing tiny or huge scaled numbers.
 */
function formatLogSI(value, precision) {
  const prefix = siPrefixFor(value);
  const scaled = value / 10 ** prefix.exp;
  const p = precision == null ? precisionFixed(scaled) : precision;
  return `${formatFixed(scaled, p)}${prefix.symbol}`;
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

  s.tickFormat = function (_count = 10, specifier) {
    const { type, precision } = parseSpecifier(specifier);
    const format =
      type === 's'
        ? (value) => formatLogSI(value, precision)
        : (value) => (precision == null ? formatLogNumber(value) : formatFixed(value, precision));
    return (value) => (isPowerOfBase(value, currentBase) ? format(value) : '');
  };

  s.copy = function () {
    return log(currentBase).domain(s.domain()).range(s.range()).clamp(s.clamp());
  };

  return s;
}
