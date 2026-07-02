import { continuous } from './continuous.js';
import { linearish } from './linearish.js';

/**
 * Creates a linear scale: a continuous, piecewise-linear mapping from a
 * numeric domain to a range of numbers or anything `interpolate()`
 * understands (colors, arrays, objects).
 * @returns {import('./continuous.js').ContinuousScale & {
 *   ticks: (count?: number) => number[],
 *   tickFormat: (count?: number, specifier?: string) => (value: number) => string,
 * }}
 * @example
 * const x = scale.linear().domain([0, 100]).range([0, 1]);
 * x(50); // 0.5
 * x.invert(0.5); // 50
 * x.ticks(5); // [0, 20, 40, 60, 80, 100]
 * x.tickFormat()(50); // '50'
 */
export function linear() {
  const s = linearish(continuous());

  s.copy = function () {
    return linear().domain(s.domain()).range(s.range()).clamp(s.clamp());
  };

  return s;
}
