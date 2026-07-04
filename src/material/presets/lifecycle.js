/**
 * Reassigns `material.dispose` to run `cleanup()` before the material's own
 * original `dispose()` — the shared pattern behind `neon`'s pulse-loop
 * cleanup and `dataDriven`'s internally-created palette-texture cleanup
 * (CLAUDE.md §1.1 DRY two-strike rule: extracted on the second occurrence,
 * per the revisit note left in `skipping_list.md` when the first one shipped).
 *
 * Ordinary object composition (reassigning one instance property), not a
 * subclass — CLAUDE.md §1.2 KISS caps inheritance in this codebase at
 * exactly two lines, neither of which is `THREE.Material`. Callers that keep
 * calling `material.dispose()` as normal (the existing `disposeMaterial()`/
 * `GraphMesh.dispose()` path) get the extra cleanup for free.
 * @param {THREE.Material} material
 * @param {() => void} cleanup
 * @returns {THREE.Material} `material`, mutated in place, returned for convenience.
 * @example
 * const texture = buildSomeTexture();
 * wrapDisposeWithCleanup(material, () => texture.dispose());
 */
export function wrapDisposeWithCleanup(material, cleanup) {
  const originalDispose = material.dispose.bind(material);
  material.dispose = () => {
    cleanup();
    originalDispose();
  };
  return material;
}
