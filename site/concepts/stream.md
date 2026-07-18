# Stream — Phase 10 (complete)

Stream is Layer 10 of Graph3D.js — live/large data sources. `DataStream` (Prompt 160) is the first piece: it wraps any source of incoming data — a plain async generator, a chunked replay of a static array, a polling interval, a WebSocket — behind one uniform shape so everything downstream has a single consumption path instead of one per source type (CLAUDE.md §1.1 DRY). `chart.stream(dataStream)` (Prompt 161, `site/concepts/chart.md`) is that first downstream consumer: it pulls a `DataStream`'s chunks straight into a chart's normal `data()` + `update()` join.

## The chunk shape

Every value a `DataStream` yields is normalized to:

```js
{ added: [...], updated: [...], removed: [...] }
```

A bare array is sugar for "these were added" — `DataStream.fromArray`'s slices and the common polling/WebSocket case (`transform` returning a plain array) don't need to spell out empty `updated`/`removed` arrays. Normalization happens once, at `DataStream`'s own iterator boundary, regardless of which factory built the stream — so an invalid chunk is caught at the same place no matter its origin (CLAUDE.md §1.5 Fail Fast).

## The four factories

```js
// Wrap any async iterable you already have — the escape hatch.
DataStream.from(myAsyncGenerator());

// Replay a static array as chunks, for demos/benchmarks.
DataStream.fromArray(bigDataset, /* chunkSize */ 500, /* ms */ 16);

// Poll a producer function on an interval.
DataStream.fromInterval(() => pollNewRows(), 1000);

// Consume a live WebSocket.
DataStream.fromWebSocket('wss://example.com/ticks', (raw) => [JSON.parse(raw)]);
```

`DataStream` itself is async-iterable, so it can be consumed directly with `for await`:

```js
const stream = DataStream.fromArray(rows, 500, 16);
for await (const { added, updated, removed } of stream) {
  // ...
}
stream.dispose();
```

## Disposal

`fromArray`/`fromInterval` own a generator loop; `fromWebSocket` owns a real socket. All three need `dispose()` (CLAUDE.md §3): it stops the loop / closes the socket and is idempotent. `DataStream.from(asyncIterable)` doesn't own anything, so its `dispose()` is a no-op — the caller's iterable is the caller's to manage.

## `Aggregator` / `middleware.decimate` (Prompt 162)

Both are off-main-thread wrappers over `core/worker/tasks.js`'s built-in worker tasks — the same registry `WorkerPool` (Phase 1) already dispatches through, so there's no second worker-message protocol here (CLAUDE.md §1.1 DRY). Each owns its own `WorkerPool`, created lazily the same way `WorkerPool` itself creates workers lazily.

```js
import { Aggregator, middleware } from 'graph3d';

// Grouped reduction — sum/mean/max/min/count/percentile.
const aggregator = new Aggregator();
const p95ByRegion = await aggregator.run(latencies, { groupKey: 'region', valueKey: 'ms', fn: 'percentile', p: 0.95 });
aggregator.dispose();

// Shape-preserving decimation (Douglas-Peucker), not uniform stride sampling.
const simplify = middleware.decimate({ target: 500, x: 'time', y: 'price' });
const thinned = await simplify(hugeTickSeries); // ~500 points, corners/spikes kept
simplify.dispose();
```

- **`Aggregator.run(data, {groupKey, valueKey, fn, p})`** resolves grouped reductions. `fn` defaults to `'sum'`; `'percentile'` additionally requires `p` (a number in `[0, 1]`, linear-interpolated — `p=0`/`p=1` match `'min'`/`'max'` exactly).
- **`middleware.decimate({target, x, y})`** returns an **async** `(data) => Promise<Array>` — the `middleware` namespace mirrors `compose/transform`'s `transform` (same "factory takes config, returns a callable" shape), but every function in it round-trips through a worker, so **none of them are droppable into `chart.use()`** (that pipeline is synchronous, unchanged by this prompt). Call it directly and hand the resolved array to `chart.data()`. Unlike `transform.decimate(target)`'s uniform-stride sampling, this runs an iterative (non-recursive — safe on very long, jagged curves) Douglas-Peucker simplification and binary-searches its tolerance for an output count *close to* (not guaranteed exactly) `target`, since point-count-vs-tolerance isn't perfectly invertible. `x`/`y` name the fields read off each datum (default: index / the datum itself, matching `generator.line()`'s own defaults for a bare `number[]`); the result is a subset of the *original* datum objects, not reshaped `{x,y}` points.
- Both return values whose underlying pool needs releasing: `aggregator.dispose()`; the function `middleware.decimate(...)` returns carries its own `.dispose()`.

## `LOD` (Prompt 163)

Camera-distance-driven level-of-detail, as a standalone engine for any duck-typed chart-like target (`.data()`/`.update()`/`.scene`) — `GraphChart.enableLOD({levels, camera})` (`site/concepts/chart.md`) is the built-in, self-contained sugar for `GraphChart` instances specifically; use `LOD` directly when driving the same behavior on something else. The two don't share an implementation: `chart/` never imports `stream/` (CLAUDE.md §1.4), so `GraphChart.enableLOD()` re-runs the identical small distance-bucketing algorithm inline rather than importing this class.

```js
import { LOD } from 'graph3d';

const lod = new LOD({
  chart,
  camera: scene.camera.three,
  levels: [
    { maxDistance: 20, maxPoints: 5000 },
    { maxDistance: 100, maxPoints: 500 },
  ],
});
lod.dispose(); // stops the per-frame check
```

Every frame (`core/Graph3DLoop`), checks `camera`'s distance to `chart.scene.position` and, when it crosses into a different `levels` bucket, re-decimates the dataset snapshotted once at construction (`chart.data()` — never re-read afterward, so a later `chart.data(newRows)` call made outside `LOD` won't be picked up; construct a fresh `LOD` after replacing the full dataset) down to that bucket's `maxPoints` via `transform.decimate` and re-binds it through `chart.data(subset, keyFn) + chart.update()`. `keyFn` defaults to identity — pass the same `keyFn` `chart`'s data was originally bound with, or re-decimated frames will misjoin.

## `OriginShift` (Prompt 164)

Transparent world-origin shifting: keeps the camera — and everything else in the scene — near local `(0, 0, 0)` so float32 position storage (vertex buffers, per-instance matrices, the camera's own position) stays precise even when a scene spans a huge coordinate range.

```js
import { OriginShift } from 'graph3d';

const originShift = new OriginShift({ scene: scene.three, camera: scene.camera.three, threshold: 1000 });
originShift.worldOffset; // {x, y, z} — total shift applied so far
originShift.dispose();
```

Every frame (`core/Graph3DLoop`), checks the camera's distance from local origin and, once it exceeds `threshold` (default `1000`, matching BUILD_PLAN's "> 1 km from origin" example), subtracts that distance's vector from the camera *and* every top-level `scene.children` entry in one shot — moving everything together preserves every relative position and render output exactly, while shrinking the absolute numbers float32 has to represent. Nested content (children of a shifted top-level object, per-instance data inside a `GraphInstancedObject`) moves for free through normal `matrixWorld` composition — only top-level children need touching, not a full recursive scene walk.

**Transparent** means exactly that: nothing else in the library needs to know this is running. `GraphChart`/`GraphScene`/`GraphInstancedObject` write positions exactly as they always have; `OriginShift` only ever adjusts `.position` on the objects it's given, from outside — the same "attach externally, duck-typed target" shape as `interact/FocusFollower`, which is also why there's no `chart.enableOriginShift()` sugar (unlike `LOD`/`enableLOD`): nothing chart-specific is involved, just a scene root and a camera. `worldOffset` accumulates every shift applied so far — add it to a current local position to recover the coordinate it would have had with no shifting ever applied (useful for anything that needs to report a stable "true" world coordinate, e.g. a debug HUD). `dispose()` stops the per-frame check.

## `GPGPU` (Prompt 165)

GPU-accelerated many-body force computation — render-target ping-pong compute via `three/examples/jsm/misc/GPUComputationRenderer.js` (lazy-loaded on first use, matching `GraphSceneCamera.enableOrbitControls`'s established pattern for optional three examples), with a feature-detected CPU+worker fallback.

```js
import { GPGPU, layout } from 'graph3d';

const gpgpu = new GPGPU({ renderer: graph3d.renderer.three, capabilities: probe.capabilities });
const sim = layout.force().nodes(hugeNodeSet).force('link', layout.force.link(links));
gpgpu.attach(sim); // 'charge' now runs on GPGPU once nodes.length > 5000
loop.add(() => { if (sim.active()) sim.tick(); });
gpgpu.dispose();
```

- **`backend`** resolves to `'gpu'` when both a `renderer` and `capabilities.floatTextures` were given at construction, `'worker'` otherwise — `capabilities` is the plain `Capabilities` object `CapabilityProbe` produces (`probe.capabilities`), the same shape `postfx/PostFX` already accepts.
- **`computeCharge(positions, {strength, distanceMin, distanceMax})`** is the low-level primitive: a flat `[x0,y0,z0,...]` buffer in, an equal-length acceleration buffer out. Always `async`, regardless of backend — a GPU readback (`renderer.readRenderTargetPixels`) and a worker round-trip (`core/worker/tasks.js`'s new `'forceCharge'` built-in task) are both genuinely asynchronous, so the contract stays uniform rather than making callers branch on `backend`. Both backends run the identical all-pairs (O(n²)) charge algorithm — on the GPU that cost is spread across every texel's own parallel fragment-shader invocation, which is exactly why it only pays off past a real node count; the worker fallback is comparatively slow (ponytail: fine for an occasional off-thread recompute, not for tens of thousands of nodes every frame — swap in a flat Barnes-Hut octree there if that becomes a real need).
- **`attach(sim, options)`** is the actual "wire `layout.force` to GPGPU above 5000 nodes" integration (BUILD_PLAN §Phase 10): it replaces `sim`'s `'charge'` force with a wrapper. Below `threshold` (default `5000`), the wrapper is byte-for-byte `layout.force.charge(strength, options)` — small simulations are completely unaffected. Above it, since neither GPGPU backend can complete inside `tick()`'s single synchronous call, the wrapper applies the most recently *resolved* acceleration (rescaled by the current tick's `alpha`) every tick and kicks off a fresh background computation whenever the previous one has finished — charge is correct on average but lags real position changes by however many ticks the round trip takes. Nodes contribute zero charge acceleration until the first result resolves; other forces (`link`/`center`/`collide`/`radial`/`cluster`) are untouched and keep applying immediately every tick.
- `dispose()` releases whichever backend resources this instance created (`WorkerPool`, `GPUComputationRenderer`) — idempotent, but does **not** detach the force wrapper from any `sim` it was `attach()`ed to; restore a plain CPU force (`sim.force('charge', layout.force.charge(...))`) first if `sim` outlives the `GPGPU` instance.

## `JoinDiff` (Prompt 167)

Worker-offloaded join diff: the same `enter`/`update`/`exit` result as `compose/selection`'s `diffData(oldData, newData, keyFn)` (the single diff authority — this class never reimplements the join, it just moves *where* the Map-matching runs), computed off the main thread once the data crosses a size threshold.

```js
import { JoinDiff } from 'graph3d';

const joinDiff = new JoinDiff({ threshold: 10000 }); // default
const { enter, update, exit } = await joinDiff.diff(oldRows, newRows, (d) => d.id);
joinDiff.dispose();
```

`keyFn` is a closure and can't be handed to a worker directly, so `diff()` evaluates it on the main thread first (`oldData.map(keyFn)`/`newData.map(keyFn)` — unavoidable), sends only the resulting keys to `core/worker/tasks.js`'s `'joinDiff'` built-in task, and re-attaches each result's `datum` from the original `oldData`/`newData` arrays once the worker resolves — the worker never round-trips the data itself, only index lists. The worker task runs the *exact* same Map-insertion-order matching algorithm as `diffData`'s keyed branch (duplicated rather than imported: `core/` sits below `compose/`, CLAUDE.md §1.4, so `tasks.js` can't import `diff.js`), so results — including `exit`'s ordering, which depends on `Map` iteration order — are byte-for-byte identical regardless of which path ran.

Below `threshold` (by `Math.max(oldData.length, newData.length)`), or whenever no `keyFn` is given at all (a positional diff is already O(1) index arithmetic — never worth a worker round-trip), `diff()` resolves synchronously via `diffData` itself, without ever touching a `WorkerPool`. `dispose()` terminates the pool, if the worker path was ever actually taken; idempotent.

## `memoryPressure()` (Prompt 168)

A heuristic memory-pressure *signal*, nothing more — it never acts on itself:

```js
import { memoryPressure } from 'graph3d';

const pressure = memoryPressure(); // number in [0, 1], or null
if (pressure !== null && pressure > 0.8) chart.compact();
```

Reads `performance.memory` (`usedJSHeapSize / jsHeapSizeLimit`) — a non-standard, Chromium-only API and the closest thing the web platform exposes to "how close is this page to its heap ceiling." Returns `null` (not a guessed number) wherever it's unavailable: Firefox, Safari, any non-Chromium engine, or an environment with no `performance` global at all — callers should treat `null` as "unknown," not "no pressure." Pair it with `chart.compact()`/`chart.window(size)` (`site/concepts/chart.md`) yourself, at whatever threshold and polling cadence fits the application.

---

`site/concepts/scale.md` walks through combining every class on this page (plus `chart.stream()`/`enableLOD()`/`compact()`/`window()` from `site/concepts/chart.md`, and `g.workers.register()` from `site/concepts/core.md`) into an actual "get to a million datums" recipe, worked examples included — read this page for any one piece's own contract, that one for how they fit together in order.
