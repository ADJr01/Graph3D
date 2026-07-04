import { buildMetalPreset } from './metal.js';

/**
 * Brushed copper look: `color` matches copper's well-known real-world F0
 * reflectance (~`(0.955, 0.638, 0.538)` in the Filament/Unreal PBR reference
 * charts), with a slightly brushed (not mirror) `roughness`. Tuned against
 * the default `'studio-1k'` HDR (`GraphSceneThemes`'s `studio-light`/
 * `studio-dark` themes) — pair with an HDR environment for this to look
 * right.
 * @param {THREE.MeshStandardMaterialParameters} [options]
 * @returns {THREE.MeshStandardMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @example material.copper({ roughness: 0.35 });
 */
export function copper(options = {}) {
  return buildMetalPreset('material.copper', { color: '#f3a389', roughness: 0.25 }, options);
}
