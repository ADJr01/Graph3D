import { assertPlainOptions, assertFiniteNumber } from './validate.js';
import { GraphMesh } from '../object/GraphMesh.js';

/** @param {string} name @param {*} value @throws {TypeError} */
function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`material.addPlanarReflection: ${name} must be a positive integer, received ${JSON.stringify(value)}.`);
  }
}

/**
 * Turns an existing flat `GraphMesh` (e.g. a floor/water plane) into a live
 * mirror: a real-time reflection of the current camera view, updated every
 * frame automatically (THREE's own `onBeforeRender` hook — no `loop`/RAF
 * wiring needed on this library's side).
 *
 * Dynamically imports `three/examples/jsm/objects/Reflector.js` (matching
 * this codebase's established pattern for `three/examples/jsm/*` utilities —
 * `GraphSceneCamera`'s `OrbitControls`, `GraphSceneEnvironment`'s
 * `RGBELoader`, `GraphObjectLoader`'s loaders). Pass `ssrPass` (a truthy
 * value — its shape still isn't validated, since any truthy value only
 * selects the constructor here) to use `ReflectorForSSRPass` instead of the
 * standalone `Reflector`. Pair it with `postfx/`'s `ssr` pass (Prompt 119):
 * create the mirror first, then `graph3d.postfx.enable('ssr', { groundReflector: mirror })`.
 *
 * `plane` is disposed and replaced in its scene by the new reflector
 * (constructed from a clone of `plane`'s geometry, at `plane`'s exact
 * transform and name) — the reflector supersedes it, not a `plane.material`
 * mutation, since `Reflector`/`ReflectorForSSRPass` are whole `THREE.Mesh`
 * subclasses with their own `onBeforeRender` hook, not swappable materials.
 * @param {GraphMesh} plane
 * @param {{
 *   textureWidth?: number,
 *   textureHeight?: number,
 *   color?: (number|string),
 *   clipBias?: number,
 *   multisample?: number,
 *   ssrPass?: *,
 * }} [options]
 * @returns {Promise<import('three').Mesh>} The new reflector — already added
 *   to `plane`'s former scene. Has its own working `.dispose()`.
 * @throws {TypeError} If `plane` is not a `GraphMesh`, `options` is not a plain object,
 *   `textureWidth`/`textureHeight`/`multisample` isn't a non-negative integer, or `clipBias` isn't finite.
 * @throws {Error} If `plane` has already been disposed.
 * @example
 * const mirror = await material.addPlanarReflection(floorPlane, { textureWidth: 1024, textureHeight: 1024 });
 * // later: mirror.dispose();
 */
export async function addPlanarReflection(plane, options = {}) {
  if (!(plane instanceof GraphMesh)) {
    throw new TypeError(
      `material.addPlanarReflection: plane must be a GraphMesh instance, received ${plane?.constructor?.name ?? typeof plane}.`,
    );
  }
  assertPlainOptions('material.addPlanarReflection', options);
  const { textureWidth = 512, textureHeight = 512, color = 0x7f7f7f, clipBias = 0, multisample = 4, ssrPass = null, ...rest } = options;
  assertPositiveInteger('textureWidth', textureWidth);
  assertPositiveInteger('textureHeight', textureHeight);
  assertFiniteNumber('material.addPlanarReflection', 'clipBias', clipBias);
  if (!Number.isInteger(multisample) || multisample < 0) {
    throw new TypeError(`material.addPlanarReflection: multisample must be a non-negative integer, received ${JSON.stringify(multisample)}.`);
  }

  const ReflectorClass = ssrPass
    ? (await import('three/examples/jsm/objects/ReflectorForSSRPass.js')).ReflectorForSSRPass
    : (await import('three/examples/jsm/objects/Reflector.js')).Reflector;

  const originalThree = plane.three;
  const geometry = originalThree.geometry.clone();
  const reflector = new ReflectorClass(geometry, { textureWidth, textureHeight, color, clipBias, multisample, ...rest });
  reflector.position.copy(originalThree.position);
  reflector.quaternion.copy(originalThree.quaternion);
  reflector.scale.copy(originalThree.scale);
  reflector.name = plane.name;

  const scene = plane.scene;
  plane.dispose();
  scene.add(reflector);
  return reflector;
}
