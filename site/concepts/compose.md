# Compose — Phase 4 (DONE)

Compose is Layer 4 of Graph3D.js — the "D3 for 3D" layer. Everything here is pure data-in/data-out (scales, generators, layouts, palettes) or, where a real 3D scene is unavoidable (`Selection`, `Axis`, `annotation`), a thin, explicit carve-out that touches only `object/`'s `GraphMesh`/`GraphInstancedObject` wrappers — never raw Three.js beyond the minimum geometry/material needed to construct one (CLAUDE.md §1.4).

No chart type exists yet (that's Phase 8). Everything below composes directly, which is the point: `examples/04-compose/` builds a full, live-updating bar chart from nothing but `Selection` + `.data().join()` + `scale.band()`/`scale.linear()` + `color.sequential()` + `Axis`/`annotation.referenceLine` — proof the layer holds together before a chart class ever wraps it.

---

## Scales — `scale.*`

`scale.linear/pow/sqrt/log` share one piecewise-linear engine (`continuous()`); `scale.band/point` divide a range into evenly sized slots for categorical data; `scale.ordinal` maps discrete values by position (implicit-domain, cycling); `scale.time` layers date-aware ticks/formatting on top of `linear`.

```js
const y = scale.linear().domain([0, 100]).range([0, 10]);
y(50);              // 5
y.invert(5);         // 50
y.ticks(5);          // [0, 20, 40, 60, 80, 100]
y.tickFormat()(50);  // '50'

const x = scale.band().domain(['a', 'b', 'c']).range([0, 30]).paddingInner(0.2);
x('b');              // band start
x.bandwidth();        // band width
```

Every continuous scale supports `.domain()`, `.range()`, `.clamp()`, `.nice()`, `.invert()`, `.copy()`. `range()` accepts colors/arrays too — routed through `compose/interpolate`, not a local lerp (DRY).

---

## Generators — `generator.*`

`generator.bar`/`generator.point` are chainable, D3-generator-style factories (`accessorField` under the hood) ending in `.compute(data)`, funneled through the single `buildBuffers` packer into `{ positions, scales, colors, attributes }` Float32Arrays — ready for `GraphInstancedObject.setAllPositions/setAllScales/setAllColors`. `generator.line`/`surface`/`arc` instead return raw vertex/index/normal streams for a `BufferGeometry`, since a continuous path or triangulated mesh isn't "one instance per datum."

```js
const bars = generator.bar().y((d) => d.value).width(0.8);
const { positions, scales } = bars.compute(data);
```

`accessor(valueOrFn)` and `accessorField(target, initial)` are the lower-level building blocks every chainable field (`x`, `y`, `width`, ...) is built from — reach for them directly only when writing a custom generator field, not for everyday chart/generator use:

```js
accessor(5)({}, 0);          // 5 — a constant is wrapped into a (datum, index) => value callable
accessor((d) => d.x)({ x: 3 }, 0); // 3 — a function passes through unchanged

const bar = {};
bar.width = accessorField(bar, 0.8); // attaches a D3-style get/set field to `bar`
bar.width(0.5);     // sets it, returns `bar` for chaining
bar.width()({}, 0); // 0.5 — the getter form returns the resolved accessor
```

`buildBuffers(data, resolve)` is the single packer every instance-based generator (`generator.bar`/`.point`) funnels through — it walks `data` once, calling `resolve(datum, index) => { position, scale?, color?, attributes? }` per item, and packs the results into the flat `Float32Array`s `GraphInstancedObject.setAllPositions/setAllScales/setAllColors` expect (`scale` defaults to `[1,1,1]`; `colors`/`attributes` stay `null`/`{}` unless at least one datum supplies them):

```js
buildBuffers([{ x: 0 }, { x: 1 }], (d) => ({ position: [d.x, 0, 0] }));
// { positions: Float32Array(6), scales: Float32Array(6) filled with 1, colors: null, attributes: {} }
```

Called for you by `.compute(data)` above; call it directly only if hand-rolling a new instance-based generator.

---

## Layouts — `layout.*`

Pure data-in, positioned-data-out (no Three.js import): `layout.stack` turns per-key values into stacked `[y0,y1]` series (d3-shape parity); `layout.grid` centers a `rows × cols` small-multiples grid; `layout.force` is a 3D force simulation (velocity Verlet + Barnes-Hut octree charge) stepped externally via `loop.add`; `layout.pack`/`layout.tree` are d3-hierarchy-parity sphere-packing/radial-tree layouts; `layout.pie` (Prompt 139) is a d3-shape-parity layout turning per-datum values into proportional angular `[startAngle, endAngle]` slices summing to a full sweep (`.value()`/`.sort()`/`.startAngle()`/`.endAngle()`/`.padAngle()`) — `PieChart`'s underlying layout, matching `d3.pie()`'s own padAngle convention (every slice, including the last, reserves a trailing pad).

```js
const sim = layout.force()
  .nodes(nodes)
  .force('charge', layout.force.charge(-30))
  .force('center', layout.force.center());
loop.add(() => { if (sim.active()) sim.tick(); });
```

---

## Color & Palettes — `color.*`, `palette.*`

`palette.viridis/inferno/magma/plasma/cividis/turbo` (sequential multi-hue), `.warm/.cool/.rainbow/.sinebow` (parametric), `.spectral/.RdYlBu/.RdBu/.BrBG/.PiYG` (diverging), `.blues/.greens/...` (sequential single-hue), and `.category10/.tableau10/...` (categorical) are all built-in `t => color` ramps or cycling functions. `color.sequential(palette, domain)`/`color.diverging(palette, [low,mid,high])` map a numeric domain onto one; `color.categorical`/`color.quantize`/`.quantile`/`.threshold` cover the discretizing cases. `palette.custom`/`interpolateRGB/HSL/LAB`/`fromCSS` build ramps from user colors.

```js
const barColor = color.sequential(palette.viridis, [0, 100]);
barColor(75); // a hex string on the viridis ramp, 75% of the way from 0 to 100
```

---

## Interpolation — `interpolate`, `interpolateNumber`, `interpolateRgb`, `interpolateHsl`, `interpolateLab`, `interpolateArray`, `interpolateObject`

The single interpolation authority for the whole library (CLAUDE.md §1.1 DRY) — scales' `range()`, `GraphAnimTimeline`/`GraphAnimKeyframe`, and `SelectionTransition` all build their `t => value` functions through this module rather than writing local lerp code, so a color or number tween looks identical everywhere in the codebase. Every function here returns a `(t: number) => value` closure, not the interpolated value itself:

```js
import { interpolate, interpolateNumber, interpolateRgb } from 'graph3d.js';

interpolateNumber(0, 100)(0.5);        // 50
interpolateRgb('#ff0000', '#0000ff')(0.5); // '#800080'
```

`interpolate(a, b)` is the dispatcher — it inspects `a`/`b`'s shape and picks the right specialist for you: both numbers → `interpolateNumber`; both colors (hex string or `{r,g,b}`, e.g. a `THREE.Color`) → `interpolateRgb`; both arrays → `interpolateArray`; both plain objects → `interpolateObject`. Throws a `TypeError` if `a`/`b` are two different shapes or an unsupported one.

```js
interpolate(0, 100)(0.5);                    // 50 — routed to interpolateNumber
interpolate({ x: 0 }, { x: 10 })(0.5);        // { x: 5 } — routed to interpolateObject
```

The specialists, for when you already know the shape and want to skip the dispatch:

- **`interpolateNumber(a, b)`** — plain linear interpolation.
- **`interpolateRgb(a, b)`** / **`interpolateHsl(a, b)`** / **`interpolateLab(a, b)`** — color interpolation in the RGB, HSL, or CIE Lab color space respectively (Lab tends to produce more perceptually-even color ramps than RGB, at extra conversion cost). Each accepts and returns hex-string colors.
- **`interpolateArray(a, b)`** — element-wise, mirroring d3-interpolate: the result has `b`'s length; indices past `a`'s length take `b`'s value at every `t`.
  ```js
  interpolateArray([0, 0], [10, 20, 30])(0.5); // [5, 10, 30]
  ```
- **`interpolateObject(a, b)`** — key-wise (also covers `{x, y, z}` vectors, which are just objects with numeric keys). Mirrors d3-interpolate: only `b`'s keys appear in the result; keys shared with `a` are interpolated, keys unique to `b` take `b`'s value at every `t`.
  ```js
  interpolateObject({ x: 0, y: 0 }, { x: 10, y: 10 })(0.5); // { x: 5, y: 5 }
  ```

---

## Selections & the data join

This is the flagship of Phase 4 — the mechanism that lets Selection/join/scale/palette compose into a real chart *without* a chart class. It's a uniform per-datum handle over either rendering path a chart might pick:

| Backend | Real objects | When |
|---|---|---|
| `meshes` | `GraphMesh[]` | Low datum count, individually inspectable |
| `instanced` | one `GraphInstancedObject` | High datum count, one draw call |

`Selection` never duplicates bound data — it reads/writes it through whatever already stores it (`GraphMesh.getUserData('datum')` / `GraphInstancedObject.getInstanceUserData(i)`), so there is exactly one copy of "what datum is this."

### Constructing a Selection

Charts and scenes hand out Selections — `GraphScene.selectAll(name)` wraps every already-registered object matching `name` (auto-detecting the backend); `selectInstance` is the low-level escape hatch beneath it for a specific instance range. For a **from-scratch** join (nothing registered yet), construct one directly with a mesh `template` so `.enter()` has something to clone from:

```js
let selection = new Selection({
  type: 'meshes',
  meshes: [],
  template: { scene: scene.three, name: 'bar', geometry, material },
});
```

An instanced-backend Selection always carries a live `GraphInstancedObject`, so it never needs a template — `.enter()` grows its capacity (pow2, via the same allocator `setInstanceCount` uses) instead.

### Micro-control: `attr` and `style`

```js
selection
  .attr('position.y', (d) => y(d.value) / 2)
  .attr('scale.y', (d) => y(d.value))
  .style('color', (d) => barColor(d.value));
```

`attr(path, valueOrFn)` covers the fixed vocabulary (`position.x/y/z`, `rotation.x/y/z`, `scale.x/y/z`, `color`, `opacity`, `visible`) plus custom instanced attributes. `style(materialProp, valueOrFn)` covers arbitrary material properties: on the meshes backend, every mesh owns its material, so anything goes per-datum; on the instanced backend, only `color`/`opacity`/`emissiveIntensity` are per-instance-capable (routed to instance attributes, consumed by Phase 6's `dataDriven` material) — everything else is material-global and collapses a per-datum accessor to one shared write, with a `console.warn`.

### The join: `.data(newData, keyFn)`

Calling `.data()` with no arguments reads bound data (unchanged from before Prompt 78). Calling it **with** `newData` diffs against what's currently bound — via the single diff authority, `diffData` (positional if `keyFn` is omitted, key-matched otherwise) — and returns a `JoinResult`, which **is** the update selection:

```js
const joined = selection.data(newData, (d) => d.id);
joined.size();           // count of matched, now-rebound members
joined.enter().size();   // new data with no prior match
joined.exit().size();    // prior data with no match in newData
```

`.enter()`/`.exit()` materialize lazily and cache — real `GraphMesh`es are created (meshes backend) or real instance slots allocated (instanced backend, recycling freed slots via a free-list before growing capacity) only the first time `.enter()` is called, and only if there's something to enter.

`.join(enterFn, updateFn, exitFn)` applies the full d3-style cycle in one call, defaulting any omitted callback: entering members appear as-is (animate them explicitly via `enter.transition()...` if desired — see below); exiting members are `.remove()`d immediately.

```js
selection = selection.data(newData, (d) => d.id).join(
  (enter) => layoutBars(enter),     // new bars — same layout fn as update
  (update) => layoutBars(update),   // still-present bars, rebound to new data
  (exit) => exit.remove(),          // departed bars — dispose/free their slot
);
```

Note the reassignment: `.join()` returns the merge of entered + updated members, which becomes the selection the *next* update cycle diffs against — this is what makes repeated `.data().join()` calls a stable, ongoing chart rather than a one-shot render. `examples/04-compose/main.js` runs this exact loop every few seconds against a randomly churning dataset, so bars visibly enter, update, and exit.

### Other Selection operations

`filter(predicateFn)`, `sort(comparator)`, `each(fn)`, `merge(other)`, `call(fn, ...args)`, `nodes()` (returns `SelectionNode` handles exposing `.datum`/`.index`), and `remove()` (permanent — disposes/frees every member, not just an `.exit()` result). `on(event, handler)` is still stubbed to throw a clear "requires Phase 9" error — picking/the interaction state machine doesn't exist yet.

`transition()` (Prompt 91) returns a `SelectionTransition`: the animated counterpart to `attr()`/`style()`/`remove()`, built on the Phase 5 animation engine (`src/anim/`, see the forthcoming `site/concepts/anim.md`). Each node's current value is captured as the tween's start; `.duration(ms)`/`.delay(msOrFn)`/`.easing(name)` configure the schedule (`delay` accepts a per-datum function for staggering), and `.on('start'|'end', handler)` observes it. A `.remove()` on the transition defers removal until every scheduled write completes — the idiom for an exit fade:

```js
joined.exit().transition().duration(400).attr('opacity', 0).remove();
```

### Bulk labeling: `syncLabels`/`removeLabels` (improvement.md initiative (c))

Two reusable `.call()` behaviors for labeling every member of a selection with one call, instead of managing one `Label`/`graphHTML()` handle per datum by hand — wire them into the same enter/update/exit callbacks you already write for `attr`/`style`:

```js
import { syncLabels, removeLabels } from 'graph3d';

function layoutBars(selection) {
  selection
    .attr('position.y', (d) => y(d.value) / 2)
    .attr('scale.y', (d) => y(d.value))
    .call(syncLabels, (d) => `${d.value}%`, { anchor: 'center', offset: { y: 0.3 } });
}

selection = selection.data(newData, (d) => d.id).join(
  (enter) => layoutBars(enter),
  (update) => layoutBars(update),
  (exit) => exit.call(removeLabels).remove(),
);
```

`syncLabels(selection, textFn, options)` creates or updates one `Label` per member, positioned at that member's own current position plus `options.offset` (default `{x:0,y:0,z:0}`). Each label persists across calls — a repeat call on the same member updates its *existing* label's text in place (a rebuild only when the resolved text actually changed) rather than disposing and recreating it. `options.font`/`.anchor` are applied once, at creation; `options.billboard` (a camera, or `null`) is cheap to re-apply and stays in sync every call.

`removeLabels(selection)` is the exit-side counterpart — call it before `.remove()` so a departing member's label is disposed alongside it, not orphaned. Was `.labels()` a method on `Selection` itself instead? Considered, but rejected: the instanced backend has no free per-instance storage slot to stash a `Label` reference in (`GraphInstancedObject.setInstanceUserData` is a single slot already holding the datum), so tracking it would mean either extending `object/` or a side-table — and a side-table needs a `.remove()`-time hook to avoid leaking. `.call()` (already this codebase's reusable-behavior idiom, see `selection.call(highlightAboveThreshold, 90)` above) reaches the exact same enter/update/exit points a chart's own `attr`/`style` calls already use, with zero changes to `Selection`/the join machinery itself.

---

## Axis — `new Axis()`

Renders a scale as a real scene object: a spine line spanning the scale's range, one tick mark per `scale.ticks(tickCount)` (or `scale.domain()`, for band/point/ordinal scales without `.ticks()`), and one label per tick.

```js
const axis = new Axis()
  .scale(scale.linear().domain([0, 100]).range([0, 10]))
  .orientation('x')       // 'x' | 'y' | 'z'
  .tickCount(5)
  .tickSize(0.3)
  .labelStyle({ color: 'white' });

axis.render(scene.three, 'xAxis'); // builds real GraphMesh line + tick meshes
axis.labels;                        // [{ type: 'label', text, position, style }, ...]
axis.dispose();                     // disposes the spine + tick meshes
```

Labels are **metadata only** (`{ text, position, style }`) — real SDF text rendering is Phase 6's job (`material/SDFText.js`, not built yet); nothing renders the label text today.

---

## Annotation — `annotation.*`

```js
annotation.label({ text: '42%', position: { x: 1, y: 2, z: 0 } });
// same metadata stub Axis's per-tick labels use — no mesh, no visual text
// pass scene + camera to also build a real, camera-billboarded label (site/concepts/material.md's Label)

annotation.callout({ scene, name: 'peak', from, to, text: 'Peak: 5' });
// a real leader-line GraphMesh + a stubbed label anchored at `to`

annotation.referenceLine(yScale, 100, { scene, name: 'target', orientation: 'y', extent: 12 });
// a real thin-box GraphMesh marking yScale(100), spanning `extent` on the ground plane

annotation.referencePlane('y', 0, { scene, name: 'ground', size: 20 });
// a real translucent panel perpendicular to the given axis

annotation.region({ min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 3, z: 5 } }, { scene, name: 'highlight' });
// a real translucent box spanning min..max
```

`callout`/`referenceLine`/`referencePlane`/`region` each return a real `GraphMesh` (or, for `callout`, a small `{ line, label, dispose() }` bundle) — dispose it like any other `GraphMesh`.

---

## The capstone: `examples/04-compose/`

A hand-rolled bar chart — `scale.band()` for categories, `scale.linear()` for value, `color.sequential(palette.viridis, ...)` for fill, a `Selection` over a meshes backend, `Axis` for both axes, and `annotation.referenceLine` for a midpoint marker — with **no chart class involved**. Its dataset re-joins on an interval so bars visibly enter, update, and exit; `tests/integration/phase4-capstone.test.js` runs the identical pattern headlessly across 200 churning join cycles, asserting correct membership, correct per-datum transforms, and zero leaked scene children.

---

## Phase 4 exit criteria (BUILD_PLAN.md) — all met

- [x] Scales: `linear`, `log`, `pow`, `sqrt`, `band`, `point`, `ordinal`, `time` — `.domain()`, `.range()`, `.nice()`, `.clamp()`, `.ticks()`, `.tickFormat()`
- [x] Generators: `generator.line`, `.arc`, `.bar`, `.point`, `.surface` returning Three.js-ready buffers/geometry
- [x] Layouts: `force`, `tree`, `pack`, `stack`, `grid` — operate on plain data, return position data
- [x] Color palettes: `viridis`/`plasma`/`inferno`/`magma`/`cividis`/`turbo` built-in; `color.sequential`/`.diverging`/`.categorical`; user-extensible via `palette.custom`/`fromCSS`
- [x] Axis: `Axis` renders tick lines, labels (real `SDFText` when `options.camera` is passed, else metadata-stubbed), and a spine
- [x] All `compose/` modules are pure functions/classes with no Three.js import — except the three sanctioned carve-outs (`compose/selection`, `compose/axis`, `compose/annotation`), each importing only `object/`'s `GraphMesh`/`GraphInstancedObject` wrappers (CLAUDE.md §1.4)
- [x] Coverage ≥ 85% lines, ≥ 80% branches across `src/compose/`
