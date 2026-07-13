# PackChart

<a name="module_PackChart.PackChart"></a>

## PackChart
`GraphChart` specialized for nested-sphere hierarchies (Prompt 138). Node
positions come from `layout.pack()` — a one-shot sphere-packing layout, not
a live simulation and not an accessor+scale computation — so, like
`TreeChart`/`NetworkChart`, `PackChart` overrides `data()`/`render()`/
`update()`/`destroy()` entirely rather than building on `GraphChart`'s
per-datum pipeline. `GraphChart`'s inherited `x()`/`y()`/`z()`/`shape()`/
`filter()`/`sort()`/`on()` are inert here (position/membership come from
`layout.pack()` and `.children()` instead); `.color()`/`.opacity()`/
`.visible()` still work, via the same `applyColorField`/`applyOpacityField`/
`applyVisibleField`/`resolveChartMaterial` helpers every other chart type
uses (CLAUDE.md §1.1 DRY) — `.selection()` is overridden to expose a real
`Selection` over the node backend so they have something to write to.
`.color()`'s accessor receives each hierarchy node itself (not the raw
datum), so `(d) => d.depth`/`(d) => d.value`/`(d) => d.data.someField` all
work.
ponytail: `.material()` defaults to the same opaque `material.standard()`
every other chart uses — but an opaque root sphere fully hides every
nested child from any outside view. Pass `.material('standard', {
transparent: true, opacity: <0.5ish> })` for a legible pack; see
skipping_list.md's "PackChart's default material is opaque" entry.
ponytail: `.size(fn)` (Prompt 141) multiplies each node's already-packed
radius by a per-datum factor — unlike every other chart this applies to,
growing a node here can make it overlap its siblings, since `layout.pack()`
only guarantees non-overlap for the *unmultiplied* radii it actually
packed against. A deliberate tradeoff (the same shared, DRY `.size()`
mechanism every chart gets, not a pack-specific carve-out) — keep any
`.size()` multiplier modest, or pair it with extra `.padding()`.

Every node (root, internal, and leaf) renders as a sphere
(`GraphObjectFactory.createNodes`, instanced above `INSTANCING_THRESHOLD`),
sized and positioned by `.r`/`.x`/`.y`/`.z` (`layout.pack()`'s own
collision-free nesting — see `chart/hierarchyField.js`'s
`nodeScaleForRadius`, which converts a node's world-unit `.r` into the
exact scale factor that renders it at that radius, matching the space
`layout.pack()` actually reserved for it). Unlike `TreeChart`, there are no
edges — nesting itself conveys parent-child structure, the 3D analogue of
d3.pack's nested circles.

There is no simulation to step — `layout.pack()` is deterministic (it runs
its own internal force-relaxation synchronously inside `.compute()`), so
there's no `.tick()` here.

**Kind**: static class of [<code>PackChart</code>](#module_PackChart)  

* [.PackChart](#module_PackChart.PackChart)
    * [new exports.PackChart(scene)](#new_module_PackChart.PackChart_new)
    * [.data([datum])](#module_PackChart.PackChart+data) ⇒ <code>object</code> \| <code>this</code>
    * [.children([fn])](#module_PackChart.PackChart+children) ⇒ <code>function</code>
    * [.value([fn])](#module_PackChart.PackChart+value) ⇒ <code>function</code>
    * [.sortChildren([fn])](#module_PackChart.PackChart+sortChildren) ⇒ <code>function</code>
    * [.padding([value])](#module_PackChart.PackChart+padding) ⇒ <code>number</code> \| <code>undefined</code> \| <code>this</code>
    * [.selection()](#module_PackChart.PackChart+selection) ⇒ <code>Selection</code>
    * [.render()](#module_PackChart.PackChart+render) ⇒ <code>this</code>
    * [.update()](#module_PackChart.PackChart+update) ⇒ <code>this</code>
    * [.destroy()](#module_PackChart.PackChart+destroy) ⇒ <code>void</code>

<a name="new_module_PackChart.PackChart_new"></a>

### new exports.PackChart(scene)
**Throws**:

- <code>TypeError</code> If `scene` is falsy.


| Param | Type | Description |
| --- | --- | --- |
| scene | <code>object</code> | The raw `THREE.Scene` this chart will attach to. |

**Example**  
```js
new PackChart(scene)
  .data({ name: 'root', children: [{ name: 'a', value: 3 }, { name: 'b', value: 5 }] })
  .padding(0.1)
  .color((d) => d.depth, palette.viridis)
  .render();
```
<a name="module_PackChart.PackChart+data"></a>

### packChart.data([datum]) ⇒ <code>object</code> \| <code>this</code>
Gets or sets the root datum this chart renders as a hierarchy. Unlike
`GraphChart.data()`, this is a single object (a tree root), not an array
— no-arg reads, one-arg writes and chains.

**Kind**: instance method of [<code>PackChart</code>](#module_PackChart.PackChart)  
**Throws**:

- <code>TypeError</code> If `datum` is given and isn't a non-null object.


| Param | Type |
| --- | --- |
| [datum] | <code>object</code> | 

**Example**  
```js
chart.data({ name: 'root', children: [{ name: 'leaf', value: 1 }] });
```
<a name="module_PackChart.PackChart+children"></a>

### packChart.children([fn]) ⇒ <code>function</code>
Gets or sets the accessor resolving a datum's child data — forwarded to
`layout.pack`'s `children` option (CLAUDE.md §1.1 DRY, no second
hierarchy-walk here). Defaults to `layout.pack`'s own default (`(d) => d.children`).

**Kind**: instance method of [<code>PackChart</code>](#module_PackChart.PackChart)  
**Throws**:

- <code>TypeError</code> If `fn` is given and isn't a function.


| Param | Type |
| --- | --- |
| [fn] | <code>function</code> | 

**Example**  
```js
chart.children((d) => d.kids);
```
<a name="module_PackChart.PackChart+value"></a>

### packChart.value([fn]) ⇒ <code>function</code>
Gets or sets the accessor summed bottom-up into each node's `.value`
(and, via `radiusFromValue`, its sphere radius) — forwarded to
`layout.pack`'s `value` option. Defaults to `layout.pack`'s own default
(`(d) => d.value`).

**Kind**: instance method of [<code>PackChart</code>](#module_PackChart.PackChart)  
**Throws**:

- <code>TypeError</code> If `fn` is given and isn't a function.


| Param | Type |
| --- | --- |
| [fn] | <code>function</code> | 

**Example**  
```js
chart.value((d) => d.size);
```
<a name="module_PackChart.PackChart+sortChildren"></a>

### packChart.sortChildren([fn]) ⇒ <code>function</code>
Gets or sets the comparator ordering each node's children — forwarded to
`layout.pack`'s `sort` option. Named distinctly from `GraphChart.sort()`
(inert here, per the class doc) since it orders sibling nodes within the
hierarchy, not this chart's flat data array.

**Kind**: instance method of [<code>PackChart</code>](#module_PackChart.PackChart)  
**Throws**:

- <code>TypeError</code> If `fn` is given and isn't a function.


| Param | Type |
| --- | --- |
| [fn] | <code>function</code> | 

**Example**  
```js
chart.sortChildren((a, b) => b.value - a.value);
```
<a name="module_PackChart.PackChart+padding"></a>

### packChart.padding([value]) ⇒ <code>number</code> \| <code>undefined</code> \| <code>this</code>
Gets or sets the extra world-unit gap enforced between sibling spheres
and between a child and its parent's enclosing surface — forwarded to
`layout.pack`'s `padding` option.

**Kind**: instance method of [<code>PackChart</code>](#module_PackChart.PackChart)  
**Throws**:

- <code>TypeError</code> If `value` is given and isn't a finite number.


| Param | Type |
| --- | --- |
| [value] | <code>number</code> | 

**Example**  
```js
chart.padding(0.2);
```
<a name="module_PackChart.PackChart+selection"></a>

### packChart.selection() ⇒ <code>Selection</code>
The live `Selection` over every rendered node — overrides
`GraphChart.selection()` (whose private per-datum backend `PackChart`
never populates, since it overrides `render()`/`update()` entirely) so
`.color()` has something real to write to.

**Kind**: instance method of [<code>PackChart</code>](#module_PackChart.PackChart)  
**Example**  
```js
chart.selection().filter((d) => d.depth === 0).attr('color', 'gold');
```
<a name="module_PackChart.PackChart+render"></a>

### packChart.render() ⇒ <code>this</code>
First call materializes node spheres; every later call routes to
`update()`.

**Kind**: instance method of [<code>PackChart</code>](#module_PackChart.PackChart)  
**Throws**:

- <code>Error</code> If `data(datum)` was never called before this render.

**See**: GraphChart#render  
<a name="module_PackChart.PackChart+update"></a>

### packChart.update() ⇒ <code>this</code>
Recomputes the hierarchy layout from the latest `data()`/`children()`/
`value()`/`sortChildren()`/`padding()` and rebuilds the node render
backend to match the current node count.

**Kind**: instance method of [<code>PackChart</code>](#module_PackChart.PackChart)  
**Throws**:

- <code>Error</code> If `render()` hasn't successfully run yet.

**See**: GraphChart#update  
<a name="module_PackChart.PackChart+destroy"></a>

### packChart.destroy() ⇒ <code>void</code>
Disposes every node render object, then defers to `GraphChart.destroy()`.
Idempotent.

**Kind**: instance method of [<code>PackChart</code>](#module_PackChart.PackChart)  
**See**: GraphChart#destroy  
