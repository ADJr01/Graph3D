# Scaling to Millions — a Phase 10 recipe (complete)

This is a practical "how do I actually get to a million datums" walkthrough, not a second API reference — every piece it uses already has its own docs (`docs/concepts/stream.md` for `stream/`'s classes, `docs/concepts/chart.md` for the chart-level sugar, `docs/concepts/core.md` for the worker pool). Read those for the full contract of any one piece; read this for how they fit together, in order, as a chart's dataset grows.

## The four walls you actually hit

Nothing in this recipe is about a single trick — it's about which wall you hit first as `N` grows, and what pushes it back:

1. **Draw calls.** One `THREE.Mesh` per datum stops scaling in the low hundreds. Solved automatically — `GraphChart`'s `render()` picks `GraphInstancedObject` over per-datum meshes once `data().length` crosses `INSTANCING_THRESHOLD` (`src/object/GraphObjectFactory.js`, currently `50`). Nothing in this doc is about crossing that threshold; it's already crossed by the time "millions" is even a question.
2. **Main-thread ingestion cost.** Handing a chart a 1,000,000-row array in one `data()` call blocks the frame that does it. Solved by streaming it in over time (`DataStream` + `chart.stream()`, below) instead of one giant call.
3. **What's actually on screen.** A million instances doesn't mean a million need to be *live* right now — most are off-screen or sub-pixel at the current camera distance. Solved by `LOD`/`chart.enableLOD()`, below.
4. **Float32 precision far from the origin.** Vertex buffers and per-instance matrices are float32; positions much past ±10,000 or so start visibly jittering. Solved by `OriginShift`, below — relevant once a scene's *coordinate range*, not just its datum count, gets large.

## 1. Get the data in without blocking a frame

```js
import { DataStream } from 'graph3d';

chart.data(firstChunk, (d) => d.id).render();
chart.stream(DataStream.fromArray(theRestOfTheRows, 10_000, 100)); // 10k rows every 100ms
```

`chart.stream(dataStream)` (Prompt 161) pulls a `DataStream`'s chunks into the chart's normal `data()` + `update()` join, one chunk at a time, instead of one call for the whole dataset. **Backpressure matters at this scale**: at most one chunk is ever pending — if `update()` for the current chunk takes longer than the interval between chunks (a real risk once a single chunk's join costs meaningfully), a newer chunk that arrives in the meantime *overwrites* (drops) it rather than queueing. The chart always converges on the stream's *latest* state, not a guaranteed-complete replay of every chunk — for a *finite* source (`DataStream.fromArray`), the one chunk that can never be dropped is the last one, since nothing ever arrives to supersede it. That's the reliable "the stream is genuinely done" signal, not `chart.data().length` reaching a target count (which backpressure can keep it from ever doing at real scale) — see `examples/22-million-points/main.js`'s `trackCompletion()` helper for exactly this pattern.

For a genuinely live source instead of a static array, swap in `DataStream.fromInterval`/`fromWebSocket` — `chart.stream()` doesn't care which factory built the stream it's handed.

## 2. Don't render what the camera can't resolve anyway

```js
chart.enableLOD({
  camera: scene.camera.three,
  levels: [
    { maxDistance: 60, maxPoints: 250_000 },
    { maxDistance: 120, maxPoints: 50_000 },
    { maxDistance: 300, maxPoints: 5_000 },
  ],
});
```

`enableLOD()` (Prompt 163) snapshots whatever's bound to `chart.data()` **once, at call time**, and re-decimates from that snapshot every time the camera crosses into a different distance bucket. That snapshot-once behavior is the one sharp edge at this scale: calling `enableLOD()` while a stream is still actively growing the dataset races `stream()`'s own `data()`/`update()` calls and freezes the visible set at whatever partial snapshot LOD happened to capture. The fix is ordering, not configuration — only call `enableLOD()` once ingestion has genuinely finished (the same "final chunk landed" signal from step 1).

## 3. Keep positions numerically sane far from the origin

```js
import { OriginShift } from 'graph3d';

const originShift = new OriginShift({ scene: scene.three, camera: scene.camera.three, threshold: 1000 });
```

Only relevant once the scene's *coordinate range* — not its datum count — gets large (geospatial data in real-world units, a simulated universe, anything where the camera can end up thousands of units from `(0,0,0)`). `OriginShift` (Prompt 164) doesn't touch datum count or draw calls at all; it keeps the numbers float32 is asked to represent small by periodically re-centering the camera and every top-level scene child together, preserving every relative position exactly. See `docs/concepts/stream.md` for the full mechanism.

## 4. Offload the expensive parts

Two pieces move CPU-bound work off the main thread once it gets big enough to matter — both are opt-in, both fall back to doing the same work synchronously below their threshold, so neither changes behavior at small scale:

- **`JoinDiff`** (Prompt 167) — the same `enter`/`update`/`exit` result as `data()`'s own internal `diffData`, computed on a worker once `Math.max(oldData.length, newData.length)` crosses `10,000` (default). Use it directly if you're computing a diff outside a chart's own `data()` call (e.g. to decide what to send *to* a chart before handing it a next `data()` array); `chart.data()` itself always diffs synchronously — this doesn't change that.
- **`GPGPU`** (Prompt 165) — offloads `layout.force`'s many-body `'charge'` force above `5,000` nodes (default), to a real GPU compute pass when a `renderer` + float-texture support are available, a worker running the same all-pairs math otherwise. Relevant to force-directed `NetworkChart`s at real scale, not to point-cloud charts.
- **Custom work**: `g.workers.register(taskName, fn)` (Prompt 169, `docs/concepts/core.md`) registers your own function onto the same worker pool everything above already shares — for whatever scale-specific transform is specific to your own data, not covered by `Aggregator`/`middleware.decimate` (`docs/concepts/stream.md`).

## 5. Bound memory for a stream that never stops

```js
import { memoryPressure } from 'graph3d';

chart.window(500_000); // hard cap — oldest rows dissolve out once exceeded
setInterval(() => {
  const pressure = memoryPressure(); // [0,1] heuristic, or null off-Chromium
  if (pressure !== null && pressure > 0.8) chart.compact();
}, 5000);
```

`chart.window(size)` (Prompt 168) is the hard ceiling — a `stream()`-fed chart that runs forever needs one, or its dataset (and instance count) grows without bound. `chart.compact()` is a one-way optimization, not a memory-pressure release valve by itself: it merges individually-addressable meshes into a single instanced object once a chart has grown past `INSTANCING_THRESHOLD` without ever crossing it at `render()` time. Both are documented in full in `docs/concepts/chart.md`; `memoryPressure()` is the suggested (not automatic) trigger for calling `compact()` — `chart/` never polls memory on its own.

## Two worked examples

- **`examples/22-million-points/main.js`** — 1,000,000 points via `DataStream.fromArray` + `chart.stream()` (steps 1–2 above, plus `Brush` region-selection), the full ingest-then-LOD sequencing from steps 1 and 2 in one file.
- **`examples/23-live-trading/main.js`** — a continuously-live feed (`DataStream.fromInterval`, ~10,000 simulated events/sec) driving a windowed `LineChart` and a live `BarChart`, cross-filtered by click. Demonstrates step 1 for a source that never ends (no "final chunk" signal — the window is bounded by hand, not `chart.window()`, since `LineChart` doesn't share `GraphChart`'s `stream()`/`window()` machinery — see the file's own top-of-file comment for why).

## Measuring it for real

`bench/stress-million.bench.js` (Prompt 171, `npm run bench:stress`) is the way to check any of the above actually holds at scale, rather than trusting the story above by eye. It defaults to a fast 20,000-point/10-chart/5-second smoke run; the prompt's literal scale is opt-in via environment variables:

```bash
STRESS_POINTS=1000000 STRESS_CHARTS=10 STRESS_DURATION_MS=1800000 node --expose-gc bench/stress-million.bench.js
```

It reports a CPU-throughput-proxy FPS (there is no real GPU context under plain Node — the same documented limitation `tests/integration/phase7.test.js` already carries for the same reason) and GC-settled heap growth, and exits non-zero if either misses its target. **At the literal 1,000,000-point scale today, it fails** — see the next section.

## What's genuinely out of scope for Phase 10

Both of these are real, root-caused, currently-unfixed defects surfaced while building the stress bench and Phase 10's integration tests — not documentation gaps. Full detail (exact root cause, reproduction, suggested fix) is in `skipping_list.md`'s Phase 10 section; summarized here because a scaling guide that omitted the one thing that currently breaks at real scale would be actively misleading:

- **A chart whose data clusters far inside `GraphInstancedObject`'s fixed `±10,000` default octree bounds degrades to O(n²) per `update()`** — every matched instance's `remove()`+`insert()` collapses into a single overloaded octree leaf once positions are small relative to that constant, which most example/demo-scale data is. This is *why* `bench/stress-million.bench.js` fails its FPS target at the prompt's literal scale: any workload that repeatedly calls `update()` against already-matched instanced rows (a live-updating chart, not a pure streaming-*append* one — `examples/22-million-points`'s pure-add streaming never triggers it) hits this once row counts get large. The fix is sizing `octreeBounds` to a chart's actual data range instead of a fixed constant; not done here, since it's a `GraphInstancedObject` construction-contract change, not something a testing/bench/docs prompt should make unasked.
- **Picking silently misses everything once a chart's instanced mesh is moved off the scene origin** — e.g. by `OriginShift` (step 3 above). `GraphInstancedObject`'s octree-pruning step queries with a world-space ray against octree entries stored in the mesh's *local* space; the two only agree while the mesh sits at identity transform, which `OriginShift`'s entire job is to violate. If a scene combines `OriginShift` with `Picker`/click-to-select, picking will stop finding anything the moment the first shift happens.

See `skipping_list.md`'s Phase 10 section for both in full, including the exact numbers that confirmed each root cause.
