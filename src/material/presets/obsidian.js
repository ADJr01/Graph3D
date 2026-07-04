import * as THREE from 'three';
import { assertPlainOptions } from '../validate.js';

/**
 * Volcanic-glass look: obsidian is glass, not metal (`metalness: 0`), but
 * opaque and near-black — a glossy `clearcoat` over a very dark base gives
 * the characteristic glassy-black sheen without needing real `transmission`
 * (real obsidian doesn't let light through). A thin, validated wrapper over
 * `THREE.MeshPhysicalMaterial`. Tuned against the default `'studio-1k'` HDR
 * (`GraphSceneThemes`'s `studio-light`/`studio-dark` themes) — pair with an
 * HDR environment for the clearcoat reflections to read correctly.
 * @param {THREE.MeshPhysicalMaterialParameters} [options]
 * @returns {THREE.MeshPhysicalMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @example material.obsidian({ clearcoatRoughness: 0.1 });
 */
export function obsidian(options = {}) {
  assertPlainOptions('material.obsidian', options);
  return new THREE.MeshPhysicalMaterial({
    color: '#0a0a0c',
    metalness: 0,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    ior: 1.5,
    ...options,
  });
}
