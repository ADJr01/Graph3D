import * as THREE from 'three';
import { CameraTour } from '../anim/index.js';
import { worldPositionOf } from './regionSelect.js';

const DEFAULT_RADIUS = 10;
const DEFAULT_HEIGHT = 5;
const DEFAULT_DURATION_MS = 8000;
const DEFAULT_SEGMENTS = 8;
const DEFAULT_EASING = 'linear';

/** @param {*} value @param {string} field @throws {TypeError} */
function assertPositiveNumber(value, field) {
  if (typeof value !== 'number' || !(value > 0)) {
    throw new TypeError(`FocusFollower: ${field} must be a positive number, received ${JSON.stringify(value)}.`);
  }
}

/**
 * Continuously orbits a `THREE.Camera` around whichever datum is currently
 * "focused" — deliberately fed the world position explicitly (`follow(chart,
 * datum)`) rather than wiring itself to `PointerRouter`'s hover/select events
 * or `KeyboardNav`'s Tab cursor directly: both are legitimate focus sources
 * (Prompt 154) and there's no single canonical "focus" event yet (that
 * unification is Prompt 156's job) — so a caller wires whichever one it wants
 * via its own `on('hover-enter', ...)`/Tab-cycling callback, same as
 * `StateMachine`'s "detect vs. respond" split.
 *
 * Delegates the actual orbit motion to `anim/CameraTour.orbit()` (CLAUDE.md
 * §1.1 DRY — no second camera-path engine here) — each lap's `onComplete`
 * immediately restarts an identical orbit around the same target, since
 * `CameraTour.orbit()` itself only ever flies once around and stops.
 * `follow()` cancels any orbit already in progress and starts a fresh one
 * around the new target; `stop()` cancels without moving the camera further.
 *
 * @example
 * const follower = new FocusFollower({ camera: scene.camera.three, radius: 12 });
 * barChart.selection().on('hover-enter', (d) => {}); // Selection.dispatch source
 * router.stateMachineFor(barChart); // (however the caller detects focus)
 * follower.follow(barChart, someDatum);
 * follower.stop();
 */
export class FocusFollower {
  /** @type {THREE.Camera} */
  #camera;
  /** @type {number} */
  #radius;
  /** @type {number} */
  #height;
  /** @type {number} */
  #durationMs;
  /** @type {number} */
  #segments;
  /** @type {string|((t:number)=>number)} */
  #easing;
  /** @type {CameraTour|null} The in-progress orbit, if any. */
  #tour = null;
  /** @type {[number, number, number]|null} World-space center of the in-progress orbit. */
  #center = null;
  /** @type {boolean} */
  #disposed = false;

  /**
   * @param {{ camera: THREE.Camera, radius?: number, height?: number, durationMs?: number,
   *   segments?: number, easing?: (string|((t:number)=>number)) }} options
   * @throws {TypeError} If `camera` is not a `THREE.Camera`, or a numeric option is not a positive number.
   * @example new FocusFollower({ camera: scene.camera.three });
   */
  constructor({ camera, radius = DEFAULT_RADIUS, height = DEFAULT_HEIGHT, durationMs = DEFAULT_DURATION_MS, segments = DEFAULT_SEGMENTS, easing = DEFAULT_EASING } = {}) {
    if (!(camera instanceof THREE.Camera)) {
      throw new TypeError('FocusFollower: camera must be a THREE.Camera instance.');
    }
    assertPositiveNumber(radius, 'radius');
    assertPositiveNumber(height, 'height');
    assertPositiveNumber(durationMs, 'durationMs');
    if (!Number.isInteger(segments) || segments < 3) {
      throw new TypeError(`FocusFollower: segments must be an integer >= 3, received ${JSON.stringify(segments)}.`);
    }
    this.#camera = camera;
    this.#radius = radius;
    this.#height = height;
    this.#durationMs = durationMs;
    this.#segments = segments;
    this.#easing = easing;
  }

  /** @returns {boolean} Whether the camera is currently orbiting a focused datum. */
  get isFollowing() {
    return this.#tour !== null;
  }

  /**
   * Starts (or redirects) a continuous orbit around `datum`'s current world
   * position within `chart`. Cancels any orbit already in progress first.
   * @param {import('../chart/GraphChart.js').GraphChart} chart Any `GraphChart` — duck-typed to `selection()`/`scene`.
   * @param {*} datum Must be one of `chart`'s currently bound `data()` entries.
   * @returns {this}
   * @throws {TypeError} If `chart` doesn't expose `selection()`/`scene`.
   * @throws {Error} If `datum` isn't currently bound to `chart`, or if called after `dispose()`.
   * @example follower.follow(barChart, hit.datum);
   */
  follow(chart, datum) {
    this.#assertNotDisposed('follow');
    if (!chart || typeof chart.selection !== 'function' || !chart.scene) {
      throw new TypeError('FocusFollower.follow: chart must expose selection()/scene.');
    }
    chart.scene.updateMatrixWorld(true);
    const backend = chart.selection().filter((d) => d === datum).backend;
    const matchCount = backend.type === 'meshes' ? backend.meshes.length : backend.indices.length;
    if (matchCount === 0) {
      throw new Error('FocusFollower.follow: datum is not currently bound to chart.');
    }
    const worldPoint = worldPositionOf(backend, 0);
    this.#startOrbit([worldPoint.x, worldPoint.y, worldPoint.z]);
    return this;
  }

  /**
   * Cancels the in-progress orbit, if any, leaving the camera where it is. No-op if not following.
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example follower.stop();
   */
  stop() {
    this.#assertNotDisposed('stop');
    if (this.#tour) {
      this.#tour.cancel();
      this.#tour = null;
      this.#center = null;
    }
    return this;
  }

  /**
   * Cancels any in-progress orbit. Idempotent.
   * @example follower.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.stop();
    this.#disposed = true;
  }

  /** @param {[number, number, number]} center */
  #startOrbit(center) {
    if (this.#tour) this.#tour.cancel();
    this.#center = center;
    this.#tour = CameraTour.orbit(this.#camera, {
      center,
      radius: this.#radius,
      height: this.#height,
      duration: this.#durationMs,
      segments: this.#segments,
      easing: this.#easing,
    });
    // onComplete never fires for a cancelled tour (CameraTour's own contract),
    // so by the time this runs #tour is still the lap that just finished
    // naturally — restart it around the same center for a continuous orbit.
    this.#tour.onComplete(() => this.#startOrbit(this.#center));
  }

  /** @param {string} method @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`FocusFollower.${method}: this follower has been disposed.`);
    }
  }
}
