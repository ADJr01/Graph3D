import * as THREE from 'three';
import { resolve as resolveEasing } from './GraphAnimCurve.js';
import { loop } from '../core/Graph3DLoop.js';

const DEFAULT_SEGMENT_DURATION_MS = 1000;
const DEFAULT_SEGMENT_EASING = 'easeInOutCubic';

/** @param {*} value @param {string} field @throws {TypeError} */
function assertVector3Array(value, field) {
  if (!Array.isArray(value) || value.length < 3 || value.slice(0, 3).some((v) => typeof v !== 'number')) {
    throw new TypeError(`CameraTour: waypoint.${field} must be [x, y, z], received ${JSON.stringify(value)}.`);
  }
}

/**
 * @typedef {{ at: number[], lookAt: number[], fov?: number, duration?: number, easing?: (string|((t:number)=>number)) }} CameraWaypoint
 */

/**
 * Flies a `THREE.Camera` through a sequence of waypoints (Prompt 94, fleshing
 * out Phase 2's `GraphSceneCamera.tour()`/`cameraPrimitives.tour()` stub with
 * a richer, standalone playback controller): each waypoint's `at` position,
 * `lookAt` target, and optional `fov` interpolate from the previous
 * waypoint's end state over that waypoint's own `duration`/`easing`
 * (resolved through `anim/GraphAnimCurve` — no local easing table). Driven by
 * the shared RAF `loop` (never a second `requestAnimationFrame`).
 *
 * Operates directly on a raw `THREE.Camera` — like `compose/axis`/
 * `compose/annotation`'s existing sanctioned touches of `THREE.*`, this is a
 * domain-specific animator that has to know about cameras, not the fully
 * opaque `GraphAnimTimeline`/`GraphAnimKeyframe` engine — so it takes no
 * `scene/` dependency at all (no new CLAUDE.md exception needed).
 *
 * Auto-plays on construction, matching this codebase's other "call it, it
 * starts" builders (`Transition.to()`, `GraphSceneCamera.tour()`).
 * @example
 * const t = new CameraTour(camera, [
 *   { at: [10, 10, 10], lookAt: [0, 0, 0], duration: 2000, easing: 'easeOutCubic' },
 *   { at: [-10, 5, 10], lookAt: [0, 0, 0], duration: 1500 },
 * ]);
 * t.pause();
 * t.resume();
 * t.skipToNext();
 * @example
 * CameraTour.orbit(camera, { center: [0, 0, 0], radius: 15 });
 */
export class CameraTour {
  /** @type {THREE.Camera} */
  #camera;
  /** @type {CameraWaypoint[]} */
  #waypoints;
  /** @type {number} */
  #index = 0;
  /** @type {boolean} */
  #playing = false;
  /** @type {boolean} */
  #cancelled = false;
  /** @type {THREE.Vector3} the running lookAt target — cameras don't store one directly */
  #currentLookAt = new THREE.Vector3();
  /** @type {THREE.Vector3} */
  #segmentStartPos = new THREE.Vector3();
  /** @type {THREE.Vector3} */
  #segmentEndPos = new THREE.Vector3();
  /** @type {THREE.Vector3} */
  #segmentStartLookAt = new THREE.Vector3();
  /** @type {THREE.Vector3} */
  #segmentEndLookAt = new THREE.Vector3();
  /** @type {number|null} */
  #segmentStartFov = null;
  /** @type {number|null} */
  #segmentEndFov = null;
  /** @type {number} */
  #segmentDurationMs = DEFAULT_SEGMENT_DURATION_MS;
  /** @type {(t: number) => number} */
  #segmentEasingFn = resolveEasing(DEFAULT_SEGMENT_EASING);
  /** @type {number} */
  #segmentElapsedMs = 0;
  /** @type {(() => void)[]} */
  #completeHandlers = [];
  /** @type {(deltaSeconds: number) => void} */
  #tick = (deltaSeconds) => this.#advanceBy(deltaSeconds * 1000);

  /**
   * @param {THREE.Camera} camera
   * @param {CameraWaypoint[]} waypoints
   * @throws {TypeError} If `camera` is not a `THREE.Camera`, or `waypoints` is
   *   empty or has malformed entries.
   */
  constructor(camera, waypoints) {
    if (!(camera instanceof THREE.Camera)) {
      throw new TypeError('CameraTour: camera must be a THREE.Camera instance.');
    }
    if (!Array.isArray(waypoints) || waypoints.length === 0) {
      throw new TypeError('CameraTour: waypoints must be a non-empty array.');
    }
    for (let i = 0; i < waypoints.length; i++) {
      assertVector3Array(waypoints[i].at, `[${i}].at`);
      assertVector3Array(waypoints[i].lookAt, `[${i}].lookAt`);
    }
    this.#camera = camera;
    this.#waypoints = waypoints;
    camera.getWorldDirection(this.#currentLookAt).multiplyScalar(5).add(camera.position);
    this.#loadSegment(0);
    this.play();
  }

  /** @returns {boolean} Whether this tour is currently advancing on the shared loop. */
  get isPlaying() {
    return this.#playing;
  }

  /** @returns {number} Index of the waypoint currently being flown toward. */
  get currentWaypointIndex() {
    return this.#index;
  }

  /**
   * Resumes (or starts) advancing through waypoints. No-op if already
   * playing, or if `cancel()` was called (a cancelled tour cannot restart).
   * @returns {this}
   * @example tour.play();
   */
  play() {
    if (this.#playing || this.#cancelled) return this;
    this.#playing = true;
    loop.add(this.#tick);
    return this;
  }

  /**
   * Freezes playback at the current position between waypoints. No-op if
   * already paused or cancelled.
   * @returns {this}
   * @example tour.pause();
   */
  pause() {
    if (!this.#playing) return this;
    this.#playing = false;
    loop.remove(this.#tick);
    return this;
  }

  /**
   * Alias for `play()`, read better after a `pause()`.
   * @returns {this}
   * @example tour.resume();
   */
  resume() {
    return this.play();
  }

  /**
   * Snaps immediately to the end of the current waypoint and advances to the
   * next one (or completes, if this was the last). No-op once the tour has
   * already completed or been cancelled.
   * @returns {this}
   * @example tour.skipToNext();
   */
  skipToNext() {
    if (this.#cancelled || this.#index >= this.#waypoints.length) return this;
    this.#applyT(1);
    this.#advanceToNextSegment();
    return this;
  }

  /**
   * Registers a callback fired once when every waypoint has been reached.
   * Never fires if `cancel()` is called first.
   * @param {() => void} handler
   * @returns {this}
   * @throws {TypeError} If `handler` is not a function.
   * @example tour.onComplete(() => console.log('tour done'));
   */
  onComplete(handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`CameraTour.onComplete: expected a function, received ${JSON.stringify(handler)}.`);
    }
    this.#completeHandlers.push(handler);
    return this;
  }

  /**
   * Stops playback permanently and unregisters from the shared loop.
   * Idempotent; `play()`/`resume()`/`skipToNext()` become no-ops afterward.
   * @returns {this}
   * @example tour.cancel();
   */
  cancel() {
    if (this.#cancelled) return this;
    this.pause();
    this.#cancelled = true;
    return this;
  }

  /** @param {number} deltaMs */
  #advanceBy(deltaMs) {
    this.#segmentElapsedMs += deltaMs;
    const rawT = Math.min(1, this.#segmentElapsedMs / this.#segmentDurationMs);
    this.#applyT(this.#segmentEasingFn(rawT));
    if (rawT >= 1) this.#advanceToNextSegment();
  }

  /** @param {number} index */
  #loadSegment(index) {
    const wp = this.#waypoints[index];
    this.#segmentDurationMs = wp.duration ?? DEFAULT_SEGMENT_DURATION_MS;
    this.#segmentEasingFn = resolveEasing(wp.easing ?? DEFAULT_SEGMENT_EASING);
    this.#segmentStartPos.copy(this.#camera.position);
    this.#segmentStartLookAt.copy(this.#currentLookAt);
    this.#segmentStartFov = this.#camera.isPerspectiveCamera ? this.#camera.fov : null;
    this.#segmentEndPos.set(...wp.at);
    this.#segmentEndLookAt.set(...wp.lookAt);
    this.#segmentEndFov = wp.fov ?? this.#segmentStartFov;
    this.#segmentElapsedMs = 0;
  }

  /** @param {number} t Eased progress through the current segment, `0..1`. */
  #applyT(t) {
    this.#camera.position.lerpVectors(this.#segmentStartPos, this.#segmentEndPos, t);
    this.#currentLookAt.lerpVectors(this.#segmentStartLookAt, this.#segmentEndLookAt, t);
    this.#camera.lookAt(this.#currentLookAt);
    if (this.#camera.isPerspectiveCamera && this.#segmentStartFov != null && this.#segmentEndFov != null) {
      this.#camera.fov = this.#segmentStartFov + (this.#segmentEndFov - this.#segmentStartFov) * t;
      this.#camera.updateProjectionMatrix();
    }
  }

  #advanceToNextSegment() {
    this.#index++;
    if (this.#index >= this.#waypoints.length) {
      this.pause();
      for (const handler of this.#completeHandlers) handler();
      return;
    }
    this.#loadSegment(this.#index);
  }

  // ── Presets ────────────────────────────────────────────────────────────────

  /**
   * A continuous orbit around `center` at a fixed `radius`/`height`, split
   * into `segments` equal waypoints spanning `duration` in total.
   * @param {THREE.Camera} camera
   * @param {{center?: number[], radius?: number, height?: number, duration?: number, segments?: number, easing?: (string|((t:number)=>number))}} [options]
   * @returns {CameraTour}
   * @throws {TypeError} If `segments` is not an integer >= 3.
   * @example CameraTour.orbit(camera, { center: [0, 0, 0], radius: 15, duration: 8000 });
   */
  static orbit(camera, { center = [0, 0, 0], radius = 10, height = 5, duration = 8000, segments = 8, easing = 'linear' } = {}) {
    if (!Number.isInteger(segments) || segments < 3) {
      throw new TypeError(`CameraTour.orbit: segments must be an integer >= 3, received ${JSON.stringify(segments)}.`);
    }
    const waypoints = [];
    for (let i = 1; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      waypoints.push({
        at: [center[0] + radius * Math.cos(angle), center[1] + height, center[2] + radius * Math.sin(angle)],
        lookAt: center,
        duration: duration / segments,
        easing,
      });
    }
    return new CameraTour(camera, waypoints);
  }

  /**
   * A single straight-line flight to `at`/`lookAt` (and `fov`, for perspective cameras).
   * @param {THREE.Camera} camera
   * @param {{at: number[], lookAt: number[], fov?: number, duration?: number, easing?: (string|((t:number)=>number))}} options
   * @returns {CameraTour}
   * @example CameraTour.flyTo(camera, { at: [5, 5, 5], lookAt: [0, 0, 0], duration: 1200 });
   */
  static flyTo(camera, { at, lookAt, fov, duration = 1000, easing = DEFAULT_SEGMENT_EASING } = {}) {
    return new CameraTour(camera, [{ at, lookAt, fov, duration, easing }]);
  }

  /**
   * A canned two-beat establishing shot: a wide, high, narrow-FOV opening
   * view of `target` easing into a closer, lower, wider-FOV framing —
   * the "sweep down into the scene" cinematic opening.
   * @param {THREE.Camera} camera
   * @param {{target?: number[], startRadius?: number, endRadius?: number, startHeight?: number, endHeight?: number, startFov?: number, endFov?: number, duration?: number, easing?: (string|((t:number)=>number))}} [options]
   * @returns {CameraTour}
   * @example CameraTour.cinematicReveal(camera, { target: [0, 0, 0] });
   */
  static cinematicReveal(
    camera,
    {
      target = [0, 0, 0],
      startRadius = 30,
      endRadius = 8,
      startHeight = 20,
      endHeight = 3,
      startFov = 75,
      endFov = 45,
      duration = 4000,
      easing = DEFAULT_SEGMENT_EASING,
    } = {},
  ) {
    const waypoints = [
      {
        at: [target[0], target[1] + startHeight, target[2] + startRadius],
        lookAt: target,
        fov: startFov,
        duration: duration * 0.4,
        easing: 'easeInCubic',
      },
      {
        at: [target[0] + endRadius * 0.3, target[1] + endHeight, target[2] + endRadius],
        lookAt: target,
        fov: endFov,
        duration: duration * 0.6,
        easing,
      },
    ];
    return new CameraTour(camera, waypoints);
  }
}
