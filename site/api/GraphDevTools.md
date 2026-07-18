# GraphDevTools

<a name="module_GraphDevTools.GraphDevTools"></a>

## GraphDevTools
Dev-only debugging surface (Prompt 178), reached via `Graph3D.devtools`.
Every method is either pure introspection (console output + a returned
data structure) or an ephemeral, disposable visual overlay added directly
to the active scene — none of it participates in rendering a chart
correctly, which is why `Graph3D.devtools` throws in production (see that
getter's own doc for the stripping mechanism).

A composition-root exception (CLAUDE.md §1.4, alongside `Graph3D`'s own
`postfx`/`chart`/`GraphScene` imports): debugging needs to reach into
every layer's live state at once, so `GraphDevTools` reads the shared
`anim` singleton directly for `listActiveTimelines` rather than every
layer growing its own parallel debug surface. The other methods take the
object to inspect as an argument (a `Selection`, a `GraphInstancedObject`,
a `Picker.pickAt()` result) instead of importing those layers — only
`anim` needed a direct import, since timelines have no other public
registry to read from.

**Kind**: static class of [<code>GraphDevTools</code>](#module_GraphDevTools)  

* [.GraphDevTools](#module_GraphDevTools.GraphDevTools)
    * [new exports.GraphDevTools(graph3d)](#new_module_GraphDevTools.GraphDevTools_new)
    * [.dumpSceneGraph([scene])](#module_GraphDevTools.GraphDevTools+dumpSceneGraph) ⇒ <code>Object</code>
    * [.listActiveTimelines()](#module_GraphDevTools.GraphDevTools+listActiveTimelines) ⇒ <code>Object</code>
    * [.memorySnapshot()](#module_GraphDevTools.GraphDevTools+memorySnapshot) ⇒ <code>Object</code>
    * [.pickingDebugOverlay(hit)](#module_GraphDevTools.GraphDevTools+pickingDebugOverlay) ⇒ <code>THREE.Mesh</code> \| <code>null</code>
    * [.frustumDebugOverlay([camera])](#module_GraphDevTools.GraphDevTools+frustumDebugOverlay) ⇒ <code>THREE.CameraHelper</code>
    * [.octreeDebugOverlay(instancedObject)](#module_GraphDevTools.GraphDevTools+octreeDebugOverlay) ⇒ <code>THREE.Group</code>
    * [.selectionDebugOverlay(selection)](#module_GraphDevTools.GraphDevTools+selectionDebugOverlay) ⇒ <code>THREE.Group</code>

<a name="new_module_GraphDevTools.GraphDevTools_new"></a>

### new exports.GraphDevTools(graph3d)

| Param | Type |
| --- | --- |
| graph3d | <code>Graph3D</code> | 

**Example**  
```js
g.devtools.dumpSceneGraph();
g.devtools.memorySnapshot();
const helper = g.devtools.frustumDebugOverlay();
// later: g.activeScene.three.remove(helper);
```
<a name="module_GraphDevTools.GraphDevTools+dumpSceneGraph"></a>

### graphDevTools.dumpSceneGraph([scene]) ⇒ <code>Object</code>
Logs an indented tree of `scene`'s contents to the console and returns
the same tree as data.

**Kind**: instance method of [<code>GraphDevTools</code>](#module_GraphDevTools.GraphDevTools)  
**Throws**:

- <code>Error</code> If no scene is given and no scene is active.


| Param | Type | Description |
| --- | --- | --- |
| [scene] | <code>GraphScene</code> | Defaults to the active scene. |

**Example**  
```js
g.devtools.dumpSceneGraph();
```
<a name="module_GraphDevTools.GraphDevTools+listActiveTimelines"></a>

### graphDevTools.listActiveTimelines() ⇒ <code>Object</code>
Every timeline currently registered with the shared `anim` engine.

**Kind**: instance method of [<code>GraphDevTools</code>](#module_GraphDevTools.GraphDevTools)  
**Example**  
```js
g.devtools.listActiveTimelines();
```
<a name="module_GraphDevTools.GraphDevTools+memorySnapshot"></a>

### graphDevTools.memorySnapshot() ⇒ <code>Object</code>
GPU resource counts read from `THREE.WebGLRenderer.info`.

**Kind**: instance method of [<code>GraphDevTools</code>](#module_GraphDevTools.GraphDevTools)  
**Throws**:

- <code>Error</code> If there is no browser renderer (e.g. under SSR).

**Example**  
```js
g.devtools.memorySnapshot();
```
<a name="module_GraphDevTools.GraphDevTools+pickingDebugOverlay"></a>

### graphDevTools.pickingDebugOverlay(hit) ⇒ <code>THREE.Mesh</code> \| <code>null</code>
Adds a wireframe marker at a `Picker.pickAt()` hit's world point.

**Kind**: instance method of [<code>GraphDevTools</code>](#module_GraphDevTools.GraphDevTools)  
**Returns**: <code>THREE.Mesh</code> \| <code>null</code> - The added marker, or `null` if `hit` was `null`.  
**Throws**:

- <code>Error</code> If no scene is active.


| Param | Type |
| --- | --- |
| hit | <code>Object</code> | 

**Example**  
```js
g.devtools.pickingDebugOverlay(picker.pickAt(x, y));
```
<a name="module_GraphDevTools.GraphDevTools+frustumDebugOverlay"></a>

### graphDevTools.frustumDebugOverlay([camera]) ⇒ <code>THREE.CameraHelper</code>
Adds a `THREE.CameraHelper` visualizing `camera`'s frustum.

**Kind**: instance method of [<code>GraphDevTools</code>](#module_GraphDevTools.GraphDevTools)  
**Throws**:

- <code>Error</code> If no scene is active and no `camera` is given.


| Param | Type | Description |
| --- | --- | --- |
| [camera] | <code>THREE.Camera</code> | Defaults to the active scene's camera. |

**Example**  
```js
g.devtools.frustumDebugOverlay();
```
<a name="module_GraphDevTools.GraphDevTools+octreeDebugOverlay"></a>

### graphDevTools.octreeDebugOverlay(instancedObject) ⇒ <code>THREE.Group</code>
Adds a wireframe box for every populated leaf of `instancedObject`'s
internal octree.

**Kind**: instance method of [<code>GraphDevTools</code>](#module_GraphDevTools.GraphDevTools)  
**Throws**:

- <code>TypeError</code> If `instancedObject` doesn't expose an `octree`.
- <code>Error</code> If no scene is active.


| Param | Type |
| --- | --- |
| instancedObject | <code>GraphInstancedObject</code> | 

**Example**  
```js
g.devtools.octreeDebugOverlay(chart.selection().backend.object);
```
<a name="module_GraphDevTools.GraphDevTools+selectionDebugOverlay"></a>

### graphDevTools.selectionDebugOverlay(selection) ⇒ <code>THREE.Group</code>
Logs `selection`'s backend type and member indices, and adds a wireframe
marker at every member's world position.

**Kind**: instance method of [<code>GraphDevTools</code>](#module_GraphDevTools.GraphDevTools)  
**Throws**:

- <code>TypeError</code> If `selection` doesn't expose a `backend`.
- <code>Error</code> If no scene is active.


| Param | Type |
| --- | --- |
| selection | <code>Selection</code> | 

**Example**  
```js
g.devtools.selectionDebugOverlay(chart.selection().filter((d) => d.value > 90));
```
