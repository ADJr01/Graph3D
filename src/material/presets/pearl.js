import * as THREE from 'three';
import { assertPlainOptions } from '../validate.js';

/**
 * Lustrous pearl look: a non-metallic (`metalness: 0`) base with a glossy
 * `clearcoat` layer and soft thin-film `iridescence` for the characteristic
 * nacre sheen. A thin, validated wrapper over `THREE.MeshPhysicalMaterial`.
 * Tuned against the default `'studio-1k'` HDR (`GraphSceneThemes`'s
 * `studio-light`/`studio-dark` themes) — pair with an HDR environment for
 * the clearcoat/iridescence reflections to read correctly.
 * @param {THREE.MeshPhysicalMaterialParameters} [options]
 * @returns {THREE.MeshPhysicalMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @example material.pearl({ color: '#fbeee0' });
 */
export function pearl(options = {}) {
  assertPlainOptions('material.pearl', options);
  return new THREE.MeshPhysicalMaterial({
    color: '#f7f1e6',
    metalness: 0,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.15,
    iridescence: 0.6,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [200, 500],
    ...options,
  });
}
