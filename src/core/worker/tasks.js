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

tasks.set('aggregate', ({ data, groupKey, valueKey, fn = 'sum' }) => {
  if (!Array.isArray(data)) throw new TypeError("aggregate: 'data' must be an array.");
  const reducers = {
    sum:   (arr) => arr.reduce((s, v) => s + v, 0),
    mean:  (arr) => arr.reduce((s, v) => s + v, 0) / arr.length,
    min:   (arr) => Math.min(...arr),
    max:   (arr) => Math.max(...arr),
    count: (arr) => arr.length,
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
