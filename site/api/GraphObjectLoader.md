# GraphObjectLoader

<a name="module_GraphObjectLoader.GraphObjectLoader"></a>

## GraphObjectLoader
Loads GLTF/GLB, OBJ, and FBX models into `GraphObject`s.

Every `loadX(url)` call for a URL already in flight or already loaded
shares the same network fetch + parse (ref-counted, per format) — each
call still returns its own independently-positionable,
independently-disposable clone.

Draco/KTX2 decoding requires `configureDracoDecoder`/
`configureKTX2Transcoder` to be called first — this package does not bundle
decoder/transcoder binaries, since the correct path depends on how the
consuming app hosts them. Without configuration, GLTFLoader throws its own
clear error if a file actually needs one of them.

**Kind**: static class of [<code>GraphObjectLoader</code>](#module_GraphObjectLoader)  

* [.GraphObjectLoader](#module_GraphObjectLoader.GraphObjectLoader)
    * [new exports.GraphObjectLoader()](#new_module_GraphObjectLoader.GraphObjectLoader_new)
    * [.configureDracoDecoder(path)](#module_GraphObjectLoader.GraphObjectLoader.configureDracoDecoder)
    * [.configureKTX2Transcoder(path, renderer)](#module_GraphObjectLoader.GraphObjectLoader.configureKTX2Transcoder)
    * [.loadGLTF(url, options)](#module_GraphObjectLoader.GraphObjectLoader.loadGLTF) ⇒ <code>\*</code>
    * [.loadOBJ(url, [mtlUrl], options)](#module_GraphObjectLoader.GraphObjectLoader.loadOBJ) ⇒ <code>\*</code>
    * [.loadFBX(url, options)](#module_GraphObjectLoader.GraphObjectLoader.loadFBX) ⇒ <code>\*</code>

<a name="new_module_GraphObjectLoader.GraphObjectLoader_new"></a>

### new exports.GraphObjectLoader()
**Example**  
```js
const model = await GraphObjectLoader.loadGLTF('/models/tree.glb', { scene, name: 'tree' });
```
**Example**  
```js
const model = await GraphObjectLoader.loadOBJ('/models/chair.obj', '/models/chair.mtl', { scene, name: 'chair' });
```
<a name="module_GraphObjectLoader.GraphObjectLoader.configureDracoDecoder"></a>

### GraphObjectLoader.configureDracoDecoder(path)
Configure the Draco decoder path used by `loadGLTF` for
Draco-compressed meshes. Takes effect on the next `loadGLTF` call.

**Kind**: static method of [<code>GraphObjectLoader</code>](#module_GraphObjectLoader.GraphObjectLoader)  
**Throws**:

- <code>TypeError</code> If `path` is not a non-empty string.


| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | Directory containing `draco_decoder.wasm`/`draco_wasm_wrapper.js`. |

**Example**  
```js
GraphObjectLoader.configureDracoDecoder('/decoders/draco/');
```
<a name="module_GraphObjectLoader.GraphObjectLoader.configureKTX2Transcoder"></a>

### GraphObjectLoader.configureKTX2Transcoder(path, renderer)
Configure the KTX2 transcoder path and renderer used by `loadGLTF` for
Basis Universal (KTX2) compressed textures. Takes effect on the next
`loadGLTF` call.

**Kind**: static method of [<code>GraphObjectLoader</code>](#module_GraphObjectLoader.GraphObjectLoader)  
**Throws**:

- <code>TypeError</code> If `path` is not a non-empty string, or `renderer` looks invalid.


| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | Directory containing the Basis transcoder files. |
| renderer | <code>THREE.WebGLRenderer</code> | Used to detect supported GPU texture formats. |

**Example**  
```js
GraphObjectLoader.configureKTX2Transcoder('/decoders/basis/', renderer);
```
<a name="module_GraphObjectLoader.GraphObjectLoader.loadGLTF"></a>

### GraphObjectLoader.loadGLTF(url, options) ⇒ <code>\*</code>
Load a GLTF/GLB model.

**Kind**: static method of [<code>GraphObjectLoader</code>](#module_GraphObjectLoader.GraphObjectLoader)  
**Throws**:

- <code>TypeError</code> If `url` is not a non-empty string.
- <code>Error</code> If the file cannot be loaded or parsed.


| Param | Type |
| --- | --- |
| url | <code>string</code> | 
| options | <code>Object</code> | 

**Example**  
```js
await GraphObjectLoader.loadGLTF('/models/tree.glb', { scene, name: 'tree' });
```
<a name="module_GraphObjectLoader.GraphObjectLoader.loadOBJ"></a>

### GraphObjectLoader.loadOBJ(url, [mtlUrl], options) ⇒ <code>\*</code>
Load an OBJ model, optionally with its companion MTL material file.

**Kind**: static method of [<code>GraphObjectLoader</code>](#module_GraphObjectLoader.GraphObjectLoader)  
**Throws**:

- <code>TypeError</code> If `url` is not a non-empty string, or `mtlUrl` is provided but not a non-empty string.
- <code>Error</code> If the file cannot be loaded or parsed.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| url | <code>string</code> |  |  |
| [mtlUrl] | <code>string</code> \| <code>null</code> | <code>null</code> | URL of a `.mtl` file, or omit for the OBJ's default material. |
| options | <code>Object</code> |  |  |

**Example**  
```js
await GraphObjectLoader.loadOBJ('/models/chair.obj', '/models/chair.mtl', { scene, name: 'chair' });
```
<a name="module_GraphObjectLoader.GraphObjectLoader.loadFBX"></a>

### GraphObjectLoader.loadFBX(url, options) ⇒ <code>\*</code>
Load an FBX model.

**Kind**: static method of [<code>GraphObjectLoader</code>](#module_GraphObjectLoader.GraphObjectLoader)  
**Throws**:

- <code>TypeError</code> If `url` is not a non-empty string.
- <code>Error</code> If the file cannot be loaded or parsed.


| Param | Type |
| --- | --- |
| url | <code>string</code> | 
| options | <code>Object</code> | 

**Example**  
```js
await GraphObjectLoader.loadFBX('/models/robot.fbx', { scene, name: 'robot' });
```
