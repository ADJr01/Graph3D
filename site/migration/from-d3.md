# Migrating from D3

Graph3D.js's `compose/` layer (see [Compose](/concepts/compose)) deliberately
mirrors D3's `selection.data().join()` mental model — the same enter/update/exit
cycle, applied to real `THREE.Object3D`s (or instance slots) instead of DOM
nodes. If you already think in D3, this is the fastest path in.

The one structural difference: D3 selects *existing DOM nodes* with CSS
selectors (`d3.selectAll('.bar')`); Graph3D selects *already-registered scene
objects* by the name you gave them (`scene.selectAll('bars')`), or you build a
`Selection` from scratch with a mesh template for `.enter()` to clone. There is
no CSS-selector equivalent — 3D scenes don't have a DOM to query.

## Quick reference

| D3 | Graph3D.js | Notes |
|---|---|---|
| `d3.select(el)` / `d3.selectAll(sel)` | `scene.selectAll(name)` | Selects objects already registered under `name`, not a CSS query. See [`GraphScene.selectAll`](/api/GraphScene). |
| `selection.data(rows, keyFn)` | `selection.data(rows, keyFn)` | Same signature, same semantics — positional if `keyFn` omitted. |
| `selection.join(enter, update, exit)` | `selection.join(enter, update, exit)` | Same three-callback shape; exit defaults to `.remove()` either way. |
| `selection.enter().append('rect')` | `joined.enter()` | Materializes real `GraphMesh`es (or instance slots) from a `template`, not a per-call `.append()` — see below. |
| `selection.attr('x', fn)` | `selection.attr('position.x', fn)` | Fixed vocabulary: `position.x/y/z`, `rotation.x/y/z`, `scale.x/y/z`, `color`, `opacity`, `visible`, plus custom instanced attributes. |
| `selection.style('fill', fn)` | `selection.style('color', fn)` or `selection.attr('color', fn)` | `style()` reaches arbitrary material properties (`roughness`, `metalness`, ...); `color`/`opacity` work through either. |
| `selection.transition().duration(400)` | `selection.transition().duration(400)` | Same chain; `.easing(name)` instead of `.ease(fn)` — named curves from `anim/GraphAnimCurve`, not a d3-ease import. |
| `selection.filter(predicate)` | `selection.filter(predicate)` | Same signature. |
| `selection.sort(comparator)` | `selection.sort(comparator)` | Logical reorder only — doesn't reparent DOM/scene nodes. |
| `selection.each(fn)` | `selection.each(fn)` | Same. |
| `selection.remove()` | `selection.remove()` | Disposes GPU resources (meshes) or frees the instance slot — not just a DOM detach. |
| `selection.on('click', fn)` | `selection.on('click', fn)` | Fires from real pointer picking (raycasting), not DOM events — see [Interact](/api/PointerRouter). |
| `d3.scaleLinear()` | `scale.linear()` | Same `.domain()/.range()/.clamp()/.nice()/.invert()/.ticks()/.tickFormat()`. |
| `d3.scaleBand()` | `scale.band()` | Same `.domain()/.range()/.paddingInner()/.bandwidth()`. |
| `d3.interpolateViridis` | `palette.viridis` | A `t => color` ramp, same shape; `color.sequential(palette, domain)` wraps it onto a numeric domain like `d3.scaleSequential`. |
| `d3.forceSimulation()` | `layout.force()` | Velocity-Verlet + Barnes-Hut octree (3D), stepped via `loop.add(() => sim.tick())` instead of D3's internal timer. |
| `d3.axisBottom(scale)` | `new Axis().scale(scale).orientation('x')` | Renders a real spine + tick meshes into the scene, not an SVG `<g>`. |
| — | `chart.dispose()` / `selection.dispose()` | No D3 equivalent — every GPU/DOM resource Graph3D creates must be explicitly disposed. See [the disposal contract](/concepts/core). |

## Side-by-side: enter/update/exit

D3, updating a `<rect>` per datum:

```js
d3.select('svg')
  .selectAll('rect')
  .data(data, (d) => d.id)
  .join(
    (enter) => enter.append('rect').attr('y', (d) => y(d.value)),
    (update) => update.attr('y', (d) => y(d.value)),
    (exit) => exit.remove(),
  );
```

Graph3D.js, updating a `GraphMesh` per datum:

```js
import * as THREE from 'three';
import { Selection } from 'graph3d.js';

let selection = new Selection({
  type: 'meshes',
  meshes: [],
  template: {
    scene: scene.three,
    name: 'bar',
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshStandardMaterial(),
  },
});

function update(data) {
  const joined = selection.data(data, (d) => d.id);
  selection = joined.join(
    (enter) => enter.attr('position.y', (d) => y(d.value) / 2),
    (update) => update.attr('position.y', (d) => y(d.value) / 2),
    (exit) => exit.remove(),
  );
}
```

The `template` is the closest thing to `enter.append('rect')`: it's what
`.enter()` clones for every entering datum. D3 lets `enter` append a
*different* element per call; Graph3D's meshes-backend `.enter()` always
clones the one template (a chart-level constraint, not a per-call choice) —
if you need heterogeneous shapes per datum, branch inside `chart.shape((d) =>
...)` at the chart level instead (see [Chart Types](/chart-types/)), or run
multiple `Selection`s, one per shape.

For datum counts where one `GraphMesh` per element isn't affordable — D3 has
no equivalent here, since SVG/Canvas has no built-in instancing — swap the
`type: 'meshes'` backend for `type: 'instanced'` over a `GraphInstancedObject`.
`.data().join().attr()` all work identically; only construction differs. See
[The Data Join & Selections, Deep-Dive](/recipes/data-join-selections) for the
full instanced version and a live re-joining example.

## Transitions

D3:

```js
selection.transition().duration(400).ease(d3.easeCubicOut).attr('opacity', 0).remove();
```

Graph3D.js:

```js
selection.transition().duration(400).easing('easeOutCubic').attr('opacity', 0).remove();
```

`.easing()` takes a named curve string (or a custom `(t) => number` function)
from `anim/GraphAnimCurve` rather than an imported `d3-ease` function — see
[Anim](/concepts/anim) for the full curve list. `.delay(msOrFn)` supports the
same per-datum stagger pattern as D3 (`(d, i) => i * 40`). A `.remove()`
chained onto a transition (instead of a plain selection) defers removal until
every scheduled write finishes, exactly like D3's transition-then-remove idiom.

## Scales, color, and layouts

`compose/scale` is close to a drop-in rename of `d3-scale`:
`scale.linear/pow/sqrt/log/band/point/ordinal/time` cover the same ground with
the same chainable `.domain()/.range()/.nice()/.clamp()` API. `compose/color`
and `compose/palette` cover `d3-scale-chromatic`'s built-in ramps
(`palette.viridis`, `.turbo`, `.category10`, ...) plus `color.sequential`/
`.diverging`/`.categorical`/`.quantize`/`.quantile`/`.threshold` mirroring
`d3.scaleSequential`/`scaleDiverging`/`scaleOrdinal`/`scaleQuantize`/etc.
`compose/layout`'s `force`/`tree`/`pack`/`stack` mirror `d3-force`/
`d3-hierarchy`/`d3-shape` respectively, extended to three dimensions (`force`
uses an octree instead of a quadtree; `tree`/`pack` lay out in 3D space). See
[Compose](/concepts/compose) for the full reference.

## Using a chart type instead of raw `Selection`

Most of the time you don't need to hand-roll `Selection`/`.join()` at all —
`chart.data(rows, keyFn)` on a chart type (`BarChart`, `ScatterChart`, ...)
runs the same join internally and re-diffs on every subsequent call:

```js
import { BarChart, scale } from 'graph3d.js';

const chart = new BarChart(scene.three)
  .x((d) => d.category, scale.band().domain(categories).range([-6, 6]))
  .y((d) => d.value, scale.linear().domain([0, 100]).range([0, 6]))
  .color((d) => d.value);

chart.data(rows, (d) => d.id);
chart.render();
```

Reach for raw `Selection` (as above) when you want a shape or layout no chart
type covers — the same escape hatch D3 gives you by not shipping a `<BarChart>`
element at all, just primitives you compose yourself.

## What has no D3 equivalent

- **Disposal.** Every class holding GPU/DOM resources needs `dispose()`
  called on it eventually — `selection.remove()`/`.dispose()`,
  `chart.destroy()`, `scene.dispose()`, `g.dispose()`. D3 leans on the
  browser's own DOM garbage collection; WebGL resources aren't
  garbage-collected the same way. See [Core](/concepts/core).
- **A camera.** 3D needs one; SVG/Canvas don't. `scene.camera` is a first-class
  object (`.three`, `.lookAt()`, `.enableOrbitControls()`) with no 2D analogue.
- **Instancing.** `type: 'instanced'` selections have no D3 counterpart — SVG
  has no batched-draw-call concept.
- **A render loop.** D3 mutates the DOM directly; Graph3D schedules draws
  through `Graph3DLoop` (`loop.add(cb)`), never a manual
  `requestAnimationFrame`.
