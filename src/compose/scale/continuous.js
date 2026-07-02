import { tickIncrement } from './ticks.js';
import { interpolate } from '../interpolate/index.js';

/**
 * @typedef {object} ContinuousScale
 * @property {(value: number) => *} - Calling the scale itself maps a domain value into the range.
 * @property {(arr?: number[]) => (number[]|ContinuousScale)} domain Get (no args) or set (chainable) the domain stops.
 * @property {(arr?: Array) => (Array|ContinuousScale)} range Get (no args) or set (chainable) the range stops —
 *   numbers, or anything `interpolate()` understands (e.g. hex colors, `THREE.Color`).
 * @property {(enabled?: boolean) => (boolean|ContinuousScale)} clamp Get (no args) or set (chainable) output clamping.
 * @property {(count?: number) => ContinuousScale} nice Round the domain's outer stops outward to "nice" numbers.
 * @property {(value: number) => number} invert Map a range value back to its domain value. Requires a numeric range.
 * @property {() => ContinuousScale} copy An independent clone with the same domain/range/clamp state.
 */

/** Binary-search the domain segment `value` falls into; used for piecewise (>2-stop) domains. */
function bisect(stops, value) {
  let lo = 1;
  let hi = stops.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (stops[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function clampValue(value, domainArr) {
  const ascending = domainArr[0] <= domainArr[domainArr.length - 1];
  const lo = ascending ? domainArr[0] : domainArr[domainArr.length - 1];
  const hi = ascending ? domainArr[domainArr.length - 1] : domainArr[0];
  return value < lo ? lo : value > hi ? hi : value;
}

function assertStops(arr, method) {
  if (!Array.isArray(arr) || arr.length < 2) {
    throw new TypeError(
      `scale.${method}: expected an array of at least 2 stops, received ${JSON.stringify(arr)}.`,
    );
  }
}

const identity = (x) => x;

/**
 * Creates a piecewise-linear continuous scale — the shared engine behind
 * `scale.linear()`, `scale.pow()`/`scale.sqrt()`, and `scale.log()`.
 * Domain and range are parallel arrays of ≥2 stops; a value between two
 * adjacent domain stops interpolates linearly into the matching range stops.
 *
 * `transform`/`untransform` let a scale type remap domain values before
 * interpolating (e.g. `scale.pow()` transforms through `x ** exponent`,
 * `scale.log()` through a logarithm) without duplicating the domain/range/
 * clamp/nice/invert machinery — `scale.linear()` uses the identity transform.
 * They're read on every call (not baked in at construction), so callers may
 * close over a mutable value (e.g. `pow()`'s `exponent`) that changes later.
 * @param {(x: number) => number} [transform] Applied to domain values before interpolating.
 * @param {(x: number) => number} [untransform] `transform`'s inverse, applied after `invert()`.
 * @param {(a: *, b: *) => (t: number) => *} [interpolator] Per-segment interpolator factory,
 *   applied to each adjacent range pair. Defaults to the generic `interpolate()` dispatcher;
 *   overridden by `palette.interpolateRGB/HSL/LAB` (Prompt 63) to pick a color space without
 *   duplicating this piecewise/bisect engine (CLAUDE.md §1.1 DRY).
 * @returns {ContinuousScale}
 * @example
 * const s = continuous().domain([0, 100]).range([0, 1]);
 * s(50); // 0.5
 */
export function continuous(transform = identity, untransform = identity, interpolator = interpolate) {
  let domainArr = [0, 1];
  let rangeArr = [0, 1];
  let clampEnabled = false;

  function scale(value) {
    const v = clampEnabled ? clampValue(value, domainArr) : value;
    const i = bisect(domainArr, v);
    const td0 = transform(domainArr[i - 1]);
    const td1 = transform(domainArr[i]);
    const t = td0 === td1 ? 0 : (transform(v) - td0) / (td1 - td0);
    // Routed through the interpolate module (not a local lerp) so non-numeric
    // ranges — colors, e.g. `.range(['#ff0000', '#0000ff'])` — work for free.
    return interpolator(rangeArr[i - 1], rangeArr[i])(t);
  }

  scale.domain = function (arr) {
    if (arguments.length === 0) return domainArr.slice();
    assertStops(arr, 'domain');
    domainArr = arr.map(Number);
    return scale;
  };

  scale.range = function (arr) {
    if (arguments.length === 0) return rangeArr.slice();
    assertStops(arr, 'range');
    // Unlike domain, range stops aren't coerced to Number — they may be
    // colors or any other shape the interpolate module understands.
    rangeArr = arr.slice();
    return scale;
  };

  scale.clamp = function (enabled) {
    if (arguments.length === 0) return clampEnabled;
    clampEnabled = Boolean(enabled);
    return scale;
  };

  scale.invert = function (value) {
    if (!rangeArr.every((r) => typeof r === 'number')) {
      throw new TypeError(
        `scale.invert: range must be numeric to invert, received ${JSON.stringify(rangeArr)}.`,
      );
    }
    const i = bisect(rangeArr, clampEnabled ? clampValue(value, rangeArr) : value);
    const r0 = rangeArr[i - 1];
    const r1 = rangeArr[i];
    const t = r0 === r1 ? 0 : (value - r0) / (r1 - r0);
    const td0 = transform(domainArr[i - 1]);
    const td1 = transform(domainArr[i]);
    return untransform(td0 + (td1 - td0) * t);
  };

  // Nices only the outer two domain stops, matching D3: inner stops of a
  // piecewise domain are left as the caller set them.
  scale.nice = function (count = 10) {
    const d = domainArr.slice();
    const i0 = 0;
    const i1 = d.length - 1;
    let start = d[i0];
    let stop = d[i1];
    let swapped = false;
    if (stop < start) {
      [start, stop] = [stop, start];
      swapped = true;
    }

    let prestep;
    let maxIter = 10;
    while (maxIter-- > 0) {
      const step = tickIncrement(start, stop, count);
      if (step === prestep) break;
      if (step > 0) {
        start = Math.floor(start / step) * step;
        stop = Math.ceil(stop / step) * step;
      } else if (step < 0) {
        start = Math.ceil(start * step) / step;
        stop = Math.floor(stop * step) / step;
      } else {
        break;
      }
      prestep = step;
    }

    d[i0] = swapped ? stop : start;
    d[i1] = swapped ? start : stop;
    domainArr = d;
    return scale;
  };

  scale.copy = function () {
    return continuous(transform, untransform, interpolator).domain(domainArr).range(rangeArr).clamp(clampEnabled);
  };

  return scale;
}
