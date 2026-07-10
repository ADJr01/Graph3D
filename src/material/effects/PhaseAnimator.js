import { loop } from '../../core/Graph3DLoop.js';
import { resolve as resolveEasing } from '../../anim/index.js';

const DEFAULT_DURATION_MS = 150;

/**
 * Drives any number of concurrent 0..1 phase animations (effect fade-in on
 * hover-enter, fade-out on hover-leave; several independent select-effect
 * fades for a multi-selection) off one shared `loop` callback — mirrors
 * `GraphInstancedObject`'s own bulk-transition RAF pattern (never a second
 * `requestAnimationFrame`, per CLAUDE.md §2's anti-pattern table),
 * generalized here since this feature needs it from two call sites
 * (per-instance attribute writes and per-mesh uniform writes — CLAUDE.md
 * §1.1 DRY two-strike rule).
 *
 * @example
 * const animator = new PhaseAnimator();
 * animator.animate('bar-3', 0, 1, (phase) => { uniforms.effectPhase_hover.value = phase; });
 * animator.animate('bar-3', 1, 0, (phase) => { ... }); // supersedes the in-flight entry for the same key
 */
export class PhaseAnimator {
  /** @type {Map<*, {from: number, to: number, elapsedMs: number, durationMs: number, easingFn: (t:number)=>number, onFrame: (phase:number)=>void, onDone?: () => void}>} */
  #entries = new Map();

  /** @type {((deltaSeconds: number) => void)|null} */
  #tick = null;

  /**
   * Animate `key`'s phase from `from` to `to` over `durationMs`, calling
   * `onFrame(phase)` every frame (including a final call at exactly `to`).
   * A new call for a `key` already animating replaces it outright — the
   * old one's `onFrame` simply stops being called (no separate "interrupt"
   * event; this is a much narrower need than `anim/Transition`'s full
   * interrupt registry, CLAUDE.md §1.2 KISS).
   * @param {*} key
   * @param {number} from
   * @param {number} to
   * @param {(phase: number) => void} onFrame
   * @param {{durationMs?: number, easing?: (string|((t:number)=>number)), onDone?: () => void}} [options]
   * @example animator.animate(instanceIndex, 0, 1, (phase) => gi.setInstanceAttribute(instanceIndex, 'effectPhase_hover', phase));
   */
  animate(key, from, to, onFrame, options = {}) {
    const { durationMs = DEFAULT_DURATION_MS, easing = 'linear', onDone } = options;
    const easingFn = resolveEasing(easing);
    this.#entries.set(key, { from, to, elapsedMs: 0, durationMs, easingFn, onFrame, onDone });
    if (!this.#tick) {
      this.#tick = (deltaSeconds) => this.#advance(deltaSeconds);
      loop.add(this.#tick);
    }
  }

  /** Stop animating `key` immediately, without a final `onFrame` call. No-op if `key` isn't animating. @param {*} key */
  cancel(key) {
    this.#entries.delete(key);
    this.#stopLoopIfIdle();
  }

  /** Stop every in-flight animation and unsubscribe from `loop`. */
  dispose() {
    this.#entries.clear();
    this.#stopLoopIfIdle();
  }

  /** @param {number} deltaSeconds */
  #advance(deltaSeconds) {
    for (const [key, entry] of this.#entries) {
      entry.elapsedMs += deltaSeconds * 1000;
      const t = Math.min(1, entry.elapsedMs / entry.durationMs);
      const phase = entry.from + (entry.to - entry.from) * entry.easingFn(t);
      entry.onFrame(phase);
      if (t >= 1) {
        this.#entries.delete(key);
        entry.onDone?.();
      }
    }
    this.#stopLoopIfIdle();
  }

  #stopLoopIfIdle() {
    if (this.#entries.size === 0 && this.#tick) {
      loop.remove(this.#tick);
      this.#tick = null;
    }
  }
}
