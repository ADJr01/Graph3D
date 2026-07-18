# GraphLine

<a name="module_GraphLine.GraphLine"></a>

## GraphLine
Wraps a Three.js `Line2` (`three/examples/jsm/lines`) — a single
continuous, constant-pixel-width polyline. This is the one chart primitive
`GraphObjectFactory` has no factory for: every primitive there is N
independent instances (bars, points, segments); a line chart's path
(`LineChart`, Prompt 133) is one continuous object instead, so it gets its
own thin wrapper here rather than being forced through the N-instance
factory dispatch.

`setPositions()` mutates the existing GPU buffer in place when the point
count matches the previous call (cheap — no reallocation); it rebuilds the
geometry via `LineGeometry.setPositions` only when the count changes,
since the underlying interleaved buffer is sized to a fixed point count.

**Kind**: static class of [<code>GraphLine</code>](#module_GraphLine)  

* [.GraphLine](#module_GraphLine.GraphLine)
    * [new exports.GraphLine(options)](#new_module_GraphLine.GraphLine_new)
    * [.material](#module_GraphLine.GraphLine+material) ⇒ <code>LineMaterial</code>
    * [.setResolution(width, height)](#module_GraphLine.GraphLine+setResolution) ⇒ <code>this</code>
    * [.setPositions(positions)](#module_GraphLine.GraphLine+setPositions) ⇒ <code>this</code>
    * [.dispose()](#module_GraphLine.GraphLine+dispose)

<a name="new_module_GraphLine.GraphLine_new"></a>

### new exports.GraphLine(options)
**Throws**:

- <code>TypeError</code> If `linewidth` isn't a positive number.
- <code>Error</code> If constructed from the UMD `<script>`-tag build without
  the `three/examples/jsm/lines/*` globals set (`core/umdCompat.js`).


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

**Example**  
```js
const line = new GraphLine({ scene: graphScene.three, name: 'line-A', color: '#3b82f6' });
line.setPositions(new Float32Array([0, 0, 0, 1, 2, 0, 2, 1, 0]));
```
<a name="module_GraphLine.GraphLine+material"></a>

### graphLine.material ⇒ <code>LineMaterial</code>
This line's material — a `LineMaterial`, not a standard `THREE.Material`
(`linewidth`/`resolution`/`dashed` are `LineMaterial`-specific).

**Kind**: instance property of [<code>GraphLine</code>](#module_GraphLine.GraphLine)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
line.material.color.set('crimson');
```
<a name="module_GraphLine.GraphLine+setResolution"></a>

### graphLine.setResolution(width, height) ⇒ <code>this</code>
Updates the material's pixel-space `resolution` uniform — required for
`linewidth` to stay a consistent pixel width after the renderer/canvas
is resized. Not wired to `window.resize` automatically; callers update
this alongside their own renderer resize handling.

**Kind**: instance method of [<code>GraphLine</code>](#module_GraphLine.GraphLine)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| width | <code>number</code> | 
| height | <code>number</code> | 

**Example**  
```js
line.setResolution(window.innerWidth, window.innerHeight);
```
<a name="module_GraphLine.GraphLine+setPositions"></a>

### graphLine.setPositions(positions) ⇒ <code>this</code>
Writes this line's full vertex position stream —
`[x0, y0, z0, x1, y1, z1, ...]`. Mutates the existing interleaved buffer
in place when the point count matches the previous call; rebuilds the
geometry otherwise.

**Kind**: instance method of [<code>GraphLine</code>](#module_GraphLine.GraphLine)  
**Throws**:

- <code>TypeError</code> If `positions` isn't a `Float32Array` of at least 2 points.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| positions | <code>Float32Array</code> | At least 2 points (6 numbers). |

**Example**  
```js
line.setPositions(new Float32Array([0, 0, 0, 1, 1, 0]));
```
<a name="module_GraphLine.GraphLine+dispose"></a>

### graphLine.dispose()
Disposes the geometry and material. Idempotent.

**Kind**: instance method of [<code>GraphLine</code>](#module_GraphLine.GraphLine)  
**Example**  
```js
line.dispose();
```
