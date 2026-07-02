import { ordinal } from './ordinal.js';

/**
 * Creates a band scale: divides a continuous `[start, stop]` range into one
 * evenly sized band per domain value, with optional padding between bands
 * (`paddingInner`) and around the outer edge (`paddingOuter`) — the standard
 * mapping for a categorical bar-chart axis. `scale(value)` returns a band's
 * start edge; `scale.bandwidth()` returns its width.
 * @returns {{
 *   (value: *): number,
 *   domain: (arr?: Array) => (Array|object),
 *   range: (arr?: [number, number]) => ([number, number]|object),
 *   bandwidth: () => number,
 *   padding: (value?: number) => (number|object),
 *   paddingInner: (value?: number) => (number|object),
 *   paddingOuter: (value?: number) => (number|object),
 *   align: (value?: number) => (number|object),
 *   copy: () => object,
 * }}
 * @example
 * const s = scale.band().domain(['a', 'b', 'c']).range([0, 300]);
 * s('b'); // 100
 * s.bandwidth(); // 100
 */
export function band() {
  const base = ordinal();
  let r0 = 0;
  let r1 = 1;
  let paddingInner = 0;
  let paddingOuter = 0;
  let align = 0.5;
  let bandwidth = 0;

  function scale(value) {
    return base(value);
  }

  function rescale() {
    const n = base.domain().length;
    const reverse = r1 < r0;
    const start = reverse ? r1 : r0;
    const stop = reverse ? r0 : r1;
    const step = (stop - start) / Math.max(1, n - paddingInner + paddingOuter * 2);
    const outerStart = start + (stop - start - step * (n - paddingInner)) * align;
    bandwidth = step * (1 - paddingInner);
    const positions = [];
    for (let i = 0; i < n; i++) positions.push(outerStart + step * i);
    base.range(reverse ? positions.reverse() : positions);
    return scale;
  }

  scale.domain = function (arr) {
    if (arguments.length === 0) return base.domain();
    base.domain(arr);
    return rescale();
  };

  scale.range = function (arr) {
    if (arguments.length === 0) return [r0, r1];
    [r0, r1] = arr.map(Number);
    return rescale();
  };

  /** The width of one band, accounting for `paddingInner`. */
  scale.bandwidth = function () {
    return bandwidth;
  };

  /**
   * Get (no args), or set (chainable) both `paddingInner` and `paddingOuter`
   * to the same value in one call — `paddingInner` is clamped to `[0, 1]`,
   * `paddingOuter` is not.
   * @param {number} [value]
   * @returns {number|object}
   */
  scale.padding = function (value) {
    if (arguments.length === 0) return paddingInner;
    paddingOuter = Number(value);
    paddingInner = Math.min(1, paddingOuter);
    return rescale();
  };

  /** Get (no args) or set (chainable) the gap between bands, as a fraction of the step, clamped to `[0, 1]`. */
  scale.paddingInner = function (value) {
    if (arguments.length === 0) return paddingInner;
    paddingInner = Math.min(1, Number(value));
    return rescale();
  };

  /** Get (no args) or set (chainable) the gap before the first and after the last band, as a fraction of the step. */
  scale.paddingOuter = function (value) {
    if (arguments.length === 0) return paddingOuter;
    paddingOuter = Number(value);
    return rescale();
  };

  /** Get (no args) or set (chainable) how leftover space is distributed, from `0` (start) to `1` (end); clamped. */
  scale.align = function (value) {
    if (arguments.length === 0) return align;
    align = Math.max(0, Math.min(1, Number(value)));
    return rescale();
  };

  scale.copy = function () {
    return band()
      .domain(base.domain())
      .range([r0, r1])
      .paddingInner(paddingInner)
      .paddingOuter(paddingOuter)
      .align(align);
  };

  return rescale();
}

/**
 * Creates a point scale: like `scale.band()` but with `paddingInner` fixed
 * at `1`, so each domain value maps to a single evenly spaced point with
 * `bandwidth() === 0` rather than a band. `paddingInner` isn't exposed since
 * it's fixed; `padding` aliases `paddingOuter`.
 * @returns {object}
 * @example
 * const s = scale.point().domain(['a', 'b', 'c']).range([0, 200]);
 * s('b'); // 100
 */
export function point() {
  const s = band().paddingInner(1);
  s.padding = s.paddingOuter;
  delete s.paddingInner;
  s.copy = function () {
    return point().domain(s.domain()).range(s.range()).paddingOuter(s.paddingOuter()).align(s.align());
  };
  return s;
}
