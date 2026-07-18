# GraphSceneClipping

<a name="module_GraphSceneClipping.GraphSceneClipping"></a>

## GraphSceneClipping
Manages global clip planes on a renderer for slicing/sectioning a scene —
letting users "cut into" volumetric heatmaps or surface charts.

Clip planes are global (`renderer.clippingPlanes`): they apply to every
object in every scene rendered by this renderer, not just one `GraphScene`.

**Kind**: static class of [<code>GraphSceneClipping</code>](#module_GraphSceneClipping)  

* [.GraphSceneClipping](#module_GraphSceneClipping.GraphSceneClipping)
    * [new exports.GraphSceneClipping(options)](#new_module_GraphSceneClipping.GraphSceneClipping_new)
    * [.planes](#module_GraphSceneClipping.GraphSceneClipping+planes)
    * [.addClipPlane(normal, constant)](#module_GraphSceneClipping.GraphSceneClipping+addClipPlane) ⇒ <code>THREE.Plane</code>
    * [.removeClipPlane(plane)](#module_GraphSceneClipping.GraphSceneClipping+removeClipPlane) ⇒ <code>this</code>
    * [.clearClipPlanes()](#module_GraphSceneClipping.GraphSceneClipping+clearClipPlanes) ⇒ <code>this</code>
    * [.dispose()](#module_GraphSceneClipping.GraphSceneClipping+dispose)

<a name="new_module_GraphSceneClipping.GraphSceneClipping_new"></a>

### new exports.GraphSceneClipping(options)
**Throws**:

- <code>TypeError</code> If `renderer` is not a THREE.WebGLRenderer instance.


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

**Example**  
```js
const clipping = new GraphSceneClipping({ renderer });
const plane = clipping.addClipPlane([0, -1, 0], 0); // hide everything below y=0
clipping.removeClipPlane(plane);
```
<a name="module_GraphSceneClipping.GraphSceneClipping+planes"></a>

### graphSceneClipping.planes
Active clip planes, in insertion order. @returns {*}

**Kind**: instance property of [<code>GraphSceneClipping</code>](#module_GraphSceneClipping.GraphSceneClipping)  
<a name="module_GraphSceneClipping.GraphSceneClipping+addClipPlane"></a>

### graphSceneClipping.addClipPlane(normal, constant) ⇒ <code>THREE.Plane</code>
Add a global clip plane. Geometry on the positive side of the plane
normal is kept; geometry on the negative side is clipped away.

**Kind**: instance method of [<code>GraphSceneClipping</code>](#module_GraphSceneClipping.GraphSceneClipping)  
**Returns**: <code>THREE.Plane</code> - The created plane — pass it to `removeClipPlane` later.  
**Throws**:

- <code>TypeError</code> If `normal` is not a Vector3 or a 3-number array, or `constant` is not a finite number.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| normal | <code>\*</code> | Plane normal. |
| constant | <code>number</code> | Signed distance of the plane from the origin. |

**Example**  
```js
clipping.addClipPlane([0, -1, 0], 0); // clip below y=0
```
<a name="module_GraphSceneClipping.GraphSceneClipping+removeClipPlane"></a>

### graphSceneClipping.removeClipPlane(plane) ⇒ <code>this</code>
Remove a previously added clip plane.

**Kind**: instance method of [<code>GraphSceneClipping</code>](#module_GraphSceneClipping.GraphSceneClipping)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| plane | <code>THREE.Plane</code> | The plane instance returned by `addClipPlane`. |

**Example**  
```js
clipping.removeClipPlane(plane);
```
<a name="module_GraphSceneClipping.GraphSceneClipping+clearClipPlanes"></a>

### graphSceneClipping.clearClipPlanes() ⇒ <code>this</code>
Remove every active clip plane.

**Kind**: instance method of [<code>GraphSceneClipping</code>](#module_GraphSceneClipping.GraphSceneClipping)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
clipping.clearClipPlanes();
```
<a name="module_GraphSceneClipping.GraphSceneClipping+dispose"></a>

### graphSceneClipping.dispose()
Remove all clip planes from the renderer. Idempotent — safe to call twice.

**Kind**: instance method of [<code>GraphSceneClipping</code>](#module_GraphSceneClipping.GraphSceneClipping)  
**Example**  
```js
clipping.dispose();
```
