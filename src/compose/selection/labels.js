import { accessor } from '../generator/index.js';
// Sanctioned compose/ -> material/ crossing (CLAUDE.md §1.4's compose/ row) —
// the same direction Axis.js/annotation/label.js already use for SDFText/
// graphHTML directly.
import { label } from '../../material/label/index.js';

// The instanced backend has no per-instance auxiliary storage slot — unlike
// GraphMesh's namespaced userData.graph3d (setUserData/getUserData), a
// GraphInstancedObject's setInstanceUserData(i, datum)/getInstanceUserData(i)
// is a single opaque slot already holding the bound datum itself. A
// self-contained side-table here (rather than extending object/ with a
// second slot) keeps this additive — no changes to already-tested object/ or
// Selection/join.js code.
/** @type {WeakMap<object, Map<number, import('../../material/label/Label.js').Label>>} */
const instancedLabelStore = new WeakMap();

// Every synced label needs a unique scene-registry name; syncLabels() itself
// takes none (matching graphHTML's identical fallbackLabelId convention).
let labelSyncId = 0;

/** @param {*} backend @param {number} localIndex @returns {import('three').Scene} */
function sceneOf(backend, localIndex) {
  return backend.type === 'meshes' ? backend.meshes[localIndex].three.parent : backend.object.three.parent;
}

/** @param {*} backend @param {number} localIndex @returns {{x:number,y:number,z:number}} */
function positionOf(backend, localIndex) {
  return backend.type === 'meshes'
    ? backend.meshes[localIndex].getPosition()
    : backend.object.getInstancePosition(backend.indices[localIndex]);
}

/** @param {*} backend @param {number} localIndex @returns {import('../../material/label/Label.js').Label|undefined} */
function existingLabel(backend, localIndex) {
  if (backend.type === 'meshes') return backend.meshes[localIndex].getUserData('label');
  return instancedLabelStore.get(backend.object)?.get(backend.indices[localIndex]);
}

/** @param {*} backend @param {number} localIndex @param {import('../../material/label/Label.js').Label} l */
function storeLabel(backend, localIndex, l) {
  if (backend.type === 'meshes') {
    backend.meshes[localIndex].setUserData('label', l);
    return;
  }
  let perObject = instancedLabelStore.get(backend.object);
  if (!perObject) {
    perObject = new Map();
    instancedLabelStore.set(backend.object, perObject);
  }
  perObject.set(backend.indices[localIndex], l);
}

/** @param {*} backend @param {number} localIndex */
function clearLabel(backend, localIndex) {
  if (backend.type === 'meshes') {
    backend.meshes[localIndex].setUserData('label', undefined);
    return;
  }
  instancedLabelStore.get(backend.object)?.delete(backend.indices[localIndex]);
}

/**
 * Reusable `Selection.call()` behavior (improvement.md initiative (c), PR 5):
 * creates or updates one `Label` per member of `selection`, positioned at
 * that member's own current position (plus `options.offset`, if given).
 * Designed to be called from the same enter/update callbacks a chart's own
 * `.attr()`/`.style()` calls already run in — see `Selection.join()`'s
 * example — so labels naturally track entering/updating members without a
 * second, independent join. Exiting members are **not** handled here; call
 * `removeLabels` from the exit callback, before `.remove()`.
 *
 * Each member's `Label` persists across calls (via `GraphMesh`'s namespaced
 * userData on the meshes backend, or a self-contained side-table on the
 * instanced backend — see `instancedLabelStore`'s own note), so repeat calls
 * update the *same* label's text/position in place (a cheap rebuild only
 * when `textFn`'s resolved value actually changes) rather than
 * disposing and recreating it.
 * @param {import('./Selection.js').Selection} selection
 * @param {string|((datum: *, index: number) => string)} textFn
 * @param {{
 *   font?: object,
 *   anchor?: ('center'|'start'),
 *   billboard?: (import('three').Camera|null),
 *   offset?: {x?: number, y?: number, z?: number},
 * }} [options] `font`/`anchor`/`billboard` are applied once, at each label's
 *   creation only (not re-applied on update, to avoid rebuilding every
 *   member's geometry on every call for options that didn't change) —
 *   except `billboard`, which is cheap to re-apply and so is kept in sync
 *   every call. `offset` defaults to `{x:0,y:0,z:0}` (label at the member's
 *   exact position).
 * @returns {import('./Selection.js').Selection} `selection`, unchanged — for `.call()` chaining.
 * @example
 * function layoutBars(selection) {
 *   selection
 *     .attr('position.x', (d) => x(d.id) + x.bandwidth() / 2)
 *     .attr('position.y', (d) => y(d.value) / 2)
 *     .call(syncLabels, (d) => `${d.value}%`, { anchor: 'center', offset: { y: 0.3 } });
 * }
 */
export function syncLabels(selection, textFn, options = {}) {
  const { font, anchor = 'center', billboard = null, offset = { x: 0, y: 0, z: 0 } } = options;
  const resolveText = accessor(textFn);
  const { backend } = selection;
  const size = selection.size();

  for (let i = 0; i < size; i++) {
    const text = resolveText(selection.datum(i), i);
    const p = positionOf(backend, i);
    const position = { x: p.x + (offset.x ?? 0), y: p.y + (offset.y ?? 0), z: p.z + (offset.z ?? 0) };

    let l = existingLabel(backend, i);
    if (l === undefined) {
      l = label().anchor(anchor);
      if (font) l.font(font);
      l.billboard(billboard).text(text).position(position).render(sceneOf(backend, i), `label_sync_${labelSyncId++}`);
      storeLabel(backend, i, l);
    } else {
      l.billboard(billboard).text(text).position(position);
    }
  }
  return selection;
}

/**
 * Reusable `Selection.call()` behavior, the exit-side counterpart to
 * `syncLabels`: disposes every label attached to `selection`'s members
 * (a no-op for any member `syncLabels` was never called on). Call from an
 * exit callback, before `.remove()` frees the underlying nodes — the label
 * side-table entries key off the same identity `.remove()` invalidates
 * (a `GraphMesh` reference, or a `GraphInstancedObject` raw index that
 * `.remove()`'s own `freeSlots` may recycle for a future, unrelated datum).
 * @param {import('./Selection.js').Selection} selection
 * @returns {import('./Selection.js').Selection} `selection`, unchanged — for `.call()` chaining.
 * @example exited.call(removeLabels).remove();
 */
export function removeLabels(selection) {
  const { backend } = selection;
  const size = selection.size();
  for (let i = 0; i < size; i++) {
    const l = existingLabel(backend, i);
    if (l === undefined) continue;
    l.dispose();
    clearLabel(backend, i);
  }
  return selection;
}
