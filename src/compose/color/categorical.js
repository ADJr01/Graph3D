import { ordinal } from '../scale/ordinal.js';

/**
 * Creates a categorical color scale: assigns each distinct discrete value a
 * color from `colors` by first-seen order, cycling once `colors` is
 * exhausted. A thin wrapper over `scale.ordinal()` (CLAUDE.md §1.1 DRY —
 * no separate categorical-assignment logic).
 * @param {Array} colors Non-empty array of colors to cycle through.
 * @returns {{ (value: *): *, domain: (arr?: Array) => (Array|object), range: (arr?: Array) => (Array|object), copy: () => object }}
 * @throws {TypeError} If `colors` isn't a non-empty array.
 * @example
 * const s = color.categorical(['#1f77b4', '#ff7f0e', '#2ca02c']);
 * s('apples'); // '#1f77b4'
 * s('pears'); // '#ff7f0e'
 */
export function categorical(colors) {
  if (!Array.isArray(colors) || colors.length === 0) {
    throw new TypeError(`color.categorical: expected a non-empty array of colors, received ${JSON.stringify(colors)}.`);
  }
  return ordinal().range(colors);
}
