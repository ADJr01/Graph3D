import { GraphObjectFactory } from '../../object/index.js';
import { diffData } from './diff.js';
import { backendForIndices } from './combinators.js';
import { allocateSlots, freeSlots } from './slotAllocator.js';

/** @param {{ type: 'meshes', meshes: object[] }|{ type: 'instanced', object: object, indices: Uint32Array }} backend @param {number} localIndex @param {*} datum */
function rebindDatum(backend, localIndex, datum) {
  if (backend.type === 'meshes') {
    backend.meshes[localIndex].setUserData('datum', datum);
  } else {
    backend.object.setInstanceUserData(backend.indices[localIndex], datum);
  }
}

/**
 * Computes `Selection.data(newData, keyFn)` (Prompt 78): diffs `backend`'s
 * currently bound data against `newData` via `diffData` (the single diff
 * authority, `diff.js`), rebinds every matched member's datum in place (a
 * join's defining trait — same node, new data), and slices `backend` into
 * an update-only backend descriptor aligned to `newData`'s order. Entering/
 * exiting members aren't materialized here — see `materializeEnter`/
 * `removeBackend`, called lazily by `JoinResult` (`Selection.js`).
 * @param {*} backend
 * @param {number} size
 * @param {(index: number) => *} datumAt
 * @param {*[]} newData
 * @param {(datum: *, index: number) => *} [keyFn]
 * @returns {{ updateBackend: *, enterEntries: {datum:*, newIndex:number}[], exitBackend: * }}
 */
export function computeJoin(backend, size, datumAt, newData, keyFn) {
  if (!Array.isArray(newData)) {
    throw new TypeError(`Selection.data: newData must be an array, received ${JSON.stringify(newData)}.`);
  }

  const oldData = new Array(size);
  for (let i = 0; i < size; i++) oldData[i] = datumAt(i);

  const { enter, update, exit } = diffData(oldData, newData, keyFn);

  for (const { datum, oldIndex } of update) rebindDatum(backend, oldIndex, datum);

  const updateBackend = backendForIndices(backend, update.map((e) => e.oldIndex));
  if (backend.type === 'meshes' && backend.template) updateBackend.template = backend.template;

  const exitBackend = backendForIndices(backend, exit.map((e) => e.oldIndex));

  return { updateBackend, enterEntries: enter, exitBackend };
}

/**
 * Materializes an `enter()` selection (Prompt 79): allocates real instance
 * slots (instanced backend, recycling freed ones via `slotAllocator` before
 * growing capacity) or creates real `GraphMesh`es via `GraphObjectFactory`
 * (meshes backend), binding each entering datum as it goes.
 * @param {{datum:*, newIndex:number}[]} enterEntries
 * @param {*} backend The update backend from `computeJoin` — carries `object`
 *   (instanced) or `template` (meshes, if the Selection was constructed with one).
 * @returns {*} A new backend descriptor for the entered members.
 * @throws {Error} If `backend` is a meshes backend with no `template` and
 *   `enterEntries` is non-empty.
 */
export function materializeEnter(enterEntries, backend) {
  if (backend.type === 'meshes') {
    if (enterEntries.length === 0) return { type: 'meshes', meshes: [] };
    if (!backend.template) {
      throw new Error(
        "Selection.join: entering new meshes requires the Selection to carry a mesh template " +
          "({ scene, name, geometry, material }) — construct it with one, or join into an instanced backend instead.",
      );
    }
    const meshes = enterEntries.map(({ datum }) => {
      const mesh = createMeshFromTemplate(backend.template);
      mesh.setUserData('datum', datum);
      return mesh;
    });
    return { type: 'meshes', meshes };
  }

  const { object } = backend;
  if (enterEntries.length === 0) return { type: 'instanced', object, indices: new Uint32Array(0) };
  const indices = allocateSlots(object, enterEntries.length);
  for (let i = 0; i < enterEntries.length; i++) object.setInstanceUserData(indices[i], enterEntries[i].datum);
  return { type: 'instanced', object, indices };
}

/**
 * Permanently removes every member of `backend` (Prompt 79) — disposes each
 * `GraphMesh`, or frees each instance index back to the join system's
 * free-list for a future `materializeEnter` to recycle.
 * @param {*} backend
 */
export function removeBackend(backend) {
  if (backend.type === 'meshes') {
    for (const mesh of backend.meshes) mesh.dispose();
    return;
  }
  freeSlots(backend.object, backend.indices);
}

// ponytail: process-wide counter for entered-mesh name suffixes — names only
// need to be unique within a scene's registry key (GraphObject enforces
// nothing stronger), so a monotonic counter is enough; not reset per scene.
let enteredMeshSequence = 0;

/** @param {{ scene: object, name: string, geometry: object, material: object|object[] }} template @returns {object} */
function createMeshFromTemplate(template) {
  return GraphObjectFactory.createMesh(`${template.name}_${enteredMeshSequence++}`, {
    scene: template.scene,
    geometry: template.geometry,
    material: template.material,
  });
}
