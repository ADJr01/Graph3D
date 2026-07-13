# PieChart

<a name="module_PieChart.PieChart"></a>

## PieChart
`GraphChart` specialized for pie/donut charts (Prompt 139). Slice angles
come from `layout.pie()` — a one-shot proportional-sweep layout, not a
live simulation and not a per-datum position+scale computation — so, like
`NetworkChart`/`TreeChart`/`PackChart`, `PieChart` overrides `data()`/
`render()`/`update()`/`destroy()` entirely rather than building on
`GraphChart`'s per-datum pipeline. Each slice is extruded into a wedge via
`generator.arc()` (CLAUDE.md §1.1 DRY, no reimplemented wedge geometry) —
called once per datum (not once for the whole array) since every slice's
wedge shape genuinely differs, unlike `BarChart`/`ScatterChart` where every
datum shares one base geometry an `InstancedMesh` can batch. Each wedge is
therefore its own `GraphMesh` (`GraphObjectFactory.createTriangleMesh`,
the same "raw triangulated-mesh buffers into one continuous `GraphMesh`"
factory `AreaChart`/`SurfaceChart` already use) — pie charts realistically
have a handful to a few dozen slices, not thousands, so this doesn't need
(and can't easily use) instancing.
ponytail: one GraphMesh per slice, not instanced — fine at pie-chart
scale (a handful to a few dozen slices); see skipping_list.md's "PieChart's
wedges are one GraphMesh per slice" entry.

`GraphChart`'s inherited `x()`/`y()`/`z()`/`shape()`/`filter()`/`sort()`/
`on()` are inert here (position/angle come from `layout.pie()`/`.value()`
instead); `.color()`/`.opacity()`/`.visible()` still work, via the same
`applyColorField`/`applyOpacityField`/`applyVisibleField`/
`resolveChartMaterial` helpers every other chart type uses (CLAUDE.md
§1.1 DRY) — `.selection()` is overridden to expose a real `Selection`
over the per-slice meshes so they have something to write to. `.color()`'s
accessor receives each slice's own datum, same as `BarChart`/`ScatterChart`.
`.size(fn)` (Prompt 141) multiplies the whole wedge mesh's scale uniformly
around its own local origin (the pie's center) — every slice mesh's base
scale is always `(1,1,1)` (position/shape are already baked into the
wedge's own vertex buffer by `generator.arc()`, not represented via a
scale multiplier the way instanced spheres/boxes are), so `.size()` grows
or shrinks a slice's radius and thickness together, independent of
`.explode()`'s separate position offset.

"Explode-on-hover" (the prompt's own wording) isn't wired to real pointer
events here — `interact/` (picking, hover state) doesn't exist yet. Instead,
`PieChart` exposes the same low-level pieces `ScatterChart.pick()`
established: `.pick(raycaster)` returns the hit slice's datum (or `null`),
and `.explode(datum, exploded?)` offsets that slice radially outward along
its own mid-angle — a caller wires its own `pointermove` handler, raycasts,
and calls both (see `examples/17-pie-chart/`).

**Kind**: static class of [<code>PieChart</code>](#module_PieChart)  

* [.PieChart](#module_PieChart.PieChart)
    * [new exports.PieChart(scene)](#new_module_PieChart.PieChart_new)
    * [.data([arr])](#module_PieChart.PieChart+data) ⇒ <code>Array</code> \| <code>this</code>
    * [.value([fn])](#module_PieChart.PieChart+value) ⇒ <code>function</code>
    * [.sortSlices([fn])](#module_PieChart.PieChart+sortSlices) ⇒ <code>function</code>
    * [.padAngle([value])](#module_PieChart.PieChart+padAngle) ⇒ <code>number</code> \| <code>this</code>
    * [.innerRadius([value])](#module_PieChart.PieChart+innerRadius) ⇒ <code>function</code>
    * [.outerRadius([value])](#module_PieChart.PieChart+outerRadius) ⇒ <code>function</code>
    * [.extrude([value])](#module_PieChart.PieChart+extrude) ⇒ <code>function</code>
    * [.explodeOffset([value])](#module_PieChart.PieChart+explodeOffset) ⇒ <code>number</code> \| <code>this</code>
    * [.explode(datum, [exploded])](#module_PieChart.PieChart+explode) ⇒ <code>this</code>
    * [.pick(raycaster)](#module_PieChart.PieChart+pick) ⇒ <code>\*</code>
    * [.selection()](#module_PieChart.PieChart+selection) ⇒ <code>Selection</code>
    * [.render()](#module_PieChart.PieChart+render) ⇒ <code>this</code>
    * [.update()](#module_PieChart.PieChart+update) ⇒ <code>this</code>
    * [.destroy()](#module_PieChart.PieChart+destroy) ⇒ <code>void</code>

<a name="new_module_PieChart.PieChart_new"></a>

### new exports.PieChart(scene)
**Throws**:

- <code>TypeError</code> If `scene` is falsy.


| Param | Type | Description |
| --- | --- | --- |
| scene | <code>object</code> | The raw `THREE.Scene` this chart will attach to. |

**Example**  
```js
new PieChart(scene)
  .data(rows)
  .value((d) => d.count)
  .innerRadius(0.4)
  .color((d) => d.label, palette.category10)
  .render();
canvas.addEventListener('pointermove', (event) => {
  const hit = chart.pick(raycasterFromEvent(event));
  for (const d of rows) chart.explode(d, d === hit);
});
```
<a name="module_PieChart.PieChart+data"></a>

### pieChart.data([arr]) ⇒ <code>Array</code> \| <code>this</code>
Gets or sets the slice array — one entry per pie slice. Unlike
`GraphChart.data()`, this doesn't join against a per-datum `Selection`
backend (mirrors `NetworkChart`/`TreeChart`/`PackChart`'s identical
override) — no-arg reads, one-arg writes and chains.

**Kind**: instance method of [<code>PieChart</code>](#module_PieChart.PieChart)  
**Throws**:

- <code>TypeError</code> If `arr` is given and isn't an array.


| Param | Type |
| --- | --- |
| [arr] | <code>Array</code> | 

**Example**  
```js
chart.data(rows).value((d) => d.count).render();
```
<a name="module_PieChart.PieChart+value"></a>

### pieChart.value([fn]) ⇒ <code>function</code>
Gets or sets the per-datum value accessor driving each slice's angular
span — forwarded to `layout.pie`'s `value` option (CLAUDE.md §1.1 DRY,
no reimplemented proportional-sweep math here).

**Kind**: instance method of [<code>PieChart</code>](#module_PieChart.PieChart)  
**Throws**:

- <code>TypeError</code> If `fn` is given and isn't a function.


| Param | Type |
| --- | --- |
| [fn] | <code>function</code> | 

**Example**  
```js
chart.value((d) => d.count);
```
<a name="module_PieChart.PieChart+sortSlices"></a>

### pieChart.sortSlices([fn]) ⇒ <code>function</code>
Gets or sets the comparator ordering slices around the sweep —
forwarded to `layout.pie`'s `sort` option. Named distinctly from
`GraphChart.sort()` (inert here, per the class doc) since it orders
slices around the pie, not this chart's flat data array.

**Kind**: instance method of [<code>PieChart</code>](#module_PieChart.PieChart)  
**Throws**:

- <code>TypeError</code> If `fn` is given and isn't a function or `null`.


| Param | Type |
| --- | --- |
| [fn] | <code>function</code> | 

**Example**  
```js
chart.sortSlices((a, b) => b.count - a.count);
```
<a name="module_PieChart.PieChart+padAngle"></a>

### pieChart.padAngle([value]) ⇒ <code>number</code> \| <code>this</code>
Gets or sets the gap angle, in radians, inserted between adjacent
slices — forwarded to `layout.pie`'s `padAngle` option.

**Kind**: instance method of [<code>PieChart</code>](#module_PieChart.PieChart)  
**Throws**:

- <code>TypeError</code> If `value` is given and isn't a finite number.


| Param | Type |
| --- | --- |
| [value] | <code>number</code> | 

**Example**  
```js
chart.padAngle(0.02);
```
<a name="module_PieChart.PieChart+innerRadius"></a>

### pieChart.innerRadius([value]) ⇒ <code>function</code>
Gets or sets each wedge's inner radius — forwarded to
`generator.arc()`'s own `innerRadius` option. `0` (default) makes a
solid pie; a positive value makes a donut.

**Kind**: instance method of [<code>PieChart</code>](#module_PieChart.PieChart)  
**Throws**:

- <code>TypeError</code> If `value` is given and isn't a number or function.


| Param | Type |
| --- | --- |
| [value] | <code>function</code> | 

**Example**  
```js
chart.innerRadius(0.4);
```
<a name="module_PieChart.PieChart+outerRadius"></a>

### pieChart.outerRadius([value]) ⇒ <code>function</code>
Gets or sets each wedge's outer radius — forwarded to
`generator.arc()`'s own `outerRadius` option.

**Kind**: instance method of [<code>PieChart</code>](#module_PieChart.PieChart)  
**Throws**:

- <code>TypeError</code> If `value` is given and isn't a number or function.


| Param | Type |
| --- | --- |
| [value] | <code>function</code> | 

**Example**  
```js
chart.outerRadius((d) => 1 + d.emphasis);
```
<a name="module_PieChart.PieChart+extrude"></a>

### pieChart.extrude([value]) ⇒ <code>function</code>
Gets or sets each wedge's extrusion height — forwarded to
`generator.arc()`'s own `extrude` option.

**Kind**: instance method of [<code>PieChart</code>](#module_PieChart.PieChart)  
**Throws**:

- <code>TypeError</code> If `value` is given and isn't a number or function.


| Param | Type |
| --- | --- |
| [value] | <code>function</code> | 

**Example**  
```js
chart.extrude((d) => d.count);
```
<a name="module_PieChart.PieChart+explodeOffset"></a>

### pieChart.explodeOffset([value]) ⇒ <code>number</code> \| <code>this</code>
Gets or sets the world-unit radial offset an exploded slice moves by —
see `.explode()`.

**Kind**: instance method of [<code>PieChart</code>](#module_PieChart.PieChart)  
**Throws**:

- <code>TypeError</code> If `value` is given and isn't a finite number.


| Param | Type |
| --- | --- |
| [value] | <code>number</code> | 

**Example**  
```js
chart.explodeOffset(0.5);
```
<a name="module_PieChart.PieChart+explode"></a>

### pieChart.explode(datum, [exploded]) ⇒ <code>this</code>
Moves `datum`'s slice outward from center (or back to center) along its
own mid-angle by `.explodeOffset()` world units — the mechanism behind
"explode-on-hover" (see the class doc for the caller-driven pointer
wiring this doesn't own itself). A no-op if `datum` isn't a currently
rendered slice.

**Kind**: instance method of [<code>PieChart</code>](#module_PieChart.PieChart)  
**Throws**:

- <code>Error</code> If `render()` hasn't successfully run yet.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| datum | <code>\*</code> |  | A datum from `data()`. |
| [exploded] | <code>boolean</code> | <code>true</code> | `true` (default) to explode, `false` to restore. |

**Example**  
```js
chart.explode(hoveredDatum, true);
```
<a name="module_PieChart.PieChart+pick"></a>

### pieChart.pick(raycaster) ⇒ <code>\*</code>
Ray-picks the frontmost slice under `raycaster` and returns its datum
(or `null`) — mirrors `ScatterChart.pick()`'s meshes-backend branch (a
plain `THREE.Raycaster.intersectObjects`; pie charts realistically have
too few slices for an octree to be worth building).

**Kind**: instance method of [<code>PieChart</code>](#module_PieChart.PieChart)  
**Returns**: <code>\*</code> - The hit datum, or `null` if nothing was hit.  
**Throws**:

- <code>Error</code> If `render()` hasn't successfully run yet.


| Param | Type | Description |
| --- | --- | --- |
| raycaster | <code>object</code> | A `THREE.Raycaster`. |

**Example**  
```js
const hit = chart.pick(raycaster);
```
<a name="module_PieChart.PieChart+selection"></a>

### pieChart.selection() ⇒ <code>Selection</code>
The live `Selection` over every rendered slice — overrides
`GraphChart.selection()` (whose private per-datum backend `PieChart`
never populates, since it overrides `render()`/`update()` entirely) so
`.color()` has something real to write to.

**Kind**: instance method of [<code>PieChart</code>](#module_PieChart.PieChart)  
**Example**  
```js
chart.selection().filter((d) => d.count > 90).attr('color', 'gold');
```
<a name="module_PieChart.PieChart+render"></a>

### pieChart.render() ⇒ <code>this</code>
First call materializes one wedge mesh per slice; every later call
routes to `update()`.

**Kind**: instance method of [<code>PieChart</code>](#module_PieChart.PieChart)  
**Throws**:

- <code>Error</code> If `data(arr)` was never called before this render.

**See**: GraphChart#render  
<a name="module_PieChart.PieChart+update"></a>

### pieChart.update() ⇒ <code>this</code>
Recomputes the pie layout from the latest `data()`/`value()`/
`sortSlices()`/`padAngle()` and rebuilds the slice meshes to match.
Previously-exploded datums (by reference) stay exploded.

**Kind**: instance method of [<code>PieChart</code>](#module_PieChart.PieChart)  
**Throws**:

- <code>Error</code> If `render()` hasn't successfully run yet.

**See**: GraphChart#update  
<a name="module_PieChart.PieChart+destroy"></a>

### pieChart.destroy() ⇒ <code>void</code>
Disposes every slice mesh, then defers to `GraphChart.destroy()`.
Idempotent.

**Kind**: instance method of [<code>PieChart</code>](#module_PieChart.PieChart)  
**See**: GraphChart#destroy  
