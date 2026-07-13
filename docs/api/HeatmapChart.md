# HeatmapChart

<a name="module_HeatmapChart.HeatmapChart"></a>

## HeatmapChart
`GraphChart` specialized for heatmaps (Prompt 136). Defaults to a new
`generator.heatmap()` — a fixed-size grid-cell box, not a baseline-relative
growth shape like `generator.bar()` — so every `GraphChart` default
(instanced-over-50-datums via `GraphObjectFactory`, `material.standard()`
fallback) already applies unchanged: a million-cell heatmap renders as one
`GraphInstancedObject` for free, same as `BarChart`/`ScatterChart`.

Two render modes, set via `.mode(name)`:
- `'plane'` (default): flat tiles in the x/z plane (thin fixed height) —
  a classic 2D heatmap. `.y()` defaults to `0` so tiles need no
  configuration to lie flat.
- `'voxel'`: full cubes, `.y()` becomes a real third grid axis (e.g. depth
  or time) — a 3D density grid. `.opacity(fn)` (Prompt 134's setter,
  `GraphChart`'s own since this chart became its second consumer) is the
  idiomatic way to encode a value as per-cell density on top of `.color()`.

`.color(fn)` (Prompt 127) falls back to `palette.viridis` here, same as
`BarChart`/`ScatterChart` (`chart/colorField.js`, third consumer).

**Kind**: static class of [<code>HeatmapChart</code>](#module_HeatmapChart)  

* [.HeatmapChart](#module_HeatmapChart.HeatmapChart)
    * [new exports.HeatmapChart(scene)](#new_module_HeatmapChart.HeatmapChart_new)
    * [.mode([name])](#module_HeatmapChart.HeatmapChart+mode) ⇒ <code>\*</code>
    * [.render()](#module_HeatmapChart.HeatmapChart+render) ⇒ <code>this</code>
    * [.update()](#module_HeatmapChart.HeatmapChart+update) ⇒ <code>this</code>

<a name="new_module_HeatmapChart.HeatmapChart_new"></a>

### new exports.HeatmapChart(scene)
**Throws**:

- <code>TypeError</code> If `scene` is falsy.


| Param | Type | Description |
| --- | --- | --- |
| scene | <code>object</code> | The raw `THREE.Scene` this chart will attach to. |

**Example**  
```js
new HeatmapChart(scene)
  .x((d) => d.col, scale.band().domain(cols).range([-6, 6]))
  .z((d) => d.row, scale.band().domain(rows).range([-6, 6]))
  .color((d) => d.value)
  .render();
```
**Example**  
```js
new HeatmapChart(scene)
  .mode('voxel')
  .x((d) => d.x).y((d) => d.y).z((d) => d.z)
  .color((d) => d.density)
  .opacity((d) => d.density)
  .render();
```
<a name="module_HeatmapChart.HeatmapChart+mode"></a>

### heatmapChart.mode([name]) ⇒ <code>\*</code>
Gets or sets the render mode: `'plane'` (default, flat 2D tiles) or
`'voxel'` (full 3D cubes). Only changes the computed cell height
(`generator.heatmap().height()`) — position (`x`/`y`/`z`) is unaffected.

**Kind**: instance method of [<code>HeatmapChart</code>](#module_HeatmapChart.HeatmapChart)  
**Throws**:

- <code>TypeError</code> If `name` is given and isn't `'plane'`/`'voxel'`.


| Param | Type |
| --- | --- |
| [name] | <code>\*</code> | 

**Example**  
```js
chart.mode('voxel');
```
<a name="module_HeatmapChart.HeatmapChart+render"></a>

### heatmapChart.render() ⇒ <code>this</code>
First call materializes via `GraphChart.render()`; every later call
routes to this class's own `update()` override. Applies `.color()`'s
palette fallback and `.opacity()` afterward either way.

**Kind**: instance method of [<code>HeatmapChart</code>](#module_HeatmapChart.HeatmapChart)  
**Throws**:

- <code>Error</code> If `data(arr)` was never called before this render.

**See**: GraphChart#render  
<a name="module_HeatmapChart.HeatmapChart+update"></a>

### heatmapChart.update() ⇒ <code>this</code>
Diffs and rewrites bound data via `GraphChart.update()`, then re-applies
`.color()`/`.opacity()` across the (possibly changed) live selection.

**Kind**: instance method of [<code>HeatmapChart</code>](#module_HeatmapChart.HeatmapChart)  
**Throws**:

- <code>Error</code> If `render()` hasn't successfully run yet.

**See**: GraphChart#update  
