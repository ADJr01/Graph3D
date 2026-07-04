import * as THREE from 'three';
import { assertPlainOptions } from '../validate.js';

/**
 * Shared builder for the metallic presets (`liquidMercury`, `chrome`, `gold`,
 * `copper`) — each is `metalness: 1` plus a physically-plausible base
 * `color`/`roughness` pair; everything else is left to
 * `THREE.MeshStandardMaterial`'s own defaults. Extracted so the four don't
 * each reimplement "validate options, spread defaults, spread overrides,
 * force metalness: 1" (CLAUDE.md §1.1 DRY).
 * @param {string} callerName - e.g. `'material.chrome'`, for error messages.
 * @param {{ color: string, roughness: number }} defaults - This preset's base look.
 * @param {THREE.MeshStandardMaterialParameters} options - Caller-supplied overrides.
 * @returns {THREE.MeshStandardMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 */
export function buildMetalPreset(callerName, defaults, options) {
  assertPlainOptions(callerName, options);
  return new THREE.MeshStandardMaterial({ metalness: 1, ...defaults, ...options });
}
