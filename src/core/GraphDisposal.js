import * as THREE from 'three';

/**
 * Disposes a material and all THREE.Texture values it references.
 * Handles both single materials and arrays of materials.
 *
 * Lives in `core/` (not `scene/`, where it originated) because both
 * `object/` (`GraphMesh`, `GraphInstancedObject`) and `scene/` (`GraphScene`
 * itself) need it, and `object/` importing `scene/` would cycle back once
 * `scene/` needs to import `compose/selection` too (`GraphScene.selectAll`,
 * Prompt 81) — `compose/selection` already depends on `object/`. `core/` is
 * beneath both, so this is the only cycle-free home.
 * @param {THREE.Material|THREE.Material[]} material
 */
export function disposeMaterial(material) {
  if (Array.isArray(material)) {
    for (const m of material) disposeMaterial(m);
    return;
  }
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  material.dispose();
}

/**
 * Walks an Object3D subtree and disposes every geometry/material reachable
 * from it. Shared by `GraphScene.dispose()` (the whole-scene safety net) and
 * any object wrapper whose own `dispose()` needs to release a multi-mesh
 * hierarchy it doesn't otherwise track piece by piece (e.g. a loaded model).
 * @param {THREE.Object3D} object3D
 */
export function disposeObjectTree(object3D) {
  object3D.traverse((object) => {
    if (object.geometry) {
      object.geometry.dispose();
    }
    if (object.material) {
      disposeMaterial(object.material);
    }
  });
}
