# Picker

<a name="module_Picker.Picker"></a>

## Picker
Centralized hit-testing across every chart registered with it: casts one
ray per `pickAt(x, y)` call and returns the closest hit across all
registered charts. Dispatches per chart on its live backend's own shape
(`Selection.backend`, Prompt 134's escape hatch) rather than re-deriving a
second spatial index — the octree-accelerated
`GraphInstancedObject.pickDetailed()` (Prompt 147) for an instanced
backend, a plain `THREE.Raycaster.intersectObjects` for the low-count
meshes backend (mirrors `ScatterChart.pick()`/`PieChart.pick()`, Prompts
134/139, generalized to work for any chart type without a per-type
`.pick()` override — most chart types don't have one).

Repeated `pickAt()` calls at the exact same `(x, y)` within the same
rendered frame reuse the cached result instead of re-raycasting every
registered chart — cheap for a hover-highlight loop that reads the
current pick more than once per frame. The cache is invalidated by the
next `loop` (Prompt 20's shared RAF manager) frame — never a second
`requestAnimationFrame` (CLAUDE.md §2 anti-patterns table).

A registered chart with `chart.pickingEnabled(false)` (Prompt 156) is
skipped entirely — never raycast, never a candidate for the closest hit —
for a static "backdrop" chart nobody interacts with.

**Kind**: static class of [<code>Picker</code>](#module_Picker)  

* [.Picker](#module_Picker.Picker)
    * [new exports.Picker(options)](#new_module_Picker.Picker_new)
    * [.camera](#module_Picker.Picker+camera) ⇒ <code>THREE.Camera</code>
    * [.domElement](#module_Picker.Picker+domElement) ⇒ <code>Object</code>
    * [.register(chart)](#module_Picker.Picker+register) ⇒ <code>this</code>
    * [.unregister(chart)](#module_Picker.Picker+unregister) ⇒ <code>this</code>
    * [.pickAt(x, y)](#module_Picker.Picker+pickAt) ⇒ <code>Object</code>
    * [.dispose()](#module_Picker.Picker+dispose)

<a name="new_module_Picker.Picker_new"></a>

### new exports.Picker(options)
**Throws**:

- <code>TypeError</code> If `camera` is not a `THREE.Camera`, or `domElement` is falsy.


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

**Example**  
```js
const picker = new Picker({ camera: scene.camera.three, domElement: canvas });
picker.register(barChart).register(scatterChart);
canvas.addEventListener('pointermove', (event) => {
  const hit = picker.pickAt(event.offsetX, event.offsetY);
  if (hit) console.log(hit.chart, hit.datum);
});
```
<a name="module_Picker.Picker+camera"></a>

### picker.camera ⇒ <code>THREE.Camera</code>
The camera this picker rays against — exposed so `PointerRouter`
(Prompt 154) can unproject a drag gesture's pointer position through the
same camera, rather than requiring a second copy passed to its own
constructor (CLAUDE.md §1.1 DRY — one source of truth for "which camera
this interaction session uses").

**Kind**: instance property of [<code>Picker</code>](#module_Picker.Picker)  
**Example**  
```js
picker.camera.position;
```
<a name="module_Picker.Picker+domElement"></a>

### picker.domElement ⇒ <code>Object</code>
The canvas-shaped element `pickAt(x, y)` treats `x`/`y` as pixel
coordinates within — exposed for the identical reason `camera` is: so
`PointerRouter`'s drag gesture (Prompt 154) can compute NDC coordinates
against the same `width`/`height` `pickAt()` itself uses, without a
second copy passed to its own constructor.

**Kind**: instance property of [<code>Picker</code>](#module_Picker.Picker)  
**Example**  
```js
picker.domElement.width;
```
<a name="module_Picker.Picker+register"></a>

### picker.register(chart) ⇒ <code>this</code>
Add a chart to the set `pickAt()` hit-tests against. No-op if already registered.

**Kind**: instance method of [<code>Picker</code>](#module_Picker.Picker)  
**Throws**:

- <code>TypeError</code> If `chart` doesn't expose a `selection()` method.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| chart | <code>GraphChart</code> | Any `GraphChart` — duck-typed to its `selection()` method. |

**Example**  
```js
picker.register(barChart);
```
<a name="module_Picker.Picker+unregister"></a>

### picker.unregister(chart) ⇒ <code>this</code>
Remove a chart from the set `pickAt()` hit-tests against. No-op if not registered.

**Kind**: instance method of [<code>Picker</code>](#module_Picker.Picker)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| chart | <code>GraphChart</code> | 

**Example**  
```js
picker.unregister(barChart);
```
<a name="module_Picker.Picker+pickAt"></a>

### picker.pickAt(x, y) ⇒ <code>Object</code>
Cast a ray from `(x, y)` — canvas-local pixel coordinates, top-left
origin, in the same physical-pixel space as `domElement.width`/
`.height` (e.g. `event.offsetX`/`event.offsetY` on the canvas itself,
not `clientX`/`clientY`) — through `camera`, and return the closest hit
across every registered chart, or `null` if none hit.

**Kind**: instance method of [<code>Picker</code>](#module_Picker.Picker)  
**Returns**: <code>Object</code> - `instanceIndex` is `null` for a hit on a non-instanced (meshes) backend.  
**Throws**:

- <code>TypeError</code> If `x` or `y` is not a finite number.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| x | <code>number</code> | 
| y | <code>number</code> | 

**Example**  
```js
const hit = picker.pickAt(event.offsetX, event.offsetY);
```
<a name="module_Picker.Picker+dispose"></a>

### picker.dispose()
Release this picker's registered charts and pending cache-invalidation
callback. Idempotent. Registered charts themselves are not disposed —
`Picker` doesn't own them.

**Kind**: instance method of [<code>Picker</code>](#module_Picker.Picker)  
**Example**  
```js
picker.dispose();
```
