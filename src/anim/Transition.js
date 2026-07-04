import { GraphAnimTimeline } from './GraphAnimTimeline.js';
import { resolve } from './GraphAnimCurve.js';
import { anim } from './GraphAnim.js';

// D3's own default transition duration.
const DEFAULT_DURATION_MS = 250;

const VALID_EVENTS = new Set(['start', 'end', 'interrupt']);

/**
 * Cross-transition interrupt bookkeeping (Prompt 93): which `Transition`
 * (and its underlying timeline) is currently animating each dot-path of a
 * given `target`, so a new `.to()` call on the same target+path can emit
 * `'interrupt'` on the one it supersedes and remove just that path's track
 * — leaving any other path the old timeline animates untouched — instead of
 * the two silently fighting over the same property every frame. Keyed by
 * `target` with a `WeakMap` so a target with no more `Transition`s ever
 * created against it is collectable like anything else.
 * @type {WeakMap<object, Map<string, {timeline: GraphAnimTimeline, transition: Transition}>>}
 */
const activeTransitionsByTarget = new WeakMap();

/**
 * D3-flavored transition builder (Prompt 90): configure `.duration()`/
 * `.delay()`/`.easing()`/`.on()`, then `.to(props)` to animate `target`'s
 * dot-paths toward the given values instead of snapping. A thin sugar layer
 * over `GraphAnimTimeline`/`GraphAnim` (CLAUDE.md §1.1 DRY — no tween math
 * lives here, only D3-flavored configuration).
 * @example
 * new Transition(bar.scale)
 *   .duration(600)
 *   .easing('easeOutCubic')
 *   .on('end', () => console.log('done'))
 *   .to({ y: 2.4 });
 */
export class Transition {
  /** @type {object} */
  #target;
  /** @type {number} */
  #durationMs = DEFAULT_DURATION_MS;
  /** @type {number|(() => number)} */
  #delayMsOrFn = 0;
  /** @type {string|((t: number) => number)} */
  #easingNameOrFn = 'linear';
  /** @type {{start: (() => void)[], end: (() => void)[], interrupt: (() => void)[]}} */
  #handlers = { start: [], end: [], interrupt: [] };
  /** @type {boolean} whether a later transition on the same target+path superseded this one */
  #interrupted = false;

  /**
   * @param {object} target The object whose dot-paths will be animated.
   * @throws {TypeError} If `target` is not a non-null object.
   */
  constructor(target) {
    if (target === null || typeof target !== 'object') {
      throw new TypeError(`Transition: expected an object target, received ${JSON.stringify(target)}.`);
    }
    this.#target = target;
  }

  /**
   * @param {number} ms Non-negative duration in milliseconds.
   * @returns {this}
   * @throws {TypeError} If `ms` is not a non-negative number.
   * @example transition.duration(600);
   */
  duration(ms) {
    if (typeof ms !== 'number' || ms < 0) {
      throw new TypeError(`Transition.duration: expected a non-negative number of milliseconds, received ${JSON.stringify(ms)}.`);
    }
    this.#durationMs = ms;
    return this;
  }

  /**
   * @param {number|(() => number)} msOrFn A non-negative delay in milliseconds, or a function returning one.
   * @returns {this}
   * @throws {TypeError} If `msOrFn` is neither a number nor a function.
   * @example transition.delay(100);
   */
  delay(msOrFn) {
    if (typeof msOrFn !== 'number' && typeof msOrFn !== 'function') {
      throw new TypeError(`Transition.delay: expected a number or a function, received ${JSON.stringify(msOrFn)}.`);
    }
    this.#delayMsOrFn = msOrFn;
    return this;
  }

  /**
   * @param {string|((t: number) => number)} nameOrFn A `GraphAnimCurve` curve name, or a raw `(t) => number` function.
   * @returns {this}
   * @throws {TypeError} If `nameOrFn` does not resolve to a valid easing (see `GraphAnimCurve.resolve`).
   * @example transition.easing('easeInOutCubic');
   */
  easing(nameOrFn) {
    resolve(nameOrFn); // validates eagerly (Fail Fast); the resolved fn itself is looked up again by GraphAnimTimeline.to()
    this.#easingNameOrFn = nameOrFn;
    return this;
  }

  /**
   * Registers a lifecycle handler. `'start'` fires once playback (past any
   * configured delay) begins; `'end'` fires once this transition completes
   * normally; `'interrupt'` fires once (Prompt 93) if a later `.to()` call on
   * the same target and an overlapping dot-path supersedes this one before
   * it finishes — in which case `'end'` does *not* also fire for this transition.
   * @param {'start'|'end'|'interrupt'} event
   * @param {() => void} handler
   * @returns {this}
   * @throws {TypeError} If `event` isn't recognized, or `handler` isn't a function.
   * @example transition.on('interrupt', () => console.log('superseded'));
   */
  on(event, handler) {
    if (!VALID_EVENTS.has(event)) {
      throw new TypeError(`Transition.on: event must be one of 'start'/'end'/'interrupt', received ${JSON.stringify(event)}.`);
    }
    if (typeof handler !== 'function') {
      throw new TypeError(`Transition.on: handler must be a function, received ${JSON.stringify(handler)}.`);
    }
    this.#handlers[event].push(handler);
    return this;
  }

  /**
   * Animates `target`'s dot-paths in `props` to the given values, using this
   * transition's configured duration/delay/easing. Registers the underlying
   * timeline with the shared `anim` engine (Prompt 89) and starts it immediately.
   * @param {Object<string, *>} props Dot-path → target value.
   * @returns {GraphAnimTimeline} The underlying timeline (for `.stop()`, further sequencing via `.then()`, etc).
   * @throws {TypeError} If `props` isn't a plain object, or a configured delay function returns a non-number.
   * @example transition.to({ 'position.y': 4, opacity: 0 });
   */
  to(props) {
    if (props === null || typeof props !== 'object' || Array.isArray(props)) {
      throw new TypeError(`Transition.to: props must be a plain object of dot-path -> value, received ${JSON.stringify(props)}.`);
    }
    const delayMs = typeof this.#delayMsOrFn === 'function' ? this.#delayMsOrFn() : this.#delayMsOrFn;
    if (typeof delayMs !== 'number' || delayMs < 0) {
      throw new TypeError(`Transition.to: delay must resolve to a non-negative number, received ${JSON.stringify(delayMs)}.`);
    }

    const timeline = new GraphAnimTimeline(this.#target);
    if (delayMs > 0) timeline.wait(delayMs / 1000);
    timeline.to(props, { duration: this.#durationMs / 1000, easing: this.#easingNameOrFn });
    this.#interruptPriorAndRegister(props, timeline);

    let started = delayMs === 0;
    if (started) {
      for (const handler of this.#handlers.start) handler();
    } else {
      const delaySec = delayMs / 1000;
      timeline.onUpdate((time) => {
        if (!started && !this.#interrupted && time >= delaySec) {
          started = true;
          for (const handler of this.#handlers.start) handler();
        }
      });
    }
    timeline.onComplete(() => {
      this.#unregister(props, timeline);
      if (!this.#interrupted) {
        for (const handler of this.#handlers.end) handler();
      }
    });

    anim.add(timeline);
    timeline.play();
    return timeline;
  }

  /**
   * Cross-transition interrupt bookkeeping (Prompt 93): for every dot-path in
   * `props`, if another still-active `Transition` is already animating that
   * exact path on `this.#target`, remove just that path's track from its
   * timeline (`GraphAnimTimeline.interruptPath`) and fire its `'interrupt'`
   * handlers — then this transition's own entry becomes the current one for
   * that path.
   * @param {Object<string, *>} props
   * @param {GraphAnimTimeline} timeline
   */
  #interruptPriorAndRegister(props, timeline) {
    let byPath = activeTransitionsByTarget.get(this.#target);
    if (!byPath) {
      byPath = new Map();
      activeTransitionsByTarget.set(this.#target, byPath);
    }
    for (const path of Object.keys(props)) {
      const prior = byPath.get(path);
      if (prior && prior.transition !== this && prior.timeline.interruptPath(path)) {
        prior.transition.#markInterrupted();
      }
      byPath.set(path, { timeline, transition: this });
    }
  }

  /** Removes this transition's now-finished entries from the shared registry, for every path it owns. */
  #unregister(props, timeline) {
    const byPath = activeTransitionsByTarget.get(this.#target);
    if (!byPath) return;
    for (const path of Object.keys(props)) {
      if (byPath.get(path)?.timeline === timeline) byPath.delete(path);
    }
  }

  /**
   * Called by a *different* `Transition` instance that just superseded this
   * one on one of its paths (private fields are accessible across instances
   * of the same class, per the language spec — this isn't a visibility
   * violation). Fires `'interrupt'` at most once even if this transition
   * animates several paths and more than one gets superseded.
   */
  #markInterrupted() {
    if (this.#interrupted) return;
    this.#interrupted = true;
    for (const handler of this.#handlers.interrupt) handler();
  }

  /**
   * How many dot-paths on `target` currently have a `Transition` still
   * animating them (Prompt 96) — the introspection primitive a future
   * `chart.runningTransitions()` delegates to once `src/chart/` exists
   * (Phase 8); usable standalone today against any target.
   * @param {object} target
   * @returns {number}
   * @example Transition.runningOn(mesh.position); // 2, if x and y are both mid-tween
   */
  static runningOn(target) {
    return activeTransitionsByTarget.get(target)?.size ?? 0;
  }

  /**
   * Immediately stops every `Transition` currently animating any path of
   * `target` (Prompt 96) — the introspection primitive a future
   * `chart.cancelTransitions()` delegates to. Each stopped transition is
   * simply unregistered from `anim`, frozen at its current interpolated
   * value — neither its `'end'` nor `'interrupt'` handlers fire (this is a
   * hard stop requested by the caller, not one transition superseding
   * another).
   * @param {object} target
   * @returns {number} How many were stopped.
   * @example Transition.cancelAllOn(mesh.position);
   */
  static cancelAllOn(target) {
    const byPath = activeTransitionsByTarget.get(target);
    if (!byPath) return 0;
    const stopped = new Set();
    for (const { timeline } of byPath.values()) stopped.add(timeline);
    for (const timeline of stopped) {
      timeline.pause(); // so even a direct timeline.update() call afterward stays inert
      anim.remove(timeline);
    }
    const count = byPath.size;
    byPath.clear();
    return count;
  }
}
