/**
 * Splits a linear ring-buffer range `[start, start + count)` (indices wrap
 * modulo `capacity`) into row-aligned rectangles over a `textureSize ×
 * textureSize` grid (`capacity` is always `textureSize * textureSize` — see
 * `ParticleSystem`'s capacity rounding). Row-aligning matters because
 * `WebGLRenderer.copyTextureToTexture()` only copies axis-aligned rectangles;
 * a batch of newly emitted particles rarely starts at a row boundary, so a
 * single `emit()` call can need 1–3 rectangles (partial first row, any full
 * rows in between, partial last row — wrap-around naturally produces the
 * same shape since index 0 is always row 0).
 *
 * Pure and GL-free — the only part of the GPU simulation path testable
 * without a real WebGL context (see `skipping_list.md`).
 *
 * @param {number} start - First linear index (0-based, before wrapping).
 * @param {number} count - Number of consecutive slots to cover.
 * @param {number} capacity - Total ring size (`textureSize * textureSize`).
 * @param {number} textureSize - Grid width/height.
 * @returns {Array<{x: number, y: number, width: number, height: number, offset: number}>}
 *   `offset` is how many of `count` slots precede this rectangle — the caller
 *   uses it to slice the matching span out of its own per-particle data.
 * @throws {RangeError} If `count` exceeds `capacity`.
 * @example splitRingRangeIntoRectangles(998, 5, 1000, 10);
 * // → [{ x: 8, y: 99, width: 2, height: 1, offset: 0 },
 * //    { x: 0, y: 0,  width: 3, height: 1, offset: 2 }]
 */
export function splitRingRangeIntoRectangles(start, count, capacity, textureSize) {
  if (count > capacity) {
    throw new RangeError(
      `splitRingRangeIntoRectangles: count (${count}) exceeds capacity (${capacity}).`,
    );
  }
  const rects = [];
  let remaining = count;
  let index = ((start % capacity) + capacity) % capacity;
  while (remaining > 0) {
    const row = Math.floor(index / textureSize);
    const col = index % textureSize;
    const width = Math.min(textureSize - col, remaining);
    rects.push({ x: col, y: row, width, height: 1, offset: count - remaining });
    index = (index + width) % capacity;
    remaining -= width;
  }
  return rects;
}

/**
 * Advances a ring-buffer cursor by `count` slots, returning the starting
 * index of the reserved range. Simple round-robin recycling — no free-list:
 * emitting faster than particles die force-recycles the oldest ones. This is
 * the standard, simplest approach for fixed-capacity GPU particle pools.
 * @param {number} cursor
 * @param {number} count
 * @param {number} capacity
 * @returns {{start: number, next: number}}
 * @throws {RangeError} If `count` exceeds `capacity`.
 */
export function advanceRingCursor(cursor, count, capacity) {
  if (count > capacity) {
    throw new RangeError(`advanceRingCursor: count (${count}) exceeds capacity (${capacity}).`);
  }
  const start = cursor % capacity;
  return { start, next: (start + count) % capacity };
}
