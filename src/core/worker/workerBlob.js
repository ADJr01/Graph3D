/**
 * `WORKER_BLOB` is a base64-encoded, self-contained IIFE injected at build time
 * by the `workerBlobPlugin` in `rollup.config.js`. It is never a real file on disk.
 * In tests, mock this module with `vi.mock('virtual:worker-blob', ...)`.
 */
import { WORKER_BLOB } from 'virtual:worker-blob';

/**
 * Lazily-created blob URL for the worker IIFE.
 * Cached so we create the Blob once per page regardless of pool size.
 * @type {string|null}
 */
let _blobUrl = null;

function getBlobUrl() {
  if (_blobUrl) return _blobUrl;
  const code = atob(WORKER_BLOB);
  _blobUrl = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
  return _blobUrl;
}

/**
 * Custom task registrations accumulated before (and after) pool creation.
 * Stored as serialised function strings so they survive the structured-clone
 * boundary when sent to new workers.
 * @type {Map<string, string>}
 */
const pendingRegistrations = new Map();

/**
 * Register a custom task available to all workers created by `createWorkerFactory`.
 * Workers that are already running receive the registration immediately on the
 * next `workerFactory()` call; existing live workers do NOT retroactively receive it
 * unless you dispose and recreate the pool.
 *
 * The function must be self-contained (no closures over module scope) because it
 * is serialised via `fn.toString()` and reconstructed inside the worker with
 * `new Function`. Requires CSP `unsafe-eval` to execute in the worker.
 *
 * @param {string} name - Task name passed to `WorkerPool.exec(name, payload)`.
 * @param {function(*): * | Promise<*>} fn - Task implementation. Receives `payload`.
 * @throws {TypeError} If `name` is not a non-empty string.
 * @throws {TypeError} If `fn` is not a function.
 * @example
 * registerWorkerTask('kmeans', ({ data, k }) => { /* pure computation *\/ });
 * const pool = new WorkerPool({ workerFactory: createWorkerFactory() });
 * const clusters = await pool.exec('kmeans', { data: points, k: 5 });
 */
export function registerWorkerTask(name, fn) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError(
      `registerWorkerTask: name must be a non-empty string, received ${JSON.stringify(name)}.`,
    );
  }
  if (typeof fn !== 'function') {
    throw new TypeError(
      `registerWorkerTask: fn must be a function, received ${typeof fn}.`,
    );
  }
  pendingRegistrations.set(name, fn.toString());
}

/**
 * Return a `workerFactory` suitable for `new WorkerPool({ workerFactory })`.
 * Each call to the factory creates a Worker from the inlined bootstrap blob and
 * immediately sends all currently-registered custom task registrations to it.
 *
 * @returns {function(): Worker}
 * @example
 * import { createWorkerFactory, registerWorkerTask } from './workerBlob.js';
 * import { WorkerPool } from '../WorkerPool.js';
 *
 * registerWorkerTask('myTask', (payload) => payload.data.reverse());
 * const pool = new WorkerPool({ workerFactory: createWorkerFactory() });
 * const result = await pool.exec('myTask', { data: [3, 1, 2] });
 */
export function createWorkerFactory() {
  return () => {
    const worker = new Worker(getBlobUrl());
    for (const [name, fn] of pendingRegistrations) {
      worker.postMessage({ type: 'register', name, fn });
    }
    return worker;
  };
}
