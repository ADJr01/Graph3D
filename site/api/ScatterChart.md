# ScatterChart

<a name="module_ScatterChart.ScatterChart"></a>

## ScatterChart
`GraphChart` specialized for scatter plots (Prompt 134). Defaults to
`generator.point()` — every `GraphChart` default (instanced-over-50-datums
via `GraphObjectFactory`, `material.standard()` fallback) already applies
unchanged, so a scatter plot of a million points renders as one
`GraphInstancedObject` for free, same as `BarChart`.

`.size(fn)`/`.color(fn, palette)`/`.opacity(valueOrFn)` (Prompt 127) are
`GraphChart`'s own setters — `ScatterChart` is the first place `.size()`
gets consumed (wired into `generator.point().size(...)` before
`compute()`, the same "wrap compute" mechanism `BarChart` established),
the second place `.color()` gets consumed (`chart/colorField.js`,
extracted out of `BarChart` once this became the second consumer), and
the first place `.opacity()` gets consumed (`chart/opacityField.js` —
originally a private field/method on this class, moved onto `GraphChart`
once `HeatmapChart`, Prompt 136, became the second consumer — CLAUDE.md
§1.1 DRY two-strike rule). `.visible(fn)` (Prompt 141) is applied the same
way via `chart/visibleField.js`.

**Kind**: static class of [<code>ScatterChart</code>](#module_ScatterChart)  

* [.ScatterChart](#module_ScatterChart.ScatterChart)
    * [new exports.ScatterChart(scene)](#new_module_ScatterChart.ScatterChart_new)
    * [.render()](#module_ScatterChart.ScatterChart+render) ⇒ <code>this</code>
    * [.update()](#module_ScatterChart.ScatterChart+update) ⇒ <code>this</code>
    * [.pick(raycaster)](#module_ScatterChart.ScatterChart+pick) ⇒ <code>\*</code>

<a name="new_module_ScatterChart.ScatterChart_new"></a>

### new exports.ScatterChart(scene)
**Throws**:

- <code>TypeError</code> If `scene` is falsy.


| Param | Type | Description |
| --- | --- | --- |
| scene | <code>object</code> | The raw `THREE.Scene` this chart will attach to. |

**Example**  
```js
new ScatterChart(scene)
  .data(rows, (d) => d.id)
  .x((d) => d.x)
  .y((d) => d.y)
  .z((d) => d.z)
  .size((d) => Math.sqrt(d.population))
  .color((d) => d.population)
  .opacity(0.8)
  .render();
const hit = chart.pick(raycaster); // the clicked datum, or null
```
<a name="module_ScatterChart.ScatterChart+render"></a>

### scatterChart.render() ⇒ <code>this</code>
First call materializes via `GraphChart.render()`; every later call
routes to this class's own `update()` override. Applies `.color()`'s
palette fallback and `.opacity()` afterward either way.

**Kind**: instance method of [<code>ScatterChart</code>](#module_ScatterChart.ScatterChart)  
**Throws**:

- <code>Error</code> If `data(arr)` was never called before this render.

**See**: GraphChart#render  
<a name="module_ScatterChart.ScatterChart+update"></a>

### scatterChart.update() ⇒ <code>this</code>
Diffs and rewrites bound data via `GraphChart.update()`, then re-applies
`.color()`/`.opacity()` across the (possibly changed) live selection.

**Kind**: instance method of [<code>ScatterChart</code>](#module_ScatterChart.ScatterChart)  
**Throws**:

- <code>Error</code> If `render()` hasn't successfully run yet.

**See**: GraphChart#update  
<a name="module_ScatterChart.ScatterChart+pick"></a>

### scatterChart.pick(raycaster) ⇒ <code>\*</code>
Ray-picks the frontmost rendered point under `raycaster`. Delegates to
the instanced backend's own octree-backed `pick()`
(`GraphInstancedObject`, Prompt 45) when this chart has grown past
`INSTANCING_THRESHOLD`; a plain `THREE.Raycaster.intersectObjects`
otherwise (an octree isn't worth the overhead at ≤50 individual meshes).
Reaches the live backend via `Selection.backend` (Prompt 134's escape
hatch) rather than duplicating a second, redundant spatial index here
(CLAUDE.md §1.1 DRY — `GraphInstancedObject` already maintains one).

**Kind**: instance method of [<code>ScatterChart</code>](#module_ScatterChart.ScatterChart)  
**Returns**: <code>\*</code> - The hit datum, or `null` if nothing was hit.  
**Throws**:

- <code>Error</code> If this chart has been destroyed.


| Param | Type | Description |
| --- | --- | --- |
| raycaster | <code>object</code> | A `THREE.Raycaster`. |

**Example**  
```js
const datum = chart.pick(raycaster);
```
