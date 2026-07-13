# Chart — Phase 8 (complete)

Chart is Layer 8 of Graph3D.js — the fluent, D3-flavored chart types built on every layer below (`compose/` scales, generators, layouts, palettes; `object/` instancing; `anim/` transitions; `material/` presets). `GraphChart` (Prompts 127–131) is the shared base every concrete chart type extends; it owns configuration state, join-native `data()`, and the `render()`/`update()`/`destroy()` lifecycle. `BarChart` (Prompt 132), `LineChart` (Prompt 133), `ScatterChart` (Prompt 134), `AreaChart`/`SurfaceChart` (Prompt 135), `HeatmapChart` (Prompt 136), `NetworkChart` (Prompt 137), `TreeChart`/`PackChart` (Prompt 138), and `PieChart`/`VolumeChart` (Prompt 139) are the eleven chart types built on it — Phase 8's complete roster, rounded out by `Graph3D.chart(typeName)` dispatch (Prompt 140), per-datum styling accessors (Prompt 141), `.use()` data-transform middleware (Prompt 142), and `.legend()`/`.tooltip()` (Prompt 143), all below.

```js
import { BarChart, scale, palette } from 'graph3d';

const x = scale.band().domain(['A', 'B', 'C']).range([-6, 6]);
const y = scale.linear().domain([0, 100]).range([0, 6]);

new BarChart(scene)
  .data(rows, (d) => d.id)
  .x((d) => d.category, x)
  .y((d) => d.value, y)
  .color((d) => d.value) // falls back to palette.viridis
  .render();
```

---

## The chart contract

Every concrete chart type below is built on the same handful of guarantees, regardless of how differently each one materializes (per-datum instanced primitives, one continuous mesh, a live physics simulation, a one-shot hierarchy layout):

- **Constructed against a real `THREE.Scene`.** `new BarChart(scene)` (any concrete class) or `g.chart(typeName)` (Prompt 140 — resolves `Graph3D`'s own active scene automatically, requires one to be set first).
- **Every setter is a chainable getter/setter.** Called with no arguments it reads the current config; called with one or more it writes and returns `this` — except `data(arr, keyFn)`'s *join* form (`BarChart`/`ScatterChart`/`HeatmapChart`, inheriting `GraphChart.data()` verbatim), which returns the resulting `JoinResult` instead, and inputs are validated at the boundary (Fail Fast) rather than failing silently or downstream.
- **First `render()` call materializes; every later call routes to `update()`.** There's no separate "is this the first render" flag to manage by hand.
- **`destroy()` is idempotent and total.** It disposes every scene/GPU resource the chart created (geometries, materials, textures, live `SelectionTransition`s including ones still mid-flight), and every other public method throws `"<Class>.<method>: this chart has been destroyed"` afterward (CLAUDE.md's Disposal Contract).
- **Instanced-by-default where a flat per-datum backend exists.** `BarChart`/`ScatterChart`/`HeatmapChart` (via `GraphChart`) and `NetworkChart`'s nodes/`TreeChart`/`PackChart` (via their own overridden `render()`/`update()`) all pick one `GraphInstancedObject` above `INSTANCING_THRESHOLD` (50 datums) or a `GraphMesh[]` below it, automatically. `LineChart`/`AreaChart`/`SurfaceChart`/`VolumeChart` render one continuous mesh/field instead — there's no flat per-datum set to choose an instancing strategy for. `PieChart` is deliberately never instanced — every slice's wedge shape genuinely differs, so it's always one `GraphMesh` per slice.
- **Inert fields are documented, not silently swallowed.** A chart type that has no matching concept for an inherited `GraphChart` setter (e.g. `.filter()`/`.sort()`/`.shape()` on `NetworkChart`, since node position/membership come from the simulation, not those accessors) says so explicitly in its own section below, rather than accepting the call and doing nothing unexplained.

## Join lifecycle — enter / update / exit

Every chart type with a real per-datum backend runs the identical enter/update/exit dispatch on each `update()` call, whether that's `GraphChart.update()` itself (`BarChart`/`ScatterChart`/`HeatmapChart`) or a concrete override doing the equivalent (`NetworkChart`/`TreeChart`/`PackChart`/`PieChart`):

```
 chart.data(newRows, keyFn)
         │
         ▼
 #prepareData(): filter() → each .use() middleware, in order → sort()
         │
         ▼
 generator.compute(data)  →  fresh positions/scales/colors
         │
         ▼
 diffData(oldData, newData, keyFn)  (compose/selection/diff.js)
         │
   ┌─────┼────────────────────────┬──────────────────────────┐
   ▼     ▼                        ▼                           ▼
 enter                        update                        exit
 (key only in newData)   (key in both old & new)      (key only in oldData)
   │                            │                              │
 on('enter', fn) set?     on('update', fn) set?         on('exit', fn) set?
  yes │      │ no          yes │     │ no                yes │      │ no
      ▼      ▼                 ▼      ▼                       ▼      ▼
  fn(entered)  write        fn(joined)  write             fn(exited)  dissolve:
               computed                  computed                     scale→0,
               position/scale            position/scale               opacity→0,
               (snapped, or                                           then .remove()
                animated via
                SelectionTransition
                if .transition() is set)
      │                          │                                    │
      └──────────────────────────┴────────────────────────────────────┘
                                  ▼
                #backendSelection = joined.merge(entered)
```

- **Handler *or* default, never both.** A registered `on('enter'|'update'|'exit', fn)` handler replaces the default write for that group entirely (Prompt 130's "user's join fns **or** defaults" semantics) — it doesn't run alongside it.
- **The default `update`/`enter` write only ever touches `position`/`scale`** (`GraphChart.js`'s `#writeComputedTransform`) — never `color`/`opacity`/`visible`/a custom attribute. A micro-edit written by hand through `chart.selection().attr(...)` on a datum whose data is unchanged survives a later `update()` call for exactly this reason (`tests/integration/phase8.test.js`).
- **An empty group is skipped entirely** — an empty `exit` set never schedules a dangling `SelectionTransition` on the shared `anim` engine for nothing.
- **`chart.exitAnimation(name, { system, ...opts })`** (Prompt 122, `docs/concepts/postfx.md`) replaces the diagram's default "dissolve: scale→0, opacity→0, then `.remove()`" branch with an immediate `exited.remove(name, options)` — a particle burst (via `options.system`, a caller-constructed `postfx/particles/ParticleSystem`) instead of a shrink/fade tween. Still only applies when there's no registered `on('exit', fn)` handler; a handler can call `exited.remove(name, options)` itself for the same effect with full custom control.

---

## GraphChart — the shared base (Prompts 127–131)

Every setter (`x`, `y`, `z`, `color`, `size`, `shape`, `material`, `filter`, `sort`, `transition`, `on`) is a two-in-one getter/setter: called with no arguments it reads the current config, called with one or more it writes and returns `this` for chaining. `data(arr, keyFn)` is the exception — it's join-native (Prompt 128), delegating straight to an internally-owned `Selection`'s own `.data()`, so it returns a `JoinResult` (`.enter()/.exit()/.join(...)`), not `this`.

- **`render()`** materializes the chart's configuration into a real scene object on its first call (Prompt 129) — fitting scaled axis domains, wiring resolved `accessor ∘ scale` functions into the generator, computing buffers, and picking a `GraphMesh[]` or `GraphInstancedObject` backend via `GraphObjectFactory`'s `INSTANCING_THRESHOLD` (50 datums). Every later call routes to `update()` instead.
- **`update()`** (Prompt 130) diffs the latest `data()` array against what's bound (`diffData`) and writes only what changed — respecting `.transition()` if configured, or snapping immediately otherwise. Registered `on('enter'|'update'|'exit', fn)` handlers run *instead of* the default write, not alongside it.
- **`destroy()`** (Prompt 131) permanently tears the chart down: stops any still-running transitions, force-disposes members still mid dissolve-out, and disposes the live backend. Idempotent; every other public method throws afterward (CLAUDE.md's Disposal Contract).

`GraphChart` itself never turns `.color()`'s accessor/palette into an actual per-instance color — it has no chart-type-specific opinion on the mapping. That's left to concrete subclasses, since bar/line/scatter/etc. each need it wired differently (or not at all).

The axis scale-domain fitting `render()`/`update()` do internally (`chart/axisField.js`) is a small shared module rather than a `GraphChart`-private method, since `LineChart` (Prompt 133) needed the identical fitting and couldn't reach a private method on a sibling subclass. The `.color()` → `palette.viridis`-fallback write (`chart/colorField.js`) is likewise shared, once `ScatterChart` (Prompt 134) became its second consumer.

---

## BarChart (Prompt 132)

`BarChart` wraps `generator.bar()`, defaults `.material('standard')` and `.transition(800)`, and is the one place `.color()` actually gets consumed: an accessor without an explicit palette falls back to `palette.viridis`, mapped across the current data's `[min, max]` via `color.sequential`.

```js
new BarChart(scene)
  .x((d) => d.category)
  .y((d) => d.value)
  .grouped((d) => d.series)   // or .stacked((d) => d.series)
  .depthSeries()              // grouped() only: offset along z instead of x
  .horizontal();              // bars grow along x instead of y
```

- **`.grouped(keyFn)`** clusters same-category series side-by-side, narrowing each bar to `originalWidth / seriesCount`. Combined with **`.depthSeries()`**, the offset moves from `x` to `z` — a 3D grid of bars (category × series × value) instead of a 2D cluster.
- **`.stacked(keyFn)`** turns same-category series into a single cumulative column via `layout.stack()` (no reimplemented stacking math — CLAUDE.md §1.1 DRY): each series' `[y0, y1]` band becomes that datum's bar `baseline`/`y`. `.depthSeries()` has no combined effect here.
- **`.horizontal()`/`.vertical()`** swap which axis the bar grows along (`vertical` — the default — grows along `y`; `horizontal` grows along `x`).

See `examples/08-bar-chart/` for a live grouped/stacked toggle with periodic re-joins.

---

## LineChart (Prompt 133)

`LineChart` wraps `generator.line()` and renders one continuous `GraphLine` (a `Line2`, `object/GraphLine.js`) per series instead of one mesh/instance per datum — `GraphChart`'s own `render()`/`update()` assume a per-datum position+scale buffer, which doesn't fit a continuous path, so `LineChart` overrides both rather than building on them. It still reuses `GraphChart`'s `x()`/`y()`/`z()` field storage and the shared axis scale-fitting (`chart/axisField.js`) as-is.

```js
new LineChart(scene)
  .x((d) => d.t, scale.linear().domain([0, 10]).range([-6, 6]))
  .y((d) => d.value, scale.linear().domain([0, 100]).range([0, 6]))
  .series((d) => d.symbol)   // one Line2 per distinct key, colored via palette.category10
  .curve('catmullRom')       // passes straight through to generator.line().curve()
  .render();
```

- **`.series(keyFn)`** splits `data()` into independent lines, each colored from `palette.category10` (auto-assigned per key in first-seen order, D3 `scaleOrdinal`-style). Without it, all of `data()` renders as a single line.
- **`.curve(type)`** is a thin passthrough to `generator.line().curve()` — no curve table lives in `LineChart` itself (CLAUDE.md §1.1 DRY).
- **Same-count updates mutate vertices in place**: `GraphLine.setPositions()` writes directly into the existing `Line2` geometry's interleaved buffer when the point count is unchanged from the previous call, and only reallocates when it changes (a series' point count changing, or a series appearing/disappearing entirely).
- **`data(arr)`** is a plain getter/setter here, unlike `GraphChart`'s own join-native version — a continuous polyline has no per-vertex `Selection` backend to `.enter()`/`.exit()` one point at a time, so `selection()`/`on('enter'|'update'|'exit', fn)` (inherited from `GraphChart`) are inert for `LineChart`.
- **`.setResolution(width, height)`** updates every live line's `LineMaterial.resolution` — `linewidth` is measured in screen pixels, so `Line2` needs the current canvas size after a resize (not wired to `window.resize` automatically; call it from your own resize handler).

See `examples/09-line-chart/` for a live multi-series toggle between `linear`/`catmullRom` curves with periodic same-count re-joins.

---

## ScatterChart (Prompt 134)

`ScatterChart` wraps `generator.point()` — every `GraphChart` default (instanced-over-50-datums, `material.standard()` fallback) already applies unchanged, so a scatter plot of a million points renders as one `GraphInstancedObject` for free, same as `BarChart`.

```js
new ScatterChart(scene)
  .x((d) => d.x)
  .y((d) => d.y)
  .z((d) => d.z)
  .size((d) => Math.sqrt(d.population))
  .color((d) => d.population)   // falls back to palette.viridis
  .opacity(0.8)
  .render();

const hit = chart.pick(raycaster); // the clicked datum, or null
```

- **`.size(fn)`** wires into `generator.point().size(...)` before `compute()` — the same "wrap compute, capture the raw fn first" mechanism `BarChart` established. `GraphChart` itself never consumed `.size()` before this (only `x`/`y`/`z` get wired into the generator).
- **`.color(fn, palette)`** is `ScatterChart`'s second use of `chart/colorField.js` (see above) — same `palette.viridis` fallback as `BarChart`.
- **`.opacity(valueOrFn)`** — a constant or per-datum accessor, written via `chart/opacityField.js`'s `applyOpacityField` after every `render()`/`update()`. Originally private to `ScatterChart`; moved onto `GraphChart` itself (Prompt 136) once `HeatmapChart` needed the identical setter for voxel-mode density.
- **`.pick(raycaster)`** ray-picks the frontmost point and returns its datum (or `null`). On the instanced backend it delegates straight to `GraphInstancedObject.pick()` (Prompt 45's already octree-backed picking, unchanged); on the meshes backend (≤50 points) it's a plain `THREE.Raycaster.intersectObjects` — an octree isn't worth the overhead at that scale. Reaching the live backend needed a new `Selection.backend` getter (Prompt 134) — a read-only escape hatch mirroring `GraphObject`'s own `get three()`, added because `Selection` had no way to hand out its underlying `GraphMesh[]`/`GraphInstancedObject` before this. `Selection.on(event, handler)` remains an unimplemented Phase 9 stub — `.pick()` doesn't touch it and isn't a substitute for the general interaction/event system Phase 9 will build.

See `examples/10-scatter-chart/` for 5,000 instanced points sized/colored/faded per datum, with octree-backed hover picking.

---

## AreaChart (Prompt 135)

`AreaChart` wraps a new `generator.area()` — an extruded vertical "wall" from each point's value down to a constant `.baseline()`, sharing `generator.line()`'s `x`/`y`/`z`/`curve`/`tension` fields and top-edge curve sampling but returning a triangulated mesh (`{positions, indices, normals}`, the same shape `generator.surface()`/`generator.arc()` return) instead of a flat vertex stream. Like `LineChart`, this doesn't fit `GraphChart`'s per-datum position+scale model, so `AreaChart` overrides `render()`/`update()`/`destroy()`/`data()` — reusing `GraphChart`'s `x()`/`y()`/`z()`/`material()` storage and the shared `chart/axisField.js`/`chart/materialField.js` helpers as-is.

```js
new AreaChart(scene)
  .x((d) => d.t, scale.linear().domain([0, 10]).range([-6, 6]))
  .y((d) => d.value, scale.linear().domain([0, 100]).range([0, 6]))
  .baseline(0)
  .curve('catmullRom')
  .render();
```

- **`.baseline(value)`**/**`.curve(type)`** pass straight through to `generator.area()`'s own setters.
- The wall is materialized via a new `GraphObjectFactory.createTriangleMesh` — the factory method that turns any generator's raw `{positions, indices, normals}` into a single `GraphMesh`, since every other factory there produces N *instanced* primitives, not one continuous surface.
- **`update()` disposes and rebuilds the wall mesh from fresh values every call** — unlike `LineChart`'s same-count-mutates-in-place `GraphLine`, no current requirement calls for in-place vertex mutation here, and CLAUDE.md §1.3 YAGNI says profile before optimizing.

See `examples/11-area-chart/` for a live linear/catmullRom curve toggle with periodic re-joins.

---

## SurfaceChart (Prompt 135)

`SurfaceChart` wraps `generator.surface()` and renders one continuous triangulated heightfield mesh. A surface has no per-datum concept the way a bar/point/line/area chart does — it's configured via `.values()`/`.xDomain()`/`.zDomain()`/`.resolution()`, mirroring the generator's own chainable API directly — so `GraphChart`'s inherited `x()`/`y()`/`z()`/`data()`/`color()`/`size()`/`shape()`/`filter()`/`sort()`/`on()`/`selection()` are all inert for it; only `.material()` (via `chart/materialField.js`) carries over meaningfully.

```js
new SurfaceChart(scene)
  .values((x, z) => Math.sin(x) * Math.cos(z))
  .xDomain([-3, 3])
  .zDomain([-3, 3])
  .resolution(64)
  .contours([-0.5, 0, 0.5])
  .render();
```

- **`.contours(levels)`** optionally overlays isolines at the given height values, traced via marching squares over the same already-computed heightfield grid (a new `compose/generator/contour.js`, operating directly on `generator.surface().compute()`'s own `positions`/`rows`/`cols` — no second heightfield sampling). Each traced path (open or closed loop; a level can trace several disjoint ones) becomes its own `GraphLine` (Prompt 133's wrapper, reused as-is), colored a constant black. The ambiguous 4-crossing "saddle" cell case is resolved by a single deterministic rule, not a full asymptotic decider — a documented simplification, not a geo-scientific-grade contour algorithm.
- Like `AreaChart`, every `update()` disposes and rebuilds the surface mesh and every contour line from fresh values — no in-place mutation, same YAGNI rationale.

See `examples/12-surface-chart/` for a `sin(x)*cos(z)` heightfield with a toggleable 5-level contour overlay.

---

## HeatmapChart (Prompt 136)

`HeatmapChart` wraps a new `generator.heatmap()` — a fixed-size grid-cell box, not a baseline-relative growth shape like `generator.bar()` (a heatmap cell has no baseline concept). Every `GraphChart` default (instanced-over-50-datums, `material.standard()` fallback) already applies unchanged, so a million-cell heatmap renders as one `GraphInstancedObject` for free, same as `BarChart`/`ScatterChart` — `GraphObjectFactory.createBars`'s existing box geometry (unmodified) already covers both this chart's render paths, so no new factory method was needed.

```js
new HeatmapChart(scene)
  .x((d) => d.col, scale.linear().domain([0, 23]).range([-6, 6]))
  .z((d) => d.row, scale.linear().domain([0, 23]).range([-6, 6]))
  .color((d) => d.value)   // falls back to palette.viridis
  .render();

// 3D density grid:
new HeatmapChart(scene)
  .mode('voxel')
  .x((d) => d.x).y((d) => d.y).z((d) => d.z)
  .color((d) => d.density)
  .opacity((d) => d.density)
  .render();
```

- **`.mode(name)`** — `'plane'` (default) renders thin flat tiles at a fixed constant height, a classic 2D heatmap; `'voxel'` renders full cubes (height equal to width), meant to be combined with `.opacity(fn)` to encode a per-cell density on top of `.color()`'s hue. Only the computed cell height changes between modes — `x`/`y`/`z` position is unaffected either way, so `'voxel'` mode still needs `.y(fn)` configured for a real third grid axis (position doesn't default to a grid automatically).
- The constructor defaults `.y(0)` so `'plane'` mode's tiles lie flat without the caller configuring anything — `GraphChart`'s own default `y` accessor (the whole datum) would otherwise produce `NaN` positions for a chart that has no natural "value" axis the way `BarChart`/`ScatterChart` do.
- **`.color(fn)`** is `HeatmapChart`'s third use of `chart/colorField.js` — same `palette.viridis` fallback as `BarChart`/`ScatterChart`.
- **`.opacity(fn)`** is `HeatmapChart`'s second use of the newly-shared `chart/opacityField.js` (see above) — the idiomatic way to show cell density in `'voxel'` mode, since a 3D grid of solid-colored cubes alone doesn't read as "heat" the way 2D tile color does.

See `examples/13-heatmap-chart/` for a live plane/voxel toggle over an animated 24×24 grid.

## NetworkChart (Prompt 137)

`NetworkChart` renders a node-link graph laid out by `layout.force()` — a live physics simulation, not an accessor+scale computation, so (like `LineChart`/`SurfaceChart`) it overrides `data()`/`render()`/`update()`/`destroy()` entirely instead of building on `GraphChart`'s per-datum pipeline. Nodes render as spheres (`GraphObjectFactory.createNodes`, instanced above `INSTANCING_THRESHOLD` same as every other chart); edges render as one `GraphLine` (a `Line2`) per link — reused as-is, the same primitive `LineChart`/`SurfaceChart`'s contour overlay already uses for continuous paths.

```js
const chart = new NetworkChart(scene)
  .data(nodes)                       // [{ id, group, ... }, ...]
  .links(links)                      // [{ source: 0, target: 1 }, ...] — index or node reference
  .linkDistance(2)
  .cluster((d) => d.group)
  .color((d) => d.group, palette.category10)
  .render();

loop.add(() => chart.tick());        // advances the simulation one step; auto-pauses once stable
```

- **`.data(nodes)`** — the node array, one entry per simulated node (like `LineChart.data()`, a plain getter/setter, not a per-datum join). Node identity is by object reference: passing the same objects across `update()` calls preserves their simulated position/velocity (`layout.force().nodes()` only seeds missing fields); passing new objects scatters them fresh.
- **`.links(links)`** — `{source, target}` pairs, each an index into `data()` or a direct node reference, passed straight through to `layout.force.link`.
- **`.linkDistance(value)`** — each link's rest length, forwarded to `layout.force.link`'s `distance` option.
- **`.cluster(keyFn)`** — pulls nodes sharing `keyFn`'s resolved value toward their shared centroid, via a new `layout.force.cluster` factory (added alongside `.link`/`.charge`/`.center`/`.collide`/`.radial`, Prompt 137).
- **`.pin(node, position?)`/`.unpin(node)`** — fixes/releases a node's position (`fx`/`fy`/`fz`, which `layout.force()`'s own `tick()` already special-cases), waking an auto-paused simulation back up.
- **`.tick()`** — advances the simulation by one step and writes the result to the node/edge render backend; returns `false` (a no-op) once `layout.force()`'s own `alpha` has decayed below `alphaMin` — the "auto-pause on stability" the prompt calls for is `layout.force()`'s existing auto-pause mechanism, not reimplemented here. The chart never drives its own `requestAnimationFrame` (CLAUDE.md §2) — call `.tick()` from your own `loop.add(cb)`.
- **`.color(fn)`/`.material(...)`** still work — `.selection()` is overridden to expose a real `Selection` over the node backend so `applyColorField`/`resolveChartMaterial` (the same helpers every other chart type uses) have something to write to. `GraphChart`'s inherited `x()`/`y()`/`z()`/`size()`/`shape()`/`opacity()`/`filter()`/`sort()`/`on()` are inert — positions/membership come from the simulation and `.links()`, not those accessors.

See `examples/14-network-chart/` for a growable, clusterable force-directed graph with a live "settling"/"stable" indicator.

---

## TreeChart / PackChart (Prompt 138)

Both render a single-root hierarchy (`layout.tree()`/`layout.pack()`, Prompt 73's d3-hierarchy-parity layouts) rather than a flat data array, so — like `NetworkChart` — they override `data()`/`render()`/`update()`/`destroy()` entirely instead of building on `GraphChart`'s per-datum pipeline. `.data(rootDatum)` takes one root object, not an array. `.children(fn)`/`.value(fn)`/`.sortChildren(fn)` forward straight to the underlying layout's own `children`/`value`/`sort` options (CLAUDE.md §1.1 DRY — no second hierarchy-walk in `chart/`); `sortChildren` is named distinctly from the inherited (and, here, inert) `GraphChart.sort()` since it orders sibling nodes within the hierarchy, not a flat array. Every hierarchy node (root, internal, and leaf) renders as a sphere, sized by its own `.r` (`radiusFromValue`'s `∛value` sizing) via a new shared `chart/hierarchyField.js` (`flattenHierarchyNodes`, `nodeScaleForRadius` — the second-consumer DRY extraction both chart types needed). `.color()`'s accessor receives each hierarchy node itself, not the raw datum, so `(d) => d.depth`/`(d) => d.value`/`(d) => d.data.someField` all work; `GraphChart`'s inherited `x()`/`y()`/`z()`/`size()`/`shape()`/`opacity()`/`filter()`/`sort()`/`on()` are inert (position/membership come from the layout and `.children()` instead). Unlike `NetworkChart`, both layouts are one-shot and deterministic — no live simulation, so no `.tick()`.

```js
new TreeChart(scene)
  .data({ name: 'root', children: [{ name: 'a', value: 3 }, { name: 'b', value: 5 }] })
  .levelHeight(1.5)
  .levelRadius(2)
  .color((d) => d.depth, palette.viridis)
  .render();

new PackChart(scene)
  .data({ name: 'root', children: [{ name: 'a', value: 3 }, { name: 'b', value: 5 }] })
  .padding(0.1)
  .color((d) => d.depth, palette.viridis)
  .render();
```

- **`TreeChart`** fans nodes radially by depth (`layout.tree()`'s "conical tree" layout) and additionally renders one `GraphLine` (a `Line2`) per parent-child edge — the same primitive `NetworkChart`'s edges already established. `.levelHeight(n)`/`.levelRadius(n)` forward to `layout.tree()`'s own options (world-unit drop per depth level / ring radius per depth level).
- **`PackChart`** nests value-sized, non-overlapping spheres inside their parent (`layout.pack()`'s sphere-packing layout) — the 3D analogue of d3.pack's nested circles. There are no edges; nesting itself conveys structure. `.padding(n)` forwards to `layout.pack()`'s own option (extra world-unit gap enforced between sibling spheres and between a child and its parent's enclosing surface).
- Both fully rebuild their node (and, for `TreeChart`, edge) backend on every `update()` — same full-rebuild-per-update tradeoff `NetworkChart`/`SurfaceChart` already accepted, not incremental.

See `examples/15-tree-chart/` for a radial org-chart-style tree with a depth-based color ramp, and `examples/16-pack-chart/` for a nested-sphere hierarchy with a live depth toggle.

---

## PieChart / VolumeChart (Prompt 139)

`PieChart` renders a proportional-sweep pie/donut via a new `layout.pie()` (Prompt 139's d3-shape-parity layout, mirroring `layout.stack()`'s chainable-only convention — `.value(fn).sort(fn).padAngle(n)`, no options-object constructor) extruded into wedges by the pre-existing `generator.arc()`. Every slice's wedge shape genuinely differs, so — unlike `BarChart`/`ScatterChart` — each slice is its own `GraphMesh` (`GraphObjectFactory.createTriangleMesh`, called once per slice), not instanced. Like `NetworkChart`/`TreeChart`/`PackChart`, it overrides `data()`/`render()`/`update()`/`destroy()` entirely. "Explode-on-hover" isn't owned by the chart — there's no `interact/` layer yet — so `PieChart` exposes the same low-level pieces `ScatterChart.pick()` established: `.pick(raycaster)` and `.explode(datum, exploded?)`, and the caller wires its own `pointermove` + raycaster (see `examples/17-pie-chart/`).

```js
new PieChart(scene)
  .data(rows)
  .value((d) => d.count)
  .innerRadius(0.4)              // 0 (default) = solid pie, >0 = donut
  .padAngle(0.02)
  .color((d) => d.label, palette.category10)
  .render();

canvas.addEventListener('pointermove', (event) => {
  const hit = chart.pick(raycasterFromEvent(event));
  for (const d of rows) chart.explode(d, d === hit);
});
```

- **`.value(fn)`/`.sortSlices(fn)`/`.padAngle(n)`** forward to `layout.pie()`'s own options (CLAUDE.md §1.1 DRY — no reimplemented proportional-sweep math in `chart/`). `.sortSlices` is named apart from the inherited (inert) `GraphChart.sort()`, same precedent as `TreeChart`/`PackChart`'s `.sortChildren()`.
- **`.innerRadius(n)`/`.outerRadius(n)`/`.extrude(n)`** forward to `generator.arc()`'s own options.
- **`.explode(datum, exploded?)`** offsets that slice's mesh radially outward along its own mid-angle by `.explodeOffset()` world units; survives `update()` by datum identity.
- A real bug surfaced while building this: `applyColorField` (`chart/colorField.js`, shared by every chart's `.color()`) always routed the given palette through `color.sequential`'s `[min, max]` domain-fitting — correct for a continuous ramp like `palette.viridis`, but wrong for a categorical palette like `palette.category10` (already a complete key→color mapping, the same way `LineChart.series()` already calls it directly). Every chart using `.color(fn, palette.category10)` — including `NetworkChart`'s own class-doc example — was silently collapsing every datum to the same color. Fixed by tagging categorical palettes with `.categorical = true` (`compose/palette/categorical.js`) and having `applyColorField` call them directly when set, bypassing `color.sequential` entirely.

`VolumeChart` renders a ray-marched scalar field — `.values(fn)` (a `(x, y, z) => number` sampling function, mirroring `SurfaceChart`'s own `.values((x, z) => number)`) is sampled onto a `.resolution()`³ grid, normalized to `[0, 1]`, and uploaded as a `THREE.Data3DTexture`. A new `material.volumeRaymarch` (`material/presets/volumeRaymarch.js`, a `THREE.ShaderMaterial` requiring WebGL2/GLSL3 for `sampler3D`) marches each view ray through a unit cube (`GraphObjectFactory.createTriangleMesh` with a hand-built cube buffer — not `createBars`, which clones whatever material it's given and would silently orphan the shader's own density/palette textures), accumulating front-to-back alpha-composited color from `.palette()` (defaults to `palette.viridis`). This is the prompt's own "opt-in heavier shader" — no lighter fallback exists, by design.

```js
new VolumeChart(scene)
  .values((x, y, z) => Math.exp(-(x * x + y * y + z * z)))
  .xDomain([-2, 2]).yDomain([-2, 2]).zDomain([-2, 2])
  .resolution(48)
  .steps(96)
  .palette(palette.plasma)
  .render();
```

- **`.xDomain()`/`.yDomain()`/`.zDomain()`/`.resolution()`** control the sampled world-space box and grid density (`resolution ** 3` total samples — an `O(n³)` cost, same as any volumetric CPU-side sampling).
- **`.steps(n)`** is the ray-march step count — a direct quality/performance knob (visibly banded/artifacted at low step counts, smoother at high ones).
- **`.densityScale(n)`** boosts a sparse field's apparent opacity before color/alpha lookup; **`.opacity(n)`** (overriding `GraphChart`'s inherited per-datum accessor with a plain global number — there's no per-datum concept for one continuous volume) is a final alpha multiplier.
- `GraphChart`'s inherited `x()`/`y()`/`z()`/`data()`/`color()`/`size()`/`shape()`/`filter()`/`sort()`/`on()`/`selection()`/`material()` are all inert — `.material()` specifically, because this chart's rendering *is* `material.volumeRaymarch(...)`, always built from its own sampled data, never a user-selectable generic preset.
- Two real GLSL compile bugs shipped in the first draft of `material.volumeRaymarch` and were only caught by loading `examples/18-volume-chart/` in an actual browser (this project's jsdom test environment can't compile shaders — see `skipping_list.md`): `gl_FragColor` (removed in GLSL ES 300, which `GLSL3`/`sampler3D` requires — needs a declared `out vec4`) and an undeclared `modelMatrix` uniform (Three.js auto-injects `cameraPosition`/`modelViewMatrix`/`projectionMatrix` into a bare `ShaderMaterial` but not `modelMatrix` alone). A third bug was a raymarching classic: the ray's start position sits exactly on the cube's boundary, and GPU perspective-correct varying interpolation isn't bit-exact, so the very first bounds check could fail before a single sample — fixed with a small boundary epsilon.

See `examples/17-pie-chart/` for an explode-on-hover pie with a donut toggle, and `examples/18-volume-chart/` for a switchable Gaussian-blobs/torus scalar field with a steps quality toggle.

---

## `Graph3D.chart(typeName)` dispatch (Prompt 140)

Every chart type built in this phase is now registered on `Graph3D` itself, so `g.chart(typeName)` is a real, working entry point — not just the per-type constructors (`new BarChart(scene.three)`, etc.) every example above uses directly. Both forms produce an identical, unconfigured chart instance; `g.chart(typeName)` additionally validates `typeName` against the registry and binds the chart to `g`'s own active scene automatically.

```js
const g = new Graph3D({ canvas });
g.setActiveScene(g.createScene('main')); // chart() requires an active scene, same as g.postfx

g.chart('bar').data(rows, (d) => d.id).x((d) => d.label).y((d) => d.value).render();
```

- **Registered names:** `'bar'`, `'line'`, `'scatter'`, `'area'`, `'surface'`, `'heatmap'`, `'network'`, `'tree'`, `'pack'`, `'pie'`, `'volume'` — one entry per chart type across Prompts 132–139.
- **Requires an active scene first** (`g.setActiveScene(...)`) — the same requirement `g.postfx` already has, and for the same reason: there's no scene to attach chart objects to otherwise.
- **Unknown type names get a spell-check, not just a list.** `g.chart('baar')` throws `"unknown chart type 'baar'. Did you mean 'bar'?"` (a small Levenshtein/edit-distance helper, distance ≤ 3) rather than always dumping the full registered-name list — that list is still the fallback when nothing is close enough to guess confidently.
- **Implementation note:** `Graph3D.js` imports every concrete `chart/` class directly — a third instance of the same "composition root" cross-layer exception `GraphScene`/`PostFX` already established in `core/` (CLAUDE.md §1.4): `Graph3D` is the one place that legitimately wires every layer together. This doesn't introduce a circular dependency (`madge --circular src/` stays clean) since `chart/` never imports back into `core/Graph3D.js` itself (only its two leaf utility modules, `Graph3DLoop.js`/`GraphDisposal.js`, which every object/material/anim file already imports today).

---

## Per-datum styling accessors — `.opacity(fn)`/`.visible(fn)`/`.size(fn)` (Prompt 141)

`.color(fn)` (Prompt 127) already worked across every chart with a real per-datum backend. Prompt 141 fills in the other three the same "thin sugar over `chart.selection().attr(...)`" way, via three small shared modules (`chart/opacityField.js`, the new `chart/visibleField.js`, and the new `chart/sizeField.js`) — one code path, wired into `BarChart`, `ScatterChart`, `HeatmapChart`, `NetworkChart`, `TreeChart`, `PackChart`, and `PieChart` (the seven chart types with N real rendered members; `LineChart`/`AreaChart`/`SurfaceChart`/`VolumeChart` stay exempt, as already documented — a continuous path/mesh/field has no per-datum concept for these to address).

```js
new BarChart(scene)
  .y((d) => d.value)
  .opacity((d) => d.confidence)
  .visible((d) => d.value > 0)
  .size((d) => d.emphasis) // multiplies the bar's footprint (x/z), never its height
  .render();
```

- **`.visible(fn)`** is brand new (`GraphChart`, mirrors `.opacity()` exactly) — a direct passthrough to `Selection.attr('visible', ...)` (Prompt 75, already supported both backends, just never had a chart-level setter). Unlike `.filter()` (excludes a datum from `data()`/layout entirely, before `render()` runs), `.visible()` only toggles a rendered member's visibility after the fact — the datum still occupies its computed position.
- **`.size(fn)` is a multiplier, not a replacement.** It reads each member's *current* scale (via `chart.selection().backend`, the same escape hatch `ScatterChart.pick()` established) and multiplies it by the accessor's result, writing back through `.attr('scale.x'|'y'|'z', ...)`. This matters because several charts' scale already encodes real data — a bar's height, a `TreeChart`/`PackChart` node's `.r`-driven radius — and `.size()` must layer on top of that, never replace it. Safe against double-multiplying across repeated `update()` calls because every chart here fully recomputes its base scale from scratch on every call (the established full-rebuild-per-update precedent), so what's on the backend the moment `.size()`'s multiply runs is always the fresh, un-multiplied base value.
- **Which axes `.size()` touches is chart-specific:** `NetworkChart`/`TreeChart`/`PackChart`/`PieChart` multiply all three axes uniformly (their base shape is a sphere or a wedge scaled around its own center); `BarChart`/`HeatmapChart` restrict it to the *footprint* only (`x`/`z` normally, or `y`/`z` when `BarChart.horizontal()` is active) — the value-encoding axis is never touched.
- **`ScatterChart.size()` was deliberately left alone**, not migrated to the shared multiplier mechanism — it already had a working, more efficient compute-time mechanism (baked directly into the initial instanced buffer, the only thing ever affecting a point's scale), and CLAUDE.md's Surgical Changes principle weighs against refactoring already-correct, already-shipped code for a behaviorally-identical result. See `skipping_list.md` for the full reasoning.
- **`PackChart.size()` can visually overlap siblings** — `layout.pack()` only guarantees non-overlap for the un-multiplied radii it actually packed against; a `.size()` multiplier is applied afterward. A documented tradeoff of using one shared `.size()` mechanism everywhere, not a `PackChart`-specific bug (see `skipping_list.md`).

## `chart.use(middleware)` data transforms (Prompt 142)

`compose/transform/` is a new namespace of pure `(data) => data` middleware factories — `transform.smooth`, `.decimate`, `.aggregate`, `.normalize`, `.sort` — that run against the array before it reaches scales/generators, the same layer `scale`/`generator`/`layout` already live in (no Three.js, per CLAUDE.md §1.4 SoC). `GraphChart.use(fn)` registers one (or several — it's composable, call it repeatedly), run in registration order inside `#prepareData()` between `.filter()` and `.sort()`:

```js
import { transform } from 'graph3d';

chart
  .data(rawSamples) // number[] — GraphChart's default y accessor is the identity function
  .filter((d) => d > 0)
  .use(transform.smooth(5))
  .use(transform.decimate(500))
  .sort((a, b) => a - b)
  .render();
```

- **`smooth(window)`** moving-averages a plain `number[]` — no per-datum field parameter. This was a deliberate, asked-and-confirmed choice: `normalize(field)` clearly needs to name a property on an object datum, but `smooth` doesn't, since `GraphChart`'s default `y` accessor is already the identity function — bare-number arrays (the common case for a raw sample series) work with `smooth` directly, no pre-mapping required.
- **`decimate(target)`** uniform-stride-samples down to `target` elements; a no-op if the array is already that size or smaller.
- **`aggregate(keyFn, reducer)`** groups by `keyFn(datum, index)` (first-occurrence order) and reduces each group to one output datum via `reducer(group, key)` — fully general, no separate "value field" concept needed.
- **`normalize(field)`** min-max rescales one named field to `[0, 1]`, returning new objects (never mutates the input, per CLAUDE.md immutability); an all-equal field maps to `0` rather than dividing by zero.
- **`sort(cmp)`** is the same comparator shape as `chart.sort()`, exposed as a transform too so it can be interleaved with the others inside one `.use()` pipeline instead of only ever running last.

Pipeline order is fixed: `.filter()` → every `.use()` middleware in registration order → `.sort()`. Filtering narrows the set before any transform sees it; sorting is the final step so a middleware that reshuffles or resizes the array (`aggregate`, `decimate`) still gets ordered predictably afterward.

## `chart.legend(options)` / `chart.tooltip(handlerFn)` (Prompt 143)

```js
const chart = new BarChart(scene)
  .y((d) => d.value)
  .color((d) => d.value)
  .size((d) => d.weight)
  .legend({ container: document.getElementById('legend') })
  .tooltip((d) => `${d.label}: ${d.value}`);
chart.data(rows).render();
```

- **`.legend({ container })`** renders into a DOM element you supply — the chart never creates or positions elements of its own, it only writes into the container it's given. Shows a gradient bar with min/max labels for a continuous `.color()` palette (or a swatch list for a categorical one), and three sample dots at the data's min/mid/max `.size()` multiplier. Stays synced automatically: it's re-rendered from scratch on every `render()`/`update()` for `BarChart`/`ScatterChart`/`HeatmapChart`/`NetworkChart`/`PieChart` (the five chart types with a real flat data array — `TreeChart`/`PackChart` bind a single root datum, not an array, so `.legend()` is inert for them, same precedent as their other inert inherited fields). `destroy()` clears the container's content (the one DOM resource this feature creates) but leaves the container element itself alone — the caller owns it.
- **`.tooltip(handlerFn)` is config-only right now.** It stores a handler, retrievable via `chart/tooltipField.js`'s `resolveTooltipContent(chart, datum, index)` — the "sensible default on hover when no handler is set" this prompt asks for: it calls `handlerFn(datum, index)` if one is configured, or falls back to a `"key: value"` listing (object datums) / `String(datum)` (primitives). Nothing shows on screen from this alone — there was no hover-detection mechanism in this phase. Phase 9 (`docs/concepts/interact.md`) later gave every chart type real picking (`Picker`, Prompt 147) and a full pointer-driven interaction surface, but never built a dedicated centralized tooltip-display class — the `interact/Tooltip.js` this paragraph once expected under a "Prompt 151" slot was renumbered out of the actual `prompts.md` sequence and never landed. A caller wires the actual DOM display by hand off `chart.on('hover', ...)` (Prompt 156), as `examples/20-interaction/main.js` (Prompt 157) demonstrates — see `docs/concepts/interact.md`'s own "What's genuinely out of scope for Phase 9" section.

## `chart.stream(dataStream)` (Prompt 161)

```js
import { DataStream } from 'graph3d';

chart.data(initialRows, (d) => d.id).render();
chart.stream(DataStream.fromWebSocket('wss://example.com/ticks', (raw) => [JSON.parse(raw)]));
```

`stream()` binds a live `DataStream` (`docs/concepts/stream.md`, Prompt 160) to an already-`render()`ed chart: it pulls the stream's `{added, updated, removed}` chunks and, for each, folds them into the currently bound data (`chart/streamField.js`'s `applyStreamChunk`, a pure array merge keyed the same way as `data(arr, keyFn)`) and drives the result through the exact same `data(nextData, keyFn)` + `update()` call a manual caller would make — one join, one code path (CLAUDE.md §1.1 DRY), not a second enter/update/exit implementation. `chart/` never imports `stream/` directly (`stream/` sits above `chart/` in CLAUDE.md §1.4's layer order); `dataStream` is accepted duck-typed (any async iterable of chunks), same pattern as `exitAnimation()`'s `options.system`.

**Backpressure: at most one chunk is ever pending.** If another arrives while the previous one is still being folded/applied, it overwrites (drops) the one waiting rather than queuing unboundedly — a chart mid-stream shows the *latest* state, not a guaranteed-complete history of every chunk that ever arrived. The apply loop yields a full macrotask (not just a microtask) between chunks specifically so a burst of already-available chunks can drain through the pull loop first, coalescing onto that one pending slot before the applier wakes up to look — a microtask-only yield loses that race almost every time (the pull loop's own `await iterator.next()` continuation tends to resolve first), which would make the "drop oldest" contract silently inert under real load.

Calling `stream()` again replaces the previous binding, disposing its `dataStream` first (if it exposes `.dispose()`); `destroy()` does the same. A dataStream that rejects (e.g. a WebSocket error) is caught and `console.error`-logged rather than becoming an unhandled promise rejection — there's no dedicated stream-error event surface in this phase.

## `chart.enableLOD(options)` / `chart.disableLOD()` (Prompt 163)

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

Every frame (`core/Graph3DLoop`), checks `camera`'s distance to the chart's `scene` and, when it crosses into a different `levels` bucket, re-decimates the dataset that was bound at the time `enableLOD()` was called down to that bucket's `maxPoints` — via `compose/transform`'s existing `transform.decimate` (the same uniform-stride sampling `.use(transform.decimate(n))` already does, CLAUDE.md §1.1 DRY, no second decimation algorithm) — and re-binds it through the normal `data() + update()` join, same one-path principle as `stream()`. The initial level applies immediately, before the first frame. `levels` don't need to be pre-sorted; the closest (smallest `maxDistance`) bucket the current distance still fits under wins, and once distance exceeds every threshold the farthest (most aggressive) level applies.

Same self-contained shape as `stream()`, for the same reason: `chart/` never imports `stream/` (it sits above `chart/` in CLAUDE.md §1.4's layer order), so `camera` is accepted duck-typed (anything exposing `.position.distanceTo`). `stream/LOD.js`'s `LOD` class (`docs/concepts/stream.md`) runs the identical distance-bucketing algorithm as a standalone engine for driving LOD on non-`GraphChart` targets — the two implementations don't share code for the same reason `stream()` doesn't import `DataStream`.

`disableLOD()` stops the per-frame check (`destroy()` does the same) but doesn't restore the full dataset — call `chart.data(originalRows).update()` for that. Calling `enableLOD()` again replaces the previous binding against a freshly re-captured snapshot of whatever's currently bound.

## `chart.compact()` / `chart.window(size)` (Prompt 168)

Two independent memory-management tools for long-running/streaming charts, meant to be driven by `stream/memoryPressure()` (`docs/concepts/stream.md`) — `chart/` never polls memory itself; nothing here is automatic.

```js
import { memoryPressure } from 'graph3d';

chart.window(500); // cap: only the 500 most-recently-bound datums stay visible
chart.stream(DataStream.fromWebSocket(url, parse));

setInterval(() => {
  const pressure = memoryPressure();
  if (pressure !== null && pressure > 0.8) chart.compact();
}, 5000);
```

- **`compact()`** one-way merges this chart's currently-static, individually-addressable `GraphMesh` instances (the below-`INSTANCING_THRESHOLD` `render()` path) into a single `GraphInstancedObject` — collapsing N draw calls/geometries/materials into one. It reads each mesh's *live* position/scale/color (whatever `.attr()`/`.style()` handlers wrote, not just what `render()` originally computed), so nothing currently visible changes. **Irreversible**: there's no path back to individually-addressable meshes short of a fresh chart + `render()`; calling it again on an already-instanced backend (or an empty one) is a no-op. Compacting while a `.transition()`-driven write is still mid-flight against these meshes disposes the meshes it's writing to — call it once things have settled, e.g. the scrolled-past tail of a `window()`-capped stream that's stopped changing.
- **`window(size)`** caps `data()`'s array to the `size` most-recently-bound datums: once it's exceeded, the oldest (frontmost) entries are trimmed *before* `.filter()`/`.use()`/`.sort()` in `#prepareData()`'s pipeline, so `update()`'s existing join treats them as ordinary exits — no second removal path exists here (CLAUDE.md §1.1 DRY). They dissolve out exactly like any other departing datum: the built-in shrink-and-fade default, a registered `on('exit', fn)`, or `exitAnimation()`, whichever is configured. Meant for a `stream()`-driven chart whose `data()` array keeps growing — caps memory/instance count at a fixed ceiling regardless of how long the stream has been running.

`memoryPressure()` (`stream/`, Prompt 168) is the suggested trigger for both — a heuristic `[0, 1]` ratio off the non-standard, Chromium-only `performance.memory` API (`null` where it's unavailable). See `docs/concepts/stream.md` for its own docs.

## `chart.setAriaLabel(label, options)` / `chart.setLongDescription(text, options)` (Prompt 180)

```js
chart.setAriaLabel('Quarterly revenue by region', { container: canvas });
chart.data(rows, (d) => d.id).render();
// no setLongDescription() call: the hidden div reads
// "Quarterly revenue by region. 24 data points, values ranging from 1200 to 58900."
```

A `<canvas>` carries no readable content of its own, so both methods write into
a visually-hidden (`position:absolute`, 1×1px, clipped — not `display:none`,
which would also hide it from screen readers) `<div>` inserted immediately
after `options.container` in the DOM via the native `insertAdjacentElement`.
`container` (typically the `<canvas>` element itself) is only required on
whichever of the two methods is called first — both write into the same div,
created once and reused.

If `setLongDescription()` is never called, `render()`/`update()` keep the div's
description in sync automatically: a one-line auto-generated summary
(`chart/a11yField.js`'s `describeData`) — a data-point count, plus a value
range read through the chart's own `.y()` accessor when the values are
numeric. An explicit `setLongDescription()` always wins over the
auto-generated text, and stops it from being recomputed until cleared by a
fresh chart.

This is a *static* label/description, read once as a screen reader arrives at
the chart — distinct from `interact/KeyboardNav`'s ARIA live region (Prompt
154, `docs/concepts/interact.md`), which announces *per-datum* content as
keyboard focus moves between them. Both use the same underlying
visually-hidden-element technique (`core/visuallyHidden.js`, shared to avoid
two copies of the same CSS). `destroy()` removes the hidden div from the DOM.

## `chart.exportPNG(options)` / `chart.exportSVG(options)` (Prompt 181)

```js
const dataUrl = chart.exportPNG({ renderer: g.renderer.three, camera: scene.camera.three });
const img = document.createElement('img');
img.src = dataUrl; // ready to <img>, download, or upload

const svg = await chart.exportSVG({ camera: scene.camera.three, width: 800, height: 600 });
new Blob([svg], { type: 'image/svg+xml' }); // ready to save as a .svg file
```

Both are lossy, in two different, specific, documented ways:

- **`exportPNG`** renders through the `renderer`/`camera` you pass in and reads
  the result back with `HTMLCanvasElement.toDataURL('image/png')`. A chart
  doesn't own an isolated render target — `renderer`/`camera` render the
  *whole* `THREE.Scene` the chart is attached to — so the capture includes
  every other chart or object sharing that scene, not just this one's own
  datums. For a chart-only image, keep that chart alone on its own scene.
- **`exportSVG`** lazy-loads Three.js's `SVGRenderer` addon (from
  `three/examples/jsm/renderers/SVGRenderer.js` — never bundled unless this
  method is actually called) and serializes its output via `XMLSerializer`.
  `SVGRenderer` predates `InstancedMesh` and has no concept of per-instance
  transforms, so this chart's default instanced backend
  (`GraphInstancedObject`, one `THREE.InstancedMesh` standing in for every
  datum) draws as a *single* shape at the object's own base transform rather
  than one shape per datum — only mesh-backend charts (the below-
  `INSTANCING_THRESHOLD` path, one real `GraphMesh` per datum, see
  `chart.compact()` above) render one shape per datum faithfully.
  `SVGRenderer` also has no texture, shading, or shadow support — its own
  documented limitation, inherited here unchanged.

`exportPNG` is synchronous (`renderer.render()` + `toDataURL()` both are);
`exportSVG` is async, purely because the `SVGRenderer` import is lazy.
