import * as THREE from 'three';

/**
 * Per-texture reference counts, for callers that knowingly share one
 * `THREE.Texture` across multiple materials (e.g. `material.crystal`'s
 * `envMap`, reused across many bars' materials — Phase 6, Prompt 111). A
 * texture never explicitly `retainTexture()`-d is absent from this map, so
 * `releaseTexture()` disposes it immediately on its first release —
 * identical to `disposeMaterial()`'s pre-Prompt-111 unconditional behavior,
 * preserved as the default for the overwhelming majority of textures that
 * aren't knowingly shared.
 * @type {WeakMap<THREE.Texture, number>}
 */
const textureRefCounts = new WeakMap();

/**
 * Mark a texture as having an additional consumer — call before that
 * consumer starts using a texture that might also be in use elsewhere, so a
 * later `disposeMaterial()`/`releaseTexture()` call from a *different*
 * consumer doesn't free it out from under this one. Every `retainTexture()`
 * must be balanced by exactly one later `releaseTexture()` (directly, or
 * via `disposeMaterial()`, which calls it for every texture a disposed
 * material references).
 * @param {THREE.Texture} texture
 * @example retainTexture(sharedEnvMap); // before assigning it to a second material
 */
export function retainTexture(texture) {
  // Base case is 1, not 0: a texture with no map entry yet has exactly one
  // implicit owner (whoever holds the only reference right now) — the first
  // retainTexture() call records that a *second* owner has shown up, so two
  // releaseTexture() calls (not one) are required before it actually disposes.
  textureRefCounts.set(texture, (textureRefCounts.get(texture) ?? 1) + 1);
}

/**
 * Release one reference to a texture, disposing it only once every
 * `retainTexture()` call on it has been matched. A texture with no
 * outstanding `retainTexture()` calls disposes immediately.
 * @param {THREE.Texture} texture
 * @example releaseTexture(oldEnvMap); // when this consumer stops using it
 */
export function releaseTexture(texture) {
  const count = textureRefCounts.get(texture);
  if (count === undefined || count <= 1) {
    textureRefCounts.delete(texture);
    texture.dispose();
    return;
  }
  textureRefCounts.set(texture, count - 1);
}

/**
 * Disposes a material and releases (ref-count-aware, see `releaseTexture`)
 * every `THREE.Texture` value it references. Handles both single materials
 * and arrays of materials.
 *
 * Lives in `core/` (not `scene/`, where it originated) because both
 * `object/` (`GraphMesh`, `GraphInstancedObject`) and `scene/` (`GraphScene`
 * itself) need it, and `object/` importing `scene/` would cycle back once
 * `scene/` needs to import `compose/selection` too (`GraphScene.selectAll`,
 * Prompt 81) — `compose/selection` already depends on `object/`. `core/` is
 * beneath both, so this is the only cycle-free home — and, since Prompt 111,
 * the only place both `core/`'s own callers and `material/GraphObjectMaterial`
 * (a higher layer, importing `core/` downward as usual) can share the exact
 * same ref-count registry without either layer reaching upward.
 * @param {THREE.Material|THREE.Material[]} material
 */
export function disposeMaterial(material) {
  if (Array.isArray(material)) {
    for (const m of material) disposeMaterial(m);
    return;
  }
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) releaseTexture(value);
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
