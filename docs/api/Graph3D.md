# Graph3D

<a name="module_Graph3D.Graph3D"></a>

## Graph3D
Top-level Graph3D entry point. Composes all Layer-1 core primitives:
capability detection, WebGL renderer, animation loop, instance registry,
frame budget, and a lazily-created worker pool.

**Kind**: static class of [<code>Graph3D</code>](#module_Graph3D)  

* [.Graph3D](#module_Graph3D.Graph3D)
    * [new exports.Graph3D(options)](#new_module_Graph3D.Graph3D_new)
    * _instance_
        * [.hdr](#module_Graph3D.Graph3D+hdr) : <code>string</code> \| <code>undefined</code>
        * [.theme](#module_Graph3D.Graph3D+theme) : <code>string</code> \| <code>undefined</code>
        * [.autoResize](#module_Graph3D.Graph3D+autoResize) : <code>boolean</code>
        * [.respectReducedMotion](#module_Graph3D.Graph3D+respectReducedMotion) : <code>boolean</code>
        * [.version](#module_Graph3D.Graph3D+version)
        * [.renderer](#module_Graph3D.Graph3D+renderer) ⇒ <code>Graph3DRenderer</code>
        * [.capabilities](#module_Graph3D.Graph3D+capabilities) ⇒ <code>Capabilities</code>
        * [.frameBudget](#module_Graph3D.Graph3D+frameBudget) ⇒ <code>FrameBudget</code>
        * [.workers](#module_Graph3D.Graph3D+workers) ⇒ <code>WorkerPool</code>
        * [.postfx](#module_Graph3D.Graph3D+postfx) ⇒ <code>PostFX</code>
        * [.devtools](#module_Graph3D.Graph3D+devtools) ⇒ <code>GraphDevTools</code>
        * [.scenes](#module_Graph3D.Graph3D+scenes) ⇒ <code>\*</code>
        * [.activeScene](#module_Graph3D.Graph3D+activeScene) ⇒ <code>\*</code>
        * [.setSize(width, height)](#module_Graph3D.Graph3D+setSize)
        * [.pause()](#module_Graph3D.Graph3D+pause)
        * [.resume()](#module_Graph3D.Graph3D+resume)
        * [.createScene(name)](#module_Graph3D.Graph3D+createScene) ⇒ <code>GraphScene</code>
        * [.setActiveScene(nameOrScene)](#module_Graph3D.Graph3D+setActiveScene)
        * [.chart(typeName)](#module_Graph3D.Graph3D+chart) ⇒ <code>GraphChart</code>
        * [.exportScene([options])](#module_Graph3D.Graph3D+exportScene) ⇒ <code>\*</code>
        * [.serialize()](#module_Graph3D.Graph3D+serialize) ⇒ <code>object</code>
        * [.dispose()](#module_Graph3D.Graph3D+dispose)
    * _static_
        * [.deserialize(json, [options])](#module_Graph3D.Graph3D.deserialize) ⇒ <code>\*</code>
        * [.disposeAll()](#module_Graph3D.Graph3D.disposeAll)

<a name="new_module_Graph3D.Graph3D_new"></a>

### new exports.Graph3D(options)
**Throws**:

- <code>TypeError</code> If `canvas` is missing in a browser environment
  (canvas is optional under SSR — see the class doc's SSR-safe example).


| Param | Type |
| --- | --- |
| options | <code>Graph3DOptions</code> | 

**Example**  
```js
const g = new Graph3D({ canvas: document.getElementById('canvas') });
console.log(g.capabilities.webgl2);
g.dispose();
```
**Example**  
```js
const g = new Graph3D({ canvas, pixelRatio: 2, hdr: '/env/studio.hdr', theme: 'studio-dark' });
g.setActiveScene(g.createScene('main'));
g.chart('bar').data(values, (d) => d.id).render();
```
**Example**  
```js
// SSR-safe mode: no `window` means no canvas is required. Scene setup, chart
// configuration, and data binding all work normally for pre-computing state
// during server-side rendering — only actual pixel rendering needs a browser.
const g = new Graph3D({}); // canvas omitted — detected automatically
g.setActiveScene(g.createScene('main'));
g.chart('bar').data(values, (d) => d.id); // fine server-side
g.renderer.render(scene, camera); // throws a clear error server-side
```
<a name="module_Graph3D.Graph3D+hdr"></a>

### graph3D.hdr : <code>string</code> \| <code>undefined</code>
**Kind**: instance property of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
<a name="module_Graph3D.Graph3D+theme"></a>

### graph3D.theme : <code>string</code> \| <code>undefined</code>
**Kind**: instance property of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
<a name="module_Graph3D.Graph3D+autoResize"></a>

### graph3D.autoResize : <code>boolean</code>
**Kind**: instance property of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
<a name="module_Graph3D.Graph3D+respectReducedMotion"></a>

### graph3D.respectReducedMotion : <code>boolean</code>
**Kind**: instance property of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
<a name="module_Graph3D.Graph3D+version"></a>

### graph3D.version
Library version string, matching `package.json#version`.

**Kind**: instance property of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
<a name="module_Graph3D.Graph3D+renderer"></a>

### graph3D.renderer ⇒ <code>Graph3DRenderer</code>
The underlying `Graph3DRenderer` instance.

**Kind**: instance property of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
<a name="module_Graph3D.Graph3D+capabilities"></a>

### graph3D.capabilities ⇒ <code>Capabilities</code>
Frozen capabilities snapshot from `CapabilityProbe`.

**Kind**: instance property of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
<a name="module_Graph3D.Graph3D+frameBudget"></a>

### graph3D.frameBudget ⇒ <code>FrameBudget</code>
The shared `FrameBudget` watchdog for this instance.

**Kind**: instance property of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
<a name="module_Graph3D.Graph3D+workers"></a>

### graph3D.workers ⇒ <code>WorkerPool</code>
The `WorkerPool` for off-thread data tasks, created on first access.
Uses the base64-inlined worker bootstrap (no separate worker file needed).

**Kind**: instance property of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
const sorted = await g.workers.exec('sort', { data: myArray });
```
<a name="module_Graph3D.Graph3D+postfx"></a>

### graph3D.postfx ⇒ <code>PostFX</code>
The `PostFX` pipeline bound to this instance's active scene, created
lazily on first access. Requires an active scene (`setActiveScene()`)
to exist first — the underlying `EffectComposer` needs a concrete scene
and camera to render.

**Kind**: instance property of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
**Throws**:

- <code>Error</code> If called after `dispose()`, or before any scene is active.

**Example**  
```js
g.setActiveScene('main');
g.postfx.enable('bloom', { strength: 1.2 });
```
<a name="module_Graph3D.Graph3D+devtools"></a>

### graph3D.devtools ⇒ <code>GraphDevTools</code>
Dev-only debugging surface (Prompt 178): scene-graph dumps, active
timelines, GPU memory snapshots, and disposable debug overlays for
picking/frustum/octree/selection. Created lazily on first access.

Throws in production. The check is a plain `process.env.NODE_ENV`
comparison, unminified — the same convention React/D3 ship — so a
consuming app's own bundler (Vite/webpack `define`/`DefinePlugin`
replacing that expression with the literal `"production"`) dead-code-
eliminates every `g.devtools...` call site downstream, without this
library needing its own production/development build split.
`typeof process !== 'undefined'` guards environments (a raw `<script>`
include) where `process` doesn't exist at all.

**Kind**: instance property of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
**Throws**:

- <code>Error</code> If `process.env.NODE_ENV === 'production'`.
- <code>Error</code> If called after `dispose()`.

**Example**  
```js
g.devtools.dumpSceneGraph();
```
<a name="module_Graph3D.Graph3D+scenes"></a>

### graph3D.scenes ⇒ <code>\*</code>
Map of all scenes keyed by name. Populated by `createScene()` (Prompt 22).

**Kind**: instance property of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
<a name="module_Graph3D.Graph3D+activeScene"></a>

### graph3D.activeScene ⇒ <code>\*</code>
The currently active scene, or `null` before any scene is created.
Updated by `setActiveScene()` (Prompt 22).

**Kind**: instance property of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
<a name="module_Graph3D.Graph3D+setSize"></a>

### graph3D.setSize(width, height)
Resize the canvas drawing buffer and notify the active scene's camera.

**Kind**: instance method of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| width | <code>number</code> | Target width in CSS pixels (rounded to integers by ResizeObserver). |
| height | <code>number</code> | Target height in CSS pixels. |

**Example**  
```js
g.setSize(window.innerWidth, window.innerHeight);
```
<a name="module_Graph3D.Graph3D+pause"></a>

### graph3D.pause()
Pause this instance: unsubscribes the loop tick so this graph stops rendering.
No-op if already paused or disposed. The registry's `pauseAll()` calls this.

**Kind**: instance method of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
**Example**  
```js
g.pause(); // e.g. when the UI panel containing the graph is hidden
```
<a name="module_Graph3D.Graph3D+resume"></a>

### graph3D.resume()
Resume this instance after a `pause()` call. Re-subscribes the loop tick.
No-op if not paused or disposed. The registry's `resumeAll()` calls this.

**Kind**: instance method of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
**Example**  
```js
g.resume();
```
<a name="module_Graph3D.Graph3D+createScene"></a>

### graph3D.createScene(name) ⇒ <code>GraphScene</code>
Create a named scene and register it with this instance.
The first scene created does not automatically become active —
call `setActiveScene()` to begin rendering it.

**Kind**: instance method of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
**Throws**:

- <code>TypeError</code> If `name` is not a non-empty string.
- <code>Error</code> If a scene with this name already exists.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | Unique scene identifier. |

**Example**  
```js
const scene = g.createScene('main');
g.setActiveScene('main');
```
<a name="module_Graph3D.Graph3D+setActiveScene"></a>

### graph3D.setActiveScene(nameOrScene)
Set the scene rendered each frame. Accepts either a scene name
(previously passed to `createScene`) or the `GraphScene` instance itself.

**Kind**: instance method of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
**Throws**:

- <code>TypeError</code> If `nameOrScene` is neither a string nor a GraphScene.
- <code>Error</code> If the named scene does not exist in this instance.
- <code>Error</code> If the GraphScene instance was not created by this instance.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| nameOrScene | <code>string</code> \| <code>GraphScene</code> | 

**Example**  
```js
g.setActiveScene('main');
// or
g.setActiveScene(scene);
```
<a name="module_Graph3D.Graph3D+chart"></a>

### graph3D.chart(typeName) ⇒ <code>GraphChart</code>
Entry point to the fluent chart API (Prompt 140). Looks up a registered
chart type and returns a new chart instance bound to the active scene's
raw `THREE.Scene` (`setActiveScene()` must be called first — the same
requirement `postfx` already has, for the same reason: there's no scene
to attach anything to otherwise).

**Kind**: instance method of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
**Returns**: <code>GraphChart</code> - A new, unconfigured chart instance — call its own `.data(...)`/`.render()`, etc.  
**Throws**:

- <code>TypeError</code> If `typeName` is not a non-empty string.
- <code>Error</code> If no active scene exists (call `setActiveScene()` first).
- <code>Error</code> If `typeName` is not a registered chart type — the message
  suggests the closest registered name (Levenshtein distance ≤ 3) when one exists.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| typeName | <code>\*</code> | 

**Example**  
```js
g.setActiveScene(g.createScene('main'));
g.chart('bar').data(values, (d) => d.id).x((d) => d.label).y((d) => d.value).render();
```
<a name="module_Graph3D.Graph3D+exportScene"></a>

### graph3D.exportScene([options]) ⇒ <code>\*</code>
Export the active scene's full `THREE.Scene` graph as glTF (Prompt 181).
`GLTFExporter` is lazy-loaded from `three/examples/jsm/exporters/GLTFExporter.js`
on first call — never bundled unless this method is actually used, same
convention as `GraphSceneCamera.enableOrbitControls`/`GraphObjectLoader`'s
lazy-loaded addons.

**Kind**: instance method of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
**Throws**:

- <code>Error</code> If no active scene exists, or called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| [options] | <code>Object</code> | `binary: true` (default) returns a   `.glb` `Blob`; `false` returns the raw glTF JSON object (embed textures   as data URIs yourself if you need a single-file `.gltf`). |

**Example**  
```js
const blob = await g.exportScene();
const url = URL.createObjectURL(blob);
```
<a name="module_Graph3D.Graph3D+serialize"></a>

### graph3D.serialize() ⇒ <code>object</code>
Capture this instance's scene/camera composition as a JSON-safe plain
object (Prompt 181) — restorable via `Graph3D.deserialize()`.

Deliberately narrow: only `theme`/`hdr` and, per scene, the applied
theme plus camera preset/position/look-at-target/fov are captured.
Chart configurations, bound data, and accessor functions are NOT
captured — they're code (closures), which has no JSON representation.
Re-create charts and call `.data()` again after `deserialize()` restores
the view. A scene whose camera was replaced via `useCamera()` (no
preset) still has its position/target/fov captured, just not a preset
name to rebuild the camera type from — `deserialize()` applies them on
top of the new instance's default camera.

**Kind**: instance method of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
**Returns**: <code>object</code> - A JSON-safe snapshot.  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
localStorage.setItem('view', JSON.stringify(g.serialize()));
```
<a name="module_Graph3D.Graph3D+dispose"></a>

### graph3D.dispose()
Release all resources: disconnects ResizeObserver, stops the loop tick,
disposes the frame budget, disposes the worker pool (if ever created),
disposes the renderer, and unregisters from the page-level registry.
Idempotent — safe to call twice.

**Kind**: instance method of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
**Example**  
```js
g.dispose();
```
<a name="module_Graph3D.Graph3D.deserialize"></a>

### Graph3D.deserialize(json, [options]) ⇒ <code>\*</code>
Reconstruct a new `Graph3D` instance from a `serialize()` snapshot
(Prompt 181): recreates each scene by name, its applied theme (if any),
and its camera preset/position/look-at-target/fov. Chart configurations
and data are NOT restored — `serialize()` never captured them (see its
own doc comment) — recreate charts and call `.data()` again after this
returns.

**Kind**: static method of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
**Throws**:

- <code>TypeError</code> If `json` isn't a `serialize()`-shaped object.


| Param | Type | Description |
| --- | --- | --- |
| json | <code>object</code> | A snapshot from `serialize()`. |
| [options] | <code>Graph3DOptions</code> | Passed through to the `Graph3D`   constructor — `canvas` is still required in a browser, since a JSON   snapshot can't carry a DOM element. Overrides `json.theme`/`json.hdr`   if given. |

**Example**  
```js
const json = JSON.parse(localStorage.getItem('view'));
const g = await Graph3D.deserialize(json, { canvas });
```
<a name="module_Graph3D.Graph3D.disposeAll"></a>

### Graph3D.disposeAll()
Dispose all currently registered `Graph3D` instances.
Delegates to the page-level `registry.disposeAll()`.

**Kind**: static method of [<code>Graph3D</code>](#module_Graph3D.Graph3D)  
**Throws**:

- <code>Error</code> Re-throws the first disposal error after attempting all disposals.

**Example**  
```js
Graph3D.disposeAll(); // e.g. before a full page teardown
```
