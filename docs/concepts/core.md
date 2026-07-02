# Core Engine — Phase 1

The Core Engine is Layer 1 of Graph3D.js. It provides the rendering loop, WebGL capability detection, frame-time observability, and off-thread data preparation. All higher layers depend on it; it depends on nothing above itself.

---

## Single-RAF / Multi-Scene Design

**Problem:** every `WebGLRenderer` allocates a GL context and every `requestAnimationFrame` call runs its own timer. A page with three charts would otherwise burn three independent RAFs, causing them to drift apart and making it impossible to coordinate pause/resume globally.

**Solution:** `Graph3DLoop` is a module-level singleton that owns exactly one RAF per page. All `Graph3D` instances subscribe frame callbacks to it.

```
Page
 └── Graph3DLoop (1 RAF)
      ├── Graph3D#tick  ← instance A
      ├── Graph3D#tick  ← instance B
      └── Graph3D#tick  ← instance C
```

### How it works

```js
import { loop } from 'graph3d.js';

// The loop is already running once Graph3D is constructed.
// You can also subscribe your own callbacks:
const myTick = (deltaSec, elapsedSec) => {
  mesh.rotation.y += deltaSec;
};
loop.add(myTick);
loop.remove(myTick); // unsubscribes; loop stops when no callbacks remain
```

Key behaviours:

| Behaviour | Detail |
|---|---|
| **Auto-start** | The RAF fires on `loop.add()` — no manual `start()` needed. |
| **Auto-stop** | The RAF is cancelled when the last callback is removed — no idle spin. |
| **Tab-hide pause** | `document.visibilitychange` cancels the RAF when the tab is hidden and reschedules it when visible again. Prevents wasted GPU work on invisible tabs. |
| **Delta = 0 on first tick** | After a start (or a resume from tab-hide), `deltaSec` is `0` for the first frame to prevent a spike caused by the gap. |

### Relationship to `Graph3D`

`Graph3D`'s constructor calls `loop.add(this.#tick)`. The tick records frame time in `FrameBudget`. `Graph3D.pause()` calls `loop.remove(this.#tick)`; `resume()` calls `loop.add(this.#tick)` again. `dispose()` always removes the tick regardless of pause state.

---

## Capability Probe

`CapabilityProbe` detects the GPU's feature set once at construction time. The result is a **frozen** object — capabilities never change after startup and can be safely cached anywhere.

```js
import { Graph3D } from 'graph3d.js';

const g = new Graph3D({ canvas });
const caps = g.capabilities;

if (!caps.webgl2) {
  console.warn('WebGL2 unavailable — instanced drawing disabled');
}
console.log(caps.vendor); // e.g. "NVIDIA Corporation"
```

### Detected capabilities

| Field | Type | Meaning |
|---|---|---|
| `webgl2` | `boolean` | `true` when a WebGL2 context is obtained. |
| `timerQuery` | `boolean` | `EXT_disjoint_timer_query_webgl2` available (GPU-side timing). |
| `floatTextures` | `boolean` | Float render targets supported (`EXT_color_buffer_float` / `OES_texture_float`). |
| `instancedArrays` | `boolean` | `true` on WebGL2 (built-in) or when `ANGLE_instanced_arrays` is present on WebGL1. |
| `maxTextureSize` | `number` | Maximum 1D/2D texture dimension in texels. |
| `maxVertexAttribs` | `number` | Maximum bound vertex attribute slots. |
| `maxInstanceCount` | `number` | Maximum instance count for instanced draws (`MAX_ELEMENT_INDEX` on WebGL2). |
| `vendor` | `string` | GPU vendor string, unmasked when `WEBGL_debug_renderer_info` is available. |
| `renderer` | `string` | GPU renderer string, unmasked when the debug extension is available. |

### Context reuse

`Graph3D` passes its canvas to both `Graph3DRenderer` and `CapabilityProbe`. `CapabilityProbe` calls `canvas.getContext('webgl2')`, but browsers deduplicate GL contexts per canvas — the same underlying context is returned, so no second context slot is consumed.

### Graceful degradation

If neither WebGL2 nor WebGL1 is available (e.g. in jsdom during tests), `CapabilityProbe` emits a `console.warn` and returns `NULL_CAPABILITIES` — all booleans `false`, all numbers `0`. Code that checks `caps.instancedArrays` before choosing a rendering path works correctly without branching on environment.

---

## Frame Budget

`FrameBudget` is a per-instance observability primitive that watches for sustained frame-rate drops. It is not a throttle or a scheduler — it only observes and reports.

### The slow-frame event

```js
const g = new Graph3D({ canvas });

g.frameBudget.addEventListener('graph3d:slow-frame', ({ detail }) => {
  console.warn(
    `Slow frame: ${detail.fps.toFixed(1)} fps`,
    `drawCalls=${detail.drawCalls}`,
  );
});
```

`graph3d:slow-frame` fires once after `windowSize` **consecutive** frames each exceed `budgetMs`. After emitting, the counter resets so the next burst also fires. A single slow frame (e.g. a GC pause) does not trigger it.

### Configuration

```js
import { FrameBudget } from 'graph3d.js';

// The defaults target 60 fps; override for 30 fps targets:
const budget = new FrameBudget({ budgetMs: 33, windowSize: 3 });
```

| Option | Default | Meaning |
|---|---|---|
| `budgetMs` | `16` | Per-frame time budget in milliseconds (16 ms = 60 fps). |
| `windowSize` | `5` | Consecutive over-budget frames before emitting. |

### Event detail

| Field | Type | Meaning |
|---|---|---|
| `fps` | `number` | Average fps across the slow-frame window (`1000 / avgMs`). |
| `drawCalls` | `number` | Draw call count from the last frame (optional, passed by the caller). |
| `triangleCount` | `number` | Triangle count from the last frame. |
| `meshCount` | `number` | Geometry count from the last frame. |
| `chartId` | `string\|null` | Identifier of the active chart, if provided. |

### Integration with the tick

`Graph3D`'s tick converts `deltaSec` (seconds, from the loop) to milliseconds before calling `FrameBudget.record`:

```js
this.#tick = (deltaSec) => {
  this.#frameBudget.record(deltaSec * 1000);
};
```

Call `frameBudget.reset()` on pause/resume or scene change to avoid false positives caused by the gap in the frame stream.

---

## Worker Pool

`WorkerPool` offloads CPU-heavy data tasks (sorting, decimation, aggregation, layout calculation) to dedicated Web Workers so they don't block the render thread.

### Accessing the pool

`Graph3D` creates the pool lazily — no workers are spawned until `.workers` is first accessed:

```js
const g = new Graph3D({ canvas });

// Workers are created on first access:
const result = await g.workers.exec('sort', { data: myArray, key: 'value' });
```

### Zero-copy transfers

Pass large buffers as transferables to avoid the structured-clone cost:

```js
const positions = new Float32Array(1_000_000 * 3);
// positions.buffer is transferred (zero-copy); positions becomes detached.
const decimated = await g.workers.exec(
  'decimate',
  { positions, threshold: 0.01 },
  [positions.buffer],
);
```

### Pool sizing and lifecycle

| Behaviour | Detail |
|---|---|
| **Default size** | `Math.max(2, navigator.hardwareConcurrency - 1)` — keeps one core for the main thread. |
| **Lazy spawn** | Workers are created on first `exec` call, not at construction. |
| **Idle timeout** | Workers that remain idle for 30 seconds are terminated automatically to reclaim memory. |
| **Queue** | If all workers are busy, tasks queue until a slot is free — no tasks are dropped. |
| **Disposal** | `g.dispose()` terminates all workers and rejects any queued/in-flight tasks with a clear error. |

### Registering custom tasks

Register a named task handler in the main thread; the pool will serialize and send it to each worker:

```js
import { registerWorkerTask } from 'graph3d.js';

registerWorkerTask('myFilter', ({ data, threshold }) =>
  data.filter((v) => v > threshold),
);

const filtered = await g.workers.exec('myFilter', { data: bigArray, threshold: 100 });
```

`registerWorkerTask` must be called before the first `exec` that uses the task name. The function body is serialized as a string and reconstructed inside the worker bootstrap.

---

## Disposal Contract

Every Phase 1 class holds resources that must be explicitly released:

```js
const g = new Graph3D({ canvas });

// ...

g.dispose(); // releases: loop tick, ResizeObserver, FrameBudget, WorkerPool, renderer
```

`dispose()` is idempotent — calling it twice is safe. After disposal:

- `g.workers` throws `"instance has been disposed"`.
- `g.setSize()` throws `"instance has been disposed"`.
- `g.pause()` and `g.resume()` are silent no-ops.
- `g.chart()` throws `"instance has been disposed"`.

`Graph3D.disposeAll()` (static) disposes every registered instance — useful for HMR teardown:

```js
if (import.meta.hot) {
  import.meta.hot.dispose(() => Graph3D.disposeAll());
}
```
