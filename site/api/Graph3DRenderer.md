# Graph3DRenderer

<a name="module_Graph3DRenderer.Graph3DRenderer"></a>

## Graph3DRenderer
Thin wrapper around `THREE.WebGLRenderer` that enforces the project's
baseline rendering configuration: sRGB output, ACESFilmic tone mapping,
PCF-soft shadows, and high-performance power preference.

Exposes `.three` for full Three.js access. All public methods guard against
use after disposal or context loss.

**Kind**: static class of [<code>Graph3DRenderer</code>](#module_Graph3DRenderer)  

* [.Graph3DRenderer](#module_Graph3DRenderer.Graph3DRenderer)
    * [new exports.Graph3DRenderer(options)](#new_module_Graph3DRenderer.Graph3DRenderer_new)
    * [.three](#module_Graph3DRenderer.Graph3DRenderer+three) : <code>THREE.WebGLRenderer</code>
    * [._deadReason](#module_Graph3DRenderer.Graph3DRenderer+_deadReason) : <code>string</code> \| <code>null</code>
    * [._onContextLost](#module_Graph3DRenderer.Graph3DRenderer+_onContextLost) : <code>EventListener</code>
    * [._onContextRestored](#module_Graph3DRenderer.Graph3DRenderer+_onContextRestored) : <code>EventListener</code>
    * [._assertAlive(method)](#module_Graph3DRenderer.Graph3DRenderer+_assertAlive)
    * [.setSize(width, height, [updateStyle])](#module_Graph3DRenderer.Graph3DRenderer+setSize)
    * [.setPixelRatio(ratio)](#module_Graph3DRenderer.Graph3DRenderer+setPixelRatio)
    * [.render(scene, camera)](#module_Graph3DRenderer.Graph3DRenderer+render)
    * [.setToneMapping(name)](#module_Graph3DRenderer.Graph3DRenderer+setToneMapping)
    * [.dispose()](#module_Graph3DRenderer.Graph3DRenderer+dispose)

<a name="new_module_Graph3DRenderer.Graph3DRenderer_new"></a>

### new exports.Graph3DRenderer(options)
**Throws**:

- <code>TypeError</code> If `canvas` is missing.
- <code>TypeError</code> If `toneMapping` or `shadowMap` is not a recognised key.


| Param | Type |
| --- | --- |
| options | <code>Graph3DRendererOptions</code> | 

**Example**  
```js
const canvas = document.getElementById('canvas');
const renderer = new Graph3DRenderer({ canvas });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.three.render(scene, camera);
```
**Example**  
```js
// Custom tone mapping:
const renderer = new Graph3DRenderer({ canvas, toneMapping: 'AgX', toneMappingExposure: 1.2 });
```
<a name="module_Graph3DRenderer.Graph3DRenderer+three"></a>

### graph3DRenderer.three : <code>THREE.WebGLRenderer</code>
The underlying Three.js renderer. Never null while alive.

**Kind**: instance property of [<code>Graph3DRenderer</code>](#module_Graph3DRenderer.Graph3DRenderer)  
<a name="module_Graph3DRenderer.Graph3DRenderer+_deadReason"></a>

### graph3DRenderer.\_deadReason : <code>string</code> \| <code>null</code>
Non-null once disposed or context-lost; names the cause.

**Kind**: instance property of [<code>Graph3DRenderer</code>](#module_Graph3DRenderer.Graph3DRenderer)  
<a name="module_Graph3DRenderer.Graph3DRenderer+_onContextLost"></a>

### graph3DRenderer.\_onContextLost : <code>EventListener</code>
Stored so we can remove it in dispose().

**Kind**: instance property of [<code>Graph3DRenderer</code>](#module_Graph3DRenderer.Graph3DRenderer)  
<a name="module_Graph3DRenderer.Graph3DRenderer+_onContextRestored"></a>

### graph3DRenderer.\_onContextRestored : <code>EventListener</code>
Stored so we can remove it in dispose().

**Kind**: instance property of [<code>Graph3DRenderer</code>](#module_Graph3DRenderer.Graph3DRenderer)  
<a name="module_Graph3DRenderer.Graph3DRenderer+_assertAlive"></a>

### graph3DRenderer.\_assertAlive(method)
**Kind**: instance method of [<code>Graph3DRenderer</code>](#module_Graph3DRenderer.Graph3DRenderer)  
**Throws**:

- <code>Error</code> If the renderer is disposed or the context is lost.


| Param | Type | Description |
| --- | --- | --- |
| method | <code>string</code> | Caller name for the error message. |

<a name="module_Graph3DRenderer.Graph3DRenderer+setSize"></a>

### graph3DRenderer.setSize(width, height, [updateStyle])
Resize the drawing buffer. Automatically updates the canvas CSS size unless
`updateStyle` is false.

**Kind**: instance method of [<code>Graph3DRenderer</code>](#module_Graph3DRenderer.Graph3DRenderer)  
**Throws**:

- <code>Error</code> If disposed or context-lost.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| width | <code>number</code> |  | Width in physical pixels. |
| height | <code>number</code> |  | Height in physical pixels. |
| [updateStyle] | <code>boolean</code> | <code>true</code> |  |

**Example**  
```js
renderer.setSize(window.innerWidth, window.innerHeight);
```
<a name="module_Graph3DRenderer.Graph3DRenderer+setPixelRatio"></a>

### graph3DRenderer.setPixelRatio(ratio)
Update the device pixel ratio without resizing the logical canvas dimensions.

**Kind**: instance method of [<code>Graph3DRenderer</code>](#module_Graph3DRenderer.Graph3DRenderer)  
**Throws**:

- <code>Error</code> If disposed or context-lost.


| Param | Type |
| --- | --- |
| ratio | <code>number</code> | 

**Example**  
```js
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```
<a name="module_Graph3DRenderer.Graph3DRenderer+render"></a>

### graph3DRenderer.render(scene, camera)
Draw one frame: `scene` through `camera` into this renderer's canvas.
`Graph3D`'s tick calls this every frame; also available directly as an
escape hatch for manual/off-loop rendering.

**Kind**: instance method of [<code>Graph3DRenderer</code>](#module_Graph3DRenderer.Graph3DRenderer)  
**Throws**:

- <code>Error</code> If disposed or context-lost.


| Param | Type |
| --- | --- |
| scene | <code>THREE.Scene</code> | 
| camera | <code>THREE.Camera</code> | 

**Example**  
```js
renderer.render(scene.three, scene.camera.three);
```
<a name="module_Graph3DRenderer.Graph3DRenderer+setToneMapping"></a>

### graph3DRenderer.setToneMapping(name)
Swap the tone mapping operator at runtime.

**Kind**: instance method of [<code>Graph3DRenderer</code>](#module_Graph3DRenderer.Graph3DRenderer)  
**Throws**:

- <code>Error</code> If disposed or context-lost.
- <code>TypeError</code> If `name` is not a recognised key.


| Param | Type | Description |
| --- | --- | --- |
| name | <code>\*</code> | One of: None, Linear, Reinhard, Cineon, ACESFilmic, AgX, Neutral. |

**Example**  
```js
renderer.setToneMapping('AgX');
```
<a name="module_Graph3DRenderer.Graph3DRenderer+dispose"></a>

### graph3DRenderer.dispose()
Release all GPU resources and remove the context-loss listener.
Safe to call multiple times (idempotent).

**Kind**: instance method of [<code>Graph3DRenderer</code>](#module_Graph3DRenderer.Graph3DRenderer)  
**Example**  
```js
renderer.dispose();
```
