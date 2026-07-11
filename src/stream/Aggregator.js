import { WorkerPool } from '../core/WorkerPool.js';
import { createWorkerFactory } from '../core/worker/workerBlob.js';

/**
 * Off-main-thread grouped reduction over a plain data array — a friendly
 * wrapper over `core/worker/tasks.js`'s built-in `'aggregate'` task (already
 * shipped in every worker's bootstrap bundle, CLAUDE.md §1.1 DRY: no second
 * reducer implementation lives here). Owns its own `WorkerPool`, created
 * lazily the same way `WorkerPool` itself creates workers lazily.
 * @example
 * const aggregator = new Aggregator();
 * const totals = await aggregator.run(sales, { groupKey: 'region', valueKey: 'amount' });
 * // { north: 1200, south: 900, ... }
 * const p95 = await aggregator.run(latencies, { valueKey: 'ms', fn: 'percentile', p: 0.95 });
 * aggregator.dispose();
 */
export class Aggregator {
  /** @type {WorkerPool} */
  #pool;
  #disposed = false;

  constructor() {
    this.#pool = new WorkerPool({ workerFactory: createWorkerFactory() });
  }

  /**
   * Groups `data` by `options.groupKey` (or a single `'__all__'` group if
   * omitted) and reduces each group's `options.valueKey` field (or the raw
   * datum, if omitted) via `options.fn`.
   * @param {Array} data
   * @param {{groupKey?: string, valueKey?: string, fn?: ('sum'|'mean'|'max'|'min'|'count'|'percentile'), p?: number}} [options]
   *   `p` (a number in `[0, 1]`) is required when `fn` is `'percentile'`.
   * @returns {Promise<Object<string, number>>} Resolves with one reduced value per group key.
   * @throws {TypeError} If `data` isn't an array.
   * @throws {Error} If this aggregator has been disposed.
   * @example aggregator.run(rows, { groupKey: 'category', valueKey: 'value', fn: 'mean' });
   */
  run(data, options = {}) {
    this.#assertNotDisposed('run');
    if (!Array.isArray(data)) {
      throw new TypeError(`Aggregator.run: data must be an array, received ${JSON.stringify(data)}.`);
    }
    const { groupKey, valueKey, fn = 'sum', p } = options;
    return this.#pool.exec('aggregate', { data, groupKey, valueKey, fn, p });
  }

  /**
   * Terminates the underlying worker pool. Idempotent — safe to call twice.
   * @example aggregator.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#pool.dispose();
  }

  /** @param {string} method @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`Aggregator.${method}: this aggregator has been disposed.`);
    }
  }
}
