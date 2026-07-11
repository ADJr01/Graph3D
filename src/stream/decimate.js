import { WorkerPool } from '../core/WorkerPool.js';
import { createWorkerFactory } from '../core/worker/workerBlob.js';

/**
 * Creates a shape-preserving decimation function backed by an off-main-thread
 * Douglas-Peucker simplification (`core/worker/tasks.js`'s `'douglasPeucker'`
 * task, CLAUDE.md §1.1 DRY: no second copy of the algorithm lives here) — the
 * `middleware` counterpart to `compose/transform.decimate(target)`'s
 * synchronous uniform-stride version. Unlike stride sampling, this keeps the
 * points that matter for the curve's *shape* (corners, spikes) and drops
 * near-collinear runs, at the cost of being async (it round-trips through a
 * worker) and therefore **not** droppable into `chart.use()`, whose
 * middleware pipeline is synchronous — call it directly and hand the
 * resolved array to `chart.data()`.
 *
 * Each call creates its own dedicated `WorkerPool`; the returned function
 * carries a `.dispose()` to release it once no longer needed.
 * @param {{target: number, x?: string, y?: string}} options
 *   `target` (integer ≥ 2) is the desired output count — reached via binary
 *   search on the simplification tolerance, so the actual output count lands
 *   *close to* `target`, not necessarily exact. `x`/`y` are property names
 *   read off each datum (defaults: index for `x`, the datum itself for `y` —
 *   matching `generator.line()`'s own defaults, for a bare `number[]`).
 * @returns {((data: Array) => Promise<Array>) & {dispose: () => void}}
 * @throws {TypeError} If `options.target` isn't an integer ≥ 2.
 * @example
 * const simplify = middleware.decimate({ target: 500, x: 'time', y: 'price' });
 * chart.data(await simplify(hugeSeries)).render();
 * simplify.dispose();
 */
export function decimate({ target, x, y } = {}) {
  if (!Number.isInteger(target) || target < 2) {
    throw new TypeError(`middleware.decimate: target must be an integer >= 2, received ${JSON.stringify(target)}.`);
  }

  const pool = new WorkerPool({ workerFactory: createWorkerFactory() });

  const decimateFn = (data) => {
    if (!Array.isArray(data)) {
      throw new TypeError(`middleware.decimate()(data): expected an array, received ${JSON.stringify(data)}.`);
    }
    return pool.exec('douglasPeucker', { data, x, y, target });
  };
  decimateFn.dispose = () => pool.dispose();
  return decimateFn;
}
