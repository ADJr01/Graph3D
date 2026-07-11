/**
 * Validates a `chart.enableLOD({levels})` levels array — CLAUDE.md §1.5 Fail
 * Fast, checked once at the boundary rather than failing confusingly deep
 * inside the first frame's re-LOD check.
 * @param {*} levels
 * @throws {TypeError} If `levels` isn't a non-empty array of `{maxDistance, maxPoints}`.
 */
export function assertLODLevels(levels) {
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new TypeError(`GraphChart.enableLOD: levels must be a non-empty array of {maxDistance, maxPoints}, received ${JSON.stringify(levels)}.`);
  }
  for (const level of levels) {
    if (!level || typeof level.maxDistance !== 'number' || !(level.maxDistance > 0)) {
      throw new TypeError(`GraphChart.enableLOD: each level's maxDistance must be a positive number, received ${JSON.stringify(level)}.`);
    }
    if (!Number.isInteger(level.maxPoints) || level.maxPoints < 1) {
      throw new TypeError(`GraphChart.enableLOD: each level's maxPoints must be a positive integer, received ${JSON.stringify(level)}.`);
    }
  }
}

/**
 * Picks the applicable level for `distance` — `levels` must already be
 * sorted ascending by `maxDistance`; the first one `distance` still fits
 * under wins (closer camera → the earlier, higher-detail levels). Beyond
 * every threshold, the farthest (most aggressive) level applies.
 * @param {{maxDistance: number, maxPoints: number}[]} levels Pre-sorted ascending by `maxDistance`.
 * @param {number} distance
 * @returns {{maxDistance: number, maxPoints: number}}
 */
export function pickLODLevel(levels, distance) {
  for (const level of levels) {
    if (distance <= level.maxDistance) return level;
  }
  return levels[levels.length - 1];
}
