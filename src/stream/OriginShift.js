import { loop } from '../core/Graph3DLoop.js';

// BUILD_PLAN §Phase 10's own example of "extreme range" (> 1 km from origin)
// — a reasonable default float32 positions stay comfortably precise under,
// with plenty of headroom before the ~7-significant-digit rounding a
// coordinate this size is already approaching.
const DEFAULT_THRESHOLD = 1000;

/**
 * Transparent world-origin shifting (Prompt 164): keeps the camera — and
 * everything else in the scene — near local `(0, 0, 0)` so float32 position
 * storage (vertex buffers, per-instance matrices, the camera's own
 * position) stays precise even when a scene spans a huge coordinate range.
 *
 * Every frame (`core/Graph3DLoop`), checks the camera's distance from local
 * origin and, once it exceeds `threshold`, subtracts that distance's vector
 * from the camera *and* every top-level `scene` child in one shot — moving
 * everything together preserves every relative position and render output
 * exactly, while shrinking the absolute numbers float32 has to represent.
 * Nested content (children of a shifted top-level object, per-instance data
 * inside a `GraphInstancedObject`) moves for free through normal
 * `matrixWorld` composition — only top-level children need touching.
 *
 * "Transparent": nothing else in the library needs to know this is running.
 * `GraphChart`/`GraphScene`/`GraphInstancedObject` write positions exactly
 * as they always have; `OriginShift` only ever adjusts `.position` on the
 * objects it's given, from outside — the same "attach externally, duck-typed
 * target" shape as `interact/FocusFollower`.
 *
 * @example
 * const originShift = new OriginShift({ scene: scene.three, camera: scene.camera.three, threshold: 1000 });
 * originShift.worldOffset; // {x, y, z} — total shift applied so far; add to a local position to recover the true one
 * originShift.dispose();
 */
export class OriginShift {
  /** @type {{children: object[]}} */
  #scene;
  /** @type {{position: object}} */
  #camera;
  /** @type {number} */
  #threshold;
  /** @type {{x: number, y: number, z: number}} */
  #worldOffset = { x: 0, y: 0, z: 0 };
  /** @type {boolean} */
  #disposed = false;
  /** @type {() => void} */
  #tick;

  /**
   * @param {object} options
   * @param {{children: object[]}} options.scene Duck-typed to `.children` — e.g. a `THREE.Scene`.
   * @param {{position: {length: Function, clone: Function, sub: Function}}} options.camera Duck-typed to a `THREE.Vector3`-like `.position`.
   * @param {number} [options.threshold] Camera distance from local origin, beyond which a shift fires. Default `1000`.
   * @throws {TypeError} If `scene` doesn't expose a `children` array, `camera` doesn't expose a `position` with `length()`/`clone()`/`sub()`, or `threshold` isn't a positive number.
   * @example new OriginShift({ scene: scene.three, camera: scene.camera.three });
   */
  constructor({ scene, camera, threshold = DEFAULT_THRESHOLD } = {}) {
    if (!scene || !Array.isArray(scene.children)) {
      throw new TypeError('OriginShift: scene must expose a children array (e.g. a THREE.Scene).');
    }
    const position = camera?.position;
    if (!position || typeof position.length !== 'function' || typeof position.clone !== 'function' || typeof position.sub !== 'function') {
      throw new TypeError('OriginShift: camera must expose a position Vector3 (length()/clone()/sub()).');
    }
    if (typeof threshold !== 'number' || !(threshold > 0)) {
      throw new TypeError(`OriginShift: threshold must be a positive number, received ${JSON.stringify(threshold)}.`);
    }

    this.#scene = scene;
    this.#camera = camera;
    this.#threshold = threshold;
    this.#tick = () => this.#checkShift();
    loop.add(this.#tick);
  }

  /**
   * Cumulative shift applied so far — add to a current local position to
   * recover the coordinate it would have had with no shifting ever applied.
   * @returns {{x: number, y: number, z: number}}
   */
  get worldOffset() {
    return { ...this.#worldOffset };
  }

  #checkShift() {
    if (this.#camera.position.length() <= this.#threshold) return;
    const delta = this.#camera.position.clone();
    this.#camera.position.sub(delta);
    for (const child of this.#scene.children) child.position.sub(delta);
    this.#worldOffset.x += delta.x;
    this.#worldOffset.y += delta.y;
    this.#worldOffset.z += delta.z;
  }

  /**
   * Stops the per-frame distance check. Idempotent.
   * @example originShift.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    loop.remove(this.#tick);
  }
}
