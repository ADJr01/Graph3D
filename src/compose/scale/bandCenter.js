/**
 * Returns the offset from a band scale's start edge to its center — half of
 * `scale.bandwidth()`. `0` for scales with no `.bandwidth` method (continuous
 * scales) and for `scale.point()` (its `bandwidth()` is always `0`), so
 * adding this offset is a no-op everywhere except a padded band scale.
 * @param {object|null|undefined} scale
 * @returns {number}
 * @example
 * const s = scale.band().domain(['a', 'b']).range([0, 100]);
 * s('a') + bandCenter(s); // the center of band 'a', not its start edge
 */
export function bandCenter(scale) {
  return typeof scale?.bandwidth === 'function' ? scale.bandwidth() / 2 : 0;
}
