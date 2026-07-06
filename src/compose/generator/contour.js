/**
 * @param {Float32Array} positions Row-major vertex positions from
 *   `generator.surface().compute()`, `(rows+1)*(cols+1)` vertices.
 * @param {number} colCount `cols + 1`.
 * @param {number} row @param {number} col
 * @returns {[number, number, number]}
 */
function vertexAt(positions, colCount, row, col) {
  const i = (row * colCount + col) * 3;
  return [positions[i], positions[i + 1], positions[i + 2]];
}

/**
 * @param {[number, number, number]} a @param {[number, number, number]} b
 * @param {number} level The height (`y`) both `a.y`/`b.y` straddle.
 * @returns {[number, number, number]} The point on segment `a`-`b` where `y === level`.
 */
function crossingPoint(a, b, level) {
  const t = (level - a[1]) / (b[1] - a[1]);
  return [a[0] + (b[0] - a[0]) * t, level, a[2] + (b[2] - a[2]) * t];
}

/**
 * A canonical id for a grid edge, shared by both cells that border it — a
 * horizontal edge between grid vertices `(gridRow, col)`-`(gridRow, col+1)`,
 * or a vertical edge between `(row, gridCol)`-`(row+1, gridCol)` — so two
 * adjacent cells independently computing the same shared crossing agree on
 * its identity without comparing floating-point coordinates.
 * @param {number} row @param {number} col
 * @param {'top'|'right'|'bottom'|'left'} edge
 * @returns {string}
 */
function edgeKey(row, col, edge) {
  if (edge === 'top') return `h:${row}:${col}`;
  if (edge === 'bottom') return `h:${row + 1}:${col}`;
  if (edge === 'left') return `v:${row}:${col}`;
  return `v:${row}:${col + 1}`;
}

/**
 * The 0, 1, or 2 line segments marching squares finds crossing threshold
 * `level` within one grid cell `(row, col)`. A cell has at most 2 segments —
 * the ambiguous "saddle" case where all 4 edges cross (two opposite corners
 * above `level`, two below) is resolved by a single deterministic rule (pair
 * by the top-left corner's side of `level`) rather than a full asymptotic
 * decider — a known, documented simplification (BUILD_PLAN.md), not a
 * geo-scientific-grade contour algorithm.
 * @param {Float32Array} positions @param {number} colCount
 * @param {number} row @param {number} col @param {number} level
 * @returns {{a: [number,number,number], b: [number,number,number], keyA: string, keyB: string}[]}
 */
function cellSegments(positions, colCount, row, col, level) {
  const tl = vertexAt(positions, colCount, row, col);
  const tr = vertexAt(positions, colCount, row, col + 1);
  const bl = vertexAt(positions, colCount, row + 1, col);
  const br = vertexAt(positions, colCount, row + 1, col + 1);

  const crossings = {};
  if ((tl[1] - level) * (tr[1] - level) < 0) crossings.top = crossingPoint(tl, tr, level);
  if ((tr[1] - level) * (br[1] - level) < 0) crossings.right = crossingPoint(tr, br, level);
  if ((bl[1] - level) * (br[1] - level) < 0) crossings.bottom = crossingPoint(bl, br, level);
  if ((tl[1] - level) * (bl[1] - level) < 0) crossings.left = crossingPoint(tl, bl, level);

  const edges = Object.keys(crossings);
  const segment = (edgeA, edgeB) => ({
    a: crossings[edgeA],
    b: crossings[edgeB],
    keyA: edgeKey(row, col, edgeA),
    keyB: edgeKey(row, col, edgeB),
  });

  if (edges.length === 2) return [segment(edges[0], edges[1])];
  if (edges.length === 4) {
    return tl[1] > level
      ? [segment('top', 'left'), segment('right', 'bottom')]
      : [segment('top', 'right'), segment('left', 'bottom')];
  }
  // 0, 1, or 3 crossings: no crossing, or an exact-on-vertex degenerate case
  // too rare/ill-defined on floating height data to resolve meaningfully.
  return [];
}

/**
 * Stitches disjoint per-cell segments into continuous polylines: open paths
 * (grid-boundary endpoints) are traced first from their loose end so they
 * come out as one connected path rather than fragments; whatever remains
 * forms closed loops, traced starting from any of their segments.
 * @param {{a: number[], b: number[], keyA: string, keyB: string}[]} segments
 * @returns {number[][][]} One entry per traced path, each an ordered array of `[x,y,z]` points.
 */
function stitchSegments(segments) {
  const adjacency = new Map();
  segments.forEach((seg, segIndex) => {
    for (const [key, endIndex] of [[seg.keyA, 0], [seg.keyB, 1]]) {
      if (!adjacency.has(key)) adjacency.set(key, []);
      adjacency.get(key).push({ segIndex, endIndex });
    }
  });

  const visited = new Array(segments.length).fill(false);
  const paths = [];

  function extend(path, fromKey) {
    let currentKey = fromKey;
    for (;;) {
      const next = (adjacency.get(currentKey) || []).find((ref) => !visited[ref.segIndex]);
      if (!next) return;
      visited[next.segIndex] = true;
      const seg = segments[next.segIndex];
      const isKeyA = next.endIndex === 0;
      path.push(isKeyA ? seg.b : seg.a);
      currentKey = isKeyA ? seg.keyB : seg.keyA;
    }
  }

  // Pass 1: open paths, starting from a true loose end (an edge referenced
  // by exactly one segment — a grid boundary or an unmatched crossing).
  for (let i = 0; i < segments.length; i++) {
    if (visited[i]) continue;
    const seg = segments[i];
    const aIsLoose = adjacency.get(seg.keyA).length === 1;
    const bIsLoose = adjacency.get(seg.keyB).length === 1;
    if (!aIsLoose && !bIsLoose) continue;
    visited[i] = true;
    const path = aIsLoose ? [seg.a, seg.b] : [seg.b, seg.a];
    extend(path, aIsLoose ? seg.keyB : seg.keyA);
    paths.push(path);
  }

  // Pass 2: whatever's left forms closed loops — any starting segment works.
  for (let i = 0; i < segments.length; i++) {
    if (visited[i]) continue;
    visited[i] = true;
    const seg = segments[i];
    const path = [seg.a, seg.b];
    extend(path, seg.keyB);
    paths.push(path);
  }

  return paths;
}

/**
 * Traces contour lines (marching squares) through a heightfield's
 * already-computed vertex grid — `generator.surface().compute()`'s own
 * `positions`, row-major, `(rows+1)*(cols+1)` vertices — at each of
 * `levels`. Operates purely on that already-built grid rather than
 * re-sampling the heightfield a second time (CLAUDE.md §1.1 DRY): the
 * `SurfaceChart` wall calling this already has `positions`/`rows`/`cols` in
 * hand from its own `generator.surface().compute()` call.
 *
 * Each traced path is a continuous, non-self-intersecting polyline (an open
 * path ending at the grid boundary, or a closed loop) ready for a `GraphLine`
 * — a contour level can trace multiple disjoint paths, so this returns one
 * entry per path, not one per level.
 * @param {Float32Array} positions
 * @param {number} rows @param {number} cols
 * @param {number[]} levels Height values to trace isolines at.
 * @returns {{level: number, positions: Float32Array}[]}
 * @throws {TypeError} If `levels` isn't an array of finite numbers.
 * @example
 * const { positions, rows, cols } = generator.surface().values(heightFn).compute();
 * traceContours(positions, rows, cols, [0, 5, 10]);
 */
export function traceContours(positions, rows, cols, levels) {
  if (!Array.isArray(levels) || levels.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new TypeError(`traceContours: levels must be an array of finite numbers, received ${JSON.stringify(levels)}.`);
  }
  const colCount = cols + 1;
  const results = [];
  for (const level of levels) {
    const segments = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        segments.push(...cellSegments(positions, colCount, row, col, level));
      }
    }
    for (const path of stitchSegments(segments)) {
      const flat = new Float32Array(path.length * 3);
      for (let i = 0; i < path.length; i++) flat.set(path[i], i * 3);
      results.push({ level, positions: flat });
    }
  }
  return results;
}
