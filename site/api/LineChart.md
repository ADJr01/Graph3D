# LineChart

<a name="module_LineChart.LineChart"></a>

## LineChart
`GraphChart` specialized for line charts (Prompt 133). Renders one
continuous `GraphLine` (a Three.js `Line2`, `object/GraphLine.js`) per
series instead of one mesh/instance per datum — `GraphChart`'s own
`render()`/`update()` assume a per-datum position+scale buffer
(`GraphObjectFactory.createBars`/`createPoints`), which doesn't fit a
continuous path, so `LineChart` overrides both instead of building on
them. It still reuses `GraphChart`'s `x()`/`y()`/`z()` field storage and
axis scale-fitting (`chart/axisField.js`, shared with `GraphChart` itself
— CLAUDE.md §1.1 DRY) as-is.

`data()` is overridden too: `GraphChart`'s own version (Prompt 128) joins
against a per-datum `Selection` backend so entering/exiting individual
bars/points can be micro-controlled — a continuous polyline has no such
backend (there's nothing to `.enter()`/`.exit()` one vertex at a time), so
`LineChart.data()` is a plain getter/setter instead, like `.filter()` or
`.material()`. `selection()`/`on('enter'|'update'|'exit', fn)`, inherited
from `GraphChart`, are consequently inert for `LineChart` — there is no
per-vertex `Selection` for them to operate on.

**Kind**: static class of [<code>LineChart</code>](#module_LineChart)  

* [.LineChart](#module_LineChart.LineChart)
    * [new exports.LineChart(scene)](#new_module_LineChart.LineChart_new)
    * [.data([arr])](#module_LineChart.LineChart+data) ⇒ <code>Array</code> \| <code>this</code>
    * [.series([keyFn])](#module_LineChart.LineChart+series) ⇒ <code>function</code>
    * [.curve([type])](#module_LineChart.LineChart+curve) ⇒ <code>string</code> \| <code>this</code>
    * [.render()](#module_LineChart.LineChart+render) ⇒ <code>this</code>
    * [.update()](#module_LineChart.LineChart+update) ⇒ <code>this</code>
    * [.setResolution(width, height)](#module_LineChart.LineChart+setResolution) ⇒ <code>this</code>
    * [.destroy()](#module_LineChart.LineChart+destroy) ⇒ <code>void</code>

<a name="new_module_LineChart.LineChart_new"></a>

### new exports.LineChart(scene)
**Throws**:

- <code>TypeError</code> If `scene` is falsy.


| Param | Type | Description |
| --- | --- | --- |
| scene | <code>object</code> | The raw `THREE.Scene` this chart will attach to. |

**Example**  
```js
new LineChart(scene)
  .data(rows)
  .x((d) => d.t, scale.linear().domain([0, 10]).range([-6, 6]))
  .y((d) => d.value, scale.linear().domain([0, 100]).range([0, 6]))
  .series((d) => d.symbol)
  .curve('catmullRom')
  .render();
```
<a name="module_LineChart.LineChart+data"></a>

### lineChart.data([arr]) ⇒ <code>Array</code> \| <code>this</code>
Gets or sets the raw datum array this chart renders. Unlike
`GraphChart.data()`, this doesn't join against a per-datum `Selection`
backend (see the class doc) — no-arg reads, one-arg writes and chains,
like every other plain `GraphChart` setter.

**Kind**: instance method of [<code>LineChart</code>](#module_LineChart.LineChart)  
**Throws**:

- <code>TypeError</code> If `arr` is given and isn't an array.


| Param | Type |
| --- | --- |
| [arr] | <code>Array</code> | 

**Example**  
```js
chart.data(rows).series((d) => d.symbol).render();
```
<a name="module_LineChart.LineChart+series"></a>

### lineChart.series([keyFn]) ⇒ <code>function</code>
Gets or sets the series-identity accessor splitting `data()` into
multiple independent lines, one `GraphLine` per distinct key — drawn in
a distinct color from `palette.category10`, auto-assigned per key in
first-seen order. Without this, all of `data()` renders as a single line.

**Kind**: instance method of [<code>LineChart</code>](#module_LineChart.LineChart)  
**Throws**:

- <code>TypeError</code> If `keyFn` is given and isn't a function.


| Param | Type |
| --- | --- |
| [keyFn] | <code>function</code> | 

**Example**  
```js
chart.series((d) => d.symbol);
```
<a name="module_LineChart.LineChart+curve"></a>

### lineChart.curve([type]) ⇒ <code>string</code> \| <code>this</code>
Gets or sets the interpolation curve — passes straight through to the
underlying `generator.line().curve()` (CLAUDE.md §1.1 DRY: the curve
table already lives there, not duplicated here).

**Kind**: instance method of [<code>LineChart</code>](#module_LineChart.LineChart)  
**Throws**:

- <code>TypeError</code> If `type` isn't one of the supported curve names.


| Param | Type |
| --- | --- |
| [type] | <code>\*</code> | 

**Example**  
```js
chart.curve('catmullRom');
```
<a name="module_LineChart.LineChart+render"></a>

### lineChart.render() ⇒ <code>this</code>
First call materializes one `GraphLine` per series; every later call
routes to `update()`.

**Kind**: instance method of [<code>LineChart</code>](#module_LineChart.LineChart)  
**Throws**:

- <code>Error</code> If `data(arr)` was never called before this render.

**See**: GraphChart#render  
<a name="module_LineChart.LineChart+update"></a>

### lineChart.update() ⇒ <code>this</code>
Recomputes every series' vertex stream from the latest `data()` and
writes it into that series' `GraphLine` (mutating in place when its
point count is unchanged — `GraphLine.setPositions`'s own optimization).
Series no longer present are disposed; newly-seen series get a new
`GraphLine`.

**Kind**: instance method of [<code>LineChart</code>](#module_LineChart.LineChart)  
**Throws**:

- <code>Error</code> If `render()` hasn't successfully run yet.

**See**: GraphChart#update  
<a name="module_LineChart.LineChart+setResolution"></a>

### lineChart.setResolution(width, height) ⇒ <code>this</code>
Updates every live line's `LineMaterial` resolution
(`GraphLine.setResolution`) — `linewidth` is measured in screen pixels,
so `Line2` needs the current canvas size to stay a consistent width
after a resize. Call this from your own renderer resize handler.

**Kind**: instance method of [<code>LineChart</code>](#module_LineChart.LineChart)  
**Throws**:

- <code>Error</code> If this chart has been destroyed.


| Param | Type |
| --- | --- |
| width | <code>number</code> | 
| height | <code>number</code> | 

**Example**  
```js
window.addEventListener('resize', () => chart.setResolution(innerWidth, innerHeight));
```
<a name="module_LineChart.LineChart+destroy"></a>

### lineChart.destroy() ⇒ <code>void</code>
Disposes every live `GraphLine`, then defers to `GraphChart.destroy()`
for handler-clearing and marking the shared inherited setters
(`x()`/`y()`/`z()`/`filter()`/...) as destroyed. Idempotent.

**Kind**: instance method of [<code>LineChart</code>](#module_LineChart.LineChart)  
**See**: GraphChart#destroy  
