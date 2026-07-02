import { continuous } from '../scale/continuous.js';
import { interpolate } from '../interpolate/index.js';

// Matches the resolution GraphInstancedObject's bulk color setters expect
// when looking up a palette by instance index (Prompt 61).
const PRECOMPUTED_STEPS = 256;

/**
 * Samples `fn` at `PRECOMPUTED_STEPS` evenly spaced points across `[0, 1]`
 * and attaches the result as `fn.colors` — the single precompute site every
 * named palette (data-table or formula-based) goes through, rather than
 * each palette re-sampling itself (CLAUDE.md §1.1 DRY).
 * @param {(t: number) => string} fn
 * @returns {(t: number) => string} `fn`, mutated in place with `.colors` attached.
 * @example
 * const p = attachColors((t) => (t < 0.5 ? '#000000' : '#ffffff'));
 * p.colors.length; // 256
 */
export function attachColors(fn) {
  const colors = new Array(PRECOMPUTED_STEPS);
  for (let i = 0; i < PRECOMPUTED_STEPS; i++) colors[i] = fn(i / (PRECOMPUTED_STEPS - 1));
  fn.colors = colors;
  return fn;
}

/**
 * Builds a `(t) => '#rrggbb'` palette by piecewise-linearly interpolating
 * through evenly spaced anchor `colors` — reuses `scale/continuous.js`'s
 * domain/range/interpolate engine rather than a bespoke ramp (CLAUDE.md
 * §1.1 DRY). `t` outside `[0, 1]` clamps to the first/last anchor.
 * @param {string[]} colors Anchor colors, low to high; at least 2.
 * @param {(a: *, b: *) => (t: number) => *} [interpolator] Per-segment color-space interpolator;
 *   defaults to the generic `interpolate()` dispatcher (RGB for colors). Overridden by
 *   `palette.interpolateRGB/HSL/LAB` (Prompt 63) to pick a color space explicitly.
 * @returns {(t: number) => string} With `.colors`, a precomputed 256-step array.
 * @example
 * const p = ramp(['#000000', '#ffffff']);
 * p(0.5); // '#808080'
 */
export function ramp(colors, interpolator = interpolate) {
  const stops = colors.map((_, i) => i / (colors.length - 1));
  const built = continuous(undefined, undefined, interpolator).domain(stops).range(colors).clamp(true);
  return attachColors((t) => built(t));
}
