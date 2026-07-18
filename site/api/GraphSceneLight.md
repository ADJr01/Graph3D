# GraphSceneLight

<a name="module_GraphSceneLight.GraphSceneLight"></a>

## GraphSceneLight
Manages a scene's light rig via named presets, with per-role intensity control
and support for user-added custom lights.

Preset-managed lights (created by `setPreset`) are tracked separately from
user lights (added via `addLight`). Switching presets replaces only the
preset lights; user lights survive.

**RectAreaLight note:** the `studio` and `product-shot` presets include
`THREE.RectAreaLight`. For correct rendering you must call
`RectAreaLightUniformsLib.init()` once before rendering.

**Kind**: static class of [<code>GraphSceneLight</code>](#module_GraphSceneLight)  

* [.GraphSceneLight](#module_GraphSceneLight.GraphSceneLight)
    * [new exports.GraphSceneLight(options)](#new_module_GraphSceneLight.GraphSceneLight_new)
    * [.preset](#module_GraphSceneLight.GraphSceneLight+preset) ⇒ <code>string</code>
    * [.setPreset(name)](#module_GraphSceneLight.GraphSceneLight+setPreset) ⇒ <code>this</code>
    * [.setKeyIntensity(value)](#module_GraphSceneLight.GraphSceneLight+setKeyIntensity) ⇒ <code>this</code>
    * [.setFillIntensity(value)](#module_GraphSceneLight.GraphSceneLight+setFillIntensity) ⇒ <code>this</code>
    * [.setRimIntensity(value)](#module_GraphSceneLight.GraphSceneLight+setRimIntensity) ⇒ <code>this</code>
    * [.setAmbientIntensity(value)](#module_GraphSceneLight.GraphSceneLight+setAmbientIntensity) ⇒ <code>this</code>
    * [.addLight(light, [name])](#module_GraphSceneLight.GraphSceneLight+addLight) ⇒ <code>this</code>
    * [.removeLight(lightOrName)](#module_GraphSceneLight.GraphSceneLight+removeLight) ⇒ <code>this</code>
    * [.dispose()](#module_GraphSceneLight.GraphSceneLight+dispose)

<a name="new_module_GraphSceneLight.GraphSceneLight_new"></a>

### new exports.GraphSceneLight(options)
**Throws**:

- <code>TypeError</code> If `scene` is not a `THREE.Scene`.


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

**Example**  
```js
const lights = new GraphSceneLight({ scene: graphScene.three });
lights.setPreset('cinematic').setKeyIntensity(3).setRimIntensity(2.5);
```
<a name="module_GraphSceneLight.GraphSceneLight+preset"></a>

### graphSceneLight.preset ⇒ <code>string</code>
The currently active preset name.

**Kind**: instance property of [<code>GraphSceneLight</code>](#module_GraphSceneLight.GraphSceneLight)  
<a name="module_GraphSceneLight.GraphSceneLight+setPreset"></a>

### graphSceneLight.setPreset(name) ⇒ <code>this</code>
Replace the light rig with the named preset.
All current preset-managed lights are removed from the scene; user lights
added via `addLight()` are preserved.

Valid presets: `ambient-only`, `three-point`, `studio`, `flat`,
`cinematic`, `product-shot`.

**Kind**: instance method of [<code>GraphSceneLight</code>](#module_GraphSceneLight.GraphSceneLight)  
**Throws**:

- <code>TypeError</code> If `name` is not a recognised preset.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| name | <code>string</code> | 

**Example**  
```js
lights.setPreset('cinematic');
```
<a name="module_GraphSceneLight.GraphSceneLight+setKeyIntensity"></a>

### graphSceneLight.setKeyIntensity(value) ⇒ <code>this</code>
Set the intensity of the key light. No-op if the current preset has no key light.

**Kind**: instance method of [<code>GraphSceneLight</code>](#module_GraphSceneLight.GraphSceneLight)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| value | <code>number</code> | 

**Example**  
```js
lights.setKeyIntensity(2.0);
```
<a name="module_GraphSceneLight.GraphSceneLight+setFillIntensity"></a>

### graphSceneLight.setFillIntensity(value) ⇒ <code>this</code>
Set the intensity of the fill light. No-op if the current preset has no fill light.

**Kind**: instance method of [<code>GraphSceneLight</code>](#module_GraphSceneLight.GraphSceneLight)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| value | <code>number</code> | 

**Example**  
```js
lights.setFillIntensity(0.3);
```
<a name="module_GraphSceneLight.GraphSceneLight+setRimIntensity"></a>

### graphSceneLight.setRimIntensity(value) ⇒ <code>this</code>
Set the intensity of the rim light. No-op if the current preset has no rim light.

**Kind**: instance method of [<code>GraphSceneLight</code>](#module_GraphSceneLight.GraphSceneLight)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| value | <code>number</code> | 

**Example**  
```js
lights.setRimIntensity(1.5);
```
<a name="module_GraphSceneLight.GraphSceneLight+setAmbientIntensity"></a>

### graphSceneLight.setAmbientIntensity(value) ⇒ <code>this</code>
Set the intensity of the ambient light. No-op if the current preset has no ambient light.

**Kind**: instance method of [<code>GraphSceneLight</code>](#module_GraphSceneLight.GraphSceneLight)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| value | <code>number</code> | 

**Example**  
```js
lights.setAmbientIntensity(0.1);
```
<a name="module_GraphSceneLight.GraphSceneLight+addLight"></a>

### graphSceneLight.addLight(light, [name]) ⇒ <code>this</code>
Add a custom light to the scene. The light is tracked by `name` so it can
be removed later. If `name` is omitted an auto-generated name is used.

User lights survive `setPreset()` calls — only preset-managed lights are
replaced on a preset switch.

**Kind**: instance method of [<code>GraphSceneLight</code>](#module_GraphSceneLight.GraphSceneLight)  
**Throws**:

- <code>TypeError</code> If `light` is not a `THREE.Light`.
- <code>Error</code> If a light with the given `name` already exists.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| light | <code>THREE.Light</code> |  |
| [name] | <code>string</code> | Optional identifier for later removal. |

**Example**  
```js
lights.addLight(new THREE.PointLight(0xff0000, 1), 'accent');
```
<a name="module_GraphSceneLight.GraphSceneLight+removeLight"></a>

### graphSceneLight.removeLight(lightOrName) ⇒ <code>this</code>
Remove a light by name or by instance reference.

**Kind**: instance method of [<code>GraphSceneLight</code>](#module_GraphSceneLight.GraphSceneLight)  
**Throws**:

- <code>TypeError</code> If `lightOrName` is neither a string nor a `THREE.Light`.
- <code>Error</code> If no matching light is found.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| lightOrName | <code>string</code> \| <code>THREE.Light</code> | 

**Example**  
```js
lights.removeLight('accent');
```
**Example**  
```js
lights.removeLight(myPointLight);
```
<a name="module_GraphSceneLight.GraphSceneLight+dispose"></a>

### graphSceneLight.dispose()
Remove all managed lights (preset and user) from the scene.
Idempotent — safe to call twice.

**Kind**: instance method of [<code>GraphSceneLight</code>](#module_GraphSceneLight.GraphSceneLight)  
**Example**  
```js
lights.dispose();
```
