import { GraphAnimKeyframe, getPath } from './GraphAnimKeyframe.js';
import { resolve } from './GraphAnimCurve.js';

const DEFAULT_DURATION = 1;
const DEFAULT_EASING = 'linear';

/**
 * Sequences one or more property tracks on a single `target`, D3/GSAP-flavored:
 * `.to()`/`.from()` calls made back-to-back run in **parallel** starting at
 * the current cursor; `.then()` advances the cursor past the current group so
 * the next calls run **sequentially** after it. Playback is driven by
 * `update(deltaSeconds)` — call it yourself, or register the timeline with
 * `GraphAnim` (Prompt 89) for automatic per-frame ticking.
 * @example
 * const tl = new GraphAnimTimeline(mesh.position);
 * tl.to({ y: 5 }, { duration: 1 })
 *   .then()
 *   .to({ y: 0 }, { duration: 0.5, easing: 'easeInBounce' })
 *   .onComplete(() => console.log('done'))
 *   .play();
 */
export class GraphAnimTimeline {
  /** @type {object} */
  #target;
  /** @type {{keyframe: GraphAnimKeyframe, start: number, duration: number, easingFn: (t: number) => number}[]} */
  #tracks = [];
  /** @type {number} start time (seconds) for the next `.to()`/`.from()` call */
  #groupStart = 0;
  /** @type {number} end time (seconds) of the furthest track added so far */
  #groupEnd = 0;
  /** @type {number} current playback position, seconds, within `[0, duration]` */
  #time = 0;
  /** @type {1|-1} */
  #direction = 1;
  /** @type {boolean} */
  #playing = false;
  /** @type {number} */
  #loopCount = 1;
  /** @type {'restart'|'pingpong'} */
  #loopMode = 'restart';
  /** @type {number} */
  #loopsDone = 0;
  /** @type {((time: number, timeline: this) => void)[]} */
  #updateCallbacks = [];
  /** @type {((timeline: this) => void)[]} */
  #completeCallbacks = [];
  /**
   * @type {{end: number, handlers: ((timeline: this) => void)[], fired: boolean}[]}
   * One entry per `.then()`-delimited parallel group (Prompt 96), the last
   * of which is always the group currently being built by `.to()`/`.from()`/
   * `.wait()`. `end` tracks that group's own boundary as it grows.
   */
  #groups = [{ end: 0, handlers: [], fired: false }];
  /** @type {boolean} set by `#resolveBoundaries` when a fresh forward pass just began; applied by `update()` after firing this tick's crossings, never before */
  #pendingGroupReset = false;

  /**
   * @param {object} target The object whose dot-paths this timeline animates.
   * @throws {TypeError} If `target` is not a non-null object.
   */
  constructor(target) {
    if (target === null || typeof target !== 'object') {
      throw new TypeError(`GraphAnimTimeline: expected an object target, received ${JSON.stringify(target)}.`);
    }
    this.#target = target;
  }

  /** @returns {number} Total single-pass duration in seconds (excludes repeats from `.loop()`). */
  get duration() {
    return this.#groupEnd;
  }

  /** @returns {number} Current playback position in seconds, within `[0, duration]`. */
  get time() {
    return this.#time;
  }

  /** @returns {boolean} Whether this timeline is currently advancing on `update()`. */
  get isPlaying() {
    return this.#playing;
  }

  /**
   * Animates dot-paths in `props` from their current value (read from
   * `target` right now) to the given value.
   * @param {Object<string, *>} props Dot-path → target value.
   * @param {{duration?: number, easing?: (string|((t:number)=>number)), delay?: number}} [options]
   * @returns {this}
   * @throws {TypeError} If `props`/`duration`/`delay` are malformed, or `easing` doesn't resolve.
   * @example timeline.to({ 'position.y': 5, opacity: 0 }, { duration: 1, easing: 'easeOutCubic' });
   */
  to(props, options = {}) {
    this.#stageTracks(props, options, (path, value) => [
      { offset: 0, value: getPath(this.#target, path) },
      { offset: 1, value },
    ]);
    return this;
  }

  /**
   * Animates dot-paths in `props` from the given value to their current
   * value (read from `target` right now).
   * @param {Object<string, *>} props Dot-path → starting value.
   * @param {{duration?: number, easing?: (string|((t:number)=>number)), delay?: number}} [options]
   * @returns {this}
   * @throws {TypeError} If `props`/`duration`/`delay` are malformed, or `easing` doesn't resolve.
   * @example timeline.from({ 'scale.y': 0.01 }, { duration: 0.4 });
   */
  from(props, options = {}) {
    this.#stageTracks(props, options, (path, value) => [
      { offset: 0, value },
      { offset: 1, value: getPath(this.#target, path) },
    ]);
    return this;
  }

  /**
   * Inserts a gap: the next `.to()`/`.from()` group starts `duration` seconds
   * after the last track added so far finishes.
   * @param {number} duration Non-negative seconds.
   * @returns {this}
   * @throws {TypeError} If `duration` is not a non-negative number.
   * @example timeline.to({ y: 1 }, { duration: 1 }).wait(0.5).to({ y: 0 }, { duration: 1 });
   */
  wait(duration) {
    if (typeof duration !== 'number' || duration < 0) {
      throw new TypeError(`GraphAnimTimeline.wait: duration must be a non-negative number, received ${JSON.stringify(duration)}.`);
    }
    this.#groupStart = this.#groupEnd + duration;
    this.#groupEnd = this.#groupStart;
    this.#groups[this.#groups.length - 1].end = this.#groupEnd;
    return this;
  }

  /**
   * Ends the current parallel group: the next `.to()`/`.from()` calls start
   * only once every track added so far has finished (sequential chaining).
   * Seals the group just ended (Prompt 96's keyframe groups) so its own
   * `onGroupComplete` handlers fire independently of the timeline's overall
   * `onComplete`, and opens a fresh group for the calls that follow.
   * @returns {this}
   * @example timeline.to({ y: 1 }, { duration: 1 }).then().to({ x: 1 }, { duration: 1 });
   */
  then() {
    this.#groupStart = this.#groupEnd;
    this.#groups.push({ end: this.#groupEnd, handlers: [], fired: false });
    return this;
  }

  /**
   * Repeats the full single-pass timeline.
   * @param {number} [count] Total number of passes, including the first (`Infinity` for endless). Must be positive.
   * @param {'restart'|'pingpong'} [mode] `'restart'` jumps back to `t=0`; `'pingpong'` reverses direction instead.
   * @returns {this}
   * @throws {TypeError} If `count` is not a positive number, or `mode` is not `'restart'`/`'pingpong'`.
   * @example timeline.loop(Infinity, 'pingpong').play();
   */
  loop(count = Infinity, mode = 'restart') {
    if (typeof count !== 'number' || !(count > 0)) {
      throw new TypeError(`GraphAnimTimeline.loop: count must be a positive number (or Infinity), received ${JSON.stringify(count)}.`);
    }
    if (mode !== 'restart' && mode !== 'pingpong') {
      throw new TypeError(`GraphAnimTimeline.loop: mode must be 'restart' or 'pingpong', received ${JSON.stringify(mode)}.`);
    }
    this.#loopCount = count;
    this.#loopMode = mode;
    return this;
  }

  /**
   * Starts (or resumes) advancing on `update()`. Immediately applies the
   * current position so `target` reflects it without waiting for the next tick.
   * @returns {this}
   * @example timeline.play();
   */
  play() {
    this.#playing = true;
    this.#applyAt(this.#time);
    return this;
  }

  /**
   * Freezes playback at the current position; `update()` becomes a no-op until `play()`.
   * @returns {this}
   * @example timeline.pause();
   */
  pause() {
    this.#playing = false;
    return this;
  }

  /**
   * Stops playback and resets to `t=0` (direction forward, loop count reset), applying that state immediately.
   * @returns {this}
   * @example timeline.stop();
   */
  stop() {
    this.#playing = false;
    this.#time = 0;
    this.#direction = 1;
    this.#loopsDone = 0;
    this.#resetGroupFirings();
    this.#applyAt(0);
    return this;
  }

  /**
   * Flips playback direction from the current position. Does not change `isPlaying`.
   * @returns {this}
   * @example timeline.reverse();
   */
  reverse() {
    this.#direction *= -1;
    return this;
  }

  /**
   * Jumps to an absolute position (seconds), clamped to `[0, duration]`, and
   * applies it immediately. Does not change `isPlaying`, direction, or loop count.
   * @param {number} time
   * @returns {this}
   * @throws {TypeError} If `time` is not a finite number.
   * @example timeline.seek(0.5);
   */
  seek(time) {
    if (typeof time !== 'number' || !Number.isFinite(time)) {
      throw new TypeError(`GraphAnimTimeline.seek: time must be a finite number, received ${JSON.stringify(time)}.`);
    }
    this.#time = Math.max(0, Math.min(this.#groupEnd, time));
    this.#applyAt(this.#time);
    return this;
  }

  /**
   * Removes every still-live track animating `path`, leaving every other
   * track on this timeline untouched — the primitive `anim/Transition` and
   * `compose/selection/SelectionTransition` build interrupt semantics on top
   * of (Prompt 93): a superseding transition on the same target+path calls
   * this on the transition it's replacing so that timeline stops writing
   * `path` from the next `update()` on, instead of the two fighting over it
   * every frame. This timeline's own clock (and any *other* path it's still
   * animating) is unaffected — only `path`'s tracks are removed.
   * @param {string} path
   * @returns {boolean} Whether any track was removed (`false` if none matched).
   * @example timelineA.interruptPath('position.y');
   */
  interruptPath(path) {
    const before = this.#tracks.length;
    this.#tracks = this.#tracks.filter((track) => track.keyframe.path !== path);
    return this.#tracks.length !== before;
  }

  /**
   * Registers a callback fired at the end of every `update()` tick while playing.
   * @param {(time: number, timeline: this) => void} fn
   * @returns {this}
   * @throws {TypeError} If `fn` is not a function.
   * @example timeline.onUpdate((t) => console.log(t));
   */
  onUpdate(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError(`GraphAnimTimeline.onUpdate: expected a function, received ${JSON.stringify(fn)}.`);
    }
    this.#updateCallbacks.push(fn);
    return this;
  }

  /**
   * Registers a callback fired once when the timeline finishes all its loop
   * passes (never fires if `.loop(Infinity, ...)` is set).
   * @param {(timeline: this) => void} fn
   * @returns {this}
   * @throws {TypeError} If `fn` is not a function.
   * @example timeline.onComplete(() => console.log('done'));
   */
  onComplete(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError(`GraphAnimTimeline.onComplete: expected a function, received ${JSON.stringify(fn)}.`);
    }
    this.#completeCallbacks.push(fn);
    return this;
  }

  /**
   * Registers a callback fired once the *current* `.then()`-delimited group
   * of parallel tracks finishes (Prompt 96's keyframe groups) — independent
   * of `onComplete`, which only fires once the whole timeline (every group)
   * is done. Attaches to whichever group is currently being built; call it
   * right after the `.to()`/`.from()` calls it should cover, before the next
   * `.then()`. Fires again on each subsequent loop pass; does not fire on a
   * `'pingpong'` pass that re-crosses the boundary in reverse.
   * @param {(timeline: this) => void} fn
   * @returns {this}
   * @throws {TypeError} If `fn` is not a function.
   * @example
   * timeline.to({ y: 1 }, { duration: 1 }).onGroupComplete(() => console.log('group 1 done'))
   *   .then()
   *   .to({ x: 1 }, { duration: 1 }).onGroupComplete(() => console.log('group 2 done'));
   */
  onGroupComplete(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError(`GraphAnimTimeline.onGroupComplete: expected a function, received ${JSON.stringify(fn)}.`);
    }
    this.#groups[this.#groups.length - 1].handlers.push(fn);
    return this;
  }

  /**
   * Advances playback by `deltaSeconds` (scaled by direction), applies the
   * resulting state, and fires `onUpdate`/`onComplete`. No-op while paused/stopped.
   * @param {number} deltaSeconds
   * @returns {void}
   * @throws {TypeError} If `deltaSeconds` is not a finite number.
   * @example timeline.update(0.016);
   */
  update(deltaSeconds) {
    if (typeof deltaSeconds !== 'number' || !Number.isFinite(deltaSeconds)) {
      throw new TypeError(`GraphAnimTimeline.update: deltaSeconds must be a finite number, received ${JSON.stringify(deltaSeconds)}.`);
    }
    if (!this.#playing) return;
    const directionThisTick = this.#direction;
    this.#time += deltaSeconds * directionThisTick;
    const rawTime = this.#time; // before #resolveBoundaries may wrap it back into range
    const finished = this.#resolveBoundaries();
    this.#applyAt(this.#time);
    for (const cb of this.#updateCallbacks) cb(this.#time, this);
    // Fire this tick's crossings using the *old* fired flags first, THEN
    // apply any pending reset for the pass that's now starting — reversing
    // this order would let the reset (meant for the next pass) wipe out the
    // very flag that should have recorded the pass that just finished.
    this.#fireCrossedGroups(directionThisTick, rawTime);
    if (this.#pendingGroupReset) {
      this.#pendingGroupReset = false;
      this.#resetGroupFirings();
    }
    if (finished) {
      this.#playing = false;
      for (const cb of this.#completeCallbacks) cb(this);
    }
  }

  /** Clears all tracks and callbacks. Not a GPU/DOM/RAF resource, so this is hygiene rather than the formal disposal contract (CLAUDE.md §3). */
  dispose() {
    this.#tracks = [];
    this.#updateCallbacks = [];
    this.#completeCallbacks = [];
    this.#groups = [{ end: 0, handlers: [], fired: false }];
  }

  /**
   * Shared validation + track-construction for `to`/`from`, which differ
   * only in which end of the `[from, to]` pair `props`'s values land on
   * (CLAUDE.md §1.1 DRY — one validation path, not two).
   * @param {Object<string, *>} props
   * @param {{duration?: number, easing?: *, delay?: number}} options
   * @param {(path: string, value: *) => [{offset: 0, value: *}, {offset: 1, value: *}]} buildStops
   */
  #stageTracks(props, options, buildStops) {
    if (props === null || typeof props !== 'object' || Array.isArray(props)) {
      throw new TypeError(`GraphAnimTimeline: props must be a plain object of dot-path -> value, received ${JSON.stringify(props)}.`);
    }
    const keys = Object.keys(props);
    if (keys.length === 0) {
      throw new TypeError('GraphAnimTimeline: props must contain at least one property.');
    }
    const { duration = DEFAULT_DURATION, easing = DEFAULT_EASING, delay = 0 } = options;
    if (typeof duration !== 'number' || duration < 0) {
      throw new TypeError(`GraphAnimTimeline: duration must be a non-negative number, received ${JSON.stringify(duration)}.`);
    }
    if (typeof delay !== 'number' || delay < 0) {
      throw new TypeError(`GraphAnimTimeline: delay must be a non-negative number, received ${JSON.stringify(delay)}.`);
    }
    const easingFn = resolve(easing);
    const start = this.#groupStart + delay;
    for (const path of keys) {
      const keyframe = new GraphAnimKeyframe(path, buildStops(path, props[path]));
      this.#tracks.push({ keyframe, start, duration, easingFn });
    }
    this.#groupEnd = Math.max(this.#groupEnd, start + duration);
    this.#groups[this.#groups.length - 1].end = this.#groupEnd;
  }

  /**
   * Writes every track's interpolated value for absolute position `time`
   * onto `target`. Tracks not yet reached hold their `from` value; tracks
   * already finished hold their `to` value.
   * @param {number} time
   */
  #applyAt(time) {
    for (const track of this.#tracks) {
      const reached = time >= track.start;
      const localRaw = track.duration === 0 ? (reached ? 1 : 0) : (time - track.start) / track.duration;
      const clamped = Math.max(0, Math.min(1, localRaw));
      track.keyframe.apply(this.#target, track.easingFn(clamped));
    }
  }

  /**
   * Fires any group's `onGroupComplete` handlers the first time forward
   * playback reaches or passes that group's own `end` boundary. Reverse
   * (`'pingpong'`) playback re-crossing the same boundary does not re-fire it
   * — only a fresh forward pass (via `#resetGroupFirings`) does.
   *
   * Takes the *pre*-`#resolveBoundaries()` direction and raw accumulated time
   * (not the post-wrap `#time`) — by the time `#resolveBoundaries` returns, a
   * completed pass has already been wrapped back into `[0, duration]` (or
   * flipped direction for `'pingpong'`), which would make a genuine boundary
   * crossing invisible if checked against the wrapped state instead.
   * @param {1|-1} directionThisTick
   * @param {number} rawTime
   */
  #fireCrossedGroups(directionThisTick, rawTime) {
    if (directionThisTick <= 0) return;
    for (const group of this.#groups) {
      if (!group.fired && rawTime >= group.end) {
        group.fired = true;
        for (const handler of group.handlers) handler(this);
      }
    }
  }

  /** Clears every group's fired flag so the next forward pass can fire them again. */
  #resetGroupFirings() {
    for (const group of this.#groups) group.fired = false;
  }

  /**
   * Wraps `#time` back into `[0, groupEnd]` when it overflows/underflows,
   * consuming one loop pass per crossing and flipping `#direction` for
   * `'pingpong'`. Returns whether the timeline has now exhausted its loop
   * count. Boundary checks are gated by the *current* direction (rather than
   * a plain `time < 0`) so a forward pass that wraps exactly onto `time = 0`
   * isn't mistaken for hitting the start while playing backward.
   * @returns {boolean}
   */
  #resolveBoundaries() {
    const total = this.#groupEnd;
    if (total <= 0) return true;
    while ((this.#direction > 0 && this.#time >= total) || (this.#direction < 0 && this.#time <= 0)) {
      if (this.#direction > 0) {
        const overflow = this.#time - total;
        if (this.#loopsDone + 1 >= this.#loopCount) {
          this.#time = total;
          return true;
        }
        this.#loopsDone++;
        if (this.#loopMode === 'pingpong') {
          this.#direction = -1;
          this.#time = total - overflow;
        } else {
          this.#time = overflow;
          this.#pendingGroupReset = true; // a fresh forward pass begins
        }
      } else {
        const underflow = -this.#time;
        if (this.#loopsDone + 1 >= this.#loopCount) {
          this.#time = 0;
          return true;
        }
        this.#loopsDone++;
        if (this.#loopMode === 'pingpong') {
          this.#direction = 1;
          this.#time = underflow;
          this.#pendingGroupReset = true; // pingpong bounced back into a fresh forward pass
        } else {
          this.#time = total - underflow;
        }
      }
    }
    return false;
  }
}
