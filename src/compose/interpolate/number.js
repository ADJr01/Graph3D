/**
 * Linearly interpolates between two numbers.
 * @param {number} a Value at `t = 0`.
 * @param {number} b Value at `t = 1`.
 * @returns {(t: number) => number}
 * @example interpolateNumber(0, 100)(0.5); // 50
 */
export function interpolateNumber(a, b) {
  return (t) => a * (1 - t) + b * t;
}
