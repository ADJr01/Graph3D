const DEFAULT_SPACING = 0.02;

/**
 * Sorted-key-index → symmetric offset, so the mapping only depends on the
 * *set* of keys, never on the order `selection.data()` happened to return
 * them in for a particular call (e.g. after a `.sort()`-driven re-rank).
 * @param {*[]} keys
 * @param {number} spacing
 * @returns {Map<*, number>}
 */
function offsetsForKeys(keys, spacing) {
  const uniqueSorted = [...new Set(keys)].sort();
  const n = uniqueSorted.length;
  const offsetByKey = new Map();
  uniqueSorted.forEach((key, index) => {
    offsetByKey.set(key, (index - (n - 1) / 2) * spacing);
  });
  return offsetByKey;
}

/**
 * @param {*} backend
 * @param {*[]} keys
 * @param {Map<*, number>} offsetByKey
 */
function applyOffsets(backend, keys, offsetByKey) {
  if (backend.type === 'meshes') {
    backend.meshes.forEach((mesh, i) => {
      mesh.translate(0, 0, offsetByKey.get(keys[i]));
    });
    return;
  }
  if (backend.type === 'instanced') {
    const { object, indices } = backend;
    indices.forEach((rawIndex, i) => {
      const p = object.getInstancePosition(rawIndex);
      object.setInstancePosition(rawIndex, p.x, p.y, p.z + offsetByKey.get(keys[i]));
    });
    object.commitMatrix();
    return;
  }
  throw new TypeError(`assignDepthJitter: unrecognized backend type ${JSON.stringify(backend.type)}.`);
}

/**
 * Assigns each member of `selection` a small, stable, per-key z-offset —
 * enough to break exact depth-coincidence between objects whose on-screen
 * position may cross paths at runtime (e.g. rank-swapping bars, nodes
 * drifting past each other in a force layout), without visibly displacing
 * them from their intended layout.
 *
 * This exists because every chart generator that doesn't have an explicit
 * per-datum z-concept (`generator.bar()` included) writes the *same*
 * `position.z` for every datum. That's harmless while members stay in their
 * own rows/lanes, but the moment two members' other axes cross — during a
 * `.transition()`-driven position swap, for instance — their geometry
 * genuinely intersects in 3D, and because their z-depth is identical, their
 * front/back faces become perfectly coplanar. A GPU depth buffer can't
 * reliably resolve which coplanar surface is nearer, so it flickers
 * (z-fighting) exactly where the two objects cross — the "glitch" a bar
 * chart race shows without this.
 *
 * Deterministic and stateless: offsets are derived by sorting the resolved
 * keys, not by call order, so the same *set* of keys always produces the
 * same key→offset mapping regardless of the array order `selection.data()`
 * happens to return at call time.
 *
 * **Call this once**, any time after the selection's identities are known
 * (e.g. right after a chart's first `render()`) — the offset is a stable
 * per-identity constant, not something that needs recomputing on every
 * subsequent `update()` as long as the same members persist across
 * re-joins. Calling it a second time on the same selection stacks a second
 * offset on top of the first (it writes via a relative `translate`, since
 * there's no generic way to know what a member's "un-jittered" z was for
 * an arbitrary chart type) — call it once, not per-frame or per-`update()`.
 *
 * @param {{backend: *, data: () => Array}} selection Anything exposing
 *   `.backend` (`{type:'meshes', meshes: GraphMesh[]}` or
 *   `{type:'instanced', object: GraphInstancedObject, indices: Uint32Array}`)
 *   and `.data()` — duck-typed so a real `compose/selection` `Selection`
 *   (e.g. `chart.selection()`) works directly, with no import from
 *   `object/` back into `compose/` (CLAUDE.md §1.4 — `object/` only ever
 *   reads the same backend *shape* `compose/selection` also uses, it never
 *   imports the `Selection` class itself).
 * @param {(datum: *, index: number) => *} keyFn Resolves each member's
 *   stable identity — same convention as a chart's join `keyFn`.
 * @param {{spacing?: number}} [options]
 * @param {number} [options.spacing=0.02] World-unit gap between adjacent
 *   assigned offsets.
 * @returns {Map<*, number>} Each resolved key's assigned z-offset (useful for tests/inspection).
 * @throws {TypeError} If `selection` doesn't expose `.backend`/`.data()`,
 *   `keyFn` isn't a function, `options.spacing` isn't a positive number, or
 *   `selection.backend.type` isn't `'meshes'`/`'instanced'`.
 * @example
 * chart.render();
 * assignDepthJitter(chart.selection(), (d) => d.name);
 */
export function assignDepthJitter(selection, keyFn, options = {}) {
  if (!selection || typeof selection.data !== 'function' || !selection.backend) {
    throw new TypeError('assignDepthJitter: selection must expose .backend and a data() method (e.g. chart.selection()).');
  }
  if (typeof keyFn !== 'function') {
    throw new TypeError(`assignDepthJitter: keyFn must be a function, received ${JSON.stringify(keyFn)}.`);
  }
  const spacing = options.spacing ?? DEFAULT_SPACING;
  if (typeof spacing !== 'number' || !(spacing > 0)) {
    throw new TypeError(`assignDepthJitter: options.spacing must be a positive number, received ${JSON.stringify(spacing)}.`);
  }

  const data = selection.data();
  const keys = data.map((d, i) => keyFn(d, i));
  const offsetByKey = offsetsForKeys(keys, spacing);

  applyOffsets(selection.backend, keys, offsetByKey);
  return offsetByKey;
}
