# Performance

Graph3D.js's performance story is deliberately concrete: every budget below is
either CI-enforced (bundle size) or backed by a real threshold constant in the
source (instancing, LOD, GPGPU, origin-shifting). Where a limit is currently
**not** met at the literal scale the project targets, this page says so
directly, with the measured numbers — see [Known limits at extreme
scale](#known-limits-at-extreme-scale) below.

## Bundle size budgets

`npm run bundle:budget` (CI-enforced, `scripts/bundle-budget.js`) fails the
build if either bundle exceeds its budget, measured minified + gzipped, with
`three` excluded (peer dependency):

| Entry point | Budget |
|---|---|
| Full library (`src/index.js`) | 200 KB |
| A consumer importing only `BarChart` | 50 KB |

The `BarChart`-only budget exists specifically to catch tree-shaking
regressions — a consumer who imports one chart type should never pay for the
other eleven, or for `postfx/`'s pass registry. See `package.json`'s
`sideEffects` field if you're investigating a bundle-size regression after
adding a new side-effect-only module (chart types, material presets, postfx
passes) — a module whose registration isn't reachable through tree-shaking's
static analysis needs to be listed there, or a production build silently
drops it. `site/gallery.md`'s own build once hit exactly this bug; see
`src/postfx/passes/index.js`'s header comment for the full story.

## Instancing — the core scaling decision

Every chart type dispatches on datum count against `INSTANCING_THRESHOLD`
(default **50**, `src/object/GraphObjectFactory.js`) to pick one of two
backends:

| Backend | Real objects | Draw calls | When |
|---|---|---|---|
| `meshes` | One `GraphMesh` per datum | One per datum | `count < 50` — individually inspectable, cheap to reason about at low counts |
| `instanced` | One `GraphInstancedObject` | One total | `count >= 50` — the path that scales to millions |

This is automatic — you never choose a backend directly through a chart
type's public API. `chart.compact()` (see [Compose](/concepts/compose) and
[`GraphChart`](/api/GraphChart)) offers a one-way, irreversible upgrade path
from meshes to instanced for a chart whose data has grown or settled after
construction; there's no downgrade path back to individually-addressable
meshes. If you're hand-rolling a `Selection` instead of using a chart type
(see [The Data Join & Selections](/recipes/data-join-selections)), you choose
the backend explicitly by which `type` you construct it with.

## Frame budget & monitoring

`g.frameBudget` (a `FrameBudget` instance, always present on every `Graph3D`)
emits `graph3d:slow-frame` after `windowSize` (default 5) **consecutive**
over-`budgetMs` (default 16 ms, i.e. a 60 fps target) frames — an
observability primitive, not a throttle. See
[Core: Frame Budget](/concepts/core#frame-budget) for the full event-detail
shape and configuration. Use it to detect real, sustained slowdowns in
production rather than guessing from a single dropped frame.

## LOD — camera-distance decimation

`chart.enableLOD({ camera, levels })` re-decimates a chart's dataset every
frame based on camera distance, via the same `transform.decimate` uniform-
stride sampling `.use(transform.decimate(n))` already provides — not a second
algorithm:

```js
chart.data(hugeSeries, (d) => d.id).render();
chart.enableLOD({
  camera: scene.camera.three,
  levels: [
    { maxDistance: 20, maxPoints: 5000 },
    { maxDistance: 100, maxPoints: 500 },
  ],
});
```

Buckets are distance-based, not raw-instance-count-based — what actually
determines how much detail is needed is how close the camera is, and that
composes with (rather than duplicates) the chart's own real datum count.
`stream/LOD` is the standalone version for driving the identical algorithm on
a non-`GraphChart` target. See [Stream](/concepts/stream#lod-prompt-163) for
the full reference, including the "re-run `enableLOD()` after replacing the
full dataset" caveat.

## GPGPU — force-directed layouts above 5,000 nodes

`layout.force`'s `'charge'` force (all-pairs, O(n²)) is the expensive part of
a force-directed layout (`NetworkChart`, or a hand-rolled `layout.force()`
simulation). `GPGPU.attach(sim)` replaces it with a GPU-computed (or
worker-computed, capability-degraded) version once `sim.nodes().length`
crosses **5,000** — below that, it's byte-for-byte the plain CPU force,
completely unaffected:

```js
import { GPGPU, layout } from 'graph3d.js';

const gpgpu = new GPGPU({ renderer: g.renderer.three, capabilities: probe.capabilities });
const sim = layout.force().nodes(hugeNodeSet).force('link', layout.force.link(links));
gpgpu.attach(sim);
loop.add(() => { if (sim.active()) sim.tick(); });
```

See [Stream: GPGPU](/concepts/stream#gpgpu-prompt-165) for the backend
resolution rules and the "charge lags real position by a few ticks above
threshold" tradeoff.

## Other scale-layer tools

| Tool | Threshold | What it does |
|---|---|---|
| `OriginShift` | `> 1 km` from origin (default) | Keeps the camera and scene near local `(0,0,0)` so float32 position precision doesn't degrade far from the origin. See [Stream: OriginShift](/concepts/stream#originshift-prompt-164). |
| `JoinDiff` | `>= 10,000` rows (default), keyed joins only | Moves the enter/update/exit key-matching off the main thread. A positional diff (no `keyFn`) is always O(1) and never worth the round trip. See [Stream: JoinDiff](/concepts/stream#joindiff-prompt-167). |
| `Aggregator` / `middleware.decimate` | — | Worker-offloaded grouped reduction and Douglas-Peucker curve simplification, for CPU-heavy data prep that would otherwise block the render thread. See [Stream](/concepts/stream#aggregator-middlewaredecimate-prompt-162). |
| `memoryPressure()` + `chart.compact()` | You choose | A Chromium-only heap-pressure heuristic (`null` elsewhere) — pair a high reading with `chart.compact()` (merges settled `GraphMesh[]` into one `GraphInstancedObject`) yourself; nothing polls this automatically. See [Stream: memoryPressure()](/concepts/stream#memorypressure-prompt-168). |

## PostFX cost

Every enabled `PostFX` pass adds at least one additional full-screen render
pass; a handful (`ssao`, `ssr`, `motionBlur`, `dof`) are inherently the
costliest since they sample the scene multiple times per pixel or need extra
render targets (depth/normal buffers, blurred mip chains), rather than
running a single cheap screen-space filter the way `vignette`/`filmGrain`/
`chromaticAberration`/`fxaa` do. If a scene is frame-budget-limited with
PostFX enabled, disable passes one at a time (`g.postfx.disable(name)`) and
re-check `graph3d:slow-frame` before assuming the chart data itself is the
bottleneck — see [PostFX & Particles](/concepts/postfx) for the full pass and
preset list.

## Known limits at extreme scale

**`GraphInstancedObject`'s octree degrades badly once data clusters densely
inside its default bounds.** The default `octreeBounds` span `±10,000` per
axis with a `maxDepth` of 8, so the smallest a leaf cell can ever get is
`20,000 / 2^8 ≈ 78` units — larger than most real chart data's actual spread
(e.g. `examples/22-million-points`' domain radius of 40). Once every point
falls inside one oversized leaf, `remove()` degrades from its intended O(1)
to a true O(n) scan, and since every `update()` call rewrites every *matched*
instance's position (not just the ones that actually moved), that's O(n²)
per update overall. Measured directly: a 4,000-row chart with data confined
to `[0, 10]` took **~300 ms** for a single `chart.data(rows, keyFn) +
chart.update()` call that only mutated 50 rows — a tightly-fit
`octreeBounds` (matching the data's real range) brought the identical
update down to **~1.3 ms** (default bounds: ~33.8 ms at the same point
count — roughly 26x slower). There is currently no way to pass
`octreeBounds` through a chart type's public API (`BarChart`, `ScatterChart`,
...) — it's a `GraphInstancedObject` constructor option only, reachable if
you're building the backend yourself via `object/`'s classes directly rather
than a chart type. This is a real, open gap, not a hard limit of the
architecture — see `skipping_list.md`'s Phase 10 entry for the full root
cause and the eventual fix direction (computing `octreeBounds` from the
chart's actual data range at first `render()`).

**"1,000,000 points across 10 charts, 30 minutes, ≥30 fps" — the project's
own literal scale target — is not yet met**, for the same underlying reason.
`bench/stress-million.bench.js` runs a CPU-side throughput proxy for this
exact scenario (there's no WebGL context under Node, so it measures the real
per-frame `data()+update()` cost, missing only GPU rasterization) and is
env-var-gated to the literal scale (`STRESS_POINTS=1000000
STRESS_DURATION_MS=1800000 node bench/stress-million.bench.js`) specifically
because it currently fails the FPS target at that scale — a real, tracked
result, not a broken bench. Smaller, realistic scales (tens of thousands of
points per chart, the bench's own default) pass comfortably.

## Quick checklist: "my scene is slow"

1. Check `g.frameBudget` for a real, sustained `graph3d:slow-frame` — don't
   chase a single dropped frame.
2. Confirm datum counts above ~50 are actually hitting the instanced
   backend, not many individual `GraphMesh`es (`chart.compact()` if data grew
   past construction time).
3. Disable PostFX passes one at a time and re-check.
4. For force-directed layouts past a few thousand nodes, attach `GPGPU`.
5. For very large or very spread-out datasets, check whether you're hitting
   the octree degradation above — tightly-fit `octreeBounds` if you're on a
   raw `GraphInstancedObject`.
6. See [Troubleshooting](/troubleshooting) for black-canvas/invisible-mesh/
   leak/context-loss issues that aren't about raw frame rate.
