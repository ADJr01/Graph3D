# GraphObjectMaterial

<a name="module_GraphObjectMaterial.GraphObjectMaterial"></a>

## GraphObjectMaterial
Material-layer wrapper around a single `GraphMesh`/`GraphInstancedObject`'smaterial — swapping it, promoting it to a custom shader, wiringself-updating uniforms, and assigning PBR texture maps, all through onenarrow surface instead of reaching into `target.three.material` directly.`material/` sits above `object/` in the CLAUDE.md layer table, so thisclass importing `GraphMesh`/`GraphInstancedObject` is an ordinary downwardimport, not one of the sanctioned upward exceptions — it's what lets`GraphMesh`'s own `material` getter stay a raw `THREE.Material` (see thatfile's comment) while still giving callers a richer wrapper on request.Multi-material targets (`target.three.material` as an array) aren'tsupported — there's no single slot for `set`/`setMap` to address. Operateon `target.three.material[i]` directly for those.`set()`/`setMap()` are ref-count-aware (Prompt 111, `core/GraphDisposal.js`'s`retainTexture`/`releaseTexture`): swapping between two materials thatshare a texture (or a map slot's old/new value) never disposes it out fromunder the one still using it, since both sides of a single `set()`/`setMap()` call are visible to that one call. This does **not** extend totwo *independently* constructed `GraphObjectMaterial`s that happen toshare a texture from the start (e.g. one `THREE.CubeTexture` handed tomany separate `material.crystal()` calls) — there's no way for onewrapper's constructor to know a texture is already used elsewhere withoutwalking the whole scene. For that case, call `retainTexture(texture)`yourself once per extra material sharing it (see `core/GraphDisposal.js`).

**Kind**: static class of [<code>GraphObjectMaterial</code>](#module_GraphObjectMaterial)  

* [.GraphObjectMaterial](#module_GraphObjectMaterial.GraphObjectMaterial)
    * [new exports.GraphObjectMaterial(target)](#new_module_GraphObjectMaterial.GraphObjectMaterial_new)
    * [.material](#module_GraphObjectMaterial.GraphObjectMaterial+material) ⇒ <code>THREE.Material</code>
    * [.set(material)](#module_GraphObjectMaterial.GraphObjectMaterial+set) ⇒ <code>this</code>
    * [.applyShader(shaderMaterial, [options])](#module_GraphObjectMaterial.GraphObjectMaterial+applyShader) ⇒ <code>this</code>
    * [.bindUniforms(uniforms)](#module_GraphObjectMaterial.GraphObjectMaterial+bindUniforms) ⇒ <code>this</code>
    * [.setMap(slot, texture)](#module_GraphObjectMaterial.GraphObjectMaterial+setMap) ⇒ <code>this</code>
    * [.dispose()](#module_GraphObjectMaterial.GraphObjectMaterial+dispose) ⇒ <code>void</code>

<a name="new_module_GraphObjectMaterial.GraphObjectMaterial_new"></a>

### new exports.GraphObjectMaterial(target)
**Throws**:

- <code>TypeError</code> If `target` is not a `GraphMesh` or `GraphInstancedObject`.
- <code>TypeError</code> If `target`'s current material is a multi-material array.
- <code>Error</code> If `target` has already been disposed.


| Param | Type |
| --- | --- |
| target | <code>GraphMesh</code> \| <code>GraphInstancedObject</code> | 

**Example**  
```js
const wrapper = new GraphObjectMaterial(bar); // bar: GraphMeshwrapper.set(new THREE.MeshStandardMaterial({ color: 'crimson' }));wrapper.setMap('roughness', roughnessTexture);
```
**Example**  
```js
// Custom shader with self-updating uniforms:wrapper.applyShader(new THREE.ShaderMaterial({ uniforms: {}, vertexShader, fragmentShader }));wrapper.bindUniforms({ time: 'auto', resolution: 'auto', intensity: 1.5 });
```
<a name="module_GraphObjectMaterial.GraphObjectMaterial+material"></a>

### graphObjectMaterial.material ⇒ <code>THREE.Material</code>
The target's current material — a live read, not a cached snapshot.

**Kind**: instance property of [<code>GraphObjectMaterial</code>](#module_GraphObjectMaterial.GraphObjectMaterial)  
**Throws**:

- <code>Error</code> If called after `dispose()`, or if the wrapped target has been disposed.

**Example**  
```js
wrapper.material.color.set('crimson');
```
<a name="module_GraphObjectMaterial.GraphObjectMaterial+set"></a>

### graphObjectMaterial.set(material) ⇒ <code>this</code>
Replace the target's material outright, disposing the one beingreplaced (GPU cleanup — do not call this with a material you intend toreuse elsewhere; reconstruct it instead). Textures the new materialreferences are retained *before* the old material's textures arereleased, so a texture shared between the two (e.g. the same `envMap`)survives the swap instead of being disposed out from under the newmaterial.

**Kind**: instance method of [<code>GraphObjectMaterial</code>](#module_GraphObjectMaterial.GraphObjectMaterial)  
**Throws**:

- <code>TypeError</code> If `material` is not a `THREE.Material` instance.
- <code>Error</code> If called after `dispose()`, or if the wrapped target has been disposed.


| Param | Type |
| --- | --- |
| material | <code>THREE.Material</code> | 

**Example**  
```js
wrapper.set(new THREE.MeshPhysicalMaterial({ metalness: 1 }));
```
<a name="module_GraphObjectMaterial.GraphObjectMaterial+applyShader"></a>

### graphObjectMaterial.applyShader(shaderMaterial, [options]) ⇒ <code>this</code>
Promote the target to a custom `THREE.ShaderMaterial`/`RawShaderMaterial`.A thin, self-documenting alias for `set()` — use `bindUniforms()`afterward to wire its `uniforms`.Pass `preserveUniforms: true` for dev-mode shader hot-reload: values ofany uniform *name* present in both the current material and`shaderMaterial` (including textures — safe thanks to `set()`'s ownref-counted swap, Prompt 111) are copied onto `shaderMaterial` beforethe swap, so re-applying a shader you've only edited the GLSL *text* ofkeeps whatever values you'd already tweaked (`bindUniforms`,`Selection.style`, ...) instead of resetting to `shaderMaterial`'s owndefaults. Defaults to `false` — for two *unrelated* shaders (e.g.`holographic` → `crystal`) that happen to share a uniform name like`color`, blindly carrying it over would be a surprising bleed-through,not a helpful reload.

**Kind**: instance method of [<code>GraphObjectMaterial</code>](#module_GraphObjectMaterial.GraphObjectMaterial)  
**Throws**:

- <code>TypeError</code> If `shaderMaterial` is not a `THREE.ShaderMaterial` (or `RawShaderMaterial`).
- <code>Error</code> If called after `dispose()`, or if the wrapped target has been disposed.


| Param | Type |
| --- | --- |
| shaderMaterial | <code>THREE.ShaderMaterial</code> | 
| [options] | <code>Object</code> | 

**Example**  
```js
wrapper.applyShader(new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader }));
```
**Example**  
```js
// Dev-mode hot-reload after editing fragmentShader's GLSL:wrapper.applyShader(recompiledMaterial, { preserveUniforms: true });
```
<a name="module_GraphObjectMaterial.GraphObjectMaterial+bindUniforms"></a>

### graphObjectMaterial.bindUniforms(uniforms) ⇒ <code>this</code>
Wire named entries of the current material's `uniforms` object. Eachvalue is either the literal `'auto'` — currently supported for `time`(seconds elapsed, driven by the shared render loop) and `resolution`(a `THREE.Vector2` of `window.innerWidth/innerHeight * devicePixelRatio`,refreshed on `window`'s `resize` event) — or a static value assigneddirectly to `uniforms[name].value`.THREE.js reads a compiled `ShaderMaterial`'s uniform value objects byreference, so re-binding a name mutates its existing `.value` in placerather than replacing the wrapper — call `bindUniforms` with everyuniform name the shader will ever need before the material's firstrender.

**Kind**: instance method of [<code>GraphObjectMaterial</code>](#module_GraphObjectMaterial.GraphObjectMaterial)  
**Throws**:

- <code>TypeError</code> If `uniforms` is not a plain object.
- <code>Error</code> If the current material has no `uniforms` object (not a shader material).
- <code>Error</code> If `'auto'` is requested for a name other than `time`/`resolution`.
- <code>Error</code> If `resolution: 'auto'` is requested outside a browser (`window` undefined).
- <code>Error</code> If called after `dispose()`, or if the wrapped target has been disposed.


| Param | Type |
| --- | --- |
| uniforms | <code>\*</code> | 

**Example**  
```js
wrapper.bindUniforms({ time: 'auto', resolution: 'auto', intensity: 1.5 });
```
<a name="module_GraphObjectMaterial.GraphObjectMaterial+setMap"></a>

### graphObjectMaterial.setMap(slot, texture) ⇒ <code>this</code>
Assign a texture to a named PBR map slot, releasing (ref-count-aware)whatever texture previously occupied that slot.

**Kind**: instance method of [<code>GraphObjectMaterial</code>](#module_GraphObjectMaterial.GraphObjectMaterial)  
**Throws**:

- <code>TypeError</code> If `slot` is not a recognised name.
- <code>TypeError</code> If `texture` is not a `THREE.Texture` instance.
- <code>Error</code> If the current material has no property for that slot (e.g. `clearcoat` on a non-physical material).
- <code>Error</code> If called after `dispose()`, or if the wrapped target has been disposed.


| Param | Type | Description |
| --- | --- | --- |
| slot | <code>\*</code> | One of: map, normal, roughness, metalness, emissive, ao, env, displacement, clearcoat. |
| texture | <code>THREE.Texture</code> |  |

**Example**  
```js
wrapper.setMap('normal', normalTexture);
```
<a name="module_GraphObjectMaterial.GraphObjectMaterial+dispose"></a>

### graphObjectMaterial.dispose() ⇒ <code>void</code>
Unsubscribe any `'auto'` uniform bindings (render-loop tick, resizelistener). Does not dispose the wrapped material — the target(`GraphMesh`/`GraphInstancedObject`) owns and disposes that itself.Idempotent.

**Kind**: instance method of [<code>GraphObjectMaterial</code>](#module_GraphObjectMaterial.GraphObjectMaterial)  
**Example**  
```js
wrapper.dispose();
```
