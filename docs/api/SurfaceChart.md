# SurfaceChart

<a name="module_SurfaceChart.SurfaceChart"></a>

## SurfaceChart
`GraphChart` specialized for surface plots (Prompt 135). Wraps
`generator.surface()` and renders one continuous triangulated heightfield
mesh (`GraphObjectFactory.createTriangleMesh`) — a surface has no
per-datum concept the way a bar/point/line chart does (it's configured via
`.values()`/`.xDomain()`/`.zDomain()`/`.resolution()`, mirroring the
generator's own chainable API directly), so `GraphChart`'s inherited
`x()`/`y()`/`z()`/`data()`/`color()`/`size()`/`shape()`/`filter()`/`sort()`/
`on()`/`selection()` are all inert here — only `.material()` (still
consumed, via `chart/materialField.js`) and `.transition()`/`destroy()`
scaffolding carry over meaningfully.

`.contours(levels)` optionally overlays isolines at the given height
values, traced via marching squares (`compose/generator/contour.js`) over
the same already-computed heightfield grid — each traced path becomes its
own `GraphLine` (Prompt 133's `object/GraphLine.js`, reused as-is).

**Kind**: static class of [<code>SurfaceChart</code>](#module_SurfaceChart)  

* [.SurfaceChart](#module_SurfaceChart.SurfaceChart)
    * [new exports.SurfaceChart(scene)](#new_module_SurfaceChart.SurfaceChart_new)
    * [.values([source])](#module_SurfaceChart.SurfaceChart+values) ⇒ <code>function</code> \| <code>this</code>
    * [.xDomain([domain])](#module_SurfaceChart.SurfaceChart+xDomain) ⇒ <code>\*</code>
    * [.zDomain([domain])](#module_SurfaceChart.SurfaceChart+zDomain) ⇒ <code>\*</code>
    * [.resolution([segments])](#module_SurfaceChart.SurfaceChart+resolution) ⇒ <code>number</code> \| <code>this</code>
    * [.contours([levels])](#module_SurfaceChart.SurfaceChart+contours) ⇒ <code>\*</code>
    * [.render()](#module_SurfaceChart.SurfaceChart+render) ⇒ <code>this</code>
    * [.update()](#module_SurfaceChart.SurfaceChart+update) ⇒ <code>this</code>
    * [.destroy()](#module_SurfaceChart.SurfaceChart+destroy) ⇒ <code>void</code>

<a name="new_module_SurfaceChart.SurfaceChart_new"></a>

### new exports.SurfaceChart(scene)
**Throws**:

- <code>TypeError</code> If `scene` is falsy.


| Param | Type | Description |
| --- | --- | --- |
| scene | <code>object</code> | The raw `THREE.Scene` this chart will attach to. |

**Example**  
```js
new SurfaceChart(scene)
  .values((x, z) => Math.sin(x) * Math.cos(z))
  .xDomain([-3, 3])
  .zDomain([-3, 3])
  .resolution(64)
  .contours([-0.5, 0, 0.5])
  .render();
```
<a name="module_SurfaceChart.SurfaceChart+values"></a>

### surfaceChart.values([source]) ⇒ <code>function</code> \| <code>this</code>
Gets or sets the heightfield source — passes straight through to
`generator.surface().values()`.

**Kind**: instance method of [<code>SurfaceChart</code>](#module_SurfaceChart.SurfaceChart)  

| Param | Type |
| --- | --- |
| [source] | <code>function</code> | 

**Example**  
```js
chart.values((x, z) => Math.sin(x) * Math.cos(z));
```
<a name="module_SurfaceChart.SurfaceChart+xDomain"></a>

### surfaceChart.xDomain([domain]) ⇒ <code>\*</code>
Gets or sets the x range sampled when `.values()` is a function —
passes straight through to `generator.surface().xDomain()`.

**Kind**: instance method of [<code>SurfaceChart</code>](#module_SurfaceChart.SurfaceChart)  
**Throws**:

- <code>TypeError</code> If `domain` isn't a `[min, max]` pair of finite numbers.


| Param | Type |
| --- | --- |
| [domain] | <code>\*</code> | 

**Example**  
```js
chart.xDomain([-3, 3]);
```
<a name="module_SurfaceChart.SurfaceChart+zDomain"></a>

### surfaceChart.zDomain([domain]) ⇒ <code>\*</code>
Gets or sets the z range sampled when `.values()` is a function —
passes straight through to `generator.surface().zDomain()`.

**Kind**: instance method of [<code>SurfaceChart</code>](#module_SurfaceChart.SurfaceChart)  
**Throws**:

- <code>TypeError</code> If `domain` isn't a `[min, max]` pair of finite numbers.


| Param | Type |
| --- | --- |
| [domain] | <code>\*</code> | 

**Example**  
```js
chart.zDomain([-3, 3]);
```
<a name="module_SurfaceChart.SurfaceChart+resolution"></a>

### surfaceChart.resolution([segments]) ⇒ <code>number</code> \| <code>this</code>
Gets or sets the grid segments per axis sampled when `.values()` is a
function — passes straight through to `generator.surface().resolution()`.

**Kind**: instance method of [<code>SurfaceChart</code>](#module_SurfaceChart.SurfaceChart)  
**Throws**:

- <code>TypeError</code> If `segments` isn't a positive integer.


| Param | Type |
| --- | --- |
| [segments] | <code>number</code> | 

**Example**  
```js
chart.resolution(64);
```
<a name="module_SurfaceChart.SurfaceChart+contours"></a>

### surfaceChart.contours([levels]) ⇒ <code>\*</code>
Gets or sets the height levels to overlay as contour lines, traced via
marching squares (`compose/generator/contour.js`) over the same
heightfield grid. Omit (or pass `null`) for no overlay — the default.

**Kind**: instance method of [<code>SurfaceChart</code>](#module_SurfaceChart.SurfaceChart)  
**Throws**:

- <code>TypeError</code> If `levels` is given and isn't `null` or an array of finite numbers.


| Param | Type |
| --- | --- |
| [levels] | <code>\*</code> | 

**Example**  
```js
chart.contours([-0.5, 0, 0.5]);
```
<a name="module_SurfaceChart.SurfaceChart+render"></a>

### surfaceChart.render() ⇒ <code>this</code>
First call materializes the heightfield (and any configured contour
overlay); every later call routes to `update()`.

**Kind**: instance method of [<code>SurfaceChart</code>](#module_SurfaceChart.SurfaceChart)  
**Throws**:

- <code>TypeError</code> If `.values()` hasn't been set, or is a grid smaller than 2x2.

**See**: GraphChart#render  
<a name="module_SurfaceChart.SurfaceChart+update"></a>

### surfaceChart.update() ⇒ <code>this</code>
Recomputes the heightfield (and contour overlay) and replaces the live
mesh/lines.

**Kind**: instance method of [<code>SurfaceChart</code>](#module_SurfaceChart.SurfaceChart)  
**Throws**:

- <code>Error</code> If `render()` hasn't successfully run yet.

**See**: GraphChart#update  
<a name="module_SurfaceChart.SurfaceChart+destroy"></a>

### surfaceChart.destroy() ⇒ <code>void</code>
Disposes the live surface mesh and any contour lines, then defers to
`GraphChart.destroy()`. Idempotent.

**Kind**: instance method of [<code>SurfaceChart</code>](#module_SurfaceChart.SurfaceChart)  
**See**: GraphChart#destroy  
