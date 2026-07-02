/**
 * Per-scene registry of live object wrappers (`GraphObject` and its
 * subclasses), keyed by name. Lives in `scene/` rather than `object/` because
 * `GraphScene.selectByName`/`selectInstance` (this registry's only readers)
 * must not import concrete wrapper types from `object/` — a higher layer per
 * `CLAUDE.md` §1.4. `object/`'s `GraphObject` base class calls the
 * register/unregister functions on construction/dispose instead of keeping
 * its own registry, since importing *down* into `scene/` is the allowed
 * direction.
 * @type {WeakMap<THREE.Scene, Map<string, *[]>>}
 */
const registries = new WeakMap();

/** @param {THREE.Scene} scene @returns {Map<string, *[]>} */
function registryFor(scene) {
  let registry = registries.get(scene);
  if (!registry) {
    registry = new Map();
    registries.set(scene, registry);
  }
  return registry;
}

/**
 * Register an object wrapper under `name` for `scene`.
 * @param {THREE.Scene} scene
 * @param {string} name
 * @param {*} object
 */
export function registerSceneObject(scene, name, object) {
  const registry = registryFor(scene);
  const group = registry.get(name);
  if (group) group.push(object);
  else registry.set(name, [object]);
}

/**
 * Unregister a previously registered object wrapper. No-op if not found.
 * @param {THREE.Scene} scene
 * @param {string} name
 * @param {*} object
 */
export function unregisterSceneObject(scene, name, object) {
  const registry = registries.get(scene);
  const group = registry?.get(name);
  if (!group) return;
  const index = group.indexOf(object);
  if (index !== -1) group.splice(index, 1);
  if (group.length === 0) registry.delete(name);
}

/**
 * Look up every object wrapper registered under `name` for `scene`.
 * @param {THREE.Scene} scene
 * @param {string} name
 * @returns {*[]} A fresh array — safe for callers to mutate.
 */
export function getSceneObjectsByName(scene, name) {
  return registries.get(scene)?.get(name)?.slice() ?? [];
}
