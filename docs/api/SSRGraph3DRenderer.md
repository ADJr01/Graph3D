# SSRGraph3DRenderer

<a name="module_Graph3DRenderer.SSRGraph3DRenderer"></a>

## Graph3DRenderer.SSRGraph3DRenderer
SSR-safe stand-in for `Graph3DRenderer`, used by `Graph3D` when constructed
outside a browser (no `window`). Never touches `THREE.WebGLRenderer` or a
canvas, so importing and constructing `Graph3D` — and building scenes and
charts on it — works during server-side rendering. `.three` is `null`,
which `GraphScene` already treats as "no renderer available" and skips
environment/shadows/clipping accordingly (the same path a bare `graph3d`
stub without a renderer takes in tests).

Only `render()`, the one method that needs a real GPU context, throws —
clearly explaining why, so a render call left unguarded during SSR fails
loudly instead of doing nothing.

**Kind**: static class of [<code>Graph3DRenderer</code>](#module_Graph3DRenderer)  

* [.SSRGraph3DRenderer](#module_Graph3DRenderer.SSRGraph3DRenderer)
    * [new exports.SSRGraph3DRenderer()](#new_module_Graph3DRenderer.SSRGraph3DRenderer_new)
    * [.three](#module_Graph3DRenderer.SSRGraph3DRenderer+three) : <code>null</code>
    * [.setSize()](#module_Graph3DRenderer.SSRGraph3DRenderer+setSize)
    * [.setPixelRatio()](#module_Graph3DRenderer.SSRGraph3DRenderer+setPixelRatio)
    * [.setToneMapping()](#module_Graph3DRenderer.SSRGraph3DRenderer+setToneMapping)
    * [.render()](#module_Graph3DRenderer.SSRGraph3DRenderer+render)
    * [.dispose()](#module_Graph3DRenderer.SSRGraph3DRenderer+dispose)

<a name="new_module_Graph3DRenderer.SSRGraph3DRenderer_new"></a>

### new exports.SSRGraph3DRenderer()
**Example**  
```js
// Constructed automatically — not intended to be used directly:
const g = new Graph3D({}); // no canvas, no window → SSR mode
g.renderer instanceof SSRGraph3DRenderer; // true
```
<a name="module_Graph3DRenderer.SSRGraph3DRenderer+three"></a>

### ssrGraph3DRenderer.three : <code>null</code>
No `THREE.WebGLRenderer` exists server-side.

**Kind**: instance property of [<code>SSRGraph3DRenderer</code>](#module_Graph3DRenderer.SSRGraph3DRenderer)  
<a name="module_Graph3DRenderer.SSRGraph3DRenderer+setSize"></a>

### ssrGraph3DRenderer.setSize()
**Kind**: instance method of [<code>SSRGraph3DRenderer</code>](#module_Graph3DRenderer.SSRGraph3DRenderer)  
**Example**  
```js
renderer.setSize(1920, 1080); — no-op server-side
```
<a name="module_Graph3DRenderer.SSRGraph3DRenderer+setPixelRatio"></a>

### ssrGraph3DRenderer.setPixelRatio()
**Kind**: instance method of [<code>SSRGraph3DRenderer</code>](#module_Graph3DRenderer.SSRGraph3DRenderer)  
**Example**  
```js
renderer.setPixelRatio(2); — no-op server-side
```
<a name="module_Graph3DRenderer.SSRGraph3DRenderer+setToneMapping"></a>

### ssrGraph3DRenderer.setToneMapping()
**Kind**: instance method of [<code>SSRGraph3DRenderer</code>](#module_Graph3DRenderer.SSRGraph3DRenderer)  
**Example**  
```js
renderer.setToneMapping('AgX'); — no-op server-side
```
<a name="module_Graph3DRenderer.SSRGraph3DRenderer+render"></a>

### ssrGraph3DRenderer.render()
**Kind**: instance method of [<code>SSRGraph3DRenderer</code>](#module_Graph3DRenderer.SSRGraph3DRenderer)  
**Throws**:

- <code>Error</code> Always — WebGL rendering requires a browser environment.

<a name="module_Graph3DRenderer.SSRGraph3DRenderer+dispose"></a>

### ssrGraph3DRenderer.dispose()
**Kind**: instance method of [<code>SSRGraph3DRenderer</code>](#module_Graph3DRenderer.SSRGraph3DRenderer)  
**Example**  
```js
renderer.dispose(); — no-op server-side
```
