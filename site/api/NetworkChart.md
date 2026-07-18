# NetworkChart

<a name="module_NetworkChart.NetworkChart"></a>

## NetworkChart
`GraphChart` specialized for node-link network graphs (Prompt 137). Node
positions come from `layout.force()` — a live physics simulation, not an
accessor+scale computation — so, like `LineChart`/`SurfaceChart`,
`NetworkChart` overrides `data()`/`render()`/`update()`/`destroy()`
entirely rather than building on `GraphChart`'s per-datum pipeline.
`GraphChart`'s inherited `x()`/`y()`/`z()`/`shape()`/`filter()`/`sort()`/
`on()` are inert here (positions/membership are driven by the simulation
and `.links()`, not those accessors); `.color()`/`.opacity()`/`.visible()`
still work, via the same `applyColorField`/`applyOpacityField`/
`applyVisibleField`/`resolveChartMaterial` helpers every other chart type
uses (CLAUDE.md §1.1 DRY) — `.selection()` is overridden to expose a real
`Selection` over the node backend so they have something to write to.
`.size(fn)` (Prompt 141) multiplies each node's rendered radius by a
per-datum factor — nodes have no other source of scale (`#buildBackend`
never calls `setScale`/`setInstanceScale` itself), so the base scale
`applySizeField` reads and multiplies is always the sphere's own default.

Nodes render as spheres (`GraphObjectFactory.createNodes`, instanced
above `INSTANCING_THRESHOLD`); edges render as one `GraphLine` (a `Line2`,
`object/GraphLine.js`) per link, reused as-is rather than built through
the instanced N-datum path — same reasoning `LineChart`/`SurfaceChart`'s
contour overlay already established for continuous paths.

The simulation doesn't run itself (CLAUDE.md §2: no internal
`requestAnimationFrame`) — call `.tick()` once per frame from your own
`loop.add(cb)` callback; it auto-pauses (becomes a no-op) once
`layout.force()`'s own `alpha` decays below `alphaMin`, per Prompt 137's
"auto-pause on stability".

**Kind**: static class of [<code>NetworkChart</code>](#module_NetworkChart)  

* [.NetworkChart](#module_NetworkChart.NetworkChart)
    * [new exports.NetworkChart(scene)](#new_module_NetworkChart.NetworkChart_new)
    * [.data([arr])](#module_NetworkChart.NetworkChart+data) ⇒ <code>Array</code> \| <code>this</code>
    * [.links([arr])](#module_NetworkChart.NetworkChart+links) ⇒ <code>Array</code> \| <code>this</code>
    * [.linkDistance([value])](#module_NetworkChart.NetworkChart+linkDistance) ⇒ <code>function</code>
    * [.cluster([keyFn], [strength])](#module_NetworkChart.NetworkChart+cluster) ⇒ <code>function</code>
    * [.pin(node, [position])](#module_NetworkChart.NetworkChart+pin) ⇒ <code>this</code>
    * [.unpin(node)](#module_NetworkChart.NetworkChart+unpin) ⇒ <code>this</code>
    * [.selection()](#module_NetworkChart.NetworkChart+selection) ⇒ <code>Selection</code>
    * [.render()](#module_NetworkChart.NetworkChart+render) ⇒ <code>this</code>
    * [.update()](#module_NetworkChart.NetworkChart+update) ⇒ <code>this</code>
    * [.tick()](#module_NetworkChart.NetworkChart+tick) ⇒ <code>boolean</code>
    * [.destroy()](#module_NetworkChart.NetworkChart+destroy) ⇒ <code>void</code>

<a name="new_module_NetworkChart.NetworkChart_new"></a>

### new exports.NetworkChart(scene)
**Throws**:

- <code>TypeError</code> If `scene` is falsy.


| Param | Type | Description |
| --- | --- | --- |
| scene | <code>object</code> | The raw `THREE.Scene` this chart will attach to. |

**Example**  
```js
new NetworkChart(scene)
  .data(nodes)
  .links(links)
  .linkDistance(2)
  .color((d) => d.group, palette.category10)
  .render();
loop.add(() => chart.tick());
```
<a name="module_NetworkChart.NetworkChart+data"></a>

### networkChart.data([arr]) ⇒ <code>Array</code> \| <code>this</code>
Gets or sets the node array — one entry per simulated node. Unlike
`GraphChart.data()`, this doesn't join against a per-datum `Selection`
backend (see the class doc) — no-arg reads, one-arg writes and chains.
Node identity is by object reference: passing the same node objects
across calls preserves their simulated `x`/`y`/`z`/velocity
(`layout.force().nodes()` only seeds missing fields); passing new
objects scatters them fresh.

**Kind**: instance method of [<code>NetworkChart</code>](#module_NetworkChart.NetworkChart)  
**Throws**:

- <code>TypeError</code> If `arr` is given and isn't an array.


| Param | Type |
| --- | --- |
| [arr] | <code>Array</code> | 

**Example**  
```js
chart.data(nodes).links(links).render();
```
<a name="module_NetworkChart.NetworkChart+links"></a>

### networkChart.links([arr]) ⇒ <code>Array</code> \| <code>this</code>
Gets or sets the link array — `{source, target}` pairs, each either an
index into `data()` or a direct node-object reference (same convention
as `layout.force.link`, which this passes straight through to).

**Kind**: instance method of [<code>NetworkChart</code>](#module_NetworkChart.NetworkChart)  
**Throws**:

- <code>TypeError</code> If `arr` is given and isn't an array.


| Param | Type |
| --- | --- |
| [arr] | <code>Object</code> | 

**Example**  
```js
chart.links([{ source: 0, target: 1 }, { source: 1, target: 2 }]);
```
<a name="module_NetworkChart.NetworkChart+linkDistance"></a>

### networkChart.linkDistance([value]) ⇒ <code>function</code>
Gets or sets each link's rest length — forwarded to `layout.force.link`'s
`distance` option (CLAUDE.md §1.1 DRY, no reimplemented spring math here).

**Kind**: instance method of [<code>NetworkChart</code>](#module_NetworkChart.NetworkChart)  
**Throws**:

- <code>TypeError</code> If `value` is given and isn't a number or function.


| Param | Type |
| --- | --- |
| [value] | <code>function</code> | 

**Example**  
```js
chart.linkDistance(2);
```
<a name="module_NetworkChart.NetworkChart+cluster"></a>

### networkChart.cluster([keyFn], [strength]) ⇒ <code>function</code>
Gets or sets the node grouping key pulling same-group nodes toward a
shared centroid (`layout.force.cluster`, CLAUDE.md §1.1 DRY). Pass
`null` to remove clustering.

**Kind**: instance method of [<code>NetworkChart</code>](#module_NetworkChart.NetworkChart)  
**Throws**:

- <code>TypeError</code> If `keyFn` is given and isn't a function or `null`.


| Param | Type | Description |
| --- | --- | --- |
| [keyFn] | <code>function</code> |  |
| [strength] | <code>number</code> | Forwarded to `layout.force.cluster`. Default `0.3`. |

**Example**  
```js
chart.cluster((d) => d.group);
```
<a name="module_NetworkChart.NetworkChart+pin"></a>

### networkChart.pin(node, [position]) ⇒ <code>this</code>
Fixes `node` in place — sets `fx`/`fy`/`fz` to `position` (default: the
node's current `x`/`y`/`z`), which `layout.force()`'s own `tick()`
already special-cases (a pinned node's simulated position snaps to
`fx`/`fy`/`fz` every tick, ignoring forces on that axis — CLAUDE.md
§1.1 DRY, no second pinning mechanism here). Wakes an auto-paused
simulation back up, since pinning changes the layout.

**Kind**: instance method of [<code>NetworkChart</code>](#module_NetworkChart.NetworkChart)  
**Throws**:

- <code>TypeError</code> If `node` isn't an object.


| Param | Type | Description |
| --- | --- | --- |
| node | <code>object</code> | A node from `data()`. |
| [position] | <code>Object</code> |  |

**Example**  
```js
chart.pin(draggedNode, { x: 3, y: 0, z: -2 });
```
<a name="module_NetworkChart.NetworkChart+unpin"></a>

### networkChart.unpin(node) ⇒ <code>this</code>
Releases a node previously fixed via `.pin()`, letting forces move it
again. Wakes an auto-paused simulation back up.

**Kind**: instance method of [<code>NetworkChart</code>](#module_NetworkChart.NetworkChart)  
**Throws**:

- <code>TypeError</code> If `node` isn't an object.


| Param | Type | Description |
| --- | --- | --- |
| node | <code>object</code> | A node from `data()`. |

**Example**  
```js
chart.unpin(draggedNode);
```
<a name="module_NetworkChart.NetworkChart+selection"></a>

### networkChart.selection() ⇒ <code>Selection</code>
The live `Selection` over every rendered node — overrides
`GraphChart.selection()` (whose private per-datum backend `NetworkChart`
never populates, since it overrides `render()`/`update()` entirely) so
`.color()` has something real to write to.

**Kind**: instance method of [<code>NetworkChart</code>](#module_NetworkChart.NetworkChart)  
**Example**  
```js
chart.selection().filter((d) => d.flagged).attr('color', 'crimson');
```
<a name="module_NetworkChart.NetworkChart+render"></a>

### networkChart.render() ⇒ <code>this</code>
First call materializes node spheres and edge lines and starts the
simulation; every later call routes to `update()`.

**Kind**: instance method of [<code>NetworkChart</code>](#module_NetworkChart.NetworkChart)  
**Throws**:

- <code>Error</code> If `data(arr)` was never called before this render.

**See**: GraphChart#render  
<a name="module_NetworkChart.NetworkChart+update"></a>

### networkChart.update() ⇒ <code>this</code>
Re-seeds the simulation from the latest `data()`/`links()` (preserving
existing nodes' simulated position/velocity — see `.data()`'s note) and
rebuilds the node/edge render backend to match the current counts.

**Kind**: instance method of [<code>NetworkChart</code>](#module_NetworkChart.NetworkChart)  
**Throws**:

- <code>Error</code> If `render()` hasn't successfully run yet.

**See**: GraphChart#update  
<a name="module_NetworkChart.NetworkChart+tick"></a>

### networkChart.tick() ⇒ <code>boolean</code>
Advances the simulation by one step and writes the result into the
node/edge render backend — call once per frame (e.g. from `loop.add`).
A no-op once the simulation has auto-paused (Prompt 137's "auto-pause on
stability", `layout.force()`'s own `active()`/`alpha` mechanism —
CLAUDE.md §1.1 DRY, not reimplemented here).

**Kind**: instance method of [<code>NetworkChart</code>](#module_NetworkChart.NetworkChart)  
**Returns**: <code>boolean</code> - Whether the simulation actually advanced.  
**Throws**:

- <code>Error</code> If `render()` hasn't successfully run yet.

**Example**  
```js
loop.add(() => chart.tick());
```
<a name="module_NetworkChart.NetworkChart+destroy"></a>

### networkChart.destroy() ⇒ <code>void</code>
Disposes every node/edge render object, then defers to
`GraphChart.destroy()`. Idempotent.

**Kind**: instance method of [<code>NetworkChart</code>](#module_NetworkChart.NetworkChart)  
**See**: GraphChart#destroy  
