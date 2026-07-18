import { loop } from '../../core/Graph3DLoop.js';

const registered = new Map();
let tick = null;

/**
 * Registers an `Object3D` to be billboarded (rotated to face the camera)
 * every frame, backed by exactly one shared `loop.add()` call regardless of
 * how many objects are registered — the single callback iterates every
 * registered object each tick, rather than each caller registering its own.
 * Re-registering an already-registered `object3D` replaces its `getCamera`.
 * @param {import('three').Object3D} object3D
 * @param {() => import('three').Camera} getCamera - Read fresh each tick, so the target camera can change over time.
 * @example
 * billboardRegistry.register(mesh.three, () => camera);
 * // later:
 * billboardRegistry.unregister(mesh.three);
 */
export function register(object3D, getCamera) {
  registered.set(object3D, getCamera);
  if (tick === null) {
    tick = () => {
      for (const [target, getCam] of registered) {
        const camera = getCam();
        if (camera) target.quaternion.copy(camera.quaternion);
      }
    };
    loop.add(tick);
  }
}

/**
 * Unregisters an `Object3D` previously passed to {@link register}. Removes
 * the shared `loop` callback once the last registered object is gone.
 * No-op if `object3D` isn't currently registered.
 * @param {import('three').Object3D} object3D
 */
export function unregister(object3D) {
  registered.delete(object3D);
  if (registered.size === 0 && tick !== null) {
    loop.remove(tick);
    tick = null;
  }
}
