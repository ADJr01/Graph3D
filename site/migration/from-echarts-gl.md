# Migrating from ECharts GL

The biggest shift coming from ECharts GL isn't any one chart type — it's the
API shape. ECharts GL is **declarative**: you build one big `option` object
(`series`, `grid3D`, `xAxis3D`, `visualMap`, ...) and hand the whole thing to
`chart.setOption(option)`. Graph3D.js is **chainable/imperative**: you
construct a chart instance and call methods on it (`.x()`, `.color()`,
`.data()`), matching D3's own fluent style rather than a single config blob.
There's no `setOption`-equivalent single call — each concern (axis scale,
color mapping, data) is its own method, composed the same way `compose/scale`
and `compose/color` compose everywhere else in Graph3D. See
[Compose](/concepts/compose) if you haven't already.

## Chart type mapping

| ECharts GL `series.type` | Graph3D.js | Notes |
|---|---|---|
| `bar3D` | `BarChart` | `.x()/.y()/.z()` replace `grid3D`+`xAxis3D`/`yAxis3D`/`zAxis3D` category/value axes. |
| `scatter3D` | `ScatterChart` | Instanced by default above the datum-count threshold — no separate "GL" variant needed for large datasets. |
| `surface` | `SurfaceChart` | Takes a `(x, z) => y` function or gridded data, same shape as ECharts GL's `equation`/`data` surface input. |
| `line3D` | `LineChart` | |
| `graphGL` | `NetworkChart` | Force-directed by default via `compose/layout`'s `layout.force` (3D, octree-based) underneath. |
| `lines3D` (great-circle paths) | — | No direct equivalent yet; a custom `generator.line`-built geometry is the closest fit today. |
| `map3D` / `globe` | — | No geo/globe chart type yet — out of scope for the current build plan. |
| `flowGL` | — | No flow-field visualization type yet. |
| — | `VolumeChart` | No ECharts GL equivalent — volumetric rendering is Graph3D-only. |
| — | `HeatmapChart`, `AreaChart`, `PieChart`, `PackChart`, `TreeChart` | No 3D ECharts equivalents for these; see [Chart Types](/chart-types/) for the full list. |

## Side-by-side: a bar3D chart

ECharts GL:

```js
myChart.setOption({
  grid3D: {},
  xAxis3D: { type: 'category', data: categories },
  yAxis3D: { type: 'value' },
  zAxis3D: { type: 'category', data: ['2023', '2024'] },
  visualMap: { min: 0, max: 100, inRange: { color: ['#440154', '#fde725'] } },
  series: [{
    type: 'bar3D',
    data: rows.map((d) => [d.category, d.value, d.year]),
    shading: 'lambert',
  }],
});
```

Graph3D.js:

```js
import { Graph3D, BarChart, scale, color, palette } from 'graph3d.js';

const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

const x = scale.band().domain(categories).range([-6, 6]);
const z = scale.band().domain(['2023', '2024']).range([-3, 3]);
const y = scale.linear().domain([0, 100]).range([0, 6]);
const barColor = color.sequential(palette.viridis, [0, 100]);

const chart = new BarChart(scene.three)
  .x((d) => d.category, x)
  .y((d) => d.value, y)
  .z((d) => d.year, z)
  .color((d) => barColor(d.value));

chart.data(rows, (d) => `${d.category}-${d.year}`);
chart.render();
```

`grid3D`+`xAxis3D`/`yAxis3D`/`zAxis3D` become `scale.band()`/`scale.linear()`
passed directly to `.x()/.y()/.z()`; `visualMap` becomes
`color.sequential(palette, domain)` passed to `.color()`; `shading: 'lambert'`
is the default material behavior (`chart.material('standard', opts)` if you
need to change it — see [Material](/concepts/material)). There's no
`setOption` — updating the chart later is a fresh `chart.data(newRows,
keyFn)` call, which diffs against what's currently bound (the same
enter/update/exit join every chart type uses, see [Compose](/concepts/compose)
and [migrating from D3](/migration/from-d3) if that's unfamiliar) rather than
a full `setOption` re-render.

## Axes and ticks

ECharts GL's `xAxis3D`/`yAxis3D`/`zAxis3D` config objects (`min`, `max`,
`interval`, `axisLabel.formatter`) map onto `compose/scale`'s chainable API:
`.domain([min, max])`, `.ticks(count)`, `.tickFormat(fn)`. If you want a
visible axis line/ticks in the scene (ECharts GL always draws one), add an
`Axis` explicitly — chart types don't render one by default:

```js
import { Axis } from 'graph3d.js';
new Axis().scale(y).orientation('y').tickCount(5).render(scene.three, 'yAxis');
```

## Color and `visualMap`

`visualMap`'s `inRange.color` ramp is `palette.custom([...])` or one of the
built-ins (`palette.viridis`, `.turbo`, ...); `visualMap`'s `min`/`max` are the
`domain` array passed to `color.sequential`/`color.diverging`. Categorical
`visualMap` (`type: 'piecewise'`, or a plain category-to-color mapping) is
`color.categorical`/`palette.category10` instead. See
[Compose](/concepts/compose)'s Color & Palettes section for the full list.

## What's structurally different

- **No `option` object.** Every ECharts GL config key has a Graph3D method,
  but there's no single call that takes them all at once — you compose the
  chart via chained method calls, then call `.render()`.
  [`GraphChart`](/api/GraphChart)'s method list is effectively the same
  surface `series`/`grid3D`/`visualMap` cover, split out one method per
  concern.
- **No global theme registry.** ECharts' `theme` name (`echarts.init(dom,
  'dark')`) maps loosely onto `scene.applyTheme(name)` — but Graph3D themes
  bundle camera/lighting/fog/HDR/shadow-quality together, not just a color
  palette. See [Scene Composition](/concepts/scene).
- **Full scene access, always.** Every Graph3D chart's underlying
  `THREE.Object3D`s are reachable (`chart.selection()`, `scene.three`) — there
  is no ECharts-GL-style black-box canvas you can only configure through
  options. See [migrating from raw Three.js](/migration/from-raw-three) for
  what that access buys you.
