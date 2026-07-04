import { buildMetalPreset } from './metal.js';

/**
 * Liquid-metal look: near-zero roughness, neutral silvery color — a
 * mirror-flat metal that reads as "liquid" purely from how close to a
 * perfect specular reflector it is (matching real mercury's actual
 * appearance), not from any procedural ripple/displacement. Tuned against
 * the default `'studio-1k'` HDR (`GraphSceneThemes`'s `studio-light`/
 * `studio-dark` themes) — metals derive their entire look from environment
 * reflection, so pair with an HDR environment for this to look right.
 * @param {THREE.MeshStandardMaterialParameters} [options]
 * @returns {THREE.MeshStandardMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @example material.liquidMercury({ roughness: 0.04 });
 */
export function liquidMercury(options = {}) {
  return buildMetalPreset('material.liquidMercury', { color: '#d8dbe0', roughness: 0.02 }, options);
}
