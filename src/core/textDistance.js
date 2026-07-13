// A suggestion beyond this edit distance is more likely to be noise than a
// genuine typo — see Graph3D.chart()'s original use of this same threshold.
const DEFAULT_MAX_DISTANCE = 3;

/**
 * Classic Wagner–Fischer edit distance between two strings — the minimum
 * number of single-character insertions/deletions/substitutions to turn `a`
 * into `b`. Used for "did you mean" suggestions (`Graph3D.chart()`'s
 * unknown-type-name error, `Selection.attr()`'s unknown-path dev warning,
 * Prompt 179). Extracted here once `Selection.attr()` needed the identical
 * algorithm `Graph3D.chart()` already had inline (CLAUDE.md §1.1 DRY
 * two-strike rule) — a `core/` leaf utility, the same "importable directly
 * by any layer" precedent as `core/GraphDisposal.js`/`core/Graph3DLoop.js`.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) distances[i][0] = i;
  for (let j = 0; j < cols; j++) distances[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      distances[i][j] = Math.min(
        distances[i - 1][j] + 1, // deletion
        distances[i][j - 1] + 1, // insertion
        distances[i - 1][j - 1] + substitutionCost, // substitution
      );
    }
  }
  return distances[rows - 1][cols - 1];
}

/**
 * The candidate closest to `input` by edit distance, or `null` if nothing is
 * within `maxDistance`.
 * @param {string} input
 * @param {string[]} candidates
 * @param {number} [maxDistance]
 * @returns {string|null}
 * @example nearestMatch('colour', ['position', 'color', 'opacity']); // 'color'
 */
export function nearestMatch(input, candidates, maxDistance = DEFAULT_MAX_DISTANCE) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = levenshteinDistance(input, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return bestDistance <= maxDistance ? best : null;
}
