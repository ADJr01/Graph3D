import * as THREE from 'three';
import { loop } from '../core/Graph3DLoop.js';

/** @type {Record<string, (t: number) => number>} */
const EASINGS = {
  linear:         (t) => t,
  easeInCubic:    (t) => t * t * t,
  easeOutCubic:   (t) => 1 - (1 - t) ** 3,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
};

/** @param {string|undefined} name */
function resolveEasing(name) {
  return EASINGS[name] ?? EASINGS.easeInOutCubic;
}

/**
 * Returned by every camera animation method. Call `.cancel()` to abort the animation early.
 *
 * @example
 * const ctrl = cam.dollyZoom(25, 2000);
 * // Stop halfway:
 * setTimeout(() => ctrl.cancel(), 1000);
 */
export class CameraController {
  #cancelFn;
  #cancelled = false;

  /** @param {() => void} cancelFn */
  constructor(cancelFn) {
    this.#cancelFn = cancelFn;
  }

  /**
   * Abort the camera animation immediately. Idempotent.
   * @returns {this}
   */
  cancel() {
    if (!this.#cancelled) {
      this.#cancelled = true;
      this.#cancelFn();
    }
    return this;
  }
}

/**
 * Tween a perspective camera's FOV from its current value to `targetFOV`.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} targetFOV - Target FOV in degrees (0 < targetFOV < 180).
 * @param {number} duration - Duration in milliseconds.
 * @returns {CameraController}
 * @throws {TypeError} If `camera` is not a PerspectiveCamera or `targetFOV` is out of range.
 */
export function dollyZoom(camera, targetFOV, duration) {
  if (!(camera instanceof THREE.PerspectiveCamera)) {
    throw new TypeError(
      "GraphSceneCamera.dollyZoom: requires a perspective camera. " +
        "Switch to an 'orbit', 'fixed', or 'cinematic-*' preset first.",
    );
  }
  if (typeof targetFOV !== 'number' || targetFOV <= 0 || targetFOV >= 180) {
    throw new TypeError(
      `GraphSceneCamera.dollyZoom: targetFOV must be a number in (0, 180), received ${targetFOV}.`,
    );
  }

  const startFOV = camera.fov;
  const durationSec = duration / 1000;
  let elapsed = 0;

  const tick = (deltaSec) => {
    elapsed += deltaSec;
    const t = Math.min(elapsed / durationSec, 1);
    camera.fov = startFOV + (targetFOV - startFOV) * EASINGS.easeInOutCubic(t);
    camera.updateProjectionMatrix();
    if (t >= 1) loop.remove(tick);
  };

  loop.add(tick);
  return new CameraController(() => loop.remove(tick));
}

/**
 * @typedef {{ at: number[], lookAt: number[], fov?: number, duration?: number, easing?: string }} Waypoint
 */

/**
 * Fly the camera through a sequence of waypoints.
 * Each waypoint defines an `at` position, `lookAt` target, optional `fov` (degrees),
 * `duration` (ms, default 1000), and `easing` name (default `'easeInOutCubic'`).
 *
 * @param {THREE.Camera} camera
 * @param {THREE.Vector3} currentLookAt - The camera's known lookAt target at the moment the tour starts.
 * @param {Waypoint[]} waypoints
 * @returns {CameraController}
 * @throws {TypeError} If `waypoints` is empty or entries are malformed.
 */
export function tour(camera, currentLookAt, waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length === 0) {
    throw new TypeError('GraphSceneCamera.tour: waypoints must be a non-empty array.');
  }
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    if (!Array.isArray(wp?.at) || wp.at.length < 3) {
      throw new TypeError(`GraphSceneCamera.tour: waypoints[${i}].at must be [x, y, z].`);
    }
    if (!Array.isArray(wp?.lookAt) || wp.lookAt.length < 3) {
      throw new TypeError(`GraphSceneCamera.tour: waypoints[${i}].lookAt must be [x, y, z].`);
    }
  }

  let wpIndex = 0;
  let elapsed = 0;

  let startPos = camera.position.clone();
  let startTarget = currentLookAt.clone();
  let startFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : null;
  let endPos = new THREE.Vector3(...waypoints[0].at);
  let endTarget = new THREE.Vector3(...waypoints[0].lookAt);
  let endFov = waypoints[0].fov ?? startFov;

  const tmpTarget = new THREE.Vector3();

  const tick = (deltaSec) => {
    const wp = waypoints[wpIndex];
    const durationSec = (wp.duration ?? 1000) / 1000;
    elapsed += deltaSec;
    const rawT = Math.min(elapsed / durationSec, 1);
    const t = resolveEasing(wp.easing)(rawT);

    camera.position.lerpVectors(startPos, endPos, t);
    tmpTarget.lerpVectors(startTarget, endTarget, t);
    camera.lookAt(tmpTarget);

    if (camera instanceof THREE.PerspectiveCamera && startFov != null && endFov != null) {
      camera.fov = startFov + (endFov - startFov) * t;
      camera.updateProjectionMatrix();
    }

    if (rawT >= 1) {
      wpIndex++;
      elapsed = 0;
      if (wpIndex < waypoints.length) {
        startPos = endPos.clone();
        startTarget = endTarget.clone();
        startFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : null;
        endPos.set(...waypoints[wpIndex].at);
        endTarget.set(...waypoints[wpIndex].lookAt);
        endFov = waypoints[wpIndex].fov ?? startFov;
      } else {
        loop.remove(tick);
      }
    }
  };

  loop.add(tick);
  return new CameraController(() => loop.remove(tick));
}

// Lerp factor controlling how quickly the camera catches up to a followed target.
const FOLLOW_LERP = 5;

/**
 * Smoothly pivot the camera toward a moving `THREE.Object3D` every frame.
 * Runs until the returned controller's `.cancel()` is called.
 *
 * @param {THREE.Camera} camera
 * @param {THREE.Object3D} target
 * @returns {CameraController}
 * @throws {TypeError} If `target` does not have `getWorldPosition`.
 */
export function follow(camera, target) {
  if (!target || typeof target.getWorldPosition !== 'function') {
    throw new TypeError(
      'GraphSceneCamera.follow: target must be a THREE.Object3D (requires getWorldPosition).',
    );
  }

  // Seed the running lookAt from the camera's current orientation.
  const currentLookAt = new THREE.Vector3();
  camera.getWorldDirection(currentLookAt).multiplyScalar(5).add(camera.position);

  const worldPos = new THREE.Vector3();

  const tick = (deltaSec) => {
    target.getWorldPosition(worldPos);
    currentLookAt.lerp(worldPos, Math.min(1, deltaSec * FOLLOW_LERP));
    camera.lookAt(currentLookAt);
  };

  loop.add(tick);
  return new CameraController(() => loop.remove(tick));
}

/**
 * Animate the camera to frame a bounding box.
 * Perspective cameras are repositioned to the correct viewing distance;
 * orthographic cameras have their frustum resized to fit the bounding sphere.
 *
 * @param {THREE.Camera} camera
 * @param {THREE.Box3} boundingBox
 * @param {number} padding - Scale factor applied to the bounding sphere radius (default 1.2).
 * @param {number} duration - Duration in milliseconds (default 600).
 * @returns {CameraController}
 * @throws {TypeError} If `boundingBox` is not a `THREE.Box3`.
 */
export function focusOn(camera, boundingBox, padding, duration) {
  if (!(boundingBox instanceof THREE.Box3)) {
    throw new TypeError('GraphSceneCamera.focusOn: boundingBox must be a THREE.Box3.');
  }

  const center = new THREE.Vector3();
  boundingBox.getCenter(center);

  const sphere = new THREE.Sphere();
  boundingBox.getBoundingSphere(sphere);
  const radius = sphere.radius * padding;

  const startPos = camera.position.clone();

  let endPos;
  let startOrthoHalf = null;
  let endOrthoHalf = null;

  if (camera instanceof THREE.PerspectiveCamera) {
    const fovRad = (camera.fov / 2) * (Math.PI / 180);
    const dist = radius / Math.tan(fovRad);
    const dir = new THREE.Vector3().subVectors(camera.position, center);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    endPos = center.clone().addScaledVector(dir, dist);
  } else if (camera instanceof THREE.OrthographicCamera) {
    endPos = startPos.clone();
    startOrthoHalf = camera.right;
    endOrthoHalf = radius;
  } else {
    endPos = startPos.clone();
  }

  const durationSec = duration / 1000;
  let elapsed = 0;

  const tmpTarget = new THREE.Vector3();

  const tick = (deltaSec) => {
    elapsed += deltaSec;
    const t = Math.min(elapsed / durationSec, 1);
    const et = EASINGS.easeInOutCubic(t);

    camera.position.lerpVectors(startPos, endPos, et);
    tmpTarget.lerpVectors(startPos, center, et);
    camera.lookAt(tmpTarget);

    if (camera instanceof THREE.OrthographicCamera && startOrthoHalf !== null) {
      const halfSize = startOrthoHalf + (endOrthoHalf - startOrthoHalf) * et;
      camera.left = -halfSize;
      camera.right = halfSize;
      camera.top = halfSize;
      camera.bottom = -halfSize;
      camera.updateProjectionMatrix();
    }

    if (t >= 1) loop.remove(tick);
  };

  loop.add(tick);
  return new CameraController(() => loop.remove(tick));
}
