/**
 * Per-`GraphInstancedObject` free-list bookkeeping for the join system's
 * enter/exit slot lifecycle (Prompt 79). `GraphInstancedObject` itself has
 * no notion of "free" vs "in use" — it only tracks `capacity`/`count` — so
 * this lives in `compose/selection` (the join-lifecycle owner) rather than
 * `object/`, keyed by object identity so unrelated instanced batches never
 * share a free-list.
 *
 * ponytail: assumes one instanced object's whole index space belongs to a
 * single logical join (one chart series per `GraphInstancedObject`). Two
 * independent joins recycling slots on the *same* object would collide —
 * add a per-selection allocator key if a future prompt needs that.
 * @type {WeakMap<object, { freeList: number[], nextFresh: number }>}
 */
const allocators = new WeakMap();

/**
 * @param {object} object @returns {{ freeList: number[], nextFresh: number }}
 */
function allocatorFor(object) {
  let state = allocators.get(object);
  if (!state) {
    // Indices already rendered (object.count) may already be bound to real
    // data that reached this object some other way (e.g. the Selection this
    // join started from) — start fresh allocation past them so a first-ever
    // allocateSlots() call can't hand out an index some existing member
    // already owns.
    state = { freeList: [], nextFresh: object.count };
    allocators.set(object, state);
  }
  return state;
}

/**
 * Reserve `n` instance slots on `object` — recycled (previously freed)
 * indices first, then fresh ones, growing `object`'s capacity/rendered count
 * (via `setInstanceCount`'s existing pow2 growth, Prompt 49) only when the
 * free-list can't cover the request. A recycled index is first restored
 * visible (`setInstanceVisible(i, true)`) to clear the stale captured-hidden
 * transform left over from when it was freed, so a later
 * `setInstanceVisible(i, false)` on it re-captures the *new* occupant's
 * transform instead of the old one.
 * @param {object} object A `GraphInstancedObject`.
 * @param {number} n
 * @returns {Uint32Array} `n` raw instance indices, ready to write.
 */
export function allocateSlots(object, n) {
  const state = allocatorFor(object);
  const indices = new Uint32Array(n);
  let taken = 0;
  while (taken < n && state.freeList.length > 0) {
    const index = state.freeList.pop();
    object.setInstanceVisible(index, true);
    indices[taken++] = index;
  }
  while (taken < n) {
    indices[taken++] = state.nextFresh++;
  }
  if (object.count < state.nextFresh) object.setInstanceCount(state.nextFresh);
  return indices;
}

/**
 * Release instance slots back to `object`'s free-list for a future
 * `allocateSlots` call to reuse, hiding each one (`setInstanceVisible(i, false)`)
 * so it renders nothing while unused.
 * @param {object} object A `GraphInstancedObject`.
 * @param {Uint32Array|number[]} indices
 */
export function freeSlots(object, indices) {
  const state = allocatorFor(object);
  for (const index of indices) {
    object.setInstanceVisible(index, false);
    state.freeList.push(index);
  }
}
