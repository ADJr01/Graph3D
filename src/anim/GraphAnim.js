import { loop } from '../core/Graph3DLoop.js';
import { GraphAnimTimeline } from './GraphAnimTimeline.js';

/**
 * The animation engine root (Prompt 89): one shared RAF tick (via
 * `core/Graph3DLoop`'s singleton `loop` — never a second `requestAnimationFrame`,
 * CLAUDE.md's "single loop guarantee") advances every registered
 * `GraphAnimTimeline`. Subscribes to `loop` only while at least one timeline
 * is registered, mirroring `Graph3DLoop`'s own auto-start/stop pattern so an
 * idle engine costs nothing.
 *
 * `respectReducedMotion` (Prompt 95): when set, every registered timeline is
 * advanced by its own full single-pass `duration` each tick instead of the
 * real frame delta — enough to cross its finish line in one tick for the
 * common single-loop case (a full pass always covers however much of itself
 * remains), so `.attr()`/`.to()`-style transitions land on their end values
 * immediately rather than animating through them. `GraphAnim` doesn't read
 * `matchMedia` itself (that's an application concern, and would tie this
 * layer to `window`) — set it from the result of your own
 * `prefers-reduced-motion` check.
 * @example
 * const tl = anim.timeline(mesh.position);
 * tl.to({ y: 5 }, { duration: 1 }).play();
 * // later:
 * anim.dispose();
 * @example
 * anim.respectReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 */
export class GraphAnim {
  /** @type {Set<GraphAnimTimeline>} */
  #timelines = new Set();
  /** @type {boolean} */
  #paused = false;
  /** @type {boolean} */
  #disposed = false;
  /** @type {boolean} */
  #respectReducedMotion = false;
  /** @type {(deltaSeconds: number) => void} */
  #tick = (deltaSeconds) => {
    if (this.#paused) return;
    for (const timeline of this.#timelines) {
      timeline.update(this.#respectReducedMotion ? timeline.duration : deltaSeconds);
    }
  };

  /**
   * Creates a `GraphAnimTimeline` bound to `target` and registers it with this engine.
   * @param {object} target The object whose dot-paths the timeline will animate.
   * @returns {GraphAnimTimeline}
   * @throws {Error} If this engine has been disposed.
   * @example const tl = anim.timeline(mesh.position);
   */
  timeline(target) {
    return this.add(new GraphAnimTimeline(target));
  }

  /**
   * Registers an existing timeline (e.g. one constructed directly via `new
   * GraphAnimTimeline(target)`) so it receives per-frame `update()` calls.
   * @param {GraphAnimTimeline} timeline
   * @returns {GraphAnimTimeline} `timeline`, for chaining.
   * @throws {TypeError} If `timeline` is not a `GraphAnimTimeline`.
   * @throws {Error} If this engine has been disposed.
   * @example anim.add(new GraphAnimTimeline(mesh.position)).to({ y: 1 }, { duration: 1 }).play();
   */
  add(timeline) {
    if (this.#disposed) {
      throw new Error('GraphAnim.add: this engine has been disposed.');
    }
    if (!(timeline instanceof GraphAnimTimeline)) {
      throw new TypeError(`GraphAnim.add: expected a GraphAnimTimeline, received ${JSON.stringify(timeline)}.`);
    }
    if (!this.#timelines.has(timeline)) {
      this.#timelines.add(timeline);
      if (this.#timelines.size === 1) loop.add(this.#tick);
    }
    return timeline;
  }

  /**
   * Unregisters a timeline. No-op if it was never registered.
   * @param {GraphAnimTimeline} timeline
   * @returns {void}
   * @example anim.remove(tl);
   */
  remove(timeline) {
    if (!this.#timelines.delete(timeline)) return;
    if (this.#timelines.size === 0) loop.remove(this.#tick);
  }

  /**
   * An ad-hoc tween (Prompt 95) for callers who just want an interpolated
   * value on every frame without building a full target object/dot-path —
   * e.g. driving a shader uniform or a non-object value. Builds a throwaway
   * single-property `GraphAnimTimeline` under the hood (so it inherits
   * `respectReducedMotion`, pause/resume, and disposal for free — CLAUDE.md
   * §1.1 DRY, not a second tween loop) whose one property's value is
   * interpolated via `compose/interpolate` (Prompt 87's single interpolation
   * authority) and handed to `onUpdate` each frame.
   * @param {*} from Start value — any type `compose/interpolate` supports.
   * @param {*} to End value, same shape as `from`.
   * @param {{duration?: number, easing?: (string|((t:number)=>number)), delay?: number}} options Same shape as `GraphAnimTimeline.to`'s (seconds).
   * @param {(value: *) => void} onUpdate Called with the interpolated value on every tick.
   * @returns {GraphAnimTimeline} The underlying timeline (for `.pause()`, `.stop()`, `anim.remove()`, etc).
   * @throws {TypeError} If `onUpdate` is not a function, or `from`/`to` can't be interpolated (see `interpolate`).
   * @throws {Error} If this engine has been disposed.
   * @example anim.tween(0, 1, { duration: 0.5 }, (v) => (material.opacity = v));
   */
  tween(from, to, options, onUpdate) {
    if (typeof onUpdate !== 'function') {
      throw new TypeError(`GraphAnim.tween: expected a function for onUpdate, received ${JSON.stringify(onUpdate)}.`);
    }
    const box = { value: from };
    const timeline = this.timeline(box);
    // GraphAnimKeyframe (built inside .to()) is what actually calls interpolate(from, to) —
    // throws synchronously here (Fail Fast) if from/to aren't an interpolatable pair.
    timeline.to({ value: to }, options);
    timeline.onUpdate(() => onUpdate(box.value));
    timeline.play();
    return timeline;
  }

  /**
   * Whether registered timelines snap straight to their end values instead
   * of animating through them (Prompt 95) — see the class doc for how this
   * is applied per tick.
   * @returns {boolean}
   */
  get respectReducedMotion() {
    return this.#respectReducedMotion;
  }

  /** @param {boolean} value @throws {TypeError} If `value` is not a boolean. */
  set respectReducedMotion(value) {
    if (typeof value !== 'boolean') {
      throw new TypeError(`GraphAnim.respectReducedMotion: expected a boolean, received ${JSON.stringify(value)}.`);
    }
    this.#respectReducedMotion = value;
  }

  /**
   * Globally pauses ticking: registered timelines stop receiving `update()`
   * calls until `resume()`, regardless of their own individual play state.
   * @returns {void}
   * @example anim.pause();
   */
  pause() {
    this.#paused = true;
  }

  /**
   * Resumes ticking after `pause()`.
   * @returns {void}
   * @example anim.resume();
   */
  resume() {
    this.#paused = false;
  }

  /** @returns {boolean} `true` while `pause()` is in effect. */
  get isPaused() {
    return this.#paused;
  }

  /** @returns {number} Number of timelines currently registered. */
  get size() {
    return this.#timelines.size;
  }

  /**
   * Unsubscribes from the shared RAF loop and drops every tracked timeline.
   * Idempotent. After disposal, `timeline()`/`add()` throw; `remove()`/
   * `pause()`/`resume()` become no-ops (nothing is ticking regardless).
   * @returns {void}
   * @example anim.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    loop.remove(this.#tick);
    this.#timelines.clear();
  }
}

/** Shared singleton engine root — mirrors `core/Graph3DLoop`'s `loop` singleton. */
export const anim = new GraphAnim();
