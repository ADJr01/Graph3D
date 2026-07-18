# Axis

<a name="module_Axis.Axis"></a>

## Axis
Renders a scale as a real 3D scene object: a spine line spanning the
scale's range, one tick mark per `scale.ticks()`/`scale.domain()` entry,
and one label per tick. `axis.labels` always carries `{ text, position }`
stub metadata (via `annotation.label`); passing `options.camera` to
`render()` additionally builds each label as a real, billboarded
`SDFText` mesh in the scene (named `${name}_ticklabel_<i>`), disposed
alongside the rest of the axis. Omitting `camera` keeps the original
metadata-only behavior — real text costs a texture-atlas load and one
`SDFText.create()` per tick, so it's opt-in rather than automatic.

**Kind**: static class of [<code>Axis</code>](#module_Axis)  

* [.Axis](#module_Axis.Axis)
    * [new exports.Axis()](#new_module_Axis.Axis_new)
    * [.labels](#module_Axis.Axis+labels) ⇒ <code>\*</code>
    * [.scale([s])](#module_Axis.Axis+scale) ⇒ <code>function</code> \| <code>this</code>
    * [.orientation([o])](#module_Axis.Axis+orientation) ⇒ <code>\*</code>
    * [.tickCount([n])](#module_Axis.Axis+tickCount) ⇒ <code>number</code> \| <code>this</code>
    * [.tickFormat([fn])](#module_Axis.Axis+tickFormat) ⇒ <code>function</code>
    * [.tickSize([n])](#module_Axis.Axis+tickSize) ⇒ <code>number</code> \| <code>this</code>
    * [.labelStyle([style])](#module_Axis.Axis+labelStyle) ⇒ <code>object</code> \| <code>this</code>
    * [.render(scene, name, [options])](#module_Axis.Axis+render) ⇒ <code>this</code>
    * [.dispose()](#module_Axis.Axis+dispose)

<a name="new_module_Axis.Axis_new"></a>

### new exports.Axis()
**Example**  
```js
const axis = new Axis().scale(scale.linear().domain([0, 100]).range([0, 10])).orientation('x');
axis.render(graphScene.three, 'xAxis', { camera: graphScene.camera.three });
axis.labels[0]; // { type: 'label', text: '0', position: { x: 0, y: -0.1, z: 0 }, style: {} }
axis.dispose();
```
<a name="module_Axis.Axis+labels"></a>

### axis.labels ⇒ <code>\*</code>
Every tick's stubbed label metadata from the last `render()` call —
`{ type: 'label', text, position: {x,y,z}, style }` per tick. Empty
before the first `render()`.

**Kind**: instance property of [<code>Axis</code>](#module_Axis.Axis)  
**Example**  
```js
axis.labels.map((l) => l.text); // ['0', '20', '40', ...]
```
<a name="module_Axis.Axis+scale"></a>

### axis.scale([s]) ⇒ <code>function</code> \| <code>this</code>
Get (no args) or set (chainable) the scale this axis renders. Must
expose either `.ticks(count)` (continuous scales) or `.domain()`
(band/point/ordinal scales) for tick placement, and a numeric `.range()`
for the spine's extent.

**Kind**: instance method of [<code>Axis</code>](#module_Axis.Axis)  
**Throws**:

- <code>TypeError</code> If `s` is not a function.


| Param | Type |
| --- | --- |
| [s] | <code>function</code> | 

**Example**  
```js
axis.scale(scale.linear().domain([0, 100]).range([0, 10]));
```
<a name="module_Axis.Axis+orientation"></a>

### axis.orientation([o]) ⇒ <code>\*</code>
Get (no args) or set (chainable) which world axis this axis spans.

**Kind**: instance method of [<code>Axis</code>](#module_Axis.Axis)  
**Throws**:

- <code>TypeError</code> If `o` isn't `'x'`, `'y'`, or `'z'`.


| Param | Type |
| --- | --- |
| [o] | <code>\*</code> | 

**Example**  
```js
axis.orientation('y');
```
<a name="module_Axis.Axis+tickCount"></a>

### axis.tickCount([n]) ⇒ <code>number</code> \| <code>this</code>
Get (no args) or set (chainable) the target tick count, passed to the
scale's own `.ticks(count)`/`.tickFormat(count)`. Default `10`.

**Kind**: instance method of [<code>Axis</code>](#module_Axis.Axis)  
**Throws**:

- <code>TypeError</code> If `n` is not a positive integer.


| Param | Type |
| --- | --- |
| [n] | <code>number</code> | 

**Example**  
```js
axis.tickCount(5);
```
<a name="module_Axis.Axis+tickFormat"></a>

### axis.tickFormat([fn]) ⇒ <code>function</code>
Get (no args) or set (chainable) an explicit tick-label formatter,
overriding the scale's own `.tickFormat()`. Default: the scale's
`.tickFormat(tickCount)` if it has one, else `String`.

**Kind**: instance method of [<code>Axis</code>](#module_Axis.Axis)  
**Throws**:

- <code>TypeError</code> If `fn` is not a function.


| Param | Type |
| --- | --- |
| [fn] | <code>function</code> | 

**Example**  
```js
axis.tickFormat((v) => `${v}%`);
```
<a name="module_Axis.Axis+tickSize"></a>

### axis.tickSize([n]) ⇒ <code>number</code> \| <code>this</code>
Get (no args) or set (chainable) how far each tick mark extends off the
spine. Default `0.2`.

**Kind**: instance method of [<code>Axis</code>](#module_Axis.Axis)  
**Throws**:

- <code>TypeError</code> If `n` is not a positive number.


| Param | Type |
| --- | --- |
| [n] | <code>number</code> | 

**Example**  
```js
axis.tickSize(0.5);
```
<a name="module_Axis.Axis+labelStyle"></a>

### axis.labelStyle([style]) ⇒ <code>object</code> \| <code>this</code>
Get (no args) or set (chainable) the style object forwarded to each
tick's stubbed `annotation.label`. Default `{}`.

**Kind**: instance method of [<code>Axis</code>](#module_Axis.Axis)  
**Throws**:

- <code>TypeError</code> If `style` is not a plain object.


| Param | Type |
| --- | --- |
| [style] | <code>object</code> | 

**Example**  
```js
axis.labelStyle({ color: 'white', size: 0.3 });
```
<a name="module_Axis.Axis+render"></a>

### axis.render(scene, name, [options]) ⇒ <code>this</code>
Builds the spine line, tick marks, and stubbed label metadata as real
`GraphMesh` scene objects under `scene`, named `${name}_line`/
`${name}_tick_<i>`. Pass `options.camera` to also build each label as a
real, camera-billboarded `SDFText` mesh (`${name}_ticklabel_<i>`) — see
this class's own doc comment.

**Kind**: instance method of [<code>Axis</code>](#module_Axis.Axis)  
**Throws**:

- <code>Error</code> If `.scale()` was never set, or `render()` was already
  called on this instance (call `dispose()` first to re-render).
- <code>TypeError</code> If `scene`/`name` are the wrong type, `options` isn't
  a plain object, `options.camera` isn't a `THREE.Camera`, or the
  scale's range doesn't resolve to finite numbers.


| Param | Type |
| --- | --- |
| scene | <code>THREE.Scene</code> | 
| name | <code>string</code> | 
| [options] | <code>Object</code> | 

**Example**  
```js
axis.render(graphScene.three, 'xAxis');
```
**Example**  
```js
axis.render(graphScene.three, 'xAxis', { camera: graphScene.camera.three });
```
<a name="module_Axis.Axis+dispose"></a>

### axis.dispose()
Disposes the spine, tick, and label meshes. Idempotent; safe before
`render()` has ever been called.

**Kind**: instance method of [<code>Axis</code>](#module_Axis.Axis)  
**Example**  
```js
axis.dispose();
```
