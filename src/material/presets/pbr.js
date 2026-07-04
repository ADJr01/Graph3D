import * as THREE from 'three';
import { assertPlainOptions } from '../validate.js';

/**
 * Physically-based material with roughness/metalness workflow — the
 * general-purpose default for most charts. A thin, validated wrapper over
 * `THREE.MeshStandardMaterial`; every constructor option (`color`,
 * `roughness`, `metalness`, `map`, ...) passes straight through.
 * @param {THREE.MeshStandardMaterialParameters} [options]
 * @returns {THREE.MeshStandardMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @example material.standard({ color: '#3b82f6', roughness: 0.4, metalness: 0.1 });
 */
export function standard(options = {}) {
  assertPlainOptions('material.standard', options);
  return new THREE.MeshStandardMaterial(options);
}

/**
 * Extended PBR material adding clearcoat, transmission, sheen, and
 * iridescence over `standard`'s roughness/metalness workflow. A thin,
 * validated wrapper over `THREE.MeshPhysicalMaterial`.
 * @param {THREE.MeshPhysicalMaterialParameters} [options]
 * @returns {THREE.MeshPhysicalMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @example material.physical({ color: '#e5e7eb', clearcoat: 1, clearcoatRoughness: 0.1 });
 */
export function physical(options = {}) {
  assertPlainOptions('material.physical', options);
  return new THREE.MeshPhysicalMaterial(options);
}

/**
 * Unlit flat-color material — no lighting response, cheapest to render. A
 * thin, validated wrapper over `THREE.MeshBasicMaterial`.
 * @param {THREE.MeshBasicMaterialParameters} [options]
 * @returns {THREE.MeshBasicMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @example material.basic({ color: '#f59e0b', wireframe: true });
 */
export function basic(options = {}) {
  assertPlainOptions('material.basic', options);
  return new THREE.MeshBasicMaterial(options);
}

/**
 * Lambertian (diffuse-only) lit material — no specular highlight, cheaper
 * than `phong`/`standard`. A thin, validated wrapper over
 * `THREE.MeshLambertMaterial`.
 * @param {THREE.MeshLambertMaterialParameters} [options]
 * @returns {THREE.MeshLambertMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @example material.lambert({ color: '#22c55e' });
 */
export function lambert(options = {}) {
  assertPlainOptions('material.lambert', options);
  return new THREE.MeshLambertMaterial(options);
}

/**
 * Blinn-Phong lit material with a specular highlight, non-physically-based.
 * A thin, validated wrapper over `THREE.MeshPhongMaterial`.
 * @param {THREE.MeshPhongMaterialParameters} [options]
 * @returns {THREE.MeshPhongMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @example material.phong({ color: '#ef4444', shininess: 80 });
 */
export function phong(options = {}) {
  assertPlainOptions('material.phong', options);
  return new THREE.MeshPhongMaterial(options);
}

/**
 * Cel/toon-shaded material — banded lighting via an optional `gradientMap`.
 * A thin, validated wrapper over `THREE.MeshToonMaterial`.
 * @param {THREE.MeshToonMaterialParameters} [options]
 * @returns {THREE.MeshToonMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @example material.toon({ color: '#a855f7', gradientMap: threeToneTexture });
 */
export function toon(options = {}) {
  assertPlainOptions('material.toon', options);
  return new THREE.MeshToonMaterial(options);
}

/**
 * Matcap-lit material — lighting baked entirely into a single sphere texture,
 * no scene lights required. A thin, validated wrapper over
 * `THREE.MeshMatcapMaterial`.
 * @param {THREE.MeshMatcapMaterialParameters} [options]
 * @returns {THREE.MeshMatcapMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @example material.matcap({ matcap: matcapTexture });
 */
export function matcap(options = {}) {
  assertPlainOptions('material.matcap', options);
  return new THREE.MeshMatcapMaterial(options);
}
