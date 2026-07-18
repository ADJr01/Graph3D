# Changelog

All notable changes to this project are documented in this file. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this
project is pre-1.0 (`0.x`), so breaking changes may still land in a minor
version bump.

## [0.1.0] — Initial release

The first public release: a complete, ten-layer 3D data visualization
framework on Three.js, from the renderer up through interaction and
streaming. Every item below is real, shipped code with tests and docs — see
`site/comparison.md` for an honest read on what's *not* here yet.

### Added — Core Engine

- `Graph3D` — the top-level entry point: canvas → renderer, single shared
  `requestAnimationFrame` loop (`Graph3DLoop`/`loop`, one per page, paused
  automatically while the tab is backgrounded), multi-scene management
  (`createScene`/`setActiveScene`), the chart-type dispatch (`g.chart(...)`),
  serialization (`serialize()`/`deserialize()`), and SSR-safe construction.
- `CapabilityProbe` — feature detection with graceful degradation.
- `FrameBudget` — a `graph3d:slow-frame` observability event after
  sustained over-budget frames; not a throttle.
- `WorkerPool` — off-main-thread task dispatch with zero-copy transfers.
- WebGL context-loss detection (`graph3d:context-lost`/`-restored` events).

### Added — Scene, Object & Mesh

- `GraphScene` — cameras (orbit/isometric/cinematic presets), light rigs,
  HDR environments, shadows, fog, clip planes, multi-viewport layouts, and
  8 bundled themes (`applyTheme()` bundles camera + lighting + fog + HDR +
  shadow quality + palette in one call).
- `GraphObject`/`GraphMesh`/`GraphInstancedObject` — automatic instancing
  above a measured threshold (default 50 datums): one draw call regardless
  of instance count, an octree-backed spatial index for picking and
  frustum culling, and a pow2 capacity-grow strategy.

### Added — Compose ("D3 for 3D")

- Scales (`scale.linear/pow/sqrt/log/band/point/ordinal/time`), matching
  d3-scale's chainable `.domain()/.range()/.nice()/.clamp()/.ticks()` API.
- Generators (`generator.bar/point/line/surface/arc`), layouts
  (`layout.force/tree/pack/stack/grid/pie`, extended to three dimensions),
  and color (`color.sequential/diverging/categorical` + 20+ built-in
  `palette.*` ramps, including colorblind-safe options).
- `Selection` — a faithful port of D3's `.data().join()` enter/update/exit
  model onto real `THREE.Object3D`s and instance slots, with
  `attr`/`style`/`filter`/`sort`/`merge`/`transition`/`on` (event
  dispatch from real pointer picking).
- `Axis` and `annotation.*` (callout/referenceLine/referencePlane/region) —
  real scene objects, not SVG/DOM overlays.

### Added — Animation & Transitions

- A shared-tick animation engine (`anim`) driving `Selection.transition()`
  and `chart.transition()` alike — named easing curves, staggered delays,
  `respectReducedMotion` support.
- `CameraTour` for scripted/orbit camera paths.

### Added — Materials & Procedural FX

- 20+ material presets (`material.standard/physical/basic/toon/...` through
  named "beautiful materials" like `chrome`/`gold`/`holographic`/`glass`),
  procedural textures (`texture.gradient/noise/voronoi/...`), and SDF text.

### Added — PostFX & Particles

- 12 post-processing passes (bloom, SSAO, DOF, motion blur, color grading,
  vignette, chromatic aberration, film grain, FXAA, SMAA, outline, god rays,
  SSR) and 7 curated presets (`cinematic`/`clean`/`dramatic`/`dreamy`/
  `editorial`/`cyberpunk`/`minimal`), toggled through one `PostFX` API.
- GPU-instanced particle system with capability-driven GPU/CPU backends.

### Added — Chart Types

- 11 fluent, chainable, instanced-by-default chart types: `BarChart`,
  `LineChart`, `ScatterChart`, `AreaChart`, `SurfaceChart`, `HeatmapChart`,
  `NetworkChart`, `TreeChart`, `PackChart`, `PieChart`, `VolumeChart` — all
  sharing one `GraphChart` base (`data()`, accessor fields, `.material()`,
  `.transition()`, lifecycle events, disposal).
- Legends, tooltips, ARIA labels/descriptions, hover/select shader effects.

### Added — Interaction & State

- Ray-based picking (`Picker`) uniform across mesh and instanced backends,
  a hover/focus/select `StateMachine` with sensible defaults, `PointerRouter`
  (mouse/touch) and `KeyboardNav` (accessible, ARIA-live-region-driven)
  input, drag-and-drop, `Brush`/`Lasso` region selection, and cross-filter
  linking between charts.

### Added — Streaming & Scale

- `DataStream` (async-iterable data sources: arrays, intervals, WebSockets),
  `Aggregator` and worker-offloaded decimation, camera-distance `LOD`,
  `GPGPU`-accelerated force layouts (above 5,000 nodes), `OriginShift`
  (float32 precision beyond 1 km from origin), worker-offloaded `JoinDiff`
  (above 10,000 rows), and `memoryPressure()`.

### Added — DX, Types & Distribution

- Full TypeScript declarations (`types/index.d.ts`), `tsd`-tested against
  real usage patterns, `strict` compilation.
- Four build outputs (ESM, UMD, minified ESM, minified UMD); CI-enforced
  bundle budgets (200 KB full library, 50 KB for a single-chart-type
  consumer, both minified+gzipped).
- `Graph3D.serialize()`/`deserialize()` for scene persistence.

### Added — Documentation

- A full VitePress documentation site: per-layer concept guides, an API
  reference generated from JSDoc, 13 runnable recipes, migration guides
  (from D3, from ECharts GL, from raw Three.js), a performance guide with
  honestly-documented known limits, an accessibility guide, a
  troubleshooting guide, an honest comparison against D3/ECharts GL/raw
  Three.js, an interactive gallery, and a live Monaco-editor playground.

### Known limitations

- `GraphInstancedObject`'s spatial index degrades at very large, densely
  clustered datasets — see `site/perf.md`'s "Known limits at extreme scale."
- No map/globe chart type yet.
- Several bundled HDR environment maps and the default SDF font atlas are
  not yet included in this repository — material/theme previews that depend
  on them fall back gracefully but aren't pixel-final. See `skipping_list.md`
  for the complete, actively-maintained list of tracked gaps.
