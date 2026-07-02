# Graph3D.js — World-Class Build Prompts (v3)

**v3 revision.** Prompts 1–47 are ✅ COMPLETE and locked — do not re-execute or renumber them. v3 fixes the gap between v2 and the true goal — *"D3 for 3D charts with micro-level control"* — by adding the missing D3 soul: a **Selection & Data-Join layer** that gives per-datum control uniformly across instanced and non-instanced paths, a **unified interpolator module**, **ticks/tickFormat on all continuous scales**, and **enter/update/exit hooks on every chart type**. Everything from Prompt 48 onward is renumbered.

## What changed v2 → v3 (summary)

| # | Change | Why |
|---|---|---|
| 1 | New **Selection** class + **data-join** (`.data().enter()/.exit()/.join()`) in Phase 4 | D3's core mechanism; the micro-control surface |
| 2 | Selection works identically over `GraphMesh[]` AND `GraphInstancedObject` | Micro-control must survive the >50-datum instancing switch |
| 3 | New `interpolate` module — single authority for number/color/array/object interpolation | DRY; consumed by scales, transitions, keyframes |
| 4 | `ticks()` + `tickFormat()` on linear/log/pow (not just time) | Axes need them |
| 5 | `chart.onEnter/onUpdate/onExit` + `chart.selection()` on all chart types | User-facing join hooks |
| 6 | `Selection.transition()` and `Selection.on()` wired through Phases 5 & 9 | Micro-control includes animation + events per datum |

## Architecture (v3 — Layer 4 expanded)

```
Layer 1  — Core Engine            ✅ done (prompts 9–20)
Layer 2  — Scene Composition      ✅ done (prompts 21–35)
Layer 3  — Object & Mesh          ✅ mostly done (36–47), remainder 48–53
Layer 4  — Compositional Core     → Scale, Interpolate, Color, Generator, Layout,
                                    ★ Selection & Data-Join ★, Axis, Annotation
Layer 5  — Animation & Transitions (+ Selection.transition)
Layer 6  — Materials & Procedural FX
Layer 7  — PostFX & Particles
Layer 8  — Chart Types (+ enter/update/exit hooks, chart.selection())
Layer 9  — Interaction & State (+ Selection.on())
Layer 10 — Streaming & Scale
```

## Headline Code (v3 target ergonomics — note the join)

```js
const g = new Graph3D({ canvas, theme: 'studio-dark' });
const chart = g.chart('bar')
  .x(d => d.category, scale.band().padding(0.1))
  .y(d => d.value, scale.linear().nice())
  .color(d => d.value, color.sequential(palette.viridis));

chart.data(values, d => d.id).join(
  enter => enter.attr('scale.y', 0).transition().duration(600).attr('scale.y', d => d.value),
  update => update.transition().duration(400).attr('scale.y', d => d.value),
  exit => exit.transition().duration(300).attr('opacity', 0).remove()
).render();

// Micro-control after render — same API whether 10 bars or 1,000,000
chart.selection()
  .filter(d => d.value > 90)
  .attr('material.emissiveIntensity', 2.0)
  .on('click', d => console.log(d));
```

---

## ✅ COMPLETED — Prompts 1–47 (do not re-execute)

- **1–8** Phase 0: bootstrap, tooling, CI, bench harness.
- **9–20** Phase 1: CapabilityProbe, Renderer, Loop, Registry, FrameBudget, WorkerPool, Graph3D core, tests, docs.
- **21–35** Phase 2: GraphScene, Camera (+cinematic tours), Lights, Shadows, Environment (HDR ref-counted), Fog, Clipping, Setup, 8 themes, tests, docs.
- **36–47** Phase 3 (partial): GraphObject, GraphInstancedObject (+custom attributes, picking, culling), Factory (50-datum instancing boundary), GraphMesh, Loader, Octree (+wiring), material lazy getters, `selectByName` / `selectInstance`.

---

## PHASE 3 — Remainder (unchanged from v2)

**Prompt 48.** Add bulk transform helpers on `GraphInstancedObject` accepting typed arrays: `setAllPositions(Float32Array)`, `setAllScales(Float32Array)`, `setAllColors(Float32Array)`. Zero-allocation hot paths for chart `update()`.

**Prompt 49.** Add InstancedMesh capacity-grow strategy: `setInstanceCount(n)` beyond capacity reallocates at `nextPow2(n)` and copies all attributes (including custom ones from Prompt 38). Preserve the octree index mapping.

**Prompt 50.** Example `examples/03-instanced/main.js`: 100,000 instanced bars in a 316×316 grid, rotated via a single shader-driven attribute, 60fps.

**Prompt 51.** Example `examples/03-million/main.js`: 1,000,000 instanced point spheres via noise placement, octree-backed hover picking, 30fps minimum target.

**Prompt 52.** Phase 3 integration tests: (a) 1M instance create+dispose leak-free, (b) instance picking correct for known positions, (c) octree matches brute-force on 10K points, (d) capacity grow preserves all attributes, (e) ≤50 → meshes / >50 → InstancedObject boundary honored.

**Prompt 53.** Document Phase 3 in `docs/concepts/object.md` with the instancing decision table. Mark DONE in BUILD_PLAN.md.

---

## PHASE 4 — Compositional Core + Selection & Data-Join ("D3 for 3D" — the soul)

### 4A — Scales & Interpolation

**Prompt 54.** Create `src/compose/scale/index.js` exporting the `scale` namespace. Each scale is a factory returning a chainable, callable object: `domain(arr)`, `range(arr)`, `clamp(bool)`, `nice()`, `invert(v)`, `copy()`, and `s(value) → mapped`. Match D3-scale ergonomics exactly.

**Prompt 55.** Create `src/compose/interpolate/index.js` — the **single interpolation authority** for the whole library (DRY mandate from CLAUDE.md). `interpolate(a, b)` returns `(t: 0..1) => value`, dispatching on type: number, hex/`THREE.Color` (RGB, HSL, and perceptual LAB variants via `interpolateRgb/Hsl/Lab`), array (element-wise), plain object (key-wise), `{x,y,z}`. Phase 5's keyframes and transitions MUST consume this module — no local lerp code anywhere else.

**Prompt 56.** Implement `scale.linear()` with `ticks(count)` (D3's nice-tick algorithm: steps of 1/2/5×10ⁿ) and `tickFormat(count, specifier?)` (fixed/precision/SI-prefix basics). Range mapping uses the `interpolate` module so non-numeric ranges (e.g. colors) work for free. Unit-test numeric parity against known D3 outputs.

**Prompt 57.** Implement `scale.log(base = 10)`, `scale.pow(exponent = 2)`, `scale.sqrt()` — same chainable surface, each with `ticks()`/`tickFormat()`. Guard log domains crossing zero with a clear thrown error.

**Prompt 58.** Implement `scale.time()`: domain `[Date, Date]`, `ticks(count)` at sensible intervals (ms → year), `tickFormat(count, specifier)`.

**Prompt 59.** Implement `scale.ordinal()` and `scale.band()` (`padding`, `paddingInner`, `paddingOuter`, `align`, `bandwidth()`), and `scale.point()`. These drive bar and category axes.

### 4B — Color

**Prompt 60.** Create `src/compose/color/index.js`: `color.sequential(palette, domain?)`, `color.diverging`, `color.categorical`, `color.quantize`, `color.quantile`, `color.threshold`. All built on the `interpolate` module.

**Prompt 61.** Implement sequential palettes in `palette`: viridis, inferno, magma, plasma, cividis, turbo, warm, cool, rainbow, sinebow, spectral, RdYlBu, RdBu, BrBG, PiYG, blues, greens, oranges, purples, reds, greys. Each is `(t) => '#rrggbb'` plus a precomputed `.colors` 256-step array for instance color buffers.

**Prompt 62.** Implement categorical palettes: category10, tableau10, pastel, dark2, paired, set1/2/3, accent — array form + cycling function form, matching D3 for migration ease.

**Prompt 63.** Implement custom palette builders: `palette.interpolateRGB/HSL/LAB(colors)` and `palette.fromCSS([...])` — thin wrappers over the `interpolate` module (no duplicate color math).

### 4C — Generators & Layouts

**Prompt 64.** Create `src/compose/generator/index.js` — generators are pure data→buffer functions: chainable builders ending in `.compute(data)` returning `{ positions, scales, colors, attributes }` Float32Arrays ready for `GraphInstancedObject.setAll*`.

**Prompt 65.** Implement `generator.bar()`: `x(accessorOrScale)`, `y(...)`, `width`, `depth`, `baseline`, `compute(data)`.

**Prompt 66.** Implement `generator.line()`: `x/y/z` accessors, `curve('linear'|'monotone'|'catmullRom'|'bezier')`, `tension`, `compute(data)` producing a Line2 vertex stream.

**Prompt 67.** Implement `generator.point()`: `x/y/z`, `size`, `shape('sphere'|'cube'|'cone'|'custom')`, `compute(data)`.

**Prompt 68.** Implement `generator.surface()`: 2D `values[][]` or `(x,z)=>y` function; `xDomain`, `zDomain`, `resolution`; `compute()` producing triangulated vertex/index/normal buffers.

**Prompt 69.** Implement `generator.arc()`: `innerRadius`, `outerRadius`, `startAngle`, `endAngle`, `extrude`, `compute(data)` — powers 3D pie/donut.

**Prompt 70.** Create `src/compose/layout/index.js` + implement `layout.stack()` (`keys`, `order`, `offset`, `value`).

**Prompt 71.** Implement `layout.grid({ rows, cols, cellWidth, cellDepth })` for small-multiples positioning.

**Prompt 72.** Implement `layout.force()` — 3D force-directed layout, velocity Verlet + Barnes-Hut octree approximation. Forces: `link`, `charge`, `center`, `collide`, `radial`. Incremental `tick()`; auto-pausable.

**Prompt 73.** Implement `layout.pack()` (sphere packing) and `layout.tree()` (3D hierarchy) with d3-hierarchy-parity input (`children`, `value`, `sum`, `sort`), returning positioned data `{x, y, z, r}`.

### 4D — ★ Selection & Data-Join ★ (NEW — the micro-control surface)

**Prompt 74.** Create `src/compose/selection/Selection.js`. Class `Selection` — a uniform per-datum handle set. Constructor takes an internal **backend**: either `{ type: 'meshes', meshes: GraphMesh[] }` or `{ type: 'instanced', object: GraphInstancedObject, indices: Uint32Array }`. Core reads: `size()`, `empty()`, `nodes()` (per-datum proxy handles), `datum(i)`, `data()`. The user never constructs a Selection directly — charts and scenes hand them out.

**Prompt 75.** Implement the **attribute write path** — `Selection.attr(path, valueOrFn)`. `path` is a dot-path from a fixed vocabulary: `position.x/y/z`, `rotation.x/y/z`, `scale.x/y/z`, `color`, `opacity`, `visible`, plus any custom instance attribute name (from Prompt 38's `defineAttribute`). `valueOrFn` may be a constant or `(datum, index) => value`. **Backend routing:** meshes-backend → writes to `GraphMesh` transforms/material; instanced-backend → writes into instance matrices/color/custom attribute buffers and marks them dirty (single `commit` per flush, not per instance). This routing is the heart of "micro-control that survives instancing" — test that both backends produce identical visual results on identical data.

**Prompt 76.** Implement Selection combinators: `filter(predicateFn)` (new narrowed Selection sharing the backend), `each((datum, index, handle) => ...)`, `sort(comparator)` (reorders datum→index mapping without touching buffers unless `.order()` is called), `call(fn)` (D3-style reusable-behavior hook), `merge(otherSelection)` (same-backend only; throw otherwise).

**Prompt 77.** Implement `Selection.style(materialProp, valueOrFn)` for material-level micro-control: meshes-backend writes to each mesh's material; instanced-backend routes to per-instance attributes consumed by the Phase 6 `dataDriven` material (stub the material link now; complete in Phase 6). Document which props are per-instance-capable (`color`, `opacity`, `emissiveIntensity` via attribute) vs material-global (everything else — warn when set on an instanced backend).

**Prompt 78.** Implement the **data join** in `src/compose/selection/join.js`. `selection.data(newData, keyFn)` diffs against bound data — FIRST extract the diff core into `src/compose/selection/diff.js` as the single diff authority (the future `GraphChartDataBinding` will consume it too; DRY). Returns a `JoinResult` with `.enter()` (Selection of pending datums, backed by placeholder slots), `.exit()` (Selection of departing datums), and the update selection as itself. `.join(enterFn?, updateFn?, exitFn?)` applies defaults when omitted: enter appears at final state, exit `.remove()`s immediately.

**Prompt 79.** Implement enter/exit materialization: `enter` selections allocate instance slots (instanced backend, growing capacity via Prompt 49) or create meshes via the factory (mesh backend); `exit.remove()` frees slots / disposes meshes. Slot recycling on the instanced backend: freed indices go to a free-list before capacity grows. Test: 10,000 join cycles with churning keys — zero capacity thrash beyond pow2 growth, zero leaks.

**Prompt 80.** Stub `Selection.transition()` returning a `SelectionTransition` placeholder (full engine lands in Phase 5) and `Selection.on(event, handler)` placeholder (full picking lands in Phase 9). Both throw a clear "requires Phase N" dev error until wired — Fail Fast, no silent no-ops.

**Prompt 81.** Wire scene-level entry points: `GraphScene.selectAll(name)` returns a Selection over all matching objects (auto-choosing backend); document `selectInstance` as the low-level escape hatch beneath it.

**Prompt 82.** Selection unit + integration tests: (a) attr routing parity meshes vs instanced (same data → same world transforms within float tolerance), (b) filter/each/sort correctness, (c) join enter/update/exit counts across keyed and unkeyed data, (d) slot free-list reuse, (e) accessor functions receive correct `(datum, index)`.

### 4E — Axis & Annotation

**Prompt 83.** Create `src/compose/axis/Axis.js`: renders axes as scene objects (line + ticks + labels). Chainable: `scale(s)`, `orientation('x'|'y'|'z')`, `tickCount`, `tickFormat`, `tickSize`, `labelStyle`. Consumes the scales' `ticks()`/`tickFormat()` from 4A. Label rendering stubs to SDF text (Phase 6).

**Prompt 84.** Create `src/compose/annotation/index.js`: `annotation.label`, `callout`, `referenceLine(scale, value)`, `referencePlane(axis, value)`, `region(box)` — all real scene objects with good defaults.

**Prompt 85.** Phase 4 capstone: build the headline join example end-to-end using only Layers 1–4 (a hand-rolled bar layout, no chart class yet), proving Selection + join + scales + palettes compose correctly. Document Phase 4 in `docs/concepts/compose.md` **with a dedicated "Selections & the data join" page** — this is the flagship doc. Mark DONE.

---

## PHASE 5 — Animation & Transitions (now Selection-aware)

**Prompt 86.** Create `src/anim/GraphAnimCurve.js`: easings (all in/out/inOut of Quad/Cubic/Quart/Quint/Expo/Circ/Sine/Back/Elastic/Bounce), `spring(stiffness, damping)`, `bezier(x1,y1,x2,y2)`, `noise(seed)`. Pure `(t)=>number`. `resolve(nameOrFn)`.

**Prompt 87.** Create `src/anim/GraphAnimKeyframe.js`: per-property track with dot-paths; ALL value interpolation delegates to `src/compose/interpolate` (no local lerp — DRY).

**Prompt 88.** Create `src/anim/GraphAnimTimeline.js`: `to`, `from`, `wait`, `then`, `play/pause/stop/reverse/seek`, `loop(count, 'restart'|'pingpong')`, `onUpdate`, `onComplete`. Parallel by default; sequential after `.then()`.

**Prompt 89.** Create `src/anim/GraphAnim.js`: engine root; one loop tick advances all timelines; `timeline(target)`; global pause/resume/dispose.

**Prompt 90.** Create `src/anim/Transition.js` — D3-flavored: `.duration(ms)`, `.delay(msOrFn)`, `.easing(name)`, `.on('start'|'end'|'interrupt')`. Chart methods following `.transition()` animate instead of snapping.

**Prompt 91.** **Implement `Selection.transition()`** (replacing the Prompt 80 stub). Returns a `SelectionTransition` mirroring the Selection API: `.attr(path, valueOrFn)` schedules per-datum tweens (start values captured per datum from current buffer state), `.style(...)` likewise, `.delay(fnOfDatum)` for staggering, `.remove()` on exit transitions disposes/frees slots on completion. Instanced backend: one per-frame pass writes all interpolated values into buffers then commits once — never per-instance commits. This is the join-animation engine used in the headline example.

**Prompt 92.** Wire `Transition` into `GraphInstancedObject` bulk setters: an in-scope transition captures the start array and interpolates per-frame instead of memcpy.

**Prompt 93.** Interrupt semantics: a new transition on the same target/attribute emits `'interrupt'` on the old one and picks up from the current interpolated state. Rigorous tests, including interrupts on SelectionTransitions mid-stagger.

**Prompt 94.** Create `src/anim/CameraTour.js` fleshing out Phase 2's stub: waypoint interpolation (position + lookAt + FOV), per-segment duration/easing, `pause/resume/skipToNext/cancel`, presets `.orbit()`, `.flyTo()`, `.cinematicReveal()`.

**Prompt 95.** Reduced-motion support: `respectReducedMotion` snaps all transitions to end values. Add `GraphAnim.tween(from, to, options, onUpdate)` ad-hoc helper (uses `interpolate`).

**Prompt 96.** Add keyframe groups (single completion event over parallel tracks) and `chart.cancelTransitions()` / `runningTransitions()` introspection stubs (chart wiring in Phase 8).

**Prompt 97.** Phase 5 example `examples/05-transitions/main.js`: a data join updating every 2s — enter grows in staggered, update morphs, exit dissolves — plus a camera tour framing the new max value.

**Prompt 98.** Phase 5 tests: (a) targets reached within tolerance, (b) `.then()` sequencing, (c) interrupt state pickup, (d) reduced-motion snap, (e) SelectionTransition parity meshes vs instanced, (f) stagger delay fn per datum, (g) exit `.remove()` frees slots only after completion.

**Prompt 99.** Document Phase 5 in `docs/concepts/anim.md` (flat sugar API + timeline + SelectionTransition side by side). Mark DONE.

---

## PHASE 6 — Materials & Procedural FX

**Prompt 100.** Create `src/material/GraphObjectMaterial.js`: `set(material)`, `applyShader(shaderMaterial)`, `bindUniforms({ time:'auto', resolution:'auto', ... })`, `setMap(slot, texture)` (map/normal/roughness/metalness/emissive/ao/env/displacement/clearcoat).

**Prompt 101.** PBR presets `src/material/presets/pbr.js`: `standard`, `physical`, `basic`, `lambert`, `phong`, `toon`, `matcap`.

**Prompt 102.** `presets/holographic.js` — animated iridescent fresnel + scanlines + chromatic shift; uniforms `intensity`, `scanlineFrequency`, `color1/2`, `time`.

**Prompt 103.** `presets/crystal.js` (refraction + cubemap caustic approximation) and `presets/glass.js` (physical thin-film, frosted variant).

**Prompt 104.** `presets/neon.js` (bloom-friendly emissive >1.0, `pulse`) plus `presets/glow.js` and `velvet.js`.

**Prompt 105.** `presets/liquidMercury.js`, `chrome.js`, `gold.js`, `copper.js`, `pearl.js`, `obsidian.js` — all tuned against the default studio HDR.

**Prompt 106.** `presets/dataDriven.js` — reads a per-instance attribute and looks it up in a palette texture. **Complete the Prompt 77 `Selection.style` link**: per-instance-capable props (`color`, `opacity`, `emissiveIntensity`) now route through this material's attributes on instanced backends.

**Prompt 107.** Export the `material` namespace from `src/material/index.js`; add render previews for the docs gallery.

**Prompt 108.** `src/material/text/SDFText.js` — MSDF text rendering; bundled Roboto atlas (<100KB, lazy-loaded); `SDFText.create(text, { outline, glow, color, fontSize, letterSpacing, align })`. **Risk note:** if atlas size creeps, split into a `@graph3d/text` sub-package rather than bloating core.

**Prompt 109.** Wire SDF text into Phase 4 Axis labels (replace stub). Axes now crisp at all distances.

**Prompt 110.** `src/material/texture/procedural.js`: `gradient`, `noise`, `voronoi`, `checkerboard`, `dots`, `lines`, `cellular` → `THREE.Texture`. Plus `paletteTexture(palette)` — a 1D 256-px lookup strip for `dataDriven`.

**Prompt 111.** Reflection helper `material.addPlanarReflection(plane)` (SSR pass when available, cube-camera fallback). Rigorous `GraphObjectMaterial.dispose()` with texture ref-counting; leak tests.

**Prompt 112.** `GraphInstancedObject.material.setPaletteForAttribute(attrName, palette)` — the 90%-case convenience over `dataDriven`. Dev-mode shader hot-reload via `applyShader`.

**Prompt 113.** Example `examples/06-materials/main.js`: 4×4 grid of bars, one material preset each, `studio-dark` theme — the hero screenshot.

**Prompt 114.** Phase 6 tests: every material renders clean; SDF crisp at multiple distances; palette texture matches palette fn; disposal leak-free; `dataDriven` samples correctly; `Selection.style('color')` on instanced backend visually matches meshes backend.

**Prompt 115.** Document Phase 6 in `docs/concepts/material.md` with a material-picker gallery. Mark DONE.

---

## PHASE 7 — PostFX & Particles

**Prompt 116.** `src/postfx/PostFX.js` wrapping EffectComposer: `enable(name, opts)`, `disable`, `configure`, `enabled()`; automatic pass ordering; lazy instantiation on `graph3d.postfx`.

**Prompt 117.** Passes: `bloom`, `ssao`, `dof`, `motionBlur` (velocity buffer), `vignette`, `chromaticAberration`, `filmGrain`, `colorGrading` (LUT), `fxaa`, `smaa` — each with good defaults.

**Prompt 118.** `outline` pass for hover/selection highlighting (auto-wired to the Phase 9 state machine) and `godRays` (auto-activated by `volumetric-cinematic` fog).

**Prompt 119.** `ssr` pass (backs Prompt 111); auto-disable on weak GPUs via CapabilityProbe. Postfx presets: `cinematic`, `clean`, `dramatic`, `dreamy`, `editorial`, `cyberpunk`, `minimal`.

**Prompt 120.** `src/postfx/particles/ParticleSystem.js`: GPU-instanced particles, `emit({ count, position, velocity, lifetime, size, color, blending })`, billboards + mesh particles, million-particle target. **iOS-Safari caveat:** the GPGPU update path (render-target ping-pong) must feature-detect float-texture support and fall back to CPU update; treat this prompt as research-first.

**Prompt 121.** Particle behaviors (`gravity`, `wind`, `attract`, `repel`, `curl`, `swirl`) + presets (`dust`, `sparks`, `smoke`, `confetti`, `dataStream`, `dissolve`). `spawnAt(mesh, options)`.

**Prompt 122.** Wire `dissolve` as the default exit animation: Selection exit `.remove('dissolve')` and `chart.exitAnimation('dissolve')` both trigger it.

**Prompt 123.** `PostFX.pipeline()` escape hatch for full pass reordering.

**Prompt 124.** Example `examples/07-postfx/main.js`: preset toggles + a 100K-particle rain button.

**Prompt 125.** Phase 7 tests: pass enable/disable cleanliness; preset combinations; 100K particles at 60fps; CPU fallback matches GPU within tolerance.

**Prompt 126.** Document Phase 7 in `docs/concepts/postfx.md` with a visual gallery. Mark DONE.

---

## PHASE 8 — Chart Types (fluent, instanced, join-native)

**Prompt 127.** Create `src/chart/GraphChart.js` — fluent base. State: data, scales, accessors, generator config, material, transitions, handlers. Methods: `data(arr, keyFn)`, `x/y/z`, `color`, `size`, `shape`, `material`, `filter`, `sort`, `transition`, `on`, `render`, `update`, `destroy` — chainable except terminals.

**Prompt 128.** **Join-native chart surface (NEW):** `chart.data(arr, keyFn)` returns a chart-level `JoinResult` (`.enter()/.exit()/.join(enterFn, updateFn, exitFn)`) built on the Phase 4 Selection join — the chart's internal render pipeline consumes the same join, so user hooks and internal updates share one code path (DRY). Also add `chart.onEnter(fn)/onUpdate(fn)/onExit(fn)` as sugar for the common case, and `chart.selection()` returning the live Selection over all rendered datums for post-render micro-control.

**Prompt 129.** `render()`: first call computes scale domains from data via accessors, materializes via generator → instanced object, applies material, attaches to scene; subsequent calls route to `update()`.

**Prompt 130.** `update()`: joins new data, recomputes buffers via generator, writes through bulk setters; respects active transitions; enter/exit animate via the user's join fns or defaults (dissolve exit).

**Prompt 131.** `destroy()`: disposes instanced objects, axes, annotations, materials, textures, handlers, running transitions, selection backends. Idempotent; 1000×-cycle leak test.

**Prompt 132.** `src/chart/BarChart.js`: `generator.bar()`, instanced default, `material.standard`, `palette.viridis`, 800ms default transition. Plus `.grouped(keyFn)`, `.stacked(keyFn)` (via `layout.stack`), `.horizontal()/.vertical()`, `.depthSeries()`.

**Prompt 133.** `src/chart/LineChart.js`: Line2-based, `.series(keyFn)` multi-series, `.curve(...)`; same-count updates mutate vertices in place.

**Prompt 134.** `src/chart/ScatterChart.js`: instanced points, million-capable, `.sizeAccessor/.colorAccessor/.opacity`, octree picking.

**Prompt 135.** `src/chart/AreaChart.js` (extruded wall to baseline) and `src/chart/SurfaceChart.js` (height field + optional contour overlay).

**Prompt 136.** `src/chart/HeatmapChart.js`: 2D instanced-plane path + 3D-voxel path (instanced cubes + opacity), million-voxel target.

**Prompt 137.** `src/chart/NetworkChart.js`: `layout.force`, instanced node spheres, Line2 edges, `.pin/.cluster/.linkDistance`, auto-pause on stability.

**Prompt 138.** `src/chart/TreeChart.js` (`layout.tree`) and `src/chart/PackChart.js` (`layout.pack`).

**Prompt 139.** `src/chart/PieChart.js` (`generator.arc`, extrude, explode-on-hover) and `src/chart/VolumeChart.js` (ray-marched, opt-in heavier shader).

**Prompt 140.** Wire `Graph3D.chart(typeName)` dispatch for `'bar' | 'line' | 'scatter' | 'area' | 'surface' | 'heatmap' | 'network' | 'tree' | 'pack' | 'pie' | 'volume'`; unknown type throws with a Levenshtein suggestion.

**Prompt 141.** Per-datum styling accessors on every chart (`.color(fn)`, `.size(fn)`, `.opacity(fn)`, `.visible(fn)`) — implemented as thin sugar over `chart.selection().attr(...)` (single code path; DRY).

**Prompt 142.** `chart.use(middleware)` data transforms: `smooth(window)`, `decimate(target)`, `aggregate(keyFn, reducer)`, `normalize(field)`, `sort(cmp)` — composable, run before scales/generators.

**Prompt 143.** `chart.legend(options)` HTML overlay synced to color/size encodings; `chart.tooltip` sensible default on hover when no handler is set.

**Prompt 144.** Example `examples/08-gallery/main.js`: one of each chart type on one page — the homepage hero.

**Prompt 145.** Phase 8 tests: every type renders; 1000× update leak-free; 1000× create/destroy leak-free; join hooks fire with correct enter/update/exit sets; accessor styling maps to instance attributes; middleware order-stable; `chart.selection()` micro-edits survive a subsequent `update()` for unchanged datums.

**Prompt 146.** Document Phase 8 in `docs/concepts/chart.md` (chart contract + join lifecycle diagram). Mark DONE.

---

## PHASE 9 — Interaction, Annotations & State (Selection events land here)

**Prompt 147.** `src/interact/Picker.js`: centralized `pickAt(x, y)` → `{ chart, mesh, instanceIndex, datum, worldPoint } | null`. Octree path for instanced, raycaster fallback. One pick per frame max.

**Prompt 148.** `src/interact/StateMachine.js`: per-chart datum states `default/hovered/focused/selected/dragging`; configurable visual responses; `chart.stateOf(datum)`.

**Prompt 149.** Wire pointer events → picker → state machine (`hover-enter/leave`, `select`, shift-multi-select). **Implement `Selection.on(event, handler)`** (replacing the Prompt 80 stub): handlers register per-Selection-scope and receive `(datum, index, event, worldPoint)`; filtering a selection scopes its handlers (e.g. `.filter(d => d.value > 90).on('click', ...)` fires only on those datums).

**Prompt 150.** Default state visuals: hovered → outline pass + 5% scale; selected → outline variant. Configurable via `chart.hoverStyle/selectStyle`.

**Prompt 151.** `src/interact/Tooltip.js`: HTML-overlay mode + 3D-billboard (SDF text + glass quad) mode; `show/hide/pin`.

**Prompt 152.** `src/interact/Brush.js` (draggable AABB → selected Selection) and `src/interact/Lasso.js` (screen-space polygon → selected Selection). Both emit `select` with a real `Selection`, so users apply micro-control to the result directly.

**Prompt 153.** `src/interact/CrossFilter.js`: `link(chartA, chartB, { transform })` — selection in A filters B/C.

**Prompt 154.** Drag-and-drop (`chart.draggable(true)`, `dragEnd` events) + keyboard navigation (Tab cycles datums, Enter selects, Esc clears, ARIA live region announces).

**Prompt 155.** `FocusFollower` camera orbit around the focused datum; annotation interactivity (`annotation.label(...).on('click')`); `chart.exportSelection()/importSelection()`.

**Prompt 156.** Full event surface on charts: `hover/select/deselect/brushStart/brushEnd/lassoStart/lassoEnd/dragStart/dragEnd/focus`. `chart.pickingEnabled(false)` for static charts.

**Prompt 157.** Example `examples/09-interaction/main.js`: three linked charts, brush-to-filter, tooltips, click-select, a live "selected data" panel.

**Prompt 158.** Phase 9 tests: picking correctness; state transitions; brush matches octree query; cross-filter propagation; keyboard nav completeness; `Selection.on` scope-filtering fires only for matching datums.

**Prompt 159.** Document Phase 9 in `docs/concepts/interaction.md`. Mark DONE.

---

## PHASE 10 — Streaming, Workers & Millions

**Prompt 160.** `src/stream/DataStream.js`: `from(asyncIterable)`, `fromWebSocket(url, transform)`, `fromInterval`, `fromArray(arr, chunkSize, ms)` — emits `{ added, updated, removed }` chunks.

**Prompt 161.** `chart.stream(dataStream)` binding — chunks flow through the same join as manual `update()` (one path; DRY). Backpressure: drop oldest pending chunks.

**Prompt 162.** `src/stream/Aggregator.js` (worker-hosted reducers: sum/mean/max/min/count/percentile, grouped) and `src/stream/decimate.js` (Douglas-Peucker in a worker; public API `middleware.decimate({ target })`).

**Prompt 163.** `src/stream/LOD.js`: `chart.enableLOD({ levels: [{ maxDistance, maxPoints }] })`; re-LOD on camera change.

**Prompt 164.** `src/stream/OriginShift.js`: transparent world-origin shifting for float32 precision at extreme ranges.

**Prompt 165.** `src/stream/GPGPU.js`: render-target ping-pong compute. Feature-detect float textures (CapabilityProbe); CPU+worker fallback. Wire `layout.force` to GPGPU above 5000 nodes.

**Prompt 166.** Streaming-aware freshness: per-instance "age" attribute + `material.freshness(decayMs)` pulse; `material.dataStream({ trailLength, palette })` trail preset.

**Prompt 167.** Worker-offloaded join diff when data length > 10,000 (via WorkerPool); result identical to main-thread diff (tested byte-for-byte).

**Prompt 168.** Memory-pressure heuristic + `chart.compact()` (one-way merge of static instances) + `chart.window(size)` FIFO with dissolve exits.

**Prompt 169.** `Graph3D.workers.register(taskName, fn)` for user-defined worker tasks.

**Prompt 170.** Example `examples/10-million-points/main.js`: 1M points streamed 10K/100ms, LOD active, brush working, 60fps target. Example `examples/10-live-trading/main.js`: fintech dashboard, simulated WebSocket at 10K events/sec, windowed lines + live bars + cross-filter.

**Prompt 171.** Stress bench `bench/stress-million.bench.js`: 1M points, 10 charts, 30 minutes, FPS ≥30, stable heap. Phase 10 tests: backpressure drops; LOD distances; origin-shift visual consistency; GPGPU vs CPU tolerance; worker diff parity.

**Prompt 172.** Document Phase 10 in `docs/concepts/scale.md` ("How to scale to millions" recipe). Mark DONE.

---

## PHASE 11 — DX, TypeScript, Distribution

**Prompt 173.** Hand-author `types/index.d.ts` for the full public surface. Generics flow: `chart.data<T>(arr)` types all accessors as `(d: T, i: number) => ...`; `Selection<T>` carries the datum type through `attr/style/filter/each/on/transition`.

**Prompt 174.** JSDoc (`@param/@returns/@throws/@example`) on every public method; CI drift-check via `tsc --noEmit --allowJs`; `tsd` type tests over the surface including Selection generics.

**Prompt 175.** API surface freeze test (snapshot of exports; PRs changing it require explicit snapshot update).

**Prompt 176.** Bundle audit: visualizer wired; budgets — full ESM <200KB min+gz (excl. THREE), bar-chart-only tree-shaken path <50KB. Tree-shake verification fixture greps for absent chart classes. CI-enforced.

**Prompt 177.** SSR-safe mode (mock renderer import path; only `render()` throws server-side, clearly).

**Prompt 178.** `Graph3D.devtools` (dev-only, stripped): `dumpSceneGraph`, `listActiveTimelines`, `memorySnapshot`, `pickingDebugOverlay`, `frustumDebugOverlay`, `octreeDebugOverlay`, **`selectionDebugOverlay`** (highlights a Selection's members, prints backend type + indices).

**Prompt 179.** Dev warnings (stripped in prod): setData before attach, shader without bindUniforms, double-dispose, transitions on destroyed charts, `Selection.attr` with unknown path (nearest-path suggestion).

**Prompt 180.** Accessibility: `chart.setAriaLabel/setLongDescription`, auto-generated data descriptions, hidden adjacent div; keyboard nav already wired.

**Prompt 181.** Exports: `chart.exportPNG`, `chart.exportSVG` (documented lossy), `graph3d.exportScene()` (GLTF blob). Persistence: `graph3d.serialize()/Graph3D.deserialize(json)`.

**Prompt 182.** `package.json` finalization (`exports` map, `files`, `unpkg`) + `npm publish --dry-run` content inspection.

**Prompt 183.** `@graph3d/react` wrapper (components + ref-exposed imperative API, auto-dispose on unmount).

**Prompt 184.** `@graph3d/vue` (Composition API) and `@graph3d/ember` (Glimmer `.gjs`) wrappers. Framework docs section. Mark Phase 11 DONE.

---

## PHASE 12 — Documentation & Examples

**Prompt 185.** Docs site scaffold (Vite + markdown): Intro, Getting Started, Concepts (per layer), Chart Types, Recipes, API Reference, Migration, Playground.

**Prompt 186.** Auto-generated API Reference via `jsdoc-to-markdown` (`npm run docs:api`).

**Prompt 187.** Recipes (runnable + screenshot + sandbox link): hello bar; live stream; million-point scatter; multi-chart dashboard; **the data join & selections deep-dive**; custom GLSL; GLTF chart shapes; entry animation + camera tour; brush + cross-filter; surface from CSV; network from JSON; theme swap; PNG export.

**Prompt 188.** Gallery page (all types × themes × postfx) + interactive Monaco playground.

**Prompt 189.** Migration guides: **`from-d3.md` is the flagship** — map `selectAll/data/join/attr/transition` 1:1 to Graph3D equivalents; also `from-echarts-gl.md`, `from-raw-three.md`.

**Prompt 190.** `perf.md` (budgets, instancing table, LOD, GPGPU criteria), `accessibility.md` (incl. color-blind-safe palette guidance), `troubleshooting.md` (black canvas, invisible meshes, FPS, leaks, context loss).

**Prompt 191.** `comparison.md` honest table + landing "Why Graph3D?" — four pillars: D3-style joins & selections, instanced-by-default millions, cinematic defaults, fully inspectable escape hatches.

**Prompt 192.** One-page printable cheatsheet. `CONTRIBUTING.md` (chart-type contract, material-preset recipe, disposal contract). `CHANGELOG.md` v0.1.0 + launch blog draft. Verify all internal links. Mark Phase 12 DONE.

---

## PHASE 13 — Verification & Launch

**Prompt 193.** Per-class checklist (JSDoc complete, options validated, idempotent dispose, ≥1 unit test per method, ≥1 integration test, docs example, d.ts parity) run against the Core layer (`Graph3D`, Renderer, Loop, Registry, CapabilityProbe, WorkerPool, FrameBudget).

**Prompt 194.** Checklist: Scene layer (Scene, Camera, Light, Environment, Shadows, Clipping).

**Prompt 195.** Checklist: Object layer (GraphObject, GraphInstancedObject, GraphMesh, Factory, Loader, Octree).

**Prompt 196.** Checklist: Compose layer — all scales, `interpolate`, generators, layouts, palettes, **Selection + join + diff**, Axis, annotations.

**Prompt 197.** Checklist: Anim layer (Anim, Timeline, Keyframe, Curve, Transition, SelectionTransition, CameraTour).

**Prompt 198.** Checklist: Material layer (all presets incl. dataDriven, SDFText, procedural textures).

**Prompt 199.** Checklist: PostFX layer (every pass, ParticleSystem, behaviors, presets).

**Prompt 200.** Checklist: Chart layer (all 11 types, GraphChart, join hooks, middleware, legend, tooltip defaults).

**Prompt 201.** Checklist: Interaction layer (Picker, StateMachine, Tooltip, Brush, Lasso, CrossFilter, FocusFollower, Selection.on).

**Prompt 202.** Checklist: Stream layer (DataStream, Aggregator, LOD, OriginShift, GPGPU, decimate, freshness).

**Prompt 203.** Risk battery: 1000× create/destroy per chart type (zero heap growth); 16 simultaneous instances on one page; bar-only bundle <50KB gz; tab-hidden auto-pause; malformed inputs across all types; HDR ref-count; variable-frame-rate animation correctness; **join churn test — 10,000 keyed join cycles, zero slot leaks**.

**Prompt 204.** Fresh benchmark baseline committed; CI fails on >15% median frame-time regression in any scenario.

**Prompt 205.** Cross-browser (Chromium/Firefox/WebKit via Playwright) + real-device mobile profiling (iPhone Safari, Pixel Chrome); document mobile defaults (pixel-ratio cap, simpler shadows, reduced postfx).

**Prompt 206.** Tag v0.1.0, `npm publish --access public`, fresh-sandbox verification (types autocomplete, headline join example runs), launch posts (X / HN / r/javascript / r/threejs / dev.to), pin 3 CodeSandbox templates, open the v0.2 roadmap discussion.

---

**End of v3.** Total: 206 prompts (47 done + 159 remaining). The renumbering absorbed v2's 244 by tightening prose, merging paired documentation/test prompts, and folding per-class checklists into per-layer checklists — no capability was dropped; capability was **added** (Selection & data-join, interpolate module, ticks on all scales, join-native charts, selection-scoped events).

### v2 → v3 prompt mapping (for anything already scheduled)
- v2 48–53 → v3 48–53 (unchanged).
- v2 54–78 (compose) → v3 54–85, expanded with interpolate (55) and Selection/join (74–82).
- v2 79–96 (anim) → v3 86–99, plus SelectionTransition (91).
- v2 97–118 (materials) → v3 100–115.
- v2 119–133 (postfx) → v3 116–126.
- v2 134–158 (charts) → v3 127–146, plus the join-native surface (128).
- v2 159–176 (interaction) → v3 147–159, plus Selection.on (149).
- v2 177–196 (stream) → v3 160–172.
- v2 197–214 (DX) → v3 173–184.
- v2 215–229 (docs) → v3 185–192.
- v2 230–244 (verify/launch) → v3 193–206.

### CLAUDE.md compliance notes for the new work
- `interpolate` (Prompt 55) and `diff.js` (Prompt 78) are DRY single-authority modules — keyframes, transitions, scales, and chart data-binding must import them, never re-implement.
- Selection lives in `compose/` (Layer 4) and imports only from `object/` (Layer 3) — coupling direction preserved.
- Prompt 80's stubs throw dev errors instead of silently no-oping — Fail Fast.
- Prompt 79's slot free-list is required before capacity growth — prevents the churn class of leak the disposal contract targets.
