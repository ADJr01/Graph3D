import { buildMetalPreset } from './metal.js';

/**
 * Polished gold look: `color` matches gold's well-known real-world F0
 * reflectance (~`(1.0, 0.766, 0.336)` in the Filament/Unreal PBR reference
 * charts), with a satin (not mirror) `roughness`. Tuned against the default
 * `'studio-1k'` HDR (`GraphSceneThemes`'s `studio-light`/`studio-dark`
 * themes) — pair with an HDR environment for this to look right.
 * @param {THREE.MeshStandardMaterialParameters} [options]
 * @returns {THREE.MeshStandardMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @example material.gold({ roughness: 0.1 });
 */
export function gold(options = {}) {
  return buildMetalPreset('material.gold', { color: '#ffc358', roughness: 0.2 }, options);
}
