# GraphObject

<a name="module_GraphObject.GraphObject"></a>

## GraphObject
Base wrapper for any scene entity. Every chart-facing object type (meshes,
instanced batches, loaded models) extends this class rather than exposing
raw Three.js objects directly.

Adds `three` to `scene` on construction and removes it on `dispose()`.
Auto-registers under its `name` in a per-scene registry so later lookups
(`GraphScene.selectByName`, Phase 3) can find it without a scene-graph walk.

**Kind**: static class of [<code>GraphObject</code>](#module_GraphObject)  

* [.GraphObject](#module_GraphObject.GraphObject)
    * [new exports.GraphObject(options)](#new_module_GraphObject.GraphObject_new)
    * [.scene](#module_GraphObject.GraphObject+scene) ⇒ <code>THREE.Scene</code>
    * [.name](#module_GraphObject.GraphObject+name) ⇒ <code>string</code>
    * [.three](#module_GraphObject.GraphObject+three) ⇒ <code>THREE.Object3D</code>
    * [.isInstanced](#module_GraphObject.GraphObject+isInstanced) ⇒ <code>boolean</code>
    * [._replaceThree(three)](#module_GraphObject.GraphObject+_replaceThree) ⇒ <code>void</code>
    * [.setName(name)](#module_GraphObject.GraphObject+setName) ⇒ <code>this</code>
    * [.setUserData(key, value)](#module_GraphObject.GraphObject+setUserData) ⇒ <code>this</code>
    * [.getUserData(key)](#module_GraphObject.GraphObject+getUserData) ⇒ <code>\*</code>
    * [.dispose()](#module_GraphObject.GraphObject+dispose)

<a name="new_module_GraphObject.GraphObject_new"></a>

### new exports.GraphObject(options)
**Throws**:

- <code>TypeError</code> If `scene` is not a `THREE.Scene`.
- <code>TypeError</code> If `name` is not a non-empty string.
- <code>TypeError</code> If `three` is not a `THREE.Object3D`.


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

**Example**  
```js
const mesh = new THREE.Mesh(geometry, material);
const obj = new GraphObject({ scene: graphScene.three, name: 'bar_0', three: mesh });
obj.setUserData('value', 42);
obj.dispose();
```
<a name="module_GraphObject.GraphObject+scene"></a>

### graphObject.scene ⇒ <code>THREE.Scene</code>
The `THREE.Scene` this object belongs to.

**Kind**: instance property of [<code>GraphObject</code>](#module_GraphObject.GraphObject)  
<a name="module_GraphObject.GraphObject+name"></a>

### graphObject.name ⇒ <code>string</code>
The current name, as last set by the constructor or `setName`.

**Kind**: instance property of [<code>GraphObject</code>](#module_GraphObject.GraphObject)  
<a name="module_GraphObject.GraphObject+three"></a>

### graphObject.three ⇒ <code>THREE.Object3D</code>
The wrapped `THREE.Object3D` — use as an escape hatch to raw Three.js.

**Kind**: instance property of [<code>GraphObject</code>](#module_GraphObject.GraphObject)  
<a name="module_GraphObject.GraphObject+isInstanced"></a>

### graphObject.isInstanced ⇒ <code>boolean</code>
Whether this wrapper exposes indexed multi-instance access
(`GraphInstancedObject`) rather than a single transform (`GraphMesh`).
Lets `GraphScene.selectInstance` tell the two apart without importing
either concrete subclass.

**Kind**: instance property of [<code>GraphObject</code>](#module_GraphObject.GraphObject)  
<a name="module_GraphObject.GraphObject+_replaceThree"></a>

### graphObject.\_replaceThree(three) ⇒ <code>void</code>
Swap the wrapped `THREE.Object3D` for a new one, carrying over the
current `name` and scene attachment. For subclasses that must
reallocate their underlying Three.js object in place — e.g.
`GraphInstancedObject` rebuilding a larger `InstancedMesh` when growing
capacity — instead of disposing and reconstructing the whole wrapper.
Does not dispose the outgoing object; the caller releases its GPU
resources before or after calling this.

**Kind**: instance method of [<code>GraphObject</code>](#module_GraphObject.GraphObject)  
**Throws**:

- <code>TypeError</code> If `three` is not a `THREE.Object3D`.
- <code>Error</code> If called after `dispose()`.

**Access**: protected  

| Param | Type |
| --- | --- |
| three | <code>THREE.Object3D</code> | 

<a name="module_GraphObject.GraphObject+setName"></a>

### graphObject.setName(name) ⇒ <code>this</code>
Rename this object, updating both `three.name` and the per-scene registry.

**Kind**: instance method of [<code>GraphObject</code>](#module_GraphObject.GraphObject)  
**Throws**:

- <code>TypeError</code> If `name` is not a non-empty string.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| name | <code>string</code> | 

**Example**  
```js
obj.setName('bar_1');
```
<a name="module_GraphObject.GraphObject+setUserData"></a>

### graphObject.setUserData(key, value) ⇒ <code>this</code>
Store a value under `three.userData.graph3d.*`, namespaced to avoid
colliding with userData set by other Three.js code or loaders.

**Kind**: instance method of [<code>GraphObject</code>](#module_GraphObject.GraphObject)  
**Throws**:

- <code>TypeError</code> If `key` is not a non-empty string.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| key | <code>string</code> | 
| value | <code>\*</code> | 

**Example**  
```js
obj.setUserData('value', 42);
```
<a name="module_GraphObject.GraphObject+getUserData"></a>

### graphObject.getUserData(key) ⇒ <code>\*</code>
Read a value previously stored via `setUserData`.

**Kind**: instance method of [<code>GraphObject</code>](#module_GraphObject.GraphObject)  
**Returns**: <code>\*</code> - The stored value, or `undefined` if never set.  
**Throws**:

- <code>TypeError</code> If `key` is not a non-empty string.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| key | <code>string</code> | 

**Example**  
```js
obj.getUserData('value'); // 42
```
<a name="module_GraphObject.GraphObject+dispose"></a>

### graphObject.dispose()
Remove `three` from its scene and unregister from the per-scene registry.
Idempotent — safe to call twice. Does not dispose `three`'s geometry or
material — subclasses that own GPU resources (`GraphMesh`,
`GraphInstancedObject`) are responsible for releasing those themselves.

**Kind**: instance method of [<code>GraphObject</code>](#module_GraphObject.GraphObject)  
**Example**  
```js
obj.dispose();
```
