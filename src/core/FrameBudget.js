/**
 * @typedef {Object} FrameBudgetOptions
 * @property {number} [budgetMs=16] - Per-frame time budget in milliseconds (default targets 60fps).
 * @property {number} [windowSize=5] - Number of *consecutive* over-budget frames before emitting.
 */

/**
 * @typedef {Object} SlowFrameDetail
 * @property {string|null} chartId
 * @property {number} drawCalls
 * @property {number} triangleCount
 * @property {number} meshCount
 * @property {number} fps - Average fps across the slow-frame window (1000 / avgMs).
 */

/**
 * Per-frame timing watchdog. Tracks consecutive over-budget frames and dispatches
 * a `graph3d:slow-frame` CustomEvent once the threshold is met, then resets so
 * subsequent bursts also emit. Extends `EventTarget` for zero-coupling event delivery.
 *
 * Frame times are in **milliseconds**. If you receive delta in seconds from
 * `Graph3DLoop`, multiply by 1000 before passing to `record`.
 *
 * @extends EventTarget
 *
 * @example
 * const budget = new FrameBudget({ budgetMs: 16, windowSize: 5 });
 * budget.addEventListener('graph3d:slow-frame', ({ detail }) => {
 *   console.warn('slow frame', detail.fps.toFixed(1), 'fps');
 * });
 *
 * // Inside the render loop (delta is in seconds from Graph3DLoop):
 * budget.record(delta * 1000, {
 *   chartId: 'scatter-1',
 *   drawCalls: renderer.info.render.calls,
 *   triangleCount: renderer.info.render.triangles,
 *   meshCount: renderer.info.memory.geometries,
 * });
 */
export class FrameBudget extends EventTarget {
  /** @type {number} */
  #budgetMs;

  /** @type {number} */
  #windowSize;

  /** @type {number} Consecutive over-budget frame count; reset after emit or on reset(). */
  #consecutiveSlow = 0;

  /**
   * Rolling buffer of the last `windowSize` frame times, used to compute FPS
   * in the event detail without allocating on every frame.
   * @type {number[]}
   */
  #recentMs = [];

  /** @type {boolean} */
  #disposed = false;

  /**
   * @param {FrameBudgetOptions} [options]
   * @throws {TypeError} If `budgetMs` is not a positive number.
   * @throws {TypeError} If `windowSize` is not a positive integer.
   */
  constructor({ budgetMs = 16, windowSize = 5 } = {}) {
    super();
    if (typeof budgetMs !== 'number' || budgetMs <= 0) {
      throw new TypeError(
        `FrameBudget: budgetMs must be a positive number, received ${budgetMs}.`,
      );
    }
    if (!Number.isInteger(windowSize) || windowSize < 1) {
      throw new TypeError(
        `FrameBudget: windowSize must be a positive integer, received ${windowSize}.`,
      );
    }
    this.#budgetMs = budgetMs;
    this.#windowSize = windowSize;
  }

  /** The configured per-frame budget in milliseconds. */
  get budgetMs() { return this.#budgetMs; }

  /** The number of consecutive slow frames required to emit. */
  get windowSize() { return this.#windowSize; }

  /**
   * Record one frame's elapsed time and update the slow-frame counter.
   * Dispatches `graph3d:slow-frame` when `windowSize` consecutive frames
   * each exceed `budgetMs`, then resets the counter.
   *
   * @param {number} frameMs - Elapsed time for this frame in **milliseconds**.
   * @param {object} [context] - Renderer stats to include in the event detail.
   * @param {string|null} [context.chartId=null]
   * @param {number} [context.drawCalls=0]
   * @param {number} [context.triangleCount=0]
   * @param {number} [context.meshCount=0]
   * @throws {Error} If called after `dispose()`.
   * @throws {TypeError} If `frameMs` is not a non-negative number.
   * @example budget.record(16.7, { chartId: 'scatter-1', drawCalls: 42, triangleCount: 120000, meshCount: 3 });
   */
  record(frameMs, {
    chartId = null,
    drawCalls = 0,
    triangleCount = 0,
    meshCount = 0,
  } = {}) {
    if (this.#disposed) {
      throw new Error('FrameBudget.record: instance has been disposed.');
    }
    if (typeof frameMs !== 'number' || frameMs < 0) {
      throw new TypeError(
        `FrameBudget.record: frameMs must be a non-negative number, received ${frameMs}.`,
      );
    }

    // Maintain a fixed-size rolling window without creating garbage on each frame.
    if (this.#recentMs.length === this.#windowSize) this.#recentMs.shift();
    this.#recentMs.push(frameMs);

    if (frameMs > this.#budgetMs) {
      this.#consecutiveSlow++;
    } else {
      this.#consecutiveSlow = 0;
    }

    if (this.#consecutiveSlow >= this.#windowSize) {
      const avgMs = this.#recentMs.reduce((sum, t) => sum + t, 0) / this.#recentMs.length;
      /** @type {SlowFrameDetail} */
      const detail = {
        chartId,
        drawCalls,
        triangleCount,
        meshCount,
        fps: 1000 / avgMs,
      };
      this.dispatchEvent(new CustomEvent('graph3d:slow-frame', { detail }));
      // Reset so the next burst of slow frames also emits rather than staying silent.
      this.#consecutiveSlow = 0;
    }
  }

  /**
   * Reset the consecutive-frame counter and the rolling time buffer.
   * Call this on pause/resume or scene change to avoid false positives
   * caused by a gap in the frame stream.
   *
   * @throws {Error} If called after `dispose()`.
   * @example budget.reset();
   */
  reset() {
    if (this.#disposed) {
      throw new Error('FrameBudget.reset: instance has been disposed.');
    }
    this.#consecutiveSlow = 0;
    this.#recentMs = [];
  }

  /**
   * Release internal state. Safe to call multiple times (idempotent).
   * After disposal, `record` and `reset` throw; `addEventListener` and
   * `removeEventListener` become no-ops via the parent EventTarget.
   *
   * @example budget.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#consecutiveSlow = 0;
    this.#recentMs = [];
  }
}
