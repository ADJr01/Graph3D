import * as THREE from 'three';
import { assertPlainOptions } from '../validate.js';

/**
 * Soft fabric look (velvet/satin): `THREE.MeshPhysicalMaterial`'s `sheen`
 * workflow (`sheen`, `sheenRoughness`, `sheenColor`) — designed specifically
 * for cloth-like materials — combined with high base `roughness` and zero
 * `metalness` so the surface reads as matte plush rather than shiny plastic.
 * A thin, validated wrapper; every constructor option overrides these
 * defaults.
 * @param {THREE.MeshPhysicalMaterialParameters} [options]
 * @returns {THREE.MeshPhysicalMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @example material.velvet({ color: '#7c1d3f', sheenColor: '#ff9ecb' });
 */
export function velvet(options = {}) {
  assertPlainOptions('material.velvet', options);
  return new THREE.MeshPhysicalMaterial({
    color: '#5a1f3d',
    metalness: 0,
    roughness: 0.85,
    sheen: 1,
    sheenRoughness: 0.6,
    sheenColor: '#b06a8f',
    ...options,
  });
}
