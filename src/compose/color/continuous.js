import { continuous } from '../scale/continuous.js';

/**
 * Resolves a `palette` argument into a `t => color` interpolator function.
 * A function is used as-is (e.g. a Phase 4B named palette). An array of ≥2
 * colors is turned into an evenly-spaced piecewise interpolator by reusing
 * `scale/continuous.js` — the same domain/range/interpolate engine that
 * powers `scale.linear()` — rather than duplicating stop-interpolation math
 * here (CLAUDE.md §1.1 DRY).
 * @param {Function|Array} palette
 * @param {string} method Calling method name, for the thrown error message.
 * @returns {(t: number) => *}
 * @throws {TypeError} If `palette` is neither a function nor an array of ≥2 colors.
 */
function toInterpolator(palette, method) {
  if (typeof palette === 'function') return palette;
  if (Array.isArray(palette)) {
    if (palette.length < 2) {
      throw new TypeError(
        `color.${method}: palette array must have at least 2 colors, received ${JSON.stringify(palette)}.`,
      );
    }
    const stops = palette.map((_, i) => i / (palette.length - 1));
    return continuous().domain(stops).range(palette).clamp(true);
  }
  throw new TypeError(
    `color.${method}: palette must be a function (t => color) or an array of ≥2 colors, ` +
      `received ${JSON.stringify(palette)}.`,
  );
}

/**
 * Creates a sequential color scale: maps a continuous numeric domain to a
 * `palette` (a `t => color` interpolator, or an array of ≥2 colors), clamped
 * so out-of-domain values saturate at the palette's ends. Mirrors D3's
 * `scaleSequential`.
 * @param {Function|Array} palette A `t => color` interpolator, or an array of ≥2 colors.
 * @param {[number, number]} [domain=[0, 1]] The domain mapped onto the palette's `[0, 1]`.
 * @returns {{ (value: number): *, domain: (arr?: [number, number]) => ([number, number]|object), copy: () => object }}
 * @throws {TypeError} If `palette` is not a function or an array of ≥2 colors.
 * @example
 * const s = color.sequential(['#000000', '#ffffff'], [0, 100]);
 * s(50); // '#808080'
 */
export function sequential(palette, domain = [0, 1]) {
  const interpolator = toInterpolator(palette, 'sequential');
  const map = continuous().domain(domain).range([0, 1]).clamp(true);

  function scale(value) {
    return interpolator(map(value));
  }

  /**
   * Get (no args) or set (chainable) the domain mapped onto the palette's `[0, 1]`.
   * @param {[number, number]} [arr]
   * @returns {[number, number]|object}
   */
  scale.domain = function (arr) {
    if (arguments.length === 0) return map.domain();
    map.domain(arr);
    return scale;
  };

  /** An independent clone with the same palette/domain state. */
  scale.copy = function () {
    return sequential(palette, map.domain());
  };

  return scale;
}

function assertDivergingDomain(arr) {
  if (!Array.isArray(arr) || arr.length !== 3) {
    throw new TypeError(`color.diverging: domain must be [low, mid, high], received ${JSON.stringify(arr)}.`);
  }
}

/**
 * Creates a diverging color scale: maps a 3-stop `[low, mid, high]` domain
 * onto a `palette`'s `[0, 0.5, 1]`, so values on either side of the midpoint
 * diverge toward the palette's two ends. Mirrors D3's `scaleDiverging`.
 * @param {Function|Array} palette A `t => color` interpolator, or an array of ≥2 colors.
 * @param {[number, number, number]} [domain=[-1, 0, 1]] The `[low, mid, high]` domain.
 * @returns {{ (value: number): *, domain: (arr?: [number, number, number]) => ([number, number, number]|object), copy: () => object }}
 * @throws {TypeError} If `palette` is invalid, or `domain` isn't a 3-element array.
 * @example
 * const s = color.diverging(['#0000ff', '#ffffff', '#ff0000'], [-10, 0, 10]);
 * s(-10); // '#0000ff'
 * s(0); // '#ffffff'
 */
export function diverging(palette, domain = [-1, 0, 1]) {
  assertDivergingDomain(domain);
  const interpolator = toInterpolator(palette, 'diverging');
  const map = continuous().domain(domain).range([0, 0.5, 1]).clamp(true);

  function scale(value) {
    return interpolator(map(value));
  }

  /**
   * Get (no args) or set (chainable) the `[low, mid, high]` domain.
   * @param {[number, number, number]} [arr]
   * @returns {[number, number, number]|object}
   */
  scale.domain = function (arr) {
    if (arguments.length === 0) return map.domain();
    assertDivergingDomain(arr);
    map.domain(arr);
    return scale;
  };

  /** An independent clone with the same palette/domain state. */
  scale.copy = function () {
    return diverging(palette, map.domain());
  };

  return scale;
}
