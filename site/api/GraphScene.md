# GraphScene

<a name="module_GraphScene.GraphScene"></a>

## GraphScene
Wraps a THREE.Scene with managed defaults and rigorous disposal.

Serves as the **disposal foundation** for Phase 2: every geometry,
material, and texture reachable from this scene is disposed when
`dispose()` is called. The constructor auto-creates a camera and a
default light rig; if `graph3d.renderer.three` is available it also
auto-creates environment, shadow, and clip-plane managers so a scene is
immediately usable without any further setup calls.

To drop down to raw Three.js, use `scene.three` for full scene access,
`scene.useCamera(threeCamera)` to replace the managed camera, or
`scene.useLights(threeLightArray)` to replace the managed light rig.

**Kind**: static class of [<code>GraphScene</code>](#module_GraphScene)  

* [.GraphScene](#module_GraphScene.GraphScene)
    * [new exports.GraphScene(options)](#new_module_GraphScene.GraphScene_new)
    * [.name](#module_GraphScene.GraphScene+name) ⇒ <code>string</code>
    * [.three](#module_GraphScene.GraphScene+three) ⇒ <code>THREE.Scene</code>
    * [.camera](#module_GraphScene.GraphScene+camera) ⇒ <code>GraphSceneCamera</code>
    * [.light](#module_GraphScene.GraphScene+light) ⇒ <code>GraphSceneLight</code> \| <code>null</code>
    * [.environment](#module_GraphScene.GraphScene+environment) ⇒ <code>GraphSceneEnvironment</code> \| <code>null</code>
    * [.shadows](#module_GraphScene.GraphScene+shadows) ⇒ <code>GraphSceneShadows</code> \| <code>null</code>
    * [.clipping](#module_GraphScene.GraphScene+clipping) ⇒ <code>GraphSceneClipping</code> \| <code>null</code>
    * [.viewports](#module_GraphScene.GraphScene+viewports) ⇒ <code>Object</code>
    * [.theme](#module_GraphScene.GraphScene+theme) ⇒ <code>string</code> \| <code>null</code>
    * [.palette](#module_GraphScene.GraphScene+palette) ⇒ <code>\*</code>
    * [.applyTheme(name, [options])](#module_GraphScene.GraphScene+applyTheme) ⇒ <code>\*</code>
    * [.useCamera(camera)](#module_GraphScene.GraphScene+useCamera) ⇒ <code>this</code>
    * [.useLights(lights)](#module_GraphScene.GraphScene+useLights) ⇒ <code>this</code>
    * [.add(...objects)](#module_GraphScene.GraphScene+add) ⇒ <code>this</code>
    * [.remove(...objects)](#module_GraphScene.GraphScene+remove) ⇒ <code>this</code>
    * [.traverse(callback)](#module_GraphScene.GraphScene+traverse) ⇒ <code>this</code>
    * [.findByName(name)](#module_GraphScene.GraphScene+findByName) ⇒ <code>THREE.Object3D</code> \| <code>null</code>
    * [.selectByName(name)](#module_GraphScene.GraphScene+selectByName) ⇒ <code>\*</code>
    * [.selectAll(name)](#module_GraphScene.GraphScene+selectAll) ⇒ <code>Selection</code>
    * [.selectInstance(name, index)](#module_GraphScene.GraphScene+selectInstance) ⇒ <code>Object</code>
    * [.setViewports(viewports)](#module_GraphScene.GraphScene+setViewports) ⇒ <code>this</code>
    * [.dispose()](#module_GraphScene.GraphScene+dispose)

<a name="new_module_GraphScene.GraphScene_new"></a>

### new exports.GraphScene(options)
**Throws**:

- <code>TypeError</code> If `graph3d` is falsy.
- <code>TypeError</code> If `name` is not a non-empty string.


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

**Example**  
```js
const scene = new GraphScene({ graph3d: g, name: 'main' });
scene.add(myMesh);
scene.dispose(); // all geometry, materials, textures released
```
<a name="module_GraphScene.GraphScene+name"></a>

### graphScene.name ⇒ <code>string</code>
Scene name as passed to the constructor.

**Kind**: instance property of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
<a name="module_GraphScene.GraphScene+three"></a>

### graphScene.three ⇒ <code>THREE.Scene</code>
The underlying THREE.Scene — use as an escape hatch to raw Three.js.

**Kind**: instance property of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
<a name="module_GraphScene.GraphScene+camera"></a>

### graphScene.camera ⇒ <code>GraphSceneCamera</code>
The active camera. Graph3D reads `scene.camera.three` each frame to drive the renderer.

**Kind**: instance property of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
<a name="module_GraphScene.GraphScene+light"></a>

### graphScene.light ⇒ <code>GraphSceneLight</code> \| <code>null</code>
The active managed light rig, or `null` after `useLights()` hands lighting to raw THREE.

**Kind**: instance property of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
<a name="module_GraphScene.GraphScene+environment"></a>

### graphScene.environment ⇒ <code>GraphSceneEnvironment</code> \| <code>null</code>
The environment manager (HDR, background, fog), or `null` if this scene
was constructed without a renderer available on `graph3d`.

**Kind**: instance property of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
<a name="module_GraphScene.GraphScene+shadows"></a>

### graphScene.shadows ⇒ <code>GraphSceneShadows</code> \| <code>null</code>
The shadow manager, or `null` if this scene was constructed without a
renderer available on `graph3d`.

**Kind**: instance property of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
<a name="module_GraphScene.GraphScene+clipping"></a>

### graphScene.clipping ⇒ <code>GraphSceneClipping</code> \| <code>null</code>
The clip-plane manager, or `null` if this scene was constructed without a
renderer available on `graph3d`.

**Kind**: instance property of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
<a name="module_GraphScene.GraphScene+viewports"></a>

### graphScene.viewports ⇒ <code>Object</code>
Viewport configurations for multiViewport rendering.
Each entry uses normalized [0, 1] canvas coordinates.
Default: one viewport covering the full canvas.

**Kind**: instance property of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
<a name="module_GraphScene.GraphScene+theme"></a>

### graphScene.theme ⇒ <code>string</code> \| <code>null</code>
Name of the currently applied theme, or `null` if `applyTheme` has never been called.

**Kind**: instance property of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
<a name="module_GraphScene.GraphScene+palette"></a>

### graphScene.palette ⇒ <code>\*</code>
Default hex-colour palette of the currently applied theme, or `null` if
`applyTheme` has never been called.

**Kind**: instance property of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
<a name="module_GraphScene.GraphScene+applyTheme"></a>

### graphScene.applyTheme(name, [options]) ⇒ <code>\*</code>
Apply a named theme: a coherent bundle of camera preset, light preset,
HDR, fog, shadow quality, and a default material palette.

A theme fully owns scene lighting and atmosphere once applied — any
existing lights (including the constructor's defaults) are removed, and
the environment/shadow managers from a previous `applyTheme` call are
disposed once the new ones are ready to take their place.

The HDR fetch (the only step that can fail, e.g. a missing/malformed
`.hdr` file) runs before anything is mutated, so a rejected promise
leaves the previous theme — camera, lights, environment, shadows —
fully intact rather than half-applying the new one.

Environment and shadows require a renderer; without one (and none was
resolved from `graph3d.renderer.three` at construction) they are skipped
and `scene.theme`/`scene.palette`/camera/lights still apply, matching
the renderer-optional behavior of `GraphSceneSetup`.

**Kind**: instance method of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
**Throws**:

- <code>TypeError</code> If `name` is not a recognised theme.
- <code>Error</code> If called after `dispose()`.
- <code>Error</code> Propagates a rejected HDR load (e.g. missing `.hdr` asset)
  without mutating the scene.


| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | One of: studio-light, studio-dark, cinema-night,   clinical-white, terminal-green, editorial, cyberpunk, museum. |
| [options] | <code>Object</code> | Defaults to the   renderer resolved from `graph3d.renderer.three` at construction. |

**Example**  
```js
await scene.applyTheme('cinema-night');
```
<a name="module_GraphScene.GraphScene+useCamera"></a>

### graphScene.useCamera(camera) ⇒ <code>this</code>
Replace the managed camera with a raw THREE camera, dropping to manual
control. Delegates to `GraphSceneCamera.useCustom`.

**Kind**: instance method of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
**Throws**:

- <code>TypeError</code> If `camera` is not a `THREE.Camera`.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| camera | <code>THREE.Camera</code> | 

**Example**  
```js
scene.useCamera(new THREE.PerspectiveCamera(45, aspect, 0.1, 1000));
```
<a name="module_GraphScene.GraphScene+useLights"></a>

### graphScene.useLights(lights) ⇒ <code>this</code>
Replace the managed light rig with a raw array of THREE lights, dropping
to manual control. Disposes the current `GraphSceneLight` (if any) and
adds `lights` directly to the scene graph. `scene.light` is `null` after
this call — reach for the raw lights via `scene.three` or `findByName`.

**Kind**: instance method of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
**Throws**:

- <code>TypeError</code> If `lights` is not an array of `THREE.Light` instances.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| lights | <code>\*</code> | 

**Example**  
```js
scene.useLights([new THREE.HemisphereLight(0xffffff, 0x444444, 1)]);
```
<a name="module_GraphScene.GraphScene+add"></a>

### graphScene.add(...objects) ⇒ <code>this</code>
Add one or more objects to the scene.

**Kind**: instance method of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| ...objects | <code>\*</code> | 

**Example**  
```js
scene.add(mesh, group);
```
<a name="module_GraphScene.GraphScene+remove"></a>

### graphScene.remove(...objects) ⇒ <code>this</code>
Remove one or more objects from the scene.

**Kind**: instance method of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| ...objects | <code>\*</code> | 

**Example**  
```js
scene.remove(mesh);
```
<a name="module_GraphScene.GraphScene+traverse"></a>

### graphScene.traverse(callback) ⇒ <code>this</code>
Walk the full scene graph depth-first, passing every object to `callback`.

**Kind**: instance method of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| callback | <code>\*</code> | 

**Example**  
```js
scene.traverse(obj => console.log(obj.name));
```
<a name="module_GraphScene.GraphScene+findByName"></a>

### graphScene.findByName(name) ⇒ <code>THREE.Object3D</code> \| <code>null</code>
Find the first object in the scene graph with the given name.
Uses THREE.Scene.getObjectByName (depth-first search).

**Kind**: instance method of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
**Returns**: <code>THREE.Object3D</code> \| <code>null</code> - Matching object or `null` if not found.  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| name | <code>string</code> | 

**Example**  
```js
scene.findByName('_key'); // the default light rig's key light
```
<a name="module_GraphScene.GraphScene+selectByName"></a>

### graphScene.selectByName(name) ⇒ <code>\*</code>
Look up every `GraphObject` (a `GraphMesh`, a `GraphInstancedObject`, or
any other wrapper registered under `name`) added to this scene — as
opposed to `findByName`, which walks the raw `THREE.Object3D` graph.

**Kind**: instance method of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
**Returns**: <code>\*</code> - A fresh array, empty if nothing is registered under `name`.  
**Throws**:

- <code>TypeError</code> If `name` is not a non-empty string.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| name | <code>string</code> | 

**Example**  
```js
scene.selectByName('bars'); // [GraphInstancedObject]
```
<a name="module_GraphScene.GraphScene+selectAll"></a>

### graphScene.selectAll(name) ⇒ <code>Selection</code>
A `Selection` over every `GraphObject` registered under `name` — the
join-ready counterpart to `selectByName` (which hands back raw wrapper
instances). Auto-chooses the backend from what's actually registered:
one `GraphInstancedObject` → an `'instanced'` backend spanning its
currently rendered instances (`object.count`); one or more `GraphMesh`es
→ a `'meshes'` backend. `selectByName`/`selectInstance` remain the
low-level escape hatches beneath this — reach for them directly when you
need the raw wrapper instances rather than a `Selection`.

Nothing registered under `name` returns an empty, template-less
`Selection` — reading it (`size`, `data`, ...) works, but joining new
data onto it and calling `.enter()` throws, since there's no mesh
template or `GraphInstancedObject` to materialize new members into
(construct a `Selection` directly with a template, or create the
initial batch via `GraphObjectFactory` first, then `selectAll` finds it).

**Kind**: instance method of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
**Throws**:

- <code>TypeError</code> If `name` is not a non-empty string.
- <code>Error</code> If `name` resolves to a mix of instanced and non-instanced
  objects, or more than one instanced object.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| name | <code>string</code> | 

**Example**  
```js
scene.selectAll('bars').attr('color', (d) => palette(d.category));
```
<a name="module_GraphScene.GraphScene+selectInstance"></a>

### graphScene.selectInstance(name, index) ⇒ <code>Object</code>
Resolve a single indexed slot on the `GraphInstancedObject` registered
under `name`, for interaction code (Phase 9) that picks one instance out
of a batch rather than the whole object.

**Kind**: instance method of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
**Throws**:

- <code>TypeError</code> If `name` is not a non-empty string, or `index` is not a non-negative integer.
- <code>Error</code> If zero or more than one instanced object is registered under `name`.
- <code>RangeError</code> If `index` exceeds the object's capacity.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| name | <code>string</code> | 
| index | <code>number</code> | 

**Example**  
```js
scene.selectInstance('bars', 12); // { object: GraphInstancedObject, index: 12 }
```
<a name="module_GraphScene.GraphScene+setViewports"></a>

### graphScene.setViewports(viewports) ⇒ <code>this</code>
Set the viewport layout for this scene. Each entry uses normalized [0, 1]
canvas coordinates `{ x, y, width, height }`. Providing multiple viewports
enables picture-in-picture or side-by-side rendering.

**Kind**: instance method of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
**Throws**:

- <code>TypeError</code> If `viewports` is not a non-empty array of `{ x, y, width, height }` objects.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| viewports | <code>Object</code> | 

**Example**  
```js
// Side-by-side
scene.setViewports([
  { x: 0,   y: 0, width: 0.5, height: 1 },
  { x: 0.5, y: 0, width: 0.5, height: 1 },
]);
```
**Example**  
```js
// Picture-in-picture: full canvas + top-right inset
scene.setViewports([
  { x: 0,    y: 0,    width: 1,    height: 1    },
  { x: 0.75, y: 0.75, width: 0.25, height: 0.25 },
]);
```
<a name="module_GraphScene.GraphScene+dispose"></a>

### graphScene.dispose()
Release all GPU resources reachable from this scene.

Walks the full THREE.Scene graph and calls `.dispose()` on every
geometry, material, and texture it encounters. After walking, clears
the scene graph. Idempotent — safe to call twice.

This is the **disposal foundation** for Phase 2. Sub-components added
in later prompts must add their resources to the scene graph for this
walk to cover them automatically.

**Kind**: instance method of [<code>GraphScene</code>](#module_GraphScene.GraphScene)  
**Example**  
```js
scene.dispose();
```
