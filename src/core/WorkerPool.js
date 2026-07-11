import { registerWorkerTask } from './worker/workerBlob.js';

/**
 * How long an idle worker stays alive before being terminated.
 * The Prompt 16 bootstrap takes ~2ms to spin up, so 30 s is a generous keep-warm window.
 */
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;

/**
 * Fallback concurrency for environments that don't expose hardwareConcurrency (Node, some mobile).
 * 4 physical cores is the statistical median for 2024 consumer hardware.
 */
const FALLBACK_CONCURRENCY = 4;

/**
 * @typedef {Object} WorkerSlot
 * @property {Worker} worker
 * @property {number|null} taskId - ID of the currently executing task; null when idle.
 * @property {ReturnType<typeof setTimeout>|null} idleTimer
 */

/**
 * @typedef {Object} QueuedTask
 * @property {number} taskId
 * @property {string} taskName
 * @property {*} payload
 * @property {Transferable[]} transferList
 * @property {function(*): void} resolve
 * @property {function(Error): void} reject
 */

/**
 * @typedef {Object} WorkerPoolOptions
 * @property {function(): Worker} workerFactory - Called to create each Worker instance.
 *   Receives a `() => Worker` so the pool stays decoupled from the bootstrap URL/Blob.
 *   Prompt 16 supplies this by inlining the bootstrap as a Blob URL.
 * @property {number} [size] - Maximum concurrent workers.
 *   Defaults to `Math.max(2, hardwareConcurrency - 1)`.
 * @property {number} [idleTimeoutMs=30000] - Milliseconds before an idle worker is terminated.
 */

/**
 * Manages a bounded pool of Web Workers for off-thread data preparation tasks
 * (sorting, decimation, aggregation, layout calculation). Workers are created
 * lazily and auto-terminated after idling for `idleTimeoutMs`.
 *
 * Message protocol (main ↔ worker, must match `src/core/worker/bootstrap.js`):
 *   main → worker: `{ id: number, task: string, payload: * }`
 *   worker → main: `{ id: number, result: * }` on success
 *                  `{ id: number, error: string }` on failure
 *
 * @example
 * import { WorkerPool } from './WorkerPool.js';
 * import workerUrl from './worker/bootstrap.js?url'; // Vite; see also Prompt 16 for blob variant
 *
 * const pool = new WorkerPool({ workerFactory: () => new Worker(workerUrl, { type: 'module' }) });
 * const sorted = await pool.exec('sort', { data: largeArray }, [largeArray.buffer]);
 * pool.dispose();
 */
export class WorkerPool {
  /** @type {number} */
  #maxSize;

  /** @type {number} */
  #idleTimeoutMs;

  /** @type {function(): Worker} */
  #workerFactory;

  /** @type {WorkerSlot[]} */
  #slots = [];

  /**
   * In-flight tasks only — tasks are added here when dispatched to a worker,
   * not when queued. This keeps dispose() from double-rejecting.
   * @type {Map<number, { resolve: function, reject: function }>}
   */
  #pending = new Map();

  /** @type {QueuedTask[]} */
  #queue = [];

  /** @type {number} */
  #taskCounter = 0;

  /** @type {boolean} */
  #disposed = false;

  /**
   * @param {WorkerPoolOptions} options
   * @throws {TypeError} If `workerFactory` is not a function.
   * @throws {TypeError} If `size` is not a positive integer.
   * @throws {TypeError} If `idleTimeoutMs` is not a positive number.
   */
  constructor({ workerFactory, size, idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS } = {}) {
    if (typeof workerFactory !== 'function') {
      throw new TypeError(
        'WorkerPool: workerFactory must be a function that returns a Worker instance.',
      );
    }
    if (size !== undefined && (!Number.isInteger(size) || size < 1)) {
      throw new TypeError(
        `WorkerPool: size must be a positive integer, received ${size}.`,
      );
    }
    if (typeof idleTimeoutMs !== 'number' || idleTimeoutMs <= 0) {
      throw new TypeError(
        `WorkerPool: idleTimeoutMs must be a positive number, received ${idleTimeoutMs}.`,
      );
    }

    this.#workerFactory = workerFactory;
    this.#idleTimeoutMs = idleTimeoutMs;

    const concurrency =
      (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : null) ??
      FALLBACK_CONCURRENCY;
    this.#maxSize = size ?? Math.max(2, concurrency - 1);
  }

  /**
   * Maximum number of concurrent workers this pool will maintain.
   *
   * @returns {number}
   */
  get size() { return this.#maxSize; }

  /**
   * Idle timeout in milliseconds before a worker is terminated.
   *
   * @returns {number}
   */
  get idleTimeoutMs() { return this.#idleTimeoutMs; }

  /**
   * Number of tasks currently executing on workers.
   *
   * @returns {number}
   */
  get pendingCount() { return this.#pending.size; }

  /**
   * Number of tasks waiting for a free worker.
   *
   * @returns {number}
   */
  get queueLength() { return this.#queue.length; }

  /**
   * Schedule a named task on the next available worker.
   * If all workers are busy and the pool is at capacity, the task is queued.
   * Workers are created lazily; the first call after construction (or after all
   * workers have idled out) spawns a new worker.
   *
   * @param {string} taskName - Registered task name the worker bootstrap will dispatch.
   * @param {*} payload - Structured-cloneable data for the task.
   * @param {Transferable[]} [transferList=[]] - Transferable objects (e.g. `ArrayBuffer`s)
   *   for zero-copy transfer. Listed objects must also appear in `payload`.
   * @returns {Promise<*>} Resolves with the worker's result; rejects on worker error.
   * @throws Never — all errors are channelled through the returned Promise.
   * @example
   * const result = await pool.exec('sort', { data: arr, key: 'value' });
   * @example
   * // Zero-copy transfer of a large Float32Array buffer:
   * const buf = positions.buffer;
   * const out = await pool.exec('decimate', { positions, threshold: 0.1 }, [buf]);
   */
  exec(taskName, payload, transferList = []) {
    if (this.#disposed) {
      return Promise.reject(new Error('WorkerPool.exec: pool has been disposed.'));
    }
    if (typeof taskName !== 'string' || taskName.length === 0) {
      return Promise.reject(
        new TypeError(
          `WorkerPool.exec: taskName must be a non-empty string, received ${JSON.stringify(taskName)}.`,
        ),
      );
    }
    if (!Array.isArray(transferList)) {
      return Promise.reject(
        new TypeError(
          `WorkerPool.exec: transferList must be an array, received ${typeof transferList}.`,
        ),
      );
    }

    return new Promise((resolve, reject) => {
      const taskId = ++this.#taskCounter;

      const idleSlot = this.#slots.find((s) => s.taskId === null);
      if (idleSlot) {
        if (idleSlot.idleTimer !== null) {
          clearTimeout(idleSlot.idleTimer);
          idleSlot.idleTimer = null;
        }
        this.#pending.set(taskId, { resolve, reject });
        this.#dispatch(idleSlot, taskId, taskName, payload, transferList);
        return;
      }

      if (this.#slots.length < this.#maxSize) {
        const slot = this.#spawnSlot();
        this.#pending.set(taskId, { resolve, reject });
        this.#dispatch(slot, taskId, taskName, payload, transferList);
        return;
      }

      // All workers busy at capacity — enqueue; resolve/reject stored here, NOT in #pending.
      this.#queue.push({ taskId, taskName, payload, transferList, resolve, reject });
    });
  }

  /**
   * Registers a user-defined task (Prompt 169) so `exec(taskName, payload)`
   * can dispatch to it — a thin delegate to `worker/workerBlob.js`'s own
   * `registerWorkerTask` (CLAUDE.md §1.1 DRY: no second registration/
   * serialization mechanism lives here). `Graph3D.workers` is the intended
   * entry point (`graph3d.workers.register(taskName, fn)`), but this works
   * on any `WorkerPool` instance directly too.
   *
   * `registerWorkerTask` writes to a *module-level* registry consulted only
   * by `createWorkerFactory()`'s own workers — it takes effect for every
   * pool built that way (not just this one), and, per its own doc, only for
   * workers spawned *after* the call (already-running workers don't
   * retroactively receive it). A pool built with a custom `workerFactory`
   * that doesn't come from `createWorkerFactory()` won't see any effect at
   * all from this method — see this class's own constructor doc for that
   * alternate construction path.
   * @param {string} name Task name, passed as `exec()`'s first argument.
   * @param {function(*): (*|Promise<*>)} fn Self-contained — no closures over
   *   outer scope; it's serialized via `fn.toString()` and reconstructed
   *   inside the worker.
   * @returns {this}
   * @throws {TypeError} If `name` isn't a non-empty string, or `fn` isn't a function.
   * @example
   * graph3d.workers.register('kmeans', ({ data, k }) => { /* pure computation *\/ });
   * const clusters = await graph3d.workers.exec('kmeans', { data: points, k: 5 });
   */
  register(name, fn) {
    registerWorkerTask(name, fn);
    return this;
  }

  /**
   * Terminate all workers, reject all in-flight and queued tasks, and mark the
   * pool as disposed. Safe to call multiple times (idempotent).
   *
   * @example pool.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;

    for (const slot of this.#slots) {
      if (slot.idleTimer !== null) clearTimeout(slot.idleTimer);
      slot.worker.terminate();
    }
    this.#slots = [];

    const err = new Error('WorkerPool: pool has been disposed.');
    for (const { reject } of this.#pending.values()) reject(err);
    this.#pending.clear();

    for (const { reject } of this.#queue) reject(err);
    this.#queue = [];
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /** Create a new slot, attach message/error handlers, push to #slots. */
  #spawnSlot() {
    /** @type {WorkerSlot} */
    const slot = { worker: null, taskId: null, idleTimer: null };
    const worker = this.#workerFactory();

    worker.onmessage = ({ data }) => this.#onMessage(slot, data);
    worker.onerror = (event) => this.#onWorkerError(slot, event?.message ?? 'unknown worker error');
    worker.onmessageerror = () => this.#onWorkerError(slot, 'message deserialization error');

    slot.worker = worker;
    this.#slots.push(slot);
    return slot;
  }

  /**
   * Send a task to a specific slot. Wraps postMessage in a try-catch so that
   * structured-clone failures (non-serializable payload) reject the promise
   * rather than throwing synchronously to the caller.
   */
  #dispatch(slot, taskId, taskName, payload, transferList) {
    slot.taskId = taskId;
    try {
      slot.worker.postMessage({ id: taskId, task: taskName, payload }, transferList);
    } catch (err) {
      // postMessage threw synchronously (e.g. payload not structured-cloneable).
      slot.taskId = null;
      const entry = this.#pending.get(taskId);
      if (entry) {
        this.#pending.delete(taskId);
        entry.reject(err);
      }
      this.#drain(slot);
    }
  }

  /** Handle a response message from a worker. */
  #onMessage(slot, data) {
    const { id, result, error } = data ?? {};
    const entry = this.#pending.get(id);

    // Guard: stale message arriving after dispose() cleared #pending.
    if (!entry) return;

    this.#pending.delete(id);
    slot.taskId = null;

    if (error != null) {
      entry.reject(new Error(`WorkerPool: task '${id}' failed — ${error}`));
    } else {
      entry.resolve(result);
    }

    this.#drain(slot);
  }

  /** Handle a worker runtime error or message-deserialization error. */
  #onWorkerError(slot, message) {
    const taskId = slot.taskId;

    // Remove the dead worker; onerror fires because the worker is already dead.
    this.#removeSlot(slot, false);

    if (taskId !== null) {
      const entry = this.#pending.get(taskId);
      if (entry) {
        this.#pending.delete(taskId);
        entry.reject(new Error(`WorkerPool: worker error on task ${taskId} — ${message}`));
      }
    }

    // Drain the queue: spawn a replacement if capacity allows and there's work waiting.
    this.#drainQueue();
  }

  /**
   * After a task completes: dispatch the next queued item to this slot, or arm
   * the idle timer so the worker can be reclaimed if nothing arrives in time.
   */
  #drain(slot) {
    if (this.#queue.length > 0) {
      const item = this.#queue.shift();
      this.#pending.set(item.taskId, { resolve: item.resolve, reject: item.reject });
      this.#dispatch(slot, item.taskId, item.taskName, item.payload, item.transferList);
    } else {
      slot.idleTimer = setTimeout(() => this.#terminateIdle(slot), this.#idleTimeoutMs);
    }
  }

  /**
   * Process the queue against all currently-idle slots, spawning new ones if
   * the pool is below capacity. Called after a worker error to avoid stranding
   * queued tasks that were waiting for the now-dead worker.
   */
  #drainQueue() {
    while (this.#queue.length > 0) {
      let slot = this.#slots.find((s) => s.taskId === null);

      if (!slot && this.#slots.length < this.#maxSize) {
        slot = this.#spawnSlot();
      }

      if (!slot) break; // at capacity, all busy — queue will drain via #drain()

      if (slot.idleTimer !== null) {
        clearTimeout(slot.idleTimer);
        slot.idleTimer = null;
      }

      const item = this.#queue.shift();
      this.#pending.set(item.taskId, { resolve: item.resolve, reject: item.reject });
      this.#dispatch(slot, item.taskId, item.taskName, item.payload, item.transferList);
    }
  }

  /** Fired by idle timer: terminate the worker if it is still idle. */
  #terminateIdle(slot) {
    // Guard: a task may have arrived between timer scheduling and firing.
    if (slot.taskId !== null) return;
    this.#removeSlot(slot, true);
  }

  #removeSlot(slot, terminate) {
    if (slot.idleTimer !== null) {
      clearTimeout(slot.idleTimer);
      slot.idleTimer = null;
    }
    if (terminate) slot.worker.terminate();
    this.#slots = this.#slots.filter((s) => s !== slot);
  }
}
