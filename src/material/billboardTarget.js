import * as THREE from 'three';
import { GraphMesh } from '../object/GraphMesh.js';
import { GraphInstancedObject } from '../object/GraphInstancedObject.js';

/**
 * Shared by every `material/` billboard utility that attaches a plane to a
 * chart object (`text/GraphHTML.js`, `icon/GraphIcon.js`): target resolution,
 * a positive-finite-number guard, and a textured-plane builder. Extracted
 * once `graphIcon` needed the exact same three helpers `graphHTML` already
 * had (CLAUDE.md §1.1 DRY's two-strike rule) — behavior is unchanged from
 * `graphHTML`'s original private copies.
 */

/** @param {string} name @param {*} value @throws {TypeError} */
export function assertPositiveFiniteNumber(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number, received ${JSON.stringify(value)}.`);
  }
}

/**
 * Resolves a billboard target down to a world-space position plus the
 * `THREE.Scene` its rendered mesh should join.
 * @param {GraphMesh|{object: GraphInstancedObject, index: number}|{scene: THREE.Scene, position: {x:number,y:number,z:number}}} target
 * @returns {{ position: THREE.Vector3, scene: THREE.Scene }}
 * @throws {TypeError} If `target` doesn't match any recognized shape, or resolves to no scene.
 */
export function resolveBillboardTarget(target) {
  let position;
  let scene;
  if (target instanceof GraphMesh) {
    position = target.three.getWorldPosition(new THREE.Vector3());
    scene = target.three.parent;
  } else if (target && target.object instanceof GraphInstancedObject && Number.isInteger(target.index)) {
    const local = target.object.getInstancePosition(target.index);
    position = target.object.three.localToWorld(new THREE.Vector3(local.x, local.y, local.z));
    scene = target.object.three.parent;
  } else if (target && target.scene instanceof THREE.Scene && target.position) {
    const p = target.position;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
      throw new TypeError(`target.position must be a finite {x,y,z}, received ${JSON.stringify(p)}.`);
    }
    position = new THREE.Vector3(p.x, p.y, p.z);
    scene = target.scene;
  } else {
    throw new TypeError(
      `target must be a GraphMesh, { object: GraphInstancedObject, index }, or ` +
        `{ scene, position }, received ${JSON.stringify(target)}.`,
    );
  }
  if (!(scene instanceof THREE.Scene)) {
    throw new TypeError('target resolves to no THREE.Scene — has it been added to a scene yet?');
  }
  return { position, scene };
}

/**
 * Builds a billboard mesh: a `THREE.PlaneGeometry` textured with `texture`,
 * transparent, unlit.
 * @param {THREE.Texture} texture @param {number} width @param {number} height
 * @returns {THREE.Mesh}
 */
export function buildTexturedPlane(texture, width, height) {
  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  return new THREE.Mesh(geometry, material);
}
