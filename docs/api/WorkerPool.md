# WorkerPool

<a name="module_WorkerPool.WorkerPool"></a>

## WorkerPool
Manages a bounded pool of Web Workers for off-thread data preparation tasks
(sorting, decimation, aggregation, layout calculation). Workers are created
lazily and auto-terminated after idling for `idleTimeoutMs`.

Message protocol (main ↔ worker, must match `src/core/worker/bootstrap.js`):
  main → worker: `{ id: number, task: string, payload: * }`
  worker → main: `{ id: number, result: * }` on success
                 `{ id: number, error: string }` on failure

**Kind**: static class of [<code>WorkerPool</code>](#module_WorkerPool)  

* [.WorkerPool](#module_WorkerPool.WorkerPool)
    * [new exports.WorkerPool(options)](#new_module_WorkerPool.WorkerPool_new)
    * [.size](#module_WorkerPool.WorkerPool+size) ⇒ <code>number</code>
    * [.idleTimeoutMs](#module_WorkerPool.WorkerPool+idleTimeoutMs) ⇒ <code>number</code>
    * [.pendingCount](#module_WorkerPool.WorkerPool+pendingCount) ⇒ <code>number</code>
    * [.queueLength](#module_WorkerPool.WorkerPool+queueLength) ⇒ <code>number</code>
    * [.exec(taskName, payload, [transferList])](#module_WorkerPool.WorkerPool+exec) ⇒ <code>\*</code>
    * [.register(name, fn)](#module_WorkerPool.WorkerPool+register) ⇒ <code>this</code>
    * [.dispose()](#module_WorkerPool.WorkerPool+dispose)

<a name="new_module_WorkerPool.WorkerPool_new"></a>

### new exports.WorkerPool(options)
**Throws**:

- <code>TypeError</code> If `workerFactory` is not a function.
- <code>TypeError</code> If `size` is not a positive integer.
- <code>TypeError</code> If `idleTimeoutMs` is not a positive number.


| Param | Type |
| --- | --- |
| options | <code>WorkerPoolOptions</code> | 

**Example**  
```js
import { WorkerPool } from './WorkerPool.js';
import workerUrl from './worker/bootstrap.js?url'; // Vite; see also Prompt 16 for blob variant

const pool = new WorkerPool({ workerFactory: () => new Worker(workerUrl, { type: 'module' }) });
const sorted = await pool.exec('sort', { data: largeArray }, [largeArray.buffer]);
pool.dispose();
```
<a name="module_WorkerPool.WorkerPool+size"></a>

### workerPool.size ⇒ <code>number</code>
Maximum number of concurrent workers this pool will maintain.

**Kind**: instance property of [<code>WorkerPool</code>](#module_WorkerPool.WorkerPool)  
<a name="module_WorkerPool.WorkerPool+idleTimeoutMs"></a>

### workerPool.idleTimeoutMs ⇒ <code>number</code>
Idle timeout in milliseconds before a worker is terminated.

**Kind**: instance property of [<code>WorkerPool</code>](#module_WorkerPool.WorkerPool)  
<a name="module_WorkerPool.WorkerPool+pendingCount"></a>

### workerPool.pendingCount ⇒ <code>number</code>
Number of tasks currently executing on workers.

**Kind**: instance property of [<code>WorkerPool</code>](#module_WorkerPool.WorkerPool)  
<a name="module_WorkerPool.WorkerPool+queueLength"></a>

### workerPool.queueLength ⇒ <code>number</code>
Number of tasks waiting for a free worker.

**Kind**: instance property of [<code>WorkerPool</code>](#module_WorkerPool.WorkerPool)  
<a name="module_WorkerPool.WorkerPool+exec"></a>

### workerPool.exec(taskName, payload, [transferList]) ⇒ <code>\*</code>
Schedule a named task on the next available worker.
If all workers are busy and the pool is at capacity, the task is queued.
Workers are created lazily; the first call after construction (or after all
workers have idled out) spawns a new worker.

**Kind**: instance method of [<code>WorkerPool</code>](#module_WorkerPool.WorkerPool)  
**Returns**: <code>\*</code> - Resolves with the worker's result; rejects on worker error.  
**Throws**:

- Never — all errors are channelled through the returned Promise.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| taskName | <code>string</code> |  | Registered task name the worker bootstrap will dispatch. |
| payload | <code>\*</code> |  | Structured-cloneable data for the task. |
| [transferList] | <code>\*</code> | <code>[]</code> | Transferable objects (e.g. `ArrayBuffer`s)   for zero-copy transfer. Listed objects must also appear in `payload`. |

**Example**  
```js
const result = await pool.exec('sort', { data: arr, key: 'value' });
```
**Example**  
```js
// Zero-copy transfer of a large Float32Array buffer:
const buf = positions.buffer;
const out = await pool.exec('decimate', { positions, threshold: 0.1 }, [buf]);
```
<a name="module_WorkerPool.WorkerPool+register"></a>

### workerPool.register(name, fn) ⇒ <code>this</code>
Registers a user-defined task (Prompt 169) so `exec(taskName, payload)`
can dispatch to it — a thin delegate to `worker/workerBlob.js`'s own
`registerWorkerTask` (CLAUDE.md §1.1 DRY: no second registration/
serialization mechanism lives here). `Graph3D.workers` is the intended
entry point (`graph3d.workers.register(taskName, fn)`), but this works
on any `WorkerPool` instance directly too.

`registerWorkerTask` writes to a *module-level* registry consulted only
by `createWorkerFactory()`'s own workers — it takes effect for every
pool built that way (not just this one), and, per its own doc, only for
workers spawned *after* the call (already-running workers don't
retroactively receive it). A pool built with a custom `workerFactory`
that doesn't come from `createWorkerFactory()` won't see any effect at
all from this method — see this class's own constructor doc for that
alternate construction path.

**Kind**: instance method of [<code>WorkerPool</code>](#module_WorkerPool.WorkerPool)  
**Throws**:

- <code>TypeError</code> If `name` isn't a non-empty string, or `fn` isn't a function.


| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | Task name, passed as `exec()`'s first argument. |
| fn | <code>\*</code> | Self-contained — no closures over   outer scope; it's serialized via `fn.toString()` and reconstructed   inside the worker. |

**Example**  
```js
graph3d.workers.register('kmeans', ({ data, k }) => { /* pure computation *\/ });
const clusters = await graph3d.workers.exec('kmeans', { data: points, k: 5 });
```
<a name="module_WorkerPool.WorkerPool+dispose"></a>

### workerPool.dispose()
Terminate all workers, reject all in-flight and queued tasks, and mark the
pool as disposed. Safe to call multiple times (idempotent).

**Kind**: instance method of [<code>WorkerPool</code>](#module_WorkerPool.WorkerPool)  
**Example**  
```js
pool.dispose();
```
