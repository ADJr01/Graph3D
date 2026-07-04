import * as THREE from 'three';
import { assertPlainOptions } from '../validate.js';

/**
 * Shared physically-based glass defaults: `transmission` for real light
 * pass-through (needs the renderer's transmission render target — see
 * THREE's own `MeshPhysicalMaterial` docs) and `iridescence` for the
 * thin-film soap-bubble sheen the prompt calls out. `glass()`/`frostedGlass()`
 * both build on this so the two stay in sync (CLAUDE.md §1.1 DRY).
 * @type {THREE.MeshPhysicalMaterialParameters}
 */
const BASE_GLASS_DEFAULTS = Object.freeze({
  color: '#ffffff',
  metalness: 0,
  roughness: 0.05,
  transmission: 1,
  ior: 1.5,
  thickness: 0.5,
  iridescence: 1,
  iridescenceIOR: 1.3,
  iridescenceThicknessRange: [100, 400],
  transparent: true,
});

/**
 * Clear physical glass: `THREE.MeshPhysicalMaterial` tuned for real
 * transmission (light passing through, not just alpha blending) plus
 * thin-film iridescence. A thin, validated wrapper — every constructor
 * option overrides these defaults.
 * @param {THREE.MeshPhysicalMaterialParameters} [options]
 * @returns {THREE.MeshPhysicalMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @example material.glass({ color: '#dbeafe', ior: 1.52 });
 */
export function glass(options = {}) {
  assertPlainOptions('material.glass', options);
  return new THREE.MeshPhysicalMaterial({ ...BASE_GLASS_DEFAULTS, ...options });
}

/**
 * Frosted physical glass: the same thin-film transmission workflow as
 * `glass()`, but with higher `roughness` and slightly reduced `transmission`
 * so THREE's transmission pass renders the characteristic soft, blurred
 * frosted-glass look instead of a clear one.
 * @param {THREE.MeshPhysicalMaterialParameters} [options]
 * @returns {THREE.MeshPhysicalMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @example material.frostedGlass({ color: '#f1f5f9' });
 */
export function frostedGlass(options = {}) {
  assertPlainOptions('material.frostedGlass', options);
  return new THREE.MeshPhysicalMaterial({
    ...BASE_GLASS_DEFAULTS,
    roughness: 0.55,
    transmission: 0.9,
    ...options,
  });
}
