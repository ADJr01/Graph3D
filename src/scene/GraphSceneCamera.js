import * as THREE from 'three';
import {
  dollyZoom as _dollyZoom,
  tour as _tour,
  follow as _follow,
  focusOn as _focusOn,
} from './cameraPrimitives.js';

const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 10_000;

// Half-size of the orthographic frustum at default zoom. Aspect-corrected by the renderer each frame.
const ORTHO_HALF_SIZE = 10;

/**
 * @typedef {{ type: string, fov?: number, position: number[], target: number[] }} PresetConfig
 * @type {Record<string, PresetConfig>}
 */
const PRESET_CONFIGS = {
  orbit:            { type: 'perspective',   fov: 60, position: [0,    2,   5], target: [0, 0, 0] },
  fixed:            { type: 'perspective',   fov: 60, position: [0,    2,   5], target: [0, 0, 0] },
  isometric:        { type: 'orthographic',           position: [10,  10,  10], target: [0, 0, 0] },
  'top-down':       { type: 'orthographic',           position: [0,   10,   0], target: [0, 0, 0] },
  'cinematic-low':  { type: 'perspective',   fov: 25, position: [0,  0.5,   8], target: [0, 0, 0] },
  'cinematic-high': { type: 'perspective',   fov: 25, position: [0,   12,   6], target: [0, 0, 0] },
};

const VALID_PRESETS = Object.keys(PRESET_CONFIGS);

/**
 * @param {string} preset
 * @returns {THREE.PerspectiveCamera|THREE.OrthographicCamera}
 */
function buildCamera(preset) {
  const config = PRESET_CONFIGS[preset];
  const camera =
    config.type === 'orthographic'
      ? new THREE.OrthographicCamera(
          -ORTHO_HALF_SIZE,
          ORTHO_HALF_SIZE,
          ORTHO_HALF_SIZE,
          -ORTHO_HALF_SIZE,
          CAMERA_NEAR,
          CAMERA_FAR,
        )
      : new THREE.PerspectiveCamera(config.fov, 1, CAMERA_NEAR, CAMERA_FAR);
  camera.position.set(...config.position);
  camera.lookAt(...config.target);
  return camera;
}

/**
 * Manages the active camera for a {@link GraphScene}.
 *
 * Wraps either a `THREE.PerspectiveCamera` or `THREE.OrthographicCamera`
 * depending on the active preset. Provides one-line preset switching,
 * optional OrbitControls (lazy-loaded on first call to `enableOrbitControls`),
 * and a `useCustom` escape hatch for raw THREE cameras.
 *
 * @example
 * const cam = new GraphSceneCamera();
 * cam.setPreset('isometric').setPosition(15, 15, 15);
 *
 * @example
 * await cam.enableOrbitControls(renderer.domElement);
 * cam.lookAt(0, 0, 0);
 */
export class GraphSceneCamera {
  /** @type {THREE.PerspectiveCamera|THREE.OrthographicCamera|THREE.Camera} */
  #camera;

  /** @type {string|null} null when a custom camera is installed via useCustom() */
  #preset;

  /** @type {import('three/examples/jsm/controls/OrbitControls.js').OrbitControls|null} */
  #orbitControls = null;

  /** @type {{ cancel: () => void }|null} — the running animation, cancelled on new animation or dispose */
  #activeController = null;

  /** @type {THREE.Vector3} — tracks the last explicit lookAt target for tour() start state */
  #lookAtTarget = new THREE.Vector3(0, 0, 0);

  /** @type {number|null} — reapplied to OrbitControls on every enableOrbitControls() call */
  #maxZoomIn = null;

  /** @type {number|null} — reapplied to OrbitControls on every enableOrbitControls() call */
  #maxZoomOut = null;

  /** @type {number|null} radians — reapplied to OrbitControls on every enableOrbitControls() call */
  #minPolarAngle = null;

  /** @type {number|null} radians — reapplied to OrbitControls on every enableOrbitControls() call */
  #maxPolarAngle = null;

  /** @type {boolean} */
  #disposed = false;

  /**
   * @param {{ preset?: string }} [options]
   * @throws {TypeError} If `preset` is not a recognised preset name.
   * @example
   * const cam = new GraphSceneCamera({ preset: 'top-down' });
   */
  constructor({ preset = 'orbit' } = {}) {
    if (!VALID_PRESETS.includes(preset)) {
      throw new TypeError(
        `GraphSceneCamera: unknown preset '${preset}'. ` +
          `Expected one of: [${VALID_PRESETS.join(', ')}].`,
      );
    }
    this.#camera = buildCamera(preset);
    this.#preset = preset;
    this.#lookAtTarget.set(...PRESET_CONFIGS[preset].target);
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  /**
   * The underlying THREE camera. The exact type depends on the active preset:
   * - Perspective presets (`orbit`, `fixed`, `cinematic-*`) → `THREE.PerspectiveCamera`
   * - Orthographic presets (`isometric`, `top-down`) → `THREE.OrthographicCamera`
   * - After `useCustom()` → whatever was passed in.
   *
   * @returns {THREE.PerspectiveCamera|THREE.OrthographicCamera|THREE.Camera}
   */
  get three() {
    return this.#camera;
  }

  /**
   * The name of the currently active preset, or `null` when a custom camera
   * was installed via `useCustom()`.
   * @returns {string|null}
   */
  get preset() {
    return this.#preset;
  }

  /**
   * The last world-space point passed to `lookAt()` (or the active preset's
   * default target). A fresh clone — mutating it has no effect on the camera.
   * @returns {THREE.Vector3}
   */
  get target() {
    return this.#lookAtTarget.clone();
  }

  // ── Preset & camera control ────────────────────────────────────────────────

  /**
   * Switch to a named camera preset, rebuilding the underlying THREE camera.
   * Any active OrbitControls are disposed first.
   *
   * Valid presets: `orbit`, `fixed`, `isometric`, `top-down`,
   * `cinematic-low`, `cinematic-high`.
   *
   * @param {string} name
   * @returns {this}
   * @throws {TypeError} If `name` is not a recognised preset.
   * @throws {Error} If called after `dispose()`.
   * @example cam.setPreset('isometric');
   */
  setPreset(name) {
    this.#assertNotDisposed('setPreset');
    if (!VALID_PRESETS.includes(name)) {
      throw new TypeError(
        `GraphSceneCamera.setPreset: unknown preset '${name}'. ` +
          `Expected one of: [${VALID_PRESETS.join(', ')}].`,
      );
    }
    this.#activeController?.cancel();
    this.#activeController = null;
    this.disableOrbitControls();
    this.#camera = buildCamera(name);
    this.#preset = name;
    this.#lookAtTarget.set(...PRESET_CONFIGS[name].target);
    return this;
  }

  /**
   * Point the camera at the given world-space coordinates.
   * When OrbitControls are active, also updates the orbit target so the
   * controls and camera stay in sync.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example cam.lookAt(0, 0, 0);
   */
  lookAt(x, y, z) {
    this.#assertNotDisposed('lookAt');
    this.#camera.lookAt(x, y, z);
    this.#lookAtTarget.set(x, y, z);
    if (this.#orbitControls) {
      this.#orbitControls.target.set(x, y, z);
      this.#orbitControls.update();
    }
    return this;
  }

  /**
   * Set the camera's world-space position.
   * When OrbitControls are active, also triggers a controls update.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example cam.setPosition(10, 5, 10);
   */
  setPosition(x, y, z) {
    this.#assertNotDisposed('setPosition');
    this.#camera.position.set(x, y, z);
    if (this.#orbitControls) this.#orbitControls.update();
    return this;
  }

  /**
   * Replace the internal camera with a custom THREE camera.
   * Disposes any active OrbitControls. Sets `preset` to `null`.
   *
   * @param {THREE.Camera} camera
   * @returns {this}
   * @throws {TypeError} If `camera` is not a `THREE.Camera`.
   * @throws {Error} If called after `dispose()`.
   * @example cam.useCustom(new THREE.PerspectiveCamera(45, aspect, 0.1, 1000));
   */
  useCustom(camera) {
    this.#assertNotDisposed('useCustom');
    if (!(camera instanceof THREE.Camera)) {
      throw new TypeError(
        'GraphSceneCamera.useCustom: expected a THREE.Camera instance.',
      );
    }
    this.#activeController?.cancel();
    this.#activeController = null;
    this.disableOrbitControls();
    this.#camera = camera;
    this.#preset = null;
    return this;
  }

  // ── Zoom limits ────────────────────────────────────────────────────────────

  /**
   * Set how far in the user may zoom via OrbitControls (mouse wheel / pinch).
   * On a perspective preset this is the closest dolly distance
   * (OrbitControls' `minDistance`); on an orthographic preset it's the
   * highest magnification (OrbitControls' `maxZoom`). Takes effect
   * immediately if OrbitControls are active, and is reapplied automatically
   * on every future `enableOrbitControls()` call (including after a
   * `setPreset()` switch between perspective and orthographic).
   *
   * @param {number} value - A positive distance (perspective) or zoom factor (orthographic).
   * @returns {this}
   * @throws {TypeError} If `value` is not a positive finite number.
   * @throws {Error} If called after `dispose()`.
   * @example
   * cam.setMaxZoomIn(2); // never let the user dolly closer than 2 units
   */
  setMaxZoomIn(value) {
    this.#assertNotDisposed('setMaxZoomIn');
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new TypeError(
        `GraphSceneCamera.setMaxZoomIn: expected a positive finite number, received ${value}.`,
      );
    }
    this.#maxZoomIn = value;
    this.#applyZoomLimits();
    return this;
  }

  /**
   * Set how far out the user may zoom via OrbitControls (mouse wheel / pinch).
   * On a perspective preset this is the farthest dolly distance
   * (OrbitControls' `maxDistance`); on an orthographic preset it's the
   * lowest magnification (OrbitControls' `minZoom`). Takes effect
   * immediately if OrbitControls are active, and is reapplied automatically
   * on every future `enableOrbitControls()` call (including after a
   * `setPreset()` switch between perspective and orthographic).
   *
   * @param {number} value - A positive distance (perspective) or zoom factor (orthographic).
   * @returns {this}
   * @throws {TypeError} If `value` is not a positive finite number.
   * @throws {Error} If called after `dispose()`.
   * @example
   * cam.setMaxZoomOut(50); // never let the user dolly past 50 units away
   */
  setMaxZoomOut(value) {
    this.#assertNotDisposed('setMaxZoomOut');
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new TypeError(
        `GraphSceneCamera.setMaxZoomOut: expected a positive finite number, received ${value}.`,
      );
    }
    this.#maxZoomOut = value;
    this.#applyZoomLimits();
    return this;
  }

  // ── Orbit angle limits ─────────────────────────────────────────────────────

  /**
   * Set the closest-to-vertical polar angle the user may orbit to via
   * OrbitControls, in radians (`0` = looking straight down from above,
   * `Math.PI / 2` = eye-level). Guards against near-grazing or below-the-plane
   * camera angles that make elevated data points (e.g. a tall line-chart
   * marker) visually detach from their ground-level axis position under
   * perspective projection — see `setMaxPolarAngle` for the matching lower
   * bound. Takes effect immediately if OrbitControls are active, and is
   * reapplied automatically on every future `enableOrbitControls()` call.
   *
   * @param {number} value - Radians in `[0, Math.PI]`.
   * @returns {this}
   * @throws {TypeError} If `value` is not a finite number in `[0, Math.PI]`.
   * @throws {RangeError} If `value` is greater than an already-set `setMaxPolarAngle` value.
   * @throws {Error} If called after `dispose()`.
   * @example
   * cam.setMinPolarAngle(Math.PI / 6); // never let the camera orbit above ~30° from vertical
   */
  setMinPolarAngle(value) {
    this.#assertNotDisposed('setMinPolarAngle');
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Math.PI) {
      throw new TypeError(
        `GraphSceneCamera.setMinPolarAngle: expected a finite number in [0, Math.PI], received ${value}.`,
      );
    }
    if (this.#maxPolarAngle !== null && value > this.#maxPolarAngle) {
      throw new RangeError(
        `GraphSceneCamera.setMinPolarAngle: value (${value}) must be <= the current setMaxPolarAngle (${this.#maxPolarAngle}).`,
      );
    }
    this.#minPolarAngle = value;
    this.#applyPolarAngleLimits();
    return this;
  }

  /**
   * Set the closest-to-horizontal/below polar angle the user may orbit to via
   * OrbitControls, in radians (`Math.PI / 2` = eye-level, `Math.PI` = looking
   * straight up from below). Pairs with `setMinPolarAngle` to keep the camera
   * within a range where axis-aligned data stays visually legible. Takes
   * effect immediately if OrbitControls are active, and is reapplied
   * automatically on every future `enableOrbitControls()` call.
   *
   * @param {number} value - Radians in `[0, Math.PI]`.
   * @returns {this}
   * @throws {TypeError} If `value` is not a finite number in `[0, Math.PI]`.
   * @throws {RangeError} If `value` is less than an already-set `setMinPolarAngle` value.
   * @throws {Error} If called after `dispose()`.
   * @example
   * cam.setMaxPolarAngle(Math.PI / 2.1); // never let the camera dip below near-eye-level
   */
  setMaxPolarAngle(value) {
    this.#assertNotDisposed('setMaxPolarAngle');
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Math.PI) {
      throw new TypeError(
        `GraphSceneCamera.setMaxPolarAngle: expected a finite number in [0, Math.PI], received ${value}.`,
      );
    }
    if (this.#minPolarAngle !== null && value < this.#minPolarAngle) {
      throw new RangeError(
        `GraphSceneCamera.setMaxPolarAngle: value (${value}) must be >= the current setMinPolarAngle (${this.#minPolarAngle}).`,
      );
    }
    this.#maxPolarAngle = value;
    this.#applyPolarAngleLimits();
    return this;
  }

  // ── Cinematic animation primitives ────────────────────────────────────────

  /**
   * Tween the camera's field of view from its current value to `targetFOV`.
   * Only valid on perspective cameras (`orbit`, `fixed`, `cinematic-*` presets).
   * Cancels any currently running animation.
   *
   * @param {number} targetFOV - Target FOV in degrees (0 < targetFOV < 180).
   * @param {number} [duration=1000] - Duration in milliseconds.
   * @returns {CameraController}
   * @throws {TypeError} If the active camera is not a PerspectiveCamera or `targetFOV` is out of range.
   * @throws {Error} If called after `dispose()`.
   * @example cam.dollyZoom(25, 2000);
   */
  dollyZoom(targetFOV, duration = 1000) {
    this.#assertNotDisposed('dollyZoom');
    this.#activeController?.cancel();
    this.#activeController = _dollyZoom(this.#camera, targetFOV, duration);
    return this.#activeController;
  }

  /**
   * Fly the camera through a sequence of waypoints in order.
   * Each waypoint specifies `at` (position), `lookAt` (target), and optionally
   * `fov` (degrees), `duration` (ms, default 1000), `easing` (default `'easeInOutCubic'`).
   * Cancels any currently running animation.
   *
   * @param {Array<{at:number[], lookAt:number[], fov?:number, duration?:number, easing?:string}>} waypoints
   * @param {object} [options] - Reserved for future use.
   * @returns {CameraController}
   * @throws {TypeError} If `waypoints` is not a non-empty array or entries are malformed.
   * @throws {Error} If called after `dispose()`.
   * @example
   * cam.tour([
   *   { at: [10, 10, 10], lookAt: [0, 0, 0], duration: 2000, easing: 'easeOutCubic' },
   *   { at: [-10,  5, 10], lookAt: [0, 0, 0], duration: 1500 },
   * ]);
   */
  tour(waypoints, _options = {}) {
    this.#assertNotDisposed('tour');
    this.#activeController?.cancel();
    this.#activeController = _tour(this.#camera, this.#lookAtTarget, waypoints);
    return this.#activeController;
  }

  /**
   * Smoothly pivot the camera toward a moving `THREE.Object3D` every frame.
   * Runs until `.cancel()` is called on the returned controller.
   * Cancels any currently running animation.
   *
   * @param {THREE.Object3D} target
   * @returns {CameraController}
   * @throws {TypeError} If `target` does not have `getWorldPosition`.
   * @throws {Error} If called after `dispose()`.
   * @example
   * const ctrl = cam.follow(ship);
   * // later:
   * ctrl.cancel();
   */
  follow(target) {
    this.#assertNotDisposed('follow');
    this.#activeController?.cancel();
    this.#activeController = _follow(this.#camera, target);
    return this.#activeController;
  }

  /**
   * Animate the camera to frame the given bounding box.
   * Perspective cameras are moved to the correct viewing distance;
   * orthographic cameras have their frustum resized to fit the bounding sphere.
   * Cancels any currently running animation.
   *
   * @param {THREE.Box3} boundingBox
   * @param {number} [padding=1.2] - Multiplier applied to the bounding sphere radius.
   * @param {number} [duration=600] - Duration in milliseconds.
   * @returns {CameraController}
   * @throws {TypeError} If `boundingBox` is not a `THREE.Box3`.
   * @throws {Error} If called after `dispose()`.
   * @example
   * const box = new THREE.Box3().setFromObject(group);
   * cam.focusOn(box, 1.5, 800);
   */
  focusOn(boundingBox, padding = 1.2, duration = 600) {
    this.#assertNotDisposed('focusOn');
    this.#activeController?.cancel();
    this.#activeController = _focusOn(this.#camera, boundingBox, padding, duration);
    return this.#activeController;
  }

  // ── OrbitControls ──────────────────────────────────────────────────────────

  /**
   * Enable OrbitControls bound to the given DOM element.
   *
   * OrbitControls is lazy-loaded from
   * `three/examples/jsm/controls/OrbitControls.js` on the first call — it is
   * NOT bundled unless this method is actually called. Any previously active
   * controls are disposed before the new ones are created.
   *
   * @param {HTMLElement} domElement - Canvas or container to receive pointer events.
   * @returns {Promise<this>}
   * @throws {TypeError} If `domElement` is falsy.
   * @throws {Error} If called after `dispose()`.
   * @example await cam.enableOrbitControls(renderer.domElement);
   */
  async enableOrbitControls(domElement) {
    this.#assertNotDisposed('enableOrbitControls');
    if (!domElement) {
      throw new TypeError(
        'GraphSceneCamera.enableOrbitControls: domElement is required.',
      );
    }
    this.disableOrbitControls();
    const { OrbitControls } = await import(
      'three/examples/jsm/controls/OrbitControls.js'
    );
    // Guard: dispose() may have been called during the async import.
    if (this.#disposed) return this;
    this.#orbitControls = new OrbitControls(this.#camera, domElement);
    this.#applyZoomLimits();
    this.#applyPolarAngleLimits();
    return this;
  }

  /**
   * Dispose and remove any active OrbitControls. No-op if controls are not active.
   *
   * @returns {this}
   * @example cam.disableOrbitControls();
   */
  disableOrbitControls() {
    if (this.#orbitControls) {
      this.#orbitControls.dispose();
      this.#orbitControls = null;
    }
    return this;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Release all resources held by this camera (primarily OrbitControls event
   * listeners). The underlying THREE camera holds no GPU resources.
   * Idempotent — safe to call twice.
   *
   * @example cam.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#activeController?.cancel();
    this.#activeController = null;
    this.disableOrbitControls();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Reapplies #maxZoomIn/#maxZoomOut to the active OrbitControls, mapped to
   * the property pair that actually bounds dolly for the current camera type.
   * No-op if OrbitControls aren't active — there's nothing to clamp yet.
   */
  #applyZoomLimits() {
    if (!this.#orbitControls) return;
    if (this.#camera.isOrthographicCamera) {
      if (this.#maxZoomIn !== null) this.#orbitControls.maxZoom = this.#maxZoomIn;
      if (this.#maxZoomOut !== null) this.#orbitControls.minZoom = this.#maxZoomOut;
    } else {
      if (this.#maxZoomIn !== null) this.#orbitControls.minDistance = this.#maxZoomIn;
      if (this.#maxZoomOut !== null) this.#orbitControls.maxDistance = this.#maxZoomOut;
    }
  }

  /**
   * Reapplies #minPolarAngle/#maxPolarAngle to the active OrbitControls, then
   * calls `update()` so a camera already outside the new bounds is
   * re-clamped immediately rather than drifting there on the next user
   * interaction. No-op if OrbitControls aren't active — there's nothing to
   * clamp yet.
   */
  #applyPolarAngleLimits() {
    if (!this.#orbitControls) return;
    if (this.#minPolarAngle !== null) this.#orbitControls.minPolarAngle = this.#minPolarAngle;
    if (this.#maxPolarAngle !== null) this.#orbitControls.maxPolarAngle = this.#maxPolarAngle;
    this.#orbitControls.update();
  }

  /** @param {string} method */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`GraphSceneCamera.${method}: instance has been disposed.`);
    }
  }
}
