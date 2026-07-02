function assertRange(arr, method) {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new TypeError(`color.${method}: range must be a non-empty array, received ${JSON.stringify(arr)}.`);
  }
}

/**
 * Creates a quantize scale: splits a continuous `[d0, d1]` domain into
 * `range.length` equal-width buckets, each mapped to one range value.
 * Values outside the domain clamp to the nearest bucket. Mirrors D3's
 * `scaleQuantize`.
 * @returns {{
 *   (value: number): *,
 *   domain: (arr?: [number, number]) => ([number, number]|object),
 *   range: (arr?: Array) => (Array|object),
 *   copy: () => object,
 * }}
 * @example
 * const s = color.quantize().domain([0, 100]).range(['#000', '#888', '#fff']);
 * s(10); // '#000'
 * s(50); // '#888'
 * s(90); // '#fff'
 */
export function quantize() {
  let d0 = 0;
  let d1 = 1;
  let rangeArr = [];

  function scale(value) {
    const n = rangeArr.length;
    const t = Math.max(0, Math.min(1, (value - d0) / (d1 - d0)));
    return rangeArr[Math.min(n - 1, Math.floor(t * n))];
  }

  /**
   * Get (no args) or set (chainable) the continuous input domain.
   * @param {[number, number]} [arr]
   * @returns {[number, number]|object}
   */
  scale.domain = function (arr) {
    if (arguments.length === 0) return [d0, d1];
    [d0, d1] = arr.map(Number);
    return scale;
  };

  /**
   * Get (no args) or set (chainable) the discrete output values — one bucket per entry.
   * @param {Array} [arr]
   * @returns {Array|object}
   */
  scale.range = function (arr) {
    if (arguments.length === 0) return rangeArr.slice();
    assertRange(arr, 'quantize');
    rangeArr = arr.slice();
    return scale;
  };

  /** An independent clone with the same domain/range state. */
  scale.copy = function () {
    return quantize().domain([d0, d1]).range(rangeArr);
  };

  return scale;
}

/** Linear-interpolation quantile of a pre-sorted numeric array, matching D3's default method. */
function quantileSorted(sorted, p) {
  const n = sorted.length;
  if (n === 0) return undefined;
  if (p <= 0 || n === 1) return sorted[0];
  if (p >= 1) return sorted[n - 1];
  const index = (n - 1) * p;
  const lo = Math.floor(index);
  return sorted[lo] + (sorted[lo + 1] - sorted[lo]) * (index - lo);
}

/**
 * Creates a quantile scale: like `color.quantize()`, but the bucket
 * boundaries are computed from the distribution of `domain`'s actual data
 * (via linear-interpolation quantiles) rather than equal domain widths, so
 * each of `range.length` buckets gets roughly the same number of data
 * points. Mirrors D3's `scaleQuantile`.
 * @returns {{
 *   (value: number): *,
 *   domain: (arr?: number[]) => (number[]|object),
 *   range: (arr?: Array) => (Array|object),
 *   quantiles: () => number[],
 *   copy: () => object,
 * }}
 * @example
 * const s = color.quantile().domain([1, 2, 3, 9, 10, 11]).range(['#000', '#fff']);
 * s(2); // '#000' — below the median
 * s(10); // '#fff' — above the median
 */
export function quantile() {
  let domainArr = [];
  let rangeArr = [];
  let sorted = [];
  let thresholds = [];

  function scale(value) {
    let i = 0;
    while (i < thresholds.length && value >= thresholds[i]) i++;
    return rangeArr[i];
  }

  function rescale() {
    sorted = domainArr.filter((d) => typeof d === 'number' && !Number.isNaN(d)).sort((a, b) => a - b);
    const n = rangeArr.length;
    thresholds = [];
    for (let i = 1; i < n; i++) thresholds.push(quantileSorted(sorted, i / n));
    return scale;
  }

  /**
   * Get (no args) or set (chainable) the sample data whose distribution determines the bucket boundaries.
   * @param {number[]} [arr]
   * @returns {number[]|object}
   */
  scale.domain = function (arr) {
    if (arguments.length === 0) return domainArr.slice();
    domainArr = arr.slice();
    return rescale();
  };

  /**
   * Get (no args) or set (chainable) the discrete output values — one bucket per entry.
   * @param {Array} [arr]
   * @returns {Array|object}
   */
  scale.range = function (arr) {
    if (arguments.length === 0) return rangeArr.slice();
    assertRange(arr, 'quantile');
    rangeArr = arr.slice();
    return rescale();
  };

  /** The computed bucket boundaries (`range.length - 1` of them), for building a legend. */
  scale.quantiles = function () {
    return thresholds.slice();
  };

  /** An independent clone with the same domain/range state. */
  scale.copy = function () {
    return quantile().domain(domainArr).range(rangeArr);
  };

  return rescale();
}

/**
 * Creates a threshold scale: maps a continuous domain to `range.length`
 * buckets separated by explicit `domain` boundaries (`range.length` must be
 * `domain.length + 1`). Mirrors D3's `scaleThreshold`.
 * @returns {{
 *   (value: number): *,
 *   domain: (arr?: number[]) => (number[]|object),
 *   range: (arr?: Array) => (Array|object),
 *   copy: () => object,
 * }}
 * @example
 * const s = color.threshold().domain([0, 10]).range(['#000', '#888', '#fff']);
 * s(-1); // '#000'
 * s(5); // '#888'
 * s(20); // '#fff'
 */
export function threshold() {
  let domainArr = [0.5];
  let rangeArr = [0, 1];

  function scale(value) {
    let i = 0;
    while (i < domainArr.length && value >= domainArr[i]) i++;
    return rangeArr[i];
  }

  /**
   * Get (no args) or set (chainable) the sorted bucket boundaries.
   * @param {number[]} [arr]
   * @returns {number[]|object}
   */
  scale.domain = function (arr) {
    if (arguments.length === 0) return domainArr.slice();
    domainArr = arr.slice();
    return scale;
  };

  /**
   * Get (no args) or set (chainable) the discrete output values — `domain.length + 1` of them.
   * @param {Array} [arr]
   * @returns {Array|object}
   */
  scale.range = function (arr) {
    if (arguments.length === 0) return rangeArr.slice();
    assertRange(arr, 'threshold');
    rangeArr = arr.slice();
    return scale;
  };

  /** An independent clone with the same domain/range state. */
  scale.copy = function () {
    return threshold().domain(domainArr).range(rangeArr);
  };

  return scale;
}
