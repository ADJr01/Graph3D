# Graph3D.js — v2 Build Plan

Source of truth for architecture layers and build phases. Each prompt number in `Promps.md` maps to a deliverable; each phase below tracks completion against its exit criteria.

---

## 10-Layer Architecture

Layers are ordered bottom-to-top. A layer may only import from layers **below** it.

| # | Layer | Responsibility |
|---|-------|----------------|
| 1 | **Core Engine** | `Graph3D`, `Graph3DRenderer`, `Graph3DLoop`, `Graph3DRegistry`, `CapabilityProbe`, `FrameBudget`, `WorkerPool`, worker bootstrap. |
| 2 | **Scene Composition** | `GraphScene` wrapper, cameras (orbit/isometric/cinematic), light rigs, HDR environment, shadows, fog, clip planes. |
| 3 | **Object & Mesh** | `GraphObject`, `GraphInstancedObject` (default for >50 datums), loader, octree spatial index. |
| 4 | **Compositional Core** | D3-flavored scales, generators, layouts, color palettes, axes, annotations. No Three.js — operates on plain arrays/numbers. |
| 5 | **Animation & Transitions** | Anim engine, timelines, easing curves, data transitions, camera tours. |
| 6 | **Materials & Procedural FX** | PBR presets, SDF text, gradient/noise procedural textures, named beautiful materials. |
| 7 | **PostFX & Particles** | Bloom, SSAO, DOF, motion blur, particle systems, god rays. Charts request passes through a public PostFX API. |
| 8 | **Chart Types** | Bar, Line, Scatter, Surface, Heatmap, Network, Tree, Pack — all instanced by default. Fluent chainable API. |
| 9 | **Interaction & State** | Picking, hover/focus/select state machine, brush, lasso, cross-filter, tooltips. |
| 10 | **Streaming & Scale** | `DataStream`, GPGPU, LOD, aggregation pipelines, origin-shifting for large coordinate ranges. |

---

## 13 Build Phases

### Phase 0 — Bootstrap & Tooling ✅
**Scope:** project skeleton, toolchain, CI, playground  
**Prompts:** 1–8  
**Exit criteria:**
- [x] `npm run dev` boots with an empty playground and zero console errors
- [x] `npm run test` runs in jsdom (Vitest)
- [x] `npm run build` produces ESM + UMD bundles with `three` external
- [x] `npm run lint` exits 0
- [x] `.github/workflows/ci.yml` covers lint + test + build + bundle-size check
- [x] `bench/harness.js` wired to `npm run bench`

---

### Phase 1 — Core Engine ✅
**Scope:** `src/core/`  
**Prompts:** 9–20  
**Exit criteria:**
- [x] `CapabilityProbe` detects WebGL2, instanced arrays, float textures, timer queries, GPU vendor; exposes frozen `Capabilities` object; gracefully falls back to `NULL_CAPABILITIES` when WebGL is unavailable
- [x] `Graph3DRenderer` wraps `THREE.WebGLRenderer`; configures sRGB + ACESFilmic tonemapping + PCFSoft shadows by default; emits `graph3d:context-lost` / `graph3d:context-restored` on canvas; `dispose()` removes all listeners
- [x] `Graph3DLoop` is a singleton RAF manager; single RAF per page; auto-starts on first `add`, auto-stops on last `remove`; pauses on `visibilitychange`; callbacks receive `(deltaSec, elapsedSec)`
- [x] `Graph3DRegistry` tracks all live instances; `disposeAll`, `pauseAll`, `resumeAll`, `panicDispose` all work
- [x] `FrameBudget` emits `graph3d:slow-frame` after `windowSize` consecutive over-budget frames; resets counter after emit; configurable `budgetMs` and `windowSize`
- [x] `WorkerPool` creates workers lazily via injected `workerFactory`; `exec(taskName, payload, transferList?)` returns a Promise; queues tasks when all workers are busy; terminates idle workers after 30 s; `dispose()` rejects in-flight tasks
- [x] Worker bootstrap is base64-inlined as a Blob URL (no CORS / path issues for library consumers); `registerWorkerTask` serialises handler functions into the worker
- [x] `Graph3D` top-level class composes all of the above; `autoResize` via `ResizeObserver`; `pause()` / `resume()`; `chart()` shell; `disposeAll` + `version` statics; fully idempotent `dispose()`
- [x] Unit tests cover every public method (`tests/core/*.test.js`) — 247 tests, 10 files, all passing
- [x] Integration tests confirm end-to-end behaviour (`tests/integration/phase1.test.js`): 1000× construct/dispose, tick delta conversion, pause/resume loop state, context-loss simulation, slow-frame event chain
- [x] No `console.log` in source; no magic numbers without named constants; all public methods have JSDoc
- [x] `docs/concepts/core.md` documents the single-RAF design, capability probe, frame budget, and worker pool

---

### Phase 2 — Scene Composition ✅
**Scope:** `src/scene/`  
**Prompts:** 21–30  
**Exit criteria:**
- [x] `GraphScene` wraps `THREE.Scene`; `add`, `remove`, `traverse`, `findByName`, `dispose` (walks geometry/material/texture disposal — sets the disposal standard for all future phases); `selectByName`/`selectInstance` (Prompt 47) look up registered `GraphObject`/`GraphInstancedObject` wrappers via the per-scene registry in `GraphSceneRegistry.js` — kept in `scene/` rather than `object/` so `GraphScene` never has to import concrete wrapper subclasses (see `GraphObject.isInstanced`/`GraphInstancedObject.capacity`)
- [x] `GraphSceneCamera` wraps perspective and orthographic cameras; presets: `orbit`, `fixed`, `isometric`, `top-down`, `cinematic-low`, `cinematic-high`; lazy-loads `OrbitControls`
- [x] Cinematic camera primitives: `dollyZoom`, `tour(waypoints)`, `follow(target)`, `focusOn(boundingBox)`; each returns a chainable controller with `.cancel()`
- [x] `GraphSceneLight` implements presets: `ambient-only`, `three-point`, `studio`, `flat`, `cinematic`, `product-shot`
- [x] `GraphSceneShadows` configures PCF / PCFSoft / VSM shadow maps and quality levels
- [x] `GraphSceneEnvironment` loads HDR via `RGBELoader`; ref-counted texture cache; fog presets; skybox; built-in preset names `studio-1k`, `cinema-night`, `daylight` wired to `src/scene/env/*.hdr` (binary assets not yet bundled — see `.claude/TODO.md`)
- [x] `Graph3D.createScene(name)` and `setActiveScene(nameOrScene)` wired; per-frame tick renders `activeScene`
- [x] Disposal tests: create + dispose N scenes; `renderer.info.memory` returns to baseline
- [x] `docs/concepts/scene.md` documents the scene graph, camera presets, and HDR environment

---

### Phase 3 — Object & Mesh
**Scope:** `src/object/`  
**Prompts:** 31–40  
**Exit criteria:**
- [x] `GraphObject` base wrapper: holds `THREE.Object3D`, exposes `dispose()`, supports user-defined metadata
- [x] `GraphInstancedObject` extends `GraphObject` for instanced rendering (>50 datums threshold); per-instance setters for matrix/position/rotation/scale/color/user data (Prompt 37), custom shader attributes (Prompt 38), a stable `instanceId` attribute + octree-backed `pick(raycaster)` (Prompt 39, upgraded Prompt 45), throttled per-instance frustum culling via `enableInstanceCulling`/`updateCulling`, octree-backed and live-updating as instances move (Prompt 40, upgraded Prompt 45), and a capacity-grow strategy (Prompt 49): `setInstanceCount(n)` beyond capacity reallocates at `ceilPowerOfTwo(n)` and copies every attribute (including custom ones from Prompt 38), preserving the octree index mapping
- [x] `Octree` (Prompt 44): `insert`/`remove`/`queryFrustum`/`queryRay`/`queryRadius`/`queryAABB`, spatial index for fast frustum culling and picking on large instance sets — wired into `GraphInstancedObject` in Prompt 45, updated incrementally by every `setInstanceMatrix`/`Position`/`Rotation`/`Scale` call
- [x] Loader (`GraphObjectLoader`, Prompt 43) supports GLTF/GLB (+ Draco/KTX2, config-gated — see `.claude/TODO.md`), OBJ (+ MTL), and FBX; ref-counted per-URL cache avoids re-fetching, each caller gets an independent disposable clone; progress-event callbacks not yet exposed (not required by Prompt 43's own spec)
- [x] Disposal tests: instance buffer attributes return to baseline count after dispose (`tests/integration/GraphInstancedObject-disposal.test.js`); a 1,000,000-instance create+dispose cycle is covered leak-free by `tests/integration/phase3.test.js` (Prompt 52)
- [x] `GraphMesh extends GraphObject` (Prompt 42): individual-mesh transform/vertex mutation API, `clone()`/`deepClone()`
- [x] `GraphObjectFactory` (Prompt 41): `createBars`/`createPoints`/`createLineSegments`/`createSurfaceTiles`/`createNodes`, dispatching on `count` vs. the configurable `INSTANCING_THRESHOLD` (default 50) to either `GraphMesh[]` or one `GraphInstancedObject`
- [x] Examples: `examples/03-instanced/main.js` (100,000 shader-spun bars, Prompt 50) and `examples/03-million/main.js` (1,000,000 noise-placed point spheres, octree-backed hover picking, Prompt 51)
- [x] Phase 3 integration tests (Prompt 52): 1M instance create+dispose leak-free; instance picking correct for known positions; octree matches brute-force on 10K points; capacity grow preserves all attributes; ≤50 → meshes / >50 → InstancedObject boundary honored — all in `tests/integration/phase3.test.js`
- [x] `docs/concepts/object.md` documents the object/mesh layer and the instancing decision table (Prompt 53)

**Phase 3 — DONE.**

---

### Phase 4 — Compositional Core — **DONE**
**Scope:** `src/compose/`  
**Prompts:** 41–55, 74–85 (Selection/join and Axis/annotation were pulled forward into Phase 4 as v3 additions — see `prompts.md`)  
**Exit criteria:**
- [x] Scales: `linear`, `log`, `pow`, `sqrt`, `band`, `point`, `ordinal`, `time` — all with `.domain()`, `.range()`, `.nice()`, `.clamp()`, `.ticks()`, `.tickFormat()` per D3 convention
- [x] Generators: `generator.line`, `generator.bar`, `generator.point`, `generator.surface`, `generator.arc` returning Three.js-ready buffers/geometry
- [x] Layouts: `force`, `tree`, `pack`, `stack`, `grid` — operate on plain data arrays, return position arrays
- [x] Color palettes: `viridis`, `plasma`, `inferno`, `magma`, `cividis`, `turbo` built-in; `color.sequential`, `color.diverging`, `color.categorical`; user-extensible via `palette.custom`/`fromCSS`
- [x] Axis: `Axis` renders tick lines, labels (SDF text after Phase 6), and a spine; consumes the scale's own `.ticks()`/`.tickFormat()`
- [x] Selection & the data join: `Selection`/`.data(newData, keyFn).join(...)` (v3 addition) — the flagship capstone (`docs/concepts/compose.md`, `examples/04-compose/`) proves Selection + join + scales + palettes compose without a chart class
- [x] All `compose/` modules are pure functions or classes with no Three.js import (Three.js objects are output only from generators) — except the three sanctioned carve-outs (`compose/selection`, `compose/axis`, `compose/annotation`), documented in `CLAUDE.md` §1.4
- [x] Coverage ≥ 85% lines, ≥ 80% branches across `src/compose/`

---

### Phase 5 — Animation & Transitions — **DONE**
**Scope:** `src/anim/`  
**Prompts:** 86–99 (renumbered from the original 56–65 as `prompts.md` grew during Phase 4's v3 additions — see `prompts.md`)  
**Exit criteria:**
- [x] `GraphAnimCurve` (Prompt 86): every in/out/inOut easing family, `spring`, `bezier`, `noise`, `resolve(nameOrFn)`
- [x] `GraphAnimKeyframe` (Prompt 87): per-property track with dot-paths; all interpolation delegates to `compose/interpolate` (no local lerp)
- [x] `GraphAnimTimeline` (Prompt 88): `to`/`from`/`wait`/`then`/`play`/`pause`/`stop`/`reverse`/`seek`/`loop`; parallel by default, sequential after `.then()`
- [x] `GraphAnim` (Prompt 89): engine root, one shared RAF tick drives every registered timeline; `timeline()`/`add()`/`remove()`, global `pause()`/`resume()`, `dispose()`
- [x] `Transition` (Prompt 90): D3-flavored `.duration()`/`.delay()`/`.easing()`/`.on('start'|'end'|'interrupt')`
- [x] `Selection.transition()` → `SelectionTransition` (Prompt 91): animated `.attr()`/`.style()`/`.remove()` over the join system, staggering via a per-datum `.delay()` function, batched per-frame buffer commits (never per-instance) on the instanced backend
- [x] `GraphInstancedObject.setAllPositions`/`setAllScales`/`setAllColors` (Prompt 92): optional `{duration, easing}` animates the whole bulk array instead of memcpy-ing it
- [x] Interrupt semantics (Prompt 93): a new `Transition`/`SelectionTransition` on the same target+path (or node+path) fires `'interrupt'` on the one it supersedes and picks up from the current interpolated state — `GraphAnimTimeline.interruptPath()` is the shared primitive underneath both
- [x] `CameraTour` (Prompt 94): waypoint interpolation (position + lookAt + FOV), per-segment duration/easing, `pause`/`resume`/`skipToNext`/`cancel`, presets `.orbit()`/`.flyTo()`/`.cinematicReveal()`
- [x] `GraphAnim.respectReducedMotion` (Prompt 95): registered timelines snap to their end values instead of animating; `GraphAnim.tween(from, to, options, onUpdate)` ad-hoc helper
- [x] Keyframe groups (Prompt 96): `GraphAnimTimeline.onGroupComplete()` — one completion event per `.then()`-delimited parallel group, independent of the timeline's overall `onComplete`; `Transition.runningOn(target)`/`cancelAllOn(target)` are the introspection primitive a future `chart.runningTransitions()`/`cancelTransitions()` (Phase 8) will wrap — no `src/chart/` layer exists yet to attach those to directly
- [x] `examples/05-transitions/main.js` (Prompt 97): a live data join re-transitioning every 2s (staggered enter, morphing update, dissolving exit) plus a `CameraTour.flyTo()` reframing on the new tallest bar
- [x] Phase 5 cross-cutting tests (Prompt 98, `tests/integration/phase5.test.js`): targets reached within tolerance; `.then()` sequencing; interrupt state pickup; reduced-motion snap; `SelectionTransition` parity meshes vs. instanced; per-datum stagger delay; exit `.remove()` frees instanced slots only after completion
- [x] `docs/concepts/anim.md` (Prompt 99): flat sugar API, timeline, and `SelectionTransition` documented side by side

---

### Phase 6 — Materials & Procedural FX — **DONE**
**Scope:** `src/material/`
**Prompts:** 100–115 (renumbered from this section's stale original range of 66–80 — corrected when the phase was completed, mirroring Phase 5's same correction)
**Exit criteria:**
- [x] `GraphObjectMaterial` (Prompt 100): `.set()`, `.applyShader()` (with dev-mode `preserveUniforms` hot-reload, Prompt 112), `.bindUniforms()` (`'auto'` time/resolution), `.setMap()` — all ref-counting-aware for shared textures (Prompt 111, `core/GraphDisposal.js`'s `retainTexture`/`releaseTexture`)
- [x] PBR pass-through presets (Prompt 101): `standard`, `physical`, `basic`, `lambert`, `phong`, `toon`, `matcap`
- [x] Custom-shader looks: `holographic` (Prompt 102), `crystal` (Prompt 103, chromatic-dispersion refraction), `glow` (Prompt 104)
- [x] `glass`/`frostedGlass` (Prompt 103, real `transmission` + thin-film `iridescence`)
- [x] `neon`/`pulse` (bloom-friendly emissive, breathing), `velvet` (Prompt 104)
- [x] Metals & coated dielectrics: `liquidMercury`, `chrome`, `gold`, `copper`, `pearl`, `obsidian` (Prompt 105)
- [x] `dataDriven` (Prompt 106): per-instance/per-vertex palette lookup; completes the Prompt 77 `Selection.style` per-instance `opacity`/`emissiveIntensity` link
- [x] The `material`/`texture` namespaces assembled and re-exported from `src/index.js` (Prompt 107)
- [x] SDF text (`SDFText.create`, Prompt 108): GPU-rendered, resolution-independent MSDF layout/shader engine — the bundled Roboto atlas binary itself is a known, documented gap (no MSDF tool/font available in this environment; same category as Phase 2's missing HDR assets)
- [x] Procedural textures (Prompt 110): `gradient`, `noise`, `voronoi`, `cellular`, `checkerboard`, `dots`, `lines`, `paletteTexture` — all `THREE.DataTexture`
- [x] `addPlanarReflection` (Prompt 111) and `setPaletteForAttribute` (Prompt 112) convenience helpers
- [x] `examples/06-materials/main.js` (Prompt 113): 4×4 grid, one preset per bar, `studio-dark` themed, verified live in a browser
- [x] Phase 6 cross-cutting tests (Prompt 114, `tests/integration/phase6.test.js`): every material renders/disposes clean, SDF crispness proxied structurally, palette texture matches its source fn, `dataDriven` samples correctly, `Selection.style('color')` backend parity
- [x] `docs/concepts/material.md` (Prompt 115) with a material-picker gallery
- [ ] No canvas-sprite text anywhere after this phase — not fully verifiable yet: `SDFText` exists and is the mandated replacement, but it isn't wired into `Axis`/`annotation.label` (still the Phase 4 metadata stub; see `docs/concepts/material.md`'s SDFText section for why) and no canvas-sprite text was ever added elsewhere, so there's nothing to replace today

---

### Phase 7 — PostFX & Particles
**Scope:** `src/postfx/`  
**Prompts:** 81–95  
**Exit criteria:**
- [ ] `GraphPostFX` owns `EffectComposer`; charts request passes via `graph3d.postfx.enable(passName, options)`
- [ ] Built-in passes: `bloom`, `ssao`, `dof`, `motionBlur`, `godRays`, `fxaa`
- [ ] `GraphParticles` system: CPU-driven for <10 000 particles, GPGPU for ≥10 000; integrates with the animation loop
- [ ] No chart type creates its own `EffectComposer`
- [ ] Disposal test: all passes and particle systems release GPU resources

---

### Phase 8 — Chart Types
**Scope:** `src/chart/`  
**Prompts:** 96–140  
**Exit criteria:**
- [ ] Chart types: `bar`, `line`, `scatter`, `surface`, `heatmap`, `network`, `tree`, `pack`
- [ ] All chart types default to instanced rendering via `GraphInstancedObject`; fall back to mesh for <50 datums
- [ ] Fluent API: `.data(arr, keyFn)`, `.x(fn, scale)`, `.y(fn, scale)`, `.z(fn, scale)`, `.color(fn, palette)`, `.material(preset)`, `.transition()`, `.on(event, handler)`, `.render()`
- [ ] `GraphChartDataBinding` manages diff-based updates — only changed instances are written to GPU buffers
- [ ] Every chart type has a unit test, integration test, and example page
- [ ] `graph3d.chart('bar')` dispatch wired in `Graph3D`

---

### Phase 9 — Interaction & State
**Scope:** `src/interact/`  
**Prompts:** 141–165  
**Exit criteria:**
- [ ] GPU picking via render-to-texture (object IDs encoded as colours); CPU raycast fallback
- [ ] Formal state machine: idle → hovered → focused → selected; transitions emit typed events
- [ ] `GraphTooltip` positions a DOM element at the hovered point; user-supplied render function
- [ ] Brush and lasso selection return arrays of matching datum keys
- [ ] Cross-filter: selecting items in one chart highlights matching items in linked charts

---

### Phase 10 — Streaming & Scale
**Scope:** `src/stream/`  
**Prompts:** 166–190  
**Exit criteria:**
- [ ] `DataStream` accepts `AsyncIterable<Chunk>` and pipes into live chart updates
- [ ] LOD (level-of-detail) decimation triggered when instance count exceeds configurable threshold
- [ ] GPGPU aggregation computes spatial histograms and bin statistics on the GPU
- [ ] Origin-shifting maintains float32 precision for coordinates > 1 km from origin
- [ ] Worker tasks registered for: sort, decimate, aggregate, spatial-bin

---

### Phase 11 — Integration & Examples
**Scope:** `examples/`, cross-layer wiring  
**Prompts:** 191–220  
**Exit criteria:**
- [ ] Examples for all 8 chart types render without console errors
- [ ] All examples reach 60 fps with 100 000 datums on a mid-range GPU
- [ ] Cross-chart example: scatter + bar + heatmap linked via cross-filter
- [ ] `npm run bench` baseline updated; no regression vs Phase 8 baseline
- [ ] `docs/` covers all public layers

---

### Phase 12 — Publishing
**Scope:** `types/`, `dist/`, CI  
**Prompts:** 221–244  
**Exit criteria:**
- [ ] `npm run build` produces all four bundles (ESM, UMD, minified ESM, minified UMD) with zero warnings
- [ ] `npm run test:coverage` meets ≥ 85% lines, ≥ 80% branches, ≥ 85% functions across all layers
- [ ] `types/index.d.ts` covers every public export; TypeScript `strict` compilation passes
- [ ] Bundle size: ESM minified ≤ 50 KB gzipped (excluding `three`)
- [ ] `npm run lint` exits 0 with zero `eslint-disable` suppressions in `src/`
- [ ] `CHANGELOG.md` documents all public API changes since v0.1.0
- [ ] `npm publish --dry-run` succeeds with correct `exports` map

---

## "Are we done?" Checklist (per phase)

Before marking a phase complete, confirm:

1. All exit-criteria checkboxes above are ticked.
2. `npm test` passes — no regressions in prior phases.
3. The playground (`npm run dev`) boots with zero console errors.
4. No new dependency added without explicit user approval.
5. Definition of Done in `CLAUDE.md §4` is satisfied.
