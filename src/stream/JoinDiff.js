import { WorkerPool } from '../core/WorkerPool.js';
import { createWorkerFactory } from '../core/worker/workerBlob.js';
import { diffData } from '../compose/index.js';

// Prompt 167's own threshold ("worker-offloaded join diff when data length
// > 10,000") — below it, diffData()'s own Map-based join is already fast
// enough that a worker round-trip would only add latency for no benefit.
const DEFAULT_THRESHOLD = 10000;

/**
 * Worker-offloaded join diff (Prompt 167): a thin wrapper over
 * `compose/selection/diffData` (the single diff authority, CLAUDE.md §1.1
 * DRY) that offloads the Map-based key-matching work to a worker once
 * `oldData`/`newData` cross `threshold`, via `core/worker/tasks.js`'s
 * `'joinDiff'` built-in task.
 *
 * `keyFn` is a closure and can't be transferred to a worker, so `diff()`
 * evaluates it on the main thread first (`oldData.map(keyFn)`/
 * `newData.map(keyFn)` — unavoidable, keyFn is opaque), sends only the
 * resulting keys, and re-attaches `datum` from the original arrays once the
 * worker returns matched index lists. The worker runs the *exact* same
 * Map-insertion-order algorithm as `diffData`'s keyed branch, so results are
 * byte-for-byte identical regardless of which path ran.
 *
 * A positional diff (no `keyFn`) is already O(1) index arithmetic — never
 * worth a worker round-trip — so `diff()` always resolves it synchronously
 * via `diffData` regardless of `threshold`.
 * @example
 * const joinDiff = new JoinDiff();
 * const { enter, update, exit } = await joinDiff.diff(oldRows, newRows, (d) => d.id);
 * joinDiff.dispose();
 */
export class JoinDiff {
  /** @type {number} */
  #threshold;
  /** @type {WorkerPool|null} Lazily created — only if the worker path is ever actually used. */
  #pool = null;
  /** @type {boolean} */
  #disposed = false;

  /**
   * @param {{threshold?: number}} [options]
   * @throws {TypeError} If `threshold` isn't a positive number.
   * @example new JoinDiff({ threshold: 5000 });
   */
  constructor({ threshold = DEFAULT_THRESHOLD } = {}) {
    if (typeof threshold !== 'number' || !(threshold > 0)) {
      throw new TypeError(`JoinDiff: threshold must be a positive number, received ${JSON.stringify(threshold)}.`);
    }
    this.#threshold = threshold;
  }

  /**
   * Diffs `oldData` against `newData` — same contract, signature, and
   * output shape as `diffData(oldData, newData, keyFn)`, just asynchronous.
   * @param {*[]} oldData
   * @param {*[]} newData
   * @param {(datum: *, index: number) => *} [keyFn]
   * @returns {Promise<{
   *   enter: {datum: *, newIndex: number}[],
   *   update: {datum: *, oldIndex: number, newIndex: number}[],
   *   exit: {datum: *, oldIndex: number}[],
   * }>}
   * @throws {TypeError} If `oldData`/`newData` are not arrays, or `keyFn` is provided but not a function.
   * @throws {Error} If `keyFn` produces the same key for two different `newData` entries.
   * @throws {Error} If this instance has been disposed.
   * @example joinDiff.diff(oldRows, newRows, (d) => d.id);
   */
  async diff(oldData, newData, keyFn) {
    this.#assertNotDisposed('diff');
    if (!Array.isArray(oldData) || !Array.isArray(newData)) {
      throw new TypeError('JoinDiff.diff: oldData and newData must both be arrays.');
    }
    if (keyFn !== undefined && typeof keyFn !== 'function') {
      throw new TypeError(`JoinDiff.diff: keyFn must be a function, received ${JSON.stringify(keyFn)}.`);
    }

    if (!keyFn || Math.max(oldData.length, newData.length) <= this.#threshold) {
      return diffData(oldData, newData, keyFn);
    }

    const oldKeys = oldData.map(keyFn);
    const newKeys = newData.map(keyFn);
    this.#pool ??= new WorkerPool({ workerFactory: createWorkerFactory() });
    const { enterNewIndices, updateOldIndices, updateNewIndices, exitOldIndices } =
      await this.#pool.exec('joinDiff', { oldKeys, newKeys });

    const enter = enterNewIndices.map((newIndex) => ({ datum: newData[newIndex], newIndex }));
    const update = updateOldIndices.map((oldIndex, k) => ({
      datum: newData[updateNewIndices[k]],
      oldIndex,
      newIndex: updateNewIndices[k],
    }));
    const exit = exitOldIndices.map((oldIndex) => ({ datum: oldData[oldIndex], oldIndex }));
    return { enter, update, exit };
  }

  /**
   * Terminates the underlying worker pool, if one was ever created. Idempotent.
   * @example joinDiff.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#pool?.dispose();
  }

  /** @param {string} method @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`JoinDiff.${method}: this instance has been disposed.`);
    }
  }
}
