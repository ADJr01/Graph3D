import { ticks } from './ticks.js';
import { tickFormat } from './tickFormat.js';

/**
 * Attaches D3's linear tick algorithm (`ticks()`/`tickFormat()`) to a
 * continuous-family scale. Shared by `scale.linear()`, `scale.pow()`, and
 * `scale.sqrt()` — matching D3, whose `linearish` mixin backs all three: a
 * pow scale's ticks are plain domain values, not power-transformed, so the
 * tick algorithm itself doesn't need to know about the scale's transform.
 * (`scale.log()` doesn't use this — its ticks are log-spaced, not linear.)
 * @param {import('./continuous.js').ContinuousScale} s
 * @returns {import('./continuous.js').ContinuousScale} `s`, decorated in place.
 */
export function linearish(s) {
  s.ticks = function (count = 10) {
    const d = s.domain();
    return ticks(d[0], d[d.length - 1], count);
  };

  s.tickFormat = function (count = 10, specifier) {
    const d = s.domain();
    return tickFormat(d[0], d[d.length - 1], count, specifier);
  };

  return s;
}
