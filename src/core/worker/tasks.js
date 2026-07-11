/**
 * Worker task registry and dispatch.
 * Exported as an ES module so tests can import directly; `bootstrap.js`
 * imports this and wires it to `self` for the actual worker IIFE.
 */

/** @type {Map<string, function(*, function): * | Promise<*>>} */
export const tasks = new Map();

/**
 * Register a named task handler.
 *
 * @param {string} name
 * @param {function(*): * | Promise<*>} fn - Receives `payload`, returns result or Promise.
 * @throws {TypeError}
 * @example registerTask('mySort', ({ data }) => data.slice().sort());
 */
export function registerTask(name, fn) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError(
      `registerTask: name must be a non-empty string, received ${JSON.stringify(name)}.`,
    );
  }
  if (typeof fn !== 'function') {
    throw new TypeError(
      `registerTask: fn must be a function, received ${typeof fn}.`,
    );
  }
  tasks.set(name, fn);
}

/**
 * Dispatch an incoming worker message to the registered task handler.
 * Auto-transfers TypedArrays and ArrayBuffers for zero-copy return.
 *
 * @param {{ id: number, task: string, payload: * }} data
 * @param {function(*, Transferable[]=): void} post - `self.postMessage` bound to worker scope.
 */
export function handleMessage({ id, task, payload }, post) {
  const handler = tasks.get(task);
  if (!handler) {
    post({
      id,
      error: `Unknown task '${task}'. Registered tasks: ${[...tasks.keys()].join(', ') || '(none)'}.`,
    });
    return;
  }

  let result;
  try {
    result = handler(payload);
  } catch (e) {
    post({ id, error: e?.message ?? String(e) });
    return;
  }

  if (result && typeof result.then === 'function') {
    result.then(
      (v) => postResult(id, v, post),
      (e) => post({ id, error: e?.message ?? String(e) }),
    );
  } else {
    postResult(id, result, post);
  }
}

/** Send a result, transferring the underlying buffer for TypedArrays/ArrayBuffers. */
function postResult(id, result, post) {
  if (ArrayBuffer.isView(result)) {
    post({ id, result }, [result.buffer]);
  } else if (result instanceof ArrayBuffer) {
    post({ id, result }, [result]);
  } else {
    post({ id, result });
  }
}

// ── Built-in tasks ────────────────────────────────────────────────────────────

tasks.set('sort', ({ data, key, dir = 'asc' }) => {
  if (!Array.isArray(data)) throw new TypeError("sort: 'data' must be an array.");
  const arr = data.slice();
  arr.sort((a, b) => {
    const va = key != null ? a[key] : a;
    const vb = key != null ? b[key] : b;
    return dir === 'asc' ? va - vb : vb - va;
  });
  return arr;
});

tasks.set('decimate', ({ data, step = 2 }) => {
  if (!Array.isArray(data)) throw new TypeError("decimate: 'data' must be an array.");
  if (!Number.isInteger(step) || step < 1)
    throw new TypeError("decimate: 'step' must be a positive integer.");
  return data.filter((_, i) => i % step === 0);
});

// Linear-interpolation percentile (the "R-7"/Excel method) — p=0 is the min,
// p=1 is the max, p=0.5 is the median (matching Math.min/Math.max's own
// endpoints exactly, so 'percentile' is a strict superset of those two).
function percentileOf(arr, p) {
  if (typeof p !== 'number' || p < 0 || p > 1) {
    throw new TypeError(`aggregate: 'p' must be a number in [0, 1] for fn 'percentile', received ${JSON.stringify(p)}.`);
  }
  const sorted = arr.slice().sort((a, b) => a - b);
  const index = p * (sorted.length - 1);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

tasks.set('aggregate', ({ data, groupKey, valueKey, fn = 'sum', p }) => {
  if (!Array.isArray(data)) throw new TypeError("aggregate: 'data' must be an array.");
  const reducers = {
    sum:        (arr) => arr.reduce((s, v) => s + v, 0),
    mean:       (arr) => arr.reduce((s, v) => s + v, 0) / arr.length,
    min:        (arr) => Math.min(...arr),
    max:        (arr) => Math.max(...arr),
    count:      (arr) => arr.length,
    percentile: (arr) => percentileOf(arr, p),
  };
  if (!reducers[fn])
    throw new TypeError(`aggregate: unknown fn '${fn}'. Expected: ${Object.keys(reducers).join(', ')}.`);
  const groups = new Map();
  for (const d of data) {
    const k = groupKey != null ? d[groupKey] : '__all__';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(valueKey != null ? d[valueKey] : d);
  }
  const out = {};
  for (const [k, vals] of groups) out[k] = reducers[fn](vals);
  return out;
});

// Perpendicular distance from `point` to the infinite line through `lineStart`/`lineEnd`.
function perpendicularDistance([x, y], [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(x - x1, y - y1);
  return Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / Math.sqrt(lengthSq);
}

// Iterative (stack-based, not recursive — this project's north star is
// million-point datasets, and a recursive descent risks a stack overflow on
// an already-jagged curve) Douglas-Peucker: returns the indices to keep at a
// given `epsilon` distance tolerance. Endpoints are always kept.
function douglasPeuckerIndices(points, epsilon) {
  const n = points.length;
  if (n < 3) return points.map((_, i) => i);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop();
    if (end - start < 2) continue;
    let maxDist = -1;
    let maxIndex = -1;
    for (let i = start + 1; i < end; i++) {
      const dist = perpendicularDistance(points[i], points[start], points[end]);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }
    if (maxDist > epsilon) {
      keep[maxIndex] = 1;
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }
  const indices = [];
  for (let i = 0; i < n; i++) if (keep[i]) indices.push(i);
  return indices;
}

tasks.set('douglasPeucker', ({ data, x, y, target }) => {
  if (!Array.isArray(data)) throw new TypeError("douglasPeucker: 'data' must be an array.");
  if (!Number.isInteger(target) || target < 2) {
    throw new TypeError("douglasPeucker: 'target' must be an integer >= 2.");
  }
  if (data.length <= target) return data;

  const points = data.map((d, i) => [x != null ? d[x] : i, y != null ? d[y] : d]);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [px, py] of points) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  let lo = 0;
  let hi = Math.hypot(maxX - minX, maxY - minY) || 1; // degenerate (all-identical) points still need a searchable range

  // Binary search epsilon for an indices count close to `target` — point
  // count is (non-strictly) monotonic non-increasing in epsilon, so this
  // converges; 20 iterations is far more than enough precision for a
  // visualization decimation target (not an exact-count guarantee).
  let bestIndices = douglasPeuckerIndices(points, lo);
  for (let i = 0; i < 20 && bestIndices.length !== target; i++) {
    const mid = (lo + hi) / 2;
    const indices = douglasPeuckerIndices(points, mid);
    if (indices.length > target) lo = mid;
    else hi = mid;
    bestIndices = indices;
  }

  return bestIndices.map((i) => data[i]);
});

// All-pairs many-body repulsion/attraction on a flat [x0,y0,z0,x1,y1,z1,...]
// buffer — `stream/GPGPU.js`'s CPU+worker fallback for `layout.force`'s
// 'charge' force above its GPGPU threshold (Prompt 165). Deliberately NOT
// the Barnes-Hut octree `compose/layout/force/octree.js` already uses for
// the main-thread path: this file can't import it (`core/` sits below
// `compose/` in CLAUDE.md §1.4's layer order), and duplicating that O(n log n)
// tree here would be a lot of intricate code for a fallback path whose whole
// point is "off the main thread, occasionally" rather than "every frame" —
// the GPU path (same all-pairs math, run in parallel across n fragment
// invocations) is the fast path; this one only runs when that's unavailable.
// ponytail: O(n²), single-threaded — fine for an occasional off-thread
// recompute, but slow (seconds, not milliseconds) well past ~20k nodes;
// swap in a flat-array Barnes-Hut octree here if that becomes a real need.
tasks.set('forceCharge', ({ positions, strength = -30, distanceMin = 1, distanceMax = Infinity }) => {
  if (!ArrayBuffer.isView(positions) && !Array.isArray(positions)) {
    throw new TypeError("forceCharge: 'positions' must be a flat [x0,y0,z0,...] array.");
  }
  if (positions.length % 3 !== 0) {
    throw new TypeError("forceCharge: 'positions' length must be a multiple of 3.");
  }
  const n = positions.length / 3;
  const distanceMinSq = distanceMin * distanceMin;
  const distanceMaxSq = distanceMax * distanceMax;
  const accel = new Float32Array(positions.length);

  for (let i = 0; i < n; i++) {
    const xi = positions[i * 3];
    const yi = positions[i * 3 + 1];
    const zi = positions[i * 3 + 2];
    let ax = 0;
    let ay = 0;
    let az = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      // dx/dy/dz point FROM self TOWARD the other node — negative strength
      // (repulsion) then accelerates self *away* from it, matching
      // compose/layout/force/forces.js's forceCharge sign convention.
      const dx = positions[j * 3] - xi;
      const dy = positions[j * 3 + 1] - yi;
      const dz = positions[j * 3 + 2] - zi;
      const distSq = Math.max(dx * dx + dy * dy + dz * dz, distanceMinSq);
      if (distSq >= distanceMaxSq) continue;
      const dist = Math.sqrt(distSq);
      const factor = strength / distSq;
      ax += (dx / dist) * factor;
      ay += (dy / dist) * factor;
      az += (dz / dist) * factor;
    }
    accel[i * 3] = ax;
    accel[i * 3 + 1] = ay;
    accel[i * 3 + 2] = az;
  }
  return accel;
});

// The keyed half of compose/selection/diff.js's diffData() join, reimplemented
// here rather than imported — `core/` sits below `compose/` (CLAUDE.md §1.4),
// so this file can never import diff.js. `stream/JoinDiff.js` (Prompt 167) is
// the one caller: it can't hand this worker a `keyFn` closure (functions
// aren't structured-cloneable), so it pre-maps oldData/newData to `oldKeys`/
// `newKeys` on the main thread and this task does only the Map-based
// matching — the exact same algorithm as diffData's keyed branch, over
// already-computed keys instead of calling keyFn itself, so the result is
// byte-for-byte identical. Returns index lists, not `{datum, ...}` objects
// (data isn't round-tripped through the worker at all) — `JoinDiff.diff()`
// re-attaches `datum` from its own oldData/newData arrays afterward.
tasks.set('joinDiff', ({ oldKeys, newKeys }) => {
  if (!Array.isArray(oldKeys) || !Array.isArray(newKeys)) {
    throw new TypeError("joinDiff: 'oldKeys' and 'newKeys' must both be arrays.");
  }
  const oldIndexByKey = new Map();
  for (let i = 0; i < oldKeys.length; i++) oldIndexByKey.set(oldKeys[i], i);

  const seenNewKeys = new Set();
  const enterNewIndices = [];
  const updateOldIndices = [];
  const updateNewIndices = [];
  for (let i = 0; i < newKeys.length; i++) {
    const key = newKeys[i];
    if (seenNewKeys.has(key)) {
      throw new Error(`joinDiff: duplicate key '${String(key)}' at newKeys[${i}] — keys must be unique within newKeys.`);
    }
    seenNewKeys.add(key);
    if (oldIndexByKey.has(key)) {
      updateOldIndices.push(oldIndexByKey.get(key));
      updateNewIndices.push(i);
      oldIndexByKey.delete(key);
    } else {
      enterNewIndices.push(i);
    }
  }
  const exitOldIndices = [...oldIndexByKey.values()];
  return { enterNewIndices, updateOldIndices, updateNewIndices, exitOldIndices };
});

// Returns a Float32Array so the buffer is auto-transferred by handleMessage.
tasks.set('layout:grid', ({ count, cols = 10, spacing = 1 }) => {
  if (!Number.isInteger(count) || count < 0)
    throw new TypeError("layout:grid: 'count' must be a non-negative integer.");
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    out[i * 3]     = (i % cols) * spacing;
    out[i * 3 + 1] = 0;
    out[i * 3 + 2] = Math.floor(i / cols) * spacing;
  }
  return out;
});
