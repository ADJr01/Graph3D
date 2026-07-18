# AreaChart

<a name="module_AreaChart.AreaChart"></a>

## AreaChart
`GraphChart` specialized for area charts (Prompt 135). Wraps
`generator.area()`, rendering one continuous extruded "wall" mesh
(`GraphObjectFactory.createTriangleMesh`) from each data point's value
down to a constant `baseline` — like `LineChart`, this isn't a per-datum
position+scale buffer `GraphChart.render()`/`update()` can materialize via
`GraphObjectFactory.createBars`/`createPoints`, so `AreaChart` overrides
both rather than building on them. It still reuses `GraphChart`'s
`x()`/`y()`/`z()`/`material()` field storage and the shared axis
scale-fitting / material-resolution helpers (`chart/axisField.js`,
`chart/materialField.js`) as-is.

Unlike `LineChart`'s same-count-mutates-in-place `GraphLine`, every
`update()` here disposes the previous wall and builds a fresh one — no
current requirement calls for in-place vertex mutation on a triangulated
wall mesh, and profiling first before optimizing is CLAUDE.md §1.3 YAGNI.

**Kind**: static class of [<code>AreaChart</code>](#module_AreaChart)  

* [.AreaChart](#module_AreaChart.AreaChart)
    * [new exports.AreaChart(scene)](#new_module_AreaChart.AreaChart_new)
    * [.data([arr])](#module_AreaChart.AreaChart+data) ⇒ <code>Array</code> \| <code>this</code>
    * [.baseline([value])](#module_AreaChart.AreaChart+baseline) ⇒ <code>number</code> \| <code>this</code>
    * [.curve([type])](#module_AreaChart.AreaChart+curve) ⇒ <code>string</code> \| <code>this</code>
    * [.render()](#module_AreaChart.AreaChart+render) ⇒ <code>this</code>
    * [.update()](#module_AreaChart.AreaChart+update) ⇒ <code>this</code>
    * [.destroy()](#module_AreaChart.AreaChart+destroy) ⇒ <code>void</code>

<a name="new_module_AreaChart.AreaChart_new"></a>

### new exports.AreaChart(scene)
**Throws**:

- <code>TypeError</code> If `scene` is falsy.


| Param | Type | Description |
| --- | --- | --- |
| scene | <code>object</code> | The raw `THREE.Scene` this chart will attach to. |

**Example**  
```js
new AreaChart(scene)
  .x((d) => d.t, scale.linear().domain([0, 10]).range([-6, 6]))
  .y((d) => d.value, scale.linear().domain([0, 100]).range([0, 6]))
  .baseline(0)
  .curve('catmullRom')
  .render();
```
<a name="module_AreaChart.AreaChart+data"></a>

### areaChart.data([arr]) ⇒ <code>Array</code> \| <code>this</code>
Gets or sets the raw datum array this chart renders. Unlike
`GraphChart.data()`, this doesn't join against a per-datum `Selection`
backend — a continuous wall has no such backend (mirrors `LineChart`'s
identical `data()` override and its rationale).

**Kind**: instance method of [<code>AreaChart</code>](#module_AreaChart.AreaChart)  
**Throws**:

- <code>TypeError</code> If `arr` is given and isn't an array.


| Param | Type |
| --- | --- |
| [arr] | <code>Array</code> | 

**Example**  
```js
chart.data(rows).baseline(0).render();
```
<a name="module_AreaChart.AreaChart+baseline"></a>

### areaChart.baseline([value]) ⇒ <code>number</code> \| <code>this</code>
Gets or sets the wall's bottom edge — passes straight through to
`generator.area().baseline()`.

**Kind**: instance method of [<code>AreaChart</code>](#module_AreaChart.AreaChart)  
**Throws**:

- <code>TypeError</code> If `value` isn't a finite number.


| Param | Type |
| --- | --- |
| [value] | <code>number</code> | 

**Example**  
```js
chart.baseline(-2);
```
<a name="module_AreaChart.AreaChart+curve"></a>

### areaChart.curve([type]) ⇒ <code>string</code> \| <code>this</code>
Gets or sets the top edge's interpolation curve — passes straight
through to `generator.area().curve()` (CLAUDE.md §1.1 DRY: no second
curve table lives here).

**Kind**: instance method of [<code>AreaChart</code>](#module_AreaChart.AreaChart)  
**Throws**:

- <code>TypeError</code> If `type` isn't one of the supported curve names.


| Param | Type |
| --- | --- |
| [type] | <code>\*</code> | 

**Example**  
```js
chart.curve('catmullRom');
```
<a name="module_AreaChart.AreaChart+render"></a>

### areaChart.render() ⇒ <code>this</code>
First call materializes the wall; every later call routes to `update()`.

**Kind**: instance method of [<code>AreaChart</code>](#module_AreaChart.AreaChart)  
**Throws**:

- <code>Error</code> If `data(arr)` was never called before this render.

**See**: GraphChart#render  
<a name="module_AreaChart.AreaChart+update"></a>

### areaChart.update() ⇒ <code>this</code>
Recomputes the wall from the latest `data()` and replaces the live mesh.

**Kind**: instance method of [<code>AreaChart</code>](#module_AreaChart.AreaChart)  
**Throws**:

- <code>Error</code> If `render()` hasn't successfully run yet.

**See**: GraphChart#update  
<a name="module_AreaChart.AreaChart+destroy"></a>

### areaChart.destroy() ⇒ <code>void</code>
Disposes the live wall mesh, then defers to `GraphChart.destroy()` for
handler-clearing and marking the shared inherited setters as destroyed.
Idempotent.

**Kind**: instance method of [<code>AreaChart</code>](#module_AreaChart.AreaChart)  
**See**: GraphChart#destroy  
