# Core Engine — Phase 1

The Core Engine is Layer 1 of Graph3D.js. It provides the rendering loop, WebGL capability detection, frame-time observability, and off-thread data preparation. All higher layers depend on it; it depends on nothing above itself.

---

## `VERSION`

```js
import { VERSION } from 'graph3d.js';

console.log(VERSION); // '0.1.0' — the same string as package.json's "version" field
```

A plain semver string constant, useful for logging/telemetry or a runtime compatibility check — not a function, no arguments.

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
| **Per-callback error isolation** | Each registered callback runs inside its own `try`/`catch`; a thrown error is logged via `console.error` and that callback is skipped for the frame — it does not stop the other registered callbacks, and does not prevent the next frame from being scheduled. Without this, one broken callback (e.g. a stale reference into a disposed scene) would silently freeze rendering for every `Graph3D` instance on the page, forever — the `for` loop dispatching callbacks would exit early on the throw, skipping the code that schedules the next RAF, with no other callback left to trigger recovery. |

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

## SSR-Safe Mode

Importing `graph3d.js` and constructing a `Graph3D` instance never throws server-side (no `window`) — only actually rendering a frame does, with a clear error.

```js
// Works in Node/SSR (e.g. Next.js getServerSideProps) exactly as in a browser:
import { Graph3D } from 'graph3d.js';

const g = new Graph3D({}); // canvas omitted — detected automatically, no window means SSR
g.setActiveScene(g.createScene('main'));
g.chart('bar').data(values, (d) => d.id); // scene/chart construction, scales, data binding — all fine

g.renderer.render(scene, camera); // throws: "requires a browser environment"
```

### What works vs. what throws

| Server-side | Client-side only |
|---|---|
| `new Graph3D({})` (no canvas required) | `g.renderer.render(scene, camera)` |
| `g.createScene()`, `g.setActiveScene()` | Anything the RAF loop drives automatically — it simply never ticks server-side (no `requestAnimationFrame`) |
| `g.chart(typeName).data(...)`, scales, layouts, generators | |
| `g.dispose()` | |

### How it's detected

`typeof window === 'undefined'` is checked once, in `Graph3D`'s constructor — matching the same idiom already used for `pixelRatio`'s browser default. When true:

- `canvas` becomes optional (a browser construction with no canvas still throws as before).
- `Graph3D` uses `SSRGraph3DRenderer` instead of `Graph3DRenderer`. Its `.three` is `null`, which `GraphScene` already treats as "no renderer available" (the same renderer-optional path a bare test stub takes) — so environment/shadows/clipping are skipped automatically, with zero SSR-specific code in `GraphScene` itself.
- `CapabilityProbe` (checked independently, via `typeof document === 'undefined'`) returns `NULL_CAPABILITIES` without touching the DOM.
- `Graph3DLoop`'s module-level singleton (constructed at import time) guards its `document`/`requestAnimationFrame` calls so merely importing the library never throws.

Only `SSRGraph3DRenderer.render()` — the one operation that genuinely needs a GPU context — throws, with a message explaining why and how to guard it (`typeof window !== 'undefined'` check, or defer to a client-only mount).

---

## Dev Tools

`Graph3D.devtools` is a dev-only debugging surface: scene-graph dumps, active
timeline listings, GPU memory snapshots, and disposable debug overlays for
picking, camera frustums, octrees, and selections. It is created lazily on
first access and throws in production.

```js
const g = new Graph3D({ canvas });
g.setActiveScene(g.createScene('main'));

g.devtools.dumpSceneGraph(); // logs + returns a nested tree of the active scene
g.devtools.listActiveTimelines(); // logs + returns every registered anim timeline
g.devtools.memorySnapshot(); // { geometries, textures, calls, triangles, points, lines }

const frustum = g.devtools.frustumDebugOverlay(); // THREE.CameraHelper, added to the scene
const octree = g.devtools.octreeDebugOverlay(chart.selection().backend.object); // populated leaf boxes
const highlight = g.devtools.selectionDebugOverlay(chart.selection().filter((d) => d.value > 90));
// remove any overlay when done: g.activeScene.three.remove(frustum);
```

| Method | Returns | Needs |
|---|---|---|
| `dumpSceneGraph(scene?)` | Nested `{name, type, uuid, visible, children}` tree | An active scene, or one passed explicitly |
| `listActiveTimelines()` | `{isPlaying, time, duration}[]` | Nothing — reads the shared `anim` engine |
| `memorySnapshot()` | `{geometries, textures, calls, triangles, points, lines}` | A browser renderer (throws under SSR) |
| `pickingDebugOverlay(hit)` | A marker mesh at `hit.worldPoint`, or `null` | The object `Picker.pickAt()` returned |
| `frustumDebugOverlay(camera?)` | A `THREE.CameraHelper` | An active scene |
| `octreeDebugOverlay(instancedObject)` | A `THREE.Group` of leaf-node boxes | A `GraphInstancedObject` |
| `selectionDebugOverlay(selection)` | A `THREE.Group` of member markers | A `Selection` |

### Why it's stripped from production

`Graph3D.devtools` throws once when `process.env.NODE_ENV === 'production'` —
the same unminified check React and D3 ship. It does nothing on its own;
it relies on the *consuming* app's bundler (Vite's `define`, webpack's
`DefinePlugin`) replacing that expression with the literal `"production"`, at
which point the bundler's own minifier dead-code-eliminates every `if`
branch and `g.devtools...` call site guarded behind it. This library ships
one build either way — there's no separate dev/production bundle to choose
between.

---

## Dev Warnings

Five common mistakes emit a `console.warn` — never a thrown error, since
none of them are wrong enough to stop execution — through the same
production-gated `devWarn()` helper `Graph3D.devtools` uses (`core/devWarnings.js`,
a `core/` leaf utility any layer imports directly, the same precedent as
`core/GraphDisposal.js`/`core/Graph3DLoop.js`). Every message is tagged
`[Graph3D dev warning]` for easy console filtering.

| Trigger | When it fires |
|---|---|
| `chart.data(rows)` without a following `render()` | One microtask after `data()`, if `render()` still hasn't run — the ordinary synchronous `chart.data(rows); chart.render();` idiom never trips it |
| `wrapper.applyShader(shaderMaterial)` with declared uniforms, no following `bindUniforms()` | One microtask after `applyShader()`, if `bindUniforms()` still hasn't been called — same deferred-check shape as the `data()` warning |
| A second `dispose()`/`destroy()` call | `Graph3D`, `GraphScene`, `GraphChart`, `GraphMesh`, `GraphInstancedObject` — the disposal contract's own idempotency guard now warns instead of silently no-opping |
| `chart.destroy()` while transitions are still running | Logged once per `destroy()` call, with the count stopped early |
| `selection.attr(path, ...)` with an unrecognized `path` close to a real one | Handled as a clearer **thrown** `Error` (`Did you mean 'color'?`), not a warning — see below |

`Selection.attr()`'s case is a thrown error, not a warning, because the
underlying write was already going to throw either way (a truly undefined
custom attribute name, or "meshes have no per-instance attributes") — the
fix only makes that existing error easier to act on. An edit-distance match
against a *legitimately pre-defined* custom attribute (e.g. someone really
did name one `colour`) is left alone; only names the object has never seen
before get the suggestion.

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

**`g.workers.register(taskName, fn)` (Prompt 169)** is the same thing through `Graph3D`'s own `workers` getter — a thin delegate to `registerWorkerTask` (CLAUDE.md §1.1 DRY, no second registration mechanism), for callers who'd rather reach everything worker-related off one instance instead of a separate top-level import:

```js
g.workers.register('myFilter', ({ data, threshold }) => data.filter((v) => v > threshold));
const filtered = await g.workers.exec('myFilter', { data: bigArray, threshold: 100 });
```

Returns the pool itself (`this`) for chaining. Since `registerWorkerTask` writes to a registry `createWorkerFactory()`'s own workers consult, `register()` works on any `WorkerPool` — not just `g.workers` — as long as it was built with `createWorkerFactory()` (the only worker source this library ships); a pool built with a fully custom `workerFactory` (see this class's own constructor doc) won't see any effect from it.

### Building a `WorkerPool` directly

`g.workers` already builds one for you — call `createWorkerFactory()` yourself only when constructing a standalone `WorkerPool` outside a `Graph3D` instance:

```js
import { WorkerPool, createWorkerFactory, registerWorkerTask } from 'graph3d.js';

registerWorkerTask('myTask', (payload) => payload.data.reverse());

const pool = new WorkerPool({ workerFactory: createWorkerFactory() });
const result = await pool.exec('myTask', { data: [3, 1, 2] });
```

Each call to the returned factory spawns a fresh `Worker` from the library's inlined bootstrap and immediately sends it every task registered so far — matching exactly what `g.workers` does internally.

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

### The `registry` singleton

`Graph3D.disposeAll()` is a thin delegate to `registry.disposeAll()` — the module-level `Graph3DRegistry` instance every `Graph3D` constructor auto-registers with (and unregisters from, on `dispose()`). Import it directly for page-wide lifecycle control beyond disposal:

```js
import { registry } from 'graph3d.js';

registry.all();        // every currently-live Graph3D instance, in registration order
registry.pauseAll();    // calls .pause() on each instance that implements it
registry.resumeAll();   // calls .resume() on each instance that implements it

// vite HMR hook — swallows disposal errors so the replacement module still mounts:
if (import.meta.hot) {
  import.meta.hot.dispose(() => registry.panicDispose());
}
```

`panicDispose()` differs from `disposeAll()` only in error handling: it logs and swallows any individual instance's disposal error instead of re-throwing, since an HMR teardown must not abort partway through.

---

## Export & Persistence (Prompt 181)

**`g.exportScene(options)`** exports the active scene's full `THREE.Scene`
graph as glTF, via Three.js's `GLTFExporter` addon (lazy-loaded from
`three/examples/jsm/exporters/GLTFExporter.js` on first call — the same
never-bundled-unless-used convention as `GraphSceneCamera.enableOrbitControls`
and `GraphObjectLoader`'s model loaders):

```js
const blob = await g.exportScene();          // Blob, 'model/gltf-binary' (.glb)
const url = URL.createObjectURL(blob);

const json = await g.exportScene({ binary: false }); // raw glTF JSON object
```

Throws if no active scene exists (`setActiveScene()` first) or after `dispose()`.

**`g.serialize()` / `Graph3D.deserialize(json, options)`** capture and restore
scene/camera *composition* — deliberately not chart configuration, bound
data, or accessor functions, since those are code (closures), which has no
JSON representation:

```js
localStorage.setItem('view', JSON.stringify(g.serialize()));

// later, or in a different tab:
const json = JSON.parse(localStorage.getItem('view'));
const g2 = await Graph3D.deserialize(json, { canvas });
// scenes, per-scene applied theme, and each camera's preset/position/
// look-at target/fov are restored — charts are not: re-create them and
// call .data() again.
```

A snapshot is a plain JSON-safe object: `{ version, theme, hdr, activeScene,
scenes: [{ name, theme, camera: { preset, position, target, fov } }] }`.
`deserialize()` applies each scene's theme *before* its explicit camera
state — `applyTheme()` resets the camera to the theme's own default preset
(`GraphSceneThemes.js`'s `cameraPreset`) as one of its side effects, so the
snapshot's actual serialized camera position/target/fov must be re-applied
afterward to win out over that reset, otherwise a themed scene would
silently come back looking at the theme's default framing instead of
wherever the camera actually was at `serialize()` time.

`Graph3D.deserialize()` still requires `canvas` in `options` in a browser —
a JSON snapshot can't carry a DOM element — and never restores it itself.
