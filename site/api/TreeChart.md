# TreeChart

<a name="module_TreeChart.TreeChart"></a>

## TreeChart
`GraphChart` specialized for hierarchical node-link trees (Prompt 138).
Node positions come from `layout.tree()` — a one-shot radial layout, not a
live simulation and not an accessor+scale computation — so, like
`LineChart`/`SurfaceChart`/`NetworkChart`, `TreeChart` overrides
`data()`/`render()`/`update()`/`destroy()` entirely rather than building on
`GraphChart`'s per-datum pipeline. `GraphChart`'s inherited `x()`/`y()`/
`z()`/`shape()`/`filter()`/`sort()`/`on()` are inert here (position/
membership come from `layout.tree()` and `.children()` instead);
`.color()`/`.opacity()`/`.visible()` still work, via the same
`applyColorField`/`applyOpacityField`/`applyVisibleField`/
`resolveChartMaterial` helpers every other chart type uses (CLAUDE.md
§1.1 DRY) — `.selection()` is overridden to expose a real `Selection`
over the node backend so they have something to write to. `.size(fn)`
(Prompt 141) multiplies each node's rendered radius on top of the
`.r`-driven base `nodeScaleForRadius` already computes — a *second*
independent per-datum factor, not a replacement of the hierarchy's own
value-driven sizing.
`.color()`'s accessor receives each hierarchy node itself (not the raw
datum), so `(d) => d.depth`/`(d) => d.value`/`(d) => d.data.someField` all
work.

Every node (root, internal, and leaf) renders as a sphere
(`GraphObjectFactory.createNodes`, instanced above `INSTANCING_THRESHOLD`),
sized by `.r` (`layout.tree()`'s own `radiusFromValue` sizing — see
`chart/hierarchyField.js`'s `nodeScaleForRadius`); each parent-child edge
renders as one `GraphLine` (a `Line2`, `object/GraphLine.js`) — the same
primitive `NetworkChart`'s edges already established for node-link graphs.

Unlike `NetworkChart`, there is no simulation to step — `layout.tree()` is
deterministic, so there's no `.tick()` here.

**Kind**: static class of [<code>TreeChart</code>](#module_TreeChart)  

* [.TreeChart](#module_TreeChart.TreeChart)
    * [new exports.TreeChart(scene)](#new_module_TreeChart.TreeChart_new)
    * [.data([datum])](#module_TreeChart.TreeChart+data) ⇒ <code>object</code> \| <code>this</code>
    * [.children([fn])](#module_TreeChart.TreeChart+children) ⇒ <code>function</code>
    * [.value([fn])](#module_TreeChart.TreeChart+value) ⇒ <code>function</code>
    * [.sortChildren([fn])](#module_TreeChart.TreeChart+sortChildren) ⇒ <code>function</code>
    * [.levelHeight([value])](#module_TreeChart.TreeChart+levelHeight) ⇒ <code>number</code> \| <code>undefined</code> \| <code>this</code>
    * [.levelRadius([value])](#module_TreeChart.TreeChart+levelRadius) ⇒ <code>number</code> \| <code>undefined</code> \| <code>this</code>
    * [.selection()](#module_TreeChart.TreeChart+selection) ⇒ <code>Selection</code>
    * [.render()](#module_TreeChart.TreeChart+render) ⇒ <code>this</code>
    * [.update()](#module_TreeChart.TreeChart+update) ⇒ <code>this</code>
    * [.destroy()](#module_TreeChart.TreeChart+destroy) ⇒ <code>void</code>

<a name="new_module_TreeChart.TreeChart_new"></a>

### new exports.TreeChart(scene)
**Throws**:

- <code>TypeError</code> If `scene` is falsy.


| Param | Type | Description |
| --- | --- | --- |
| scene | <code>object</code> | The raw `THREE.Scene` this chart will attach to. |

**Example**  
```js
new TreeChart(scene)
  .data({ name: 'root', children: [{ name: 'a', value: 3 }, { name: 'b', value: 5 }] })
  .levelHeight(1.5)
  .color((d) => d.depth, palette.viridis)
  .render();
```
<a name="module_TreeChart.TreeChart+data"></a>

### treeChart.data([datum]) ⇒ <code>object</code> \| <code>this</code>
Gets or sets the root datum this chart renders as a hierarchy. Unlike
`GraphChart.data()`, this is a single object (a tree root), not an array
— no-arg reads, one-arg writes and chains.

**Kind**: instance method of [<code>TreeChart</code>](#module_TreeChart.TreeChart)  
**Throws**:

- <code>TypeError</code> If `datum` is given and isn't a non-null object.


| Param | Type |
| --- | --- |
| [datum] | <code>object</code> | 

**Example**  
```js
chart.data({ name: 'root', children: [{ name: 'leaf', value: 1 }] });
```
<a name="module_TreeChart.TreeChart+children"></a>

### treeChart.children([fn]) ⇒ <code>function</code>
Gets or sets the accessor resolving a datum's child data — forwarded to
`layout.tree`'s `children` option (CLAUDE.md §1.1 DRY, no second
hierarchy-walk here). Defaults to `layout.tree`'s own default (`(d) => d.children`).

**Kind**: instance method of [<code>TreeChart</code>](#module_TreeChart.TreeChart)  
**Throws**:

- <code>TypeError</code> If `fn` is given and isn't a function.


| Param | Type |
| --- | --- |
| [fn] | <code>function</code> | 

**Example**  
```js
chart.children((d) => d.kids);
```
<a name="module_TreeChart.TreeChart+value"></a>

### treeChart.value([fn]) ⇒ <code>function</code>
Gets or sets the accessor summed bottom-up into each node's `.value`
(and, via `radiusFromValue`, its sphere radius) — forwarded to
`layout.tree`'s `value` option. Defaults to `layout.tree`'s own default
(`(d) => d.value`).

**Kind**: instance method of [<code>TreeChart</code>](#module_TreeChart.TreeChart)  
**Throws**:

- <code>TypeError</code> If `fn` is given and isn't a function.


| Param | Type |
| --- | --- |
| [fn] | <code>function</code> | 

**Example**  
```js
chart.value((d) => d.size);
```
<a name="module_TreeChart.TreeChart+sortChildren"></a>

### treeChart.sortChildren([fn]) ⇒ <code>function</code>
Gets or sets the comparator ordering each node's children — forwarded to
`layout.tree`'s `sort` option. Named distinctly from `GraphChart.sort()`
(inert here, per the class doc) since it orders sibling nodes within the
hierarchy, not this chart's flat data array.

**Kind**: instance method of [<code>TreeChart</code>](#module_TreeChart.TreeChart)  
**Throws**:

- <code>TypeError</code> If `fn` is given and isn't a function.


| Param | Type |
| --- | --- |
| [fn] | <code>function</code> | 

**Example**  
```js
chart.sortChildren((a, b) => b.value - a.value);
```
<a name="module_TreeChart.TreeChart+levelHeight"></a>

### treeChart.levelHeight([value]) ⇒ <code>number</code> \| <code>undefined</code> \| <code>this</code>
Gets or sets the world-unit drop per depth level — forwarded to
`layout.tree`'s `levelHeight` option.

**Kind**: instance method of [<code>TreeChart</code>](#module_TreeChart.TreeChart)  
**Throws**:

- <code>TypeError</code> If `value` is given and isn't a finite number.


| Param | Type |
| --- | --- |
| [value] | <code>number</code> | 

**Example**  
```js
chart.levelHeight(2);
```
<a name="module_TreeChart.TreeChart+levelRadius"></a>

### treeChart.levelRadius([value]) ⇒ <code>number</code> \| <code>undefined</code> \| <code>this</code>
Gets or sets the world-unit ring radius per depth level — forwarded to
`layout.tree`'s `levelRadius` option.

**Kind**: instance method of [<code>TreeChart</code>](#module_TreeChart.TreeChart)  
**Throws**:

- <code>TypeError</code> If `value` is given and isn't a finite number.


| Param | Type |
| --- | --- |
| [value] | <code>number</code> | 

**Example**  
```js
chart.levelRadius(2);
```
<a name="module_TreeChart.TreeChart+selection"></a>

### treeChart.selection() ⇒ <code>Selection</code>
The live `Selection` over every rendered node — overrides
`GraphChart.selection()` (whose private per-datum backend `TreeChart`
never populates, since it overrides `render()`/`update()` entirely) so
`.color()` has something real to write to.

**Kind**: instance method of [<code>TreeChart</code>](#module_TreeChart.TreeChart)  
**Example**  
```js
chart.selection().filter((d) => d.depth === 0).attr('color', 'gold');
```
<a name="module_TreeChart.TreeChart+render"></a>

### treeChart.render() ⇒ <code>this</code>
First call materializes node spheres and edge lines; every later call
routes to `update()`.

**Kind**: instance method of [<code>TreeChart</code>](#module_TreeChart.TreeChart)  
**Throws**:

- <code>Error</code> If `data(datum)` was never called before this render.

**See**: GraphChart#render  
<a name="module_TreeChart.TreeChart+update"></a>

### treeChart.update() ⇒ <code>this</code>
Recomputes the hierarchy layout from the latest `data()`/`children()`/
`value()`/`sortChildren()` and rebuilds the node/edge render backend to
match the current node/link counts.

**Kind**: instance method of [<code>TreeChart</code>](#module_TreeChart.TreeChart)  
**Throws**:

- <code>Error</code> If `render()` hasn't successfully run yet.

**See**: GraphChart#update  
<a name="module_TreeChart.TreeChart+destroy"></a>

### treeChart.destroy() ⇒ <code>void</code>
Disposes every node/edge render object, then defers to
`GraphChart.destroy()`. Idempotent.

**Kind**: instance method of [<code>TreeChart</code>](#module_TreeChart.TreeChart)  
**See**: GraphChart#destroy  
