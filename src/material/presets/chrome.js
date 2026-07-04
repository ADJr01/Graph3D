import { buildMetalPreset } from './metal.js';

/**
 * Classic mirror-chrome look: near-zero roughness, a very slightly cool
 * neutral color (aluminum's real-world reflectance is close to neutral gray
 * with a faint blue tint). Tuned against the default `'studio-1k'` HDR
 * (`GraphSceneThemes`'s `studio-light`/`studio-dark` themes) — pair with an
 * HDR environment for this to look right.
 * @param {THREE.MeshStandardMaterialParameters} [options]
 * @returns {THREE.MeshStandardMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @example material.chrome({ roughness: 0.1 });
 */
export function chrome(options = {}) {
  return buildMetalPreset('material.chrome', { color: '#e9ebec', roughness: 0.05 }, options);
}
