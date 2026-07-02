/** @param {*} value @param {string} method @throws {TypeError} */
function assertFunction(value, method) {
  if (typeof value !== 'function') {
    throw new TypeError(`Selection.${method}: expected a function, received ${JSON.stringify(value)}.`);
  }
}

/**
 * Narrows `backend` to the members at `localIndices` (positions within the
 * *current* selection, not raw instance indices) — the shared backend-slicing
 * logic behind both `filter` and `sort` (CLAUDE.md §1.1 DRY two-strike rule:
 * both need "a backend restricted/reordered to a subset of local positions").
 * Slicing an array of `GraphMesh` references or a `Uint32Array` of instance
 * indices touches no GPU buffer — narrowing/reordering a *selection* is not
 * the same as writing an *attribute* (that's `attr.js`'s job).
 * @param {{ type: 'meshes', meshes: object[] }|{ type: 'instanced', object: object, indices: Uint32Array }} backend
 * @param {number[]} localIndices
 * @returns {{ type: 'meshes', meshes: object[] }|{ type: 'instanced', object: object, indices: Uint32Array }}
 */
export function backendForIndices(backend, localIndices) {
  if (backend.type === 'meshes') {
    return { type: 'meshes', meshes: localIndices.map((i) => backend.meshes[i]) };
  }
  const { object, indices } = backend;
  return { type: 'instanced', object, indices: Uint32Array.from(localIndices, (i) => indices[i]) };
}

/**
 * Backend for `Selection.filter(predicateFn)` — the members of `backend` for
 * which `predicateFn(datum, index)` is truthy, in their original order.
 * @param {*} backend
 * @param {number} size
 * @param {(index: number) => *} datumAt
 * @param {(datum: *, index: number) => boolean} predicateFn
 * @returns {*} A new backend descriptor, narrowed.
 * @throws {TypeError} If `predicateFn` is not a function.
 */
export function filterBackend(backend, size, datumAt, predicateFn) {
  assertFunction(predicateFn, 'filter');
  const kept = [];
  for (let i = 0; i < size; i++) {
    if (predicateFn(datumAt(i), i)) kept.push(i);
  }
  return backendForIndices(backend, kept);
}

/**
 * Backend for `Selection.sort(comparator)` — `backend`'s members reordered by
 * `comparator(datumA, datumB)` (the same contract as `Array.prototype.sort`).
 * Only the *selection's* datum→index mapping changes — no instance buffer or
 * mesh array is rewritten, matching Prompt 76's "without touching buffers
 * unless `.order()` is called" (a physical-reorder method this codebase
 * doesn't implement yet — no consumer requires it, CLAUDE.md §1.3 YAGNI).
 * @param {*} backend
 * @param {number} size
 * @param {(index: number) => *} datumAt
 * @param {(a: *, b: *) => number} comparator
 * @returns {*} A new backend descriptor, reordered.
 * @throws {TypeError} If `comparator` is not a function.
 */
export function sortBackend(backend, size, datumAt, comparator) {
  assertFunction(comparator, 'sort');
  const data = new Array(size);
  for (let i = 0; i < size; i++) data[i] = datumAt(i);
  const order = Array.from({ length: size }, (_, i) => i);
  order.sort((a, b) => comparator(data[a], data[b]));
  return backendForIndices(backend, order);
}

/**
 * Backend for `Selection.merge(other)` — the concatenation of two
 * same-backend selections (Prompt 76: "same-backend only; throw otherwise").
 * Meshes backends merge regardless of which meshes they hold; instanced
 * backends must additionally share the exact same `GraphInstancedObject`
 * (a `Uint32Array` of indices is only meaningful relative to one object's
 * instance slots). Does not deduplicate overlapping members, mirroring d3's
 * own `.merge()`.
 * @param {*} a
 * @param {*} b
 * @returns {*} A new backend descriptor, concatenated.
 * @throws {Error} If `a` and `b` have different backend types, or are
 *   instanced backends over different `GraphInstancedObject`s.
 */
export function mergeBackend(a, b) {
  if (a.type !== b.type) {
    throw new Error(`Selection.merge: cannot merge a '${a.type}' selection with a '${b.type}' selection.`);
  }
  if (a.type === 'meshes') {
    const merged = { type: 'meshes', meshes: [...a.meshes, ...b.meshes] };
    // A from-scratch join's template must survive merge() — join()'s own
    // default (`this.merge(entered)`) hands the result back as the next
    // cycle's selection, and that cycle may need to materialize another
    // enter() (CLAUDE.md §1.1 DRY: computeJoin already carries `template`
    // forward the same way; merge must not silently drop it).
    const template = a.template ?? b.template;
    if (template) merged.template = template;
    return merged;
  }
  if (a.object !== b.object) {
    throw new Error('Selection.merge: instanced selections must share the same GraphInstancedObject.');
  }
  const indices = new Uint32Array(a.indices.length + b.indices.length);
  indices.set(a.indices, 0);
  indices.set(b.indices, a.indices.length);
  return { type: 'instanced', object: a.object, indices };
}
