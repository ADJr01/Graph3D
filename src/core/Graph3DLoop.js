const SEC = 1 / 1000;

/**
 * RAF-based animation loop. A single instance (`loop`) is shared across the
 * entire page to satisfy the "one RAF per page" requirement. Use `add`/`remove`
 * to register callbacks; the RAF starts and stops automatically.
 *
 * @example
 * import { loop } from './Graph3DLoop.js';
 * const unsubscribe = (delta, elapsed) => mesh.rotation.y += delta;
 * loop.add(unsubscribe);
 * // later:
 * loop.remove(unsubscribe);
 */
export class Graph3DLoop {
  #callbacks = new Set();
  #rafId = null;
  #lastTime = null;
  #elapsed = 0;
  #running = false;
  #onVisibilityChange;

  constructor() {
    this.#onVisibilityChange = () => {
      if (document.hidden) {
        this.#cancelRaf();
      } else if (this.#running) {
        this.#scheduleRaf();
      }
    };
    // SSR-safe: this class is instantiated as a module-level singleton (see
    // `loop` below), so importing the library server-side must not throw.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.#onVisibilityChange);
    }
  }

  /**
   * True while the loop is intended to be active (even if temporarily suspended by tab hide).
   *
   * @returns {boolean}
   */
  get isRunning() {
    return this.#running;
  }

  /**
   * Register a frame callback. Auto-starts the loop on the first add.
   *
   * @param {function(deltaSec: number, elapsedSec: number): void} callback
   * @throws {TypeError} If `callback` is not a function.
   * @example loop.add((delta) => { mesh.rotation.y += delta; });
   */
  add(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError(
        `Graph3DLoop.add: expected a function, received ${typeof callback}.`,
      );
    }
    this.#callbacks.add(callback);
    if (!this.#running) this.start();
  }

  /**
   * Unregister a frame callback. Auto-stops the loop when the last callback is removed.
   *
   * @param {function} callback - Must be the same reference passed to `add`.
   * @example
   * const tick = (delta) => { mesh.rotation.y += delta; };
   * loop.add(tick);
   * loop.remove(tick);
   */
  remove(callback) {
    this.#callbacks.delete(callback);
    if (this.#running && this.#callbacks.size === 0) this.stop();
  }

  /**
   * Manually start the loop. No-op if already running.
   * Respects tab visibility — RAF is deferred if the tab is hidden.
   *
   * @example loop.start();
   */
  start() {
    if (this.#running) return;
    this.#running = true;
    if (typeof document === 'undefined' || !document.hidden) this.#scheduleRaf();
  }

  /**
   * Manually stop the loop. No-op if already stopped.
   * Resets the last-time reference so the next `start` gets delta=0 on its first tick.
   *
   * @example loop.stop();
   */
  stop() {
    if (!this.#running) return;
    this.#running = false;
    this.#cancelRaf();
    this.#lastTime = null; // prevent delta spike if stop() is called mid-tick before #cancelRaf runs
  }

  /**
   * Release all resources: cancels the RAF, clears all callbacks, removes the
   * visibility listener. Safe to call multiple times.
   *
   * @example loop.dispose();
   */
  dispose() {
    this.stop();
    this.#callbacks.clear();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.#onVisibilityChange);
    }
  }

  #scheduleRaf() {
    if (this.#rafId !== null) return;
    // No requestAnimationFrame outside a browser (SSR) — registered callbacks
    // simply never tick; there is nothing to render server-side anyway.
    if (typeof requestAnimationFrame === 'undefined') return;
    this.#rafId = requestAnimationFrame(this.#tick);
  }

  #cancelRaf() {
    if (this.#rafId === null) return;
    cancelAnimationFrame(this.#rafId);
    this.#rafId = null;
    this.#lastTime = null;
  }

  #tick = (now) => {
    this.#rafId = null;
    const delta = this.#lastTime === null ? 0 : (now - this.#lastTime) * SEC;
    this.#lastTime = now;
    this.#elapsed += delta;
    for (const cb of this.#callbacks) cb(delta, this.#elapsed);
    if (this.#running) this.#scheduleRaf();
  };
}

/** Shared singleton — one RAF per page. */
export const loop = new Graph3DLoop();
