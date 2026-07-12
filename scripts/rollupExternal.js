/**
 * Shared `external` predicate for every Rollup build of this library
 * (rollup.config.js, scripts/bundle-budget.js): `three` itself and its
 * `three/examples/jsm/...` submodules (dynamically imported by
 * GraphObjectLoader for DRACO/KTX2/GLTF/OBJ/FBX loading) are all peer-relied
 * THREE.js code — bundling them in would duplicate THREE for consumers and
 * defeat GraphObjectLoader's lazy-load code-splitting.
 * @param {string} id
 * @returns {boolean}
 */
export function isThreeImport(id) {
  return id === 'three' || id.startsWith('three/');
}
