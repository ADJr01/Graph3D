# VolumeChart

<a name="module_VolumeChart.VolumeChart"></a>

## VolumeChart
`GraphChart` specialized for ray-marched scalar-field volumes (Prompt
139's "opt-in heavier shader"). The scalar field comes from `.values(fn)`
— a `(x, y, z) => number` sampling function, mirroring `SurfaceChart`'s
own `.values((x, z) => number)` — sampled onto a `.resolution()`^3 grid at
`render()`/`update()` time and uploaded as a 3D texture. Like
`SurfaceChart`, there's no per-datum concept a bar/point/line/area chart
has, so `GraphChart`'s inherited `x()`/`y()`/`z()`/`data()`/`color()`/
`size()`/`shape()`/`filter()`/`sort()`/`on()`/`selection()`/`material()`
are all inert (documented explicitly, same precedent as `SurfaceChart`'s
inert fields) — `.material()` specifically is inert because this chart's
rendering *is* `material.volumeRaymarch(...)`, always, built from this
chart's own sampled data, not a user-selectable generic preset the way
`SurfaceChart.material()` genuinely is. `.opacity(value)` is overridden
with different semantics than `GraphChart`'s inherited per-datum accessor:
a single global alpha multiplier (a plain number, no per-datum concept
applies to one continuous volume).

Renders as a single unit cube spanning `.xDomain()`/`.yDomain()`/
`.zDomain()`, materialized via `GraphObjectFactory.createTriangleMesh`
(the same "raw triangulated-mesh buffers into one continuous `GraphMesh`"
factory `AreaChart`/`SurfaceChart`/`PieChart` already use) from a
hand-built unit-cube buffer rather than `GraphObjectFactory.createBars`'s
default `BoxGeometry` — `createBars`/`createMesh` clone whatever material
they're given, which would silently orphan `material.volumeRaymarch`'s
real density/palette textures behind a disposed-but-inert clone (see
`buildUnitCubeBuffers`'s own doc). Textured with `material.volumeRaymarch`
(`material/presets/volumeRaymarch.js`) — a `THREE.ShaderMaterial` that
ray-marches the sampled density texture from the camera, through the
cube, accumulating front-to-back alpha-composited color from `.palette()`
(defaults to `palette.viridis`, matching every other Phase 8 chart's own
uncolored-fallback convention).

Sampled values are normalized to `[0, 1]` across their own `[min, max]`
before upload (CLAUDE.md §1.1 DRY — same min-max-normalize idea
`applyColorField` already uses for `.color()`, inlined here since there's
no per-datum `Selection` to route it through).

**Kind**: static class of [<code>VolumeChart</code>](#module_VolumeChart)  

* [.VolumeChart](#module_VolumeChart.VolumeChart)
    * [new exports.VolumeChart(scene)](#new_module_VolumeChart.VolumeChart_new)
    * [.values([fn])](#module_VolumeChart.VolumeChart+values) ⇒ <code>function</code>
    * [.xDomain([domain])](#module_VolumeChart.VolumeChart+xDomain) ⇒ <code>\*</code>
    * [.yDomain([domain])](#module_VolumeChart.VolumeChart+yDomain) ⇒ <code>\*</code>
    * [.zDomain([domain])](#module_VolumeChart.VolumeChart+zDomain) ⇒ <code>\*</code>
    * [.resolution([value])](#module_VolumeChart.VolumeChart+resolution) ⇒ <code>number</code> \| <code>this</code>
    * [.steps([value])](#module_VolumeChart.VolumeChart+steps) ⇒ <code>number</code> \| <code>this</code>
    * [.densityScale([value])](#module_VolumeChart.VolumeChart+densityScale) ⇒ <code>number</code> \| <code>this</code>
    * [.opacity([value])](#module_VolumeChart.VolumeChart+opacity) ⇒ <code>number</code> \| <code>this</code>
    * [.palette([fn])](#module_VolumeChart.VolumeChart+palette) ⇒ <code>function</code>
    * [.render()](#module_VolumeChart.VolumeChart+render) ⇒ <code>this</code>
    * [.update()](#module_VolumeChart.VolumeChart+update) ⇒ <code>this</code>
    * [.destroy()](#module_VolumeChart.VolumeChart+destroy) ⇒ <code>void</code>

<a name="new_module_VolumeChart.VolumeChart_new"></a>

### new exports.VolumeChart(scene)
**Throws**:

- <code>TypeError</code> If `scene` is falsy.


| Param | Type | Description |
| --- | --- | --- |
| scene | <code>object</code> | The raw `THREE.Scene` this chart will attach to. |

**Example**  
```js
new VolumeChart(scene)
  .values((x, y, z) => Math.exp(-(x * x + y * y + z * z)))
  .xDomain([-2, 2]).yDomain([-2, 2]).zDomain([-2, 2])
  .resolution(48)
  .steps(96)
  .render();
```
<a name="module_VolumeChart.VolumeChart+values"></a>

### volumeChart.values([fn]) ⇒ <code>function</code>
Gets or sets the scalar-field sampling function, called at
`render()`/`update()` time for every grid cell.

**Kind**: instance method of [<code>VolumeChart</code>](#module_VolumeChart.VolumeChart)  
**Throws**:

- <code>TypeError</code> If `fn` is given and isn't a function.


| Param | Type |
| --- | --- |
| [fn] | <code>function</code> | 

**Example**  
```js
chart.values((x, y, z) => Math.exp(-(x * x + y * y + z * z)));
```
<a name="module_VolumeChart.VolumeChart+xDomain"></a>

### volumeChart.xDomain([domain]) ⇒ <code>\*</code>
Gets or sets the world-space `[min, max]` range sampled along x.

**Kind**: instance method of [<code>VolumeChart</code>](#module_VolumeChart.VolumeChart)  
**Throws**:

- <code>TypeError</code> If `domain` is given and isn't a `[min, max]` array of finite numbers with `min < max`.


| Param | Type |
| --- | --- |
| [domain] | <code>\*</code> | 

**Example**  
```js
chart.xDomain([-2, 2]);
```
<a name="module_VolumeChart.VolumeChart+yDomain"></a>

### volumeChart.yDomain([domain]) ⇒ <code>\*</code>
Gets or sets the world-space `[min, max]` range sampled along y.

**Kind**: instance method of [<code>VolumeChart</code>](#module_VolumeChart.VolumeChart)  
**Throws**:

- <code>TypeError</code> If `domain` is given and isn't a `[min, max]` array of finite numbers with `min < max`.


| Param | Type |
| --- | --- |
| [domain] | <code>\*</code> | 

**Example**  
```js
chart.yDomain([-2, 2]);
```
<a name="module_VolumeChart.VolumeChart+zDomain"></a>

### volumeChart.zDomain([domain]) ⇒ <code>\*</code>
Gets or sets the world-space `[min, max]` range sampled along z.

**Kind**: instance method of [<code>VolumeChart</code>](#module_VolumeChart.VolumeChart)  
**Throws**:

- <code>TypeError</code> If `domain` is given and isn't a `[min, max]` array of finite numbers with `min < max`.


| Param | Type |
| --- | --- |
| [domain] | <code>\*</code> | 

**Example**  
```js
chart.zDomain([-2, 2]);
```
<a name="module_VolumeChart.VolumeChart+resolution"></a>

### volumeChart.resolution([value]) ⇒ <code>number</code> \| <code>this</code>
Gets or sets the grid resolution sampled per axis (`resolution ** 3`
total samples).

**Kind**: instance method of [<code>VolumeChart</code>](#module_VolumeChart.VolumeChart)  
**Throws**:

- <code>TypeError</code> If `value` is given and isn't a positive integer.


| Param | Type |
| --- | --- |
| [value] | <code>number</code> | 

**Example**  
```js
chart.resolution(48);
```
<a name="module_VolumeChart.VolumeChart+steps"></a>

### volumeChart.steps([value]) ⇒ <code>number</code> \| <code>this</code>
Gets or sets the ray-march step count — forwarded to
`material.volumeRaymarch`'s own `steps` option (which enforces the
compiled `1..256` ceiling; CLAUDE.md §1.1 DRY, not duplicated here).

**Kind**: instance method of [<code>VolumeChart</code>](#module_VolumeChart.VolumeChart)  
**Throws**:

- <code>TypeError</code> If `value` is given and isn't a positive integer.


| Param | Type |
| --- | --- |
| [value] | <code>number</code> | 

**Example**  
```js
chart.steps(96);
```
<a name="module_VolumeChart.VolumeChart+densityScale"></a>

### volumeChart.densityScale([value]) ⇒ <code>number</code> \| <code>this</code>
Gets or sets a multiplier applied to each sampled (already `[0, 1]`-
normalized) density before it drives color/alpha — boosts a sparse
field's apparent opacity without changing `.opacity()`'s global fade.

**Kind**: instance method of [<code>VolumeChart</code>](#module_VolumeChart.VolumeChart)  
**Throws**:

- <code>TypeError</code> If `value` is given and isn't a finite number.


| Param | Type |
| --- | --- |
| [value] | <code>number</code> | 

**Example**  
```js
chart.densityScale(2);
```
<a name="module_VolumeChart.VolumeChart+opacity"></a>

### volumeChart.opacity([value]) ⇒ <code>number</code> \| <code>this</code>
Gets or sets a global alpha multiplier applied to the whole volume.
Overrides `GraphChart.opacity()` (a per-datum constant-or-accessor) with
a plain number: one continuous volume has no per-datum concept for it
to accessor-ize.

**Kind**: instance method of [<code>VolumeChart</code>](#module_VolumeChart.VolumeChart)  
**Throws**:

- <code>TypeError</code> If `value` is given and isn't a finite number.


| Param | Type |
| --- | --- |
| [value] | <code>number</code> | 

**Example**  
```js
chart.opacity(0.7);
```
<a name="module_VolumeChart.VolumeChart+palette"></a>

### volumeChart.palette([fn]) ⇒ <code>function</code>
Gets or sets the color ramp sampled densities are looked up through.
Defaults to `palette.viridis`, matching every other Phase 8 chart's own
uncolored fallback.

**Kind**: instance method of [<code>VolumeChart</code>](#module_VolumeChart.VolumeChart)  
**Throws**:

- <code>TypeError</code> If `fn` is given and isn't a function.


| Param | Type |
| --- | --- |
| [fn] | <code>function</code> | 

**Example**  
```js
chart.palette(palette.plasma);
```
<a name="module_VolumeChart.VolumeChart+render"></a>

### volumeChart.render() ⇒ <code>this</code>
First call materializes the volume cube; every later call routes to
`update()`.

**Kind**: instance method of [<code>VolumeChart</code>](#module_VolumeChart.VolumeChart)  
**Throws**:

- <code>Error</code> If `values(fn)` was never called before this render.

**See**: GraphChart#render  
<a name="module_VolumeChart.VolumeChart+update"></a>

### volumeChart.update() ⇒ <code>this</code>
Re-samples the scalar field from the latest `.values()`/domains/
`.resolution()` and rebuilds the volume cube to match.

**Kind**: instance method of [<code>VolumeChart</code>](#module_VolumeChart.VolumeChart)  
**Throws**:

- <code>Error</code> If `render()` hasn't successfully run yet.

**See**: GraphChart#update  
<a name="module_VolumeChart.VolumeChart+destroy"></a>

### volumeChart.destroy() ⇒ <code>void</code>
Disposes the live volume mesh (and its `volumeRaymarch` material, whose
`dispose()` frees its density/palette textures), then defers to
`GraphChart.destroy()`. Idempotent.

**Kind**: instance method of [<code>VolumeChart</code>](#module_VolumeChart.VolumeChart)  
**See**: GraphChart#destroy  
