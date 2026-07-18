# GraphSceneShadows

<a name="module_GraphSceneShadows.GraphSceneShadows"></a>

## GraphSceneShadows
Configures the renderer's shadow system for a scene.

Supported modes:
- `'pcf'` — standard percentage-closer filtering
- `'pcf-soft'` — softer PCF (slightly more expensive)
- `'vsm'` — variance shadow maps, best for soft shadows
- `'csm'` — cascaded shadow maps for large scenes; lazy-loads
  `three/examples/jsm/csm/CSM.js` and registers a per-frame update
- `'contact'` — VSM tuned for product-shot close-up lighting

`setQuality` controls the shadow map resolution and applies retroactively
to every shadow-casting light already in the scene.

**Kind**: static class of [<code>GraphSceneShadows</code>](#module_GraphSceneShadows)  

* [.GraphSceneShadows](#module_GraphSceneShadows.GraphSceneShadows)
    * [new exports.GraphSceneShadows(options)](#new_module_GraphSceneShadows.GraphSceneShadows_new)
    * [.mode](#module_GraphSceneShadows.GraphSceneShadows+mode)
    * [.quality](#module_GraphSceneShadows.GraphSceneShadows+quality)
    * [.enable(mode)](#module_GraphSceneShadows.GraphSceneShadows+enable) ⇒ <code>\*</code>
    * [.disable()](#module_GraphSceneShadows.GraphSceneShadows+disable) ⇒ <code>this</code>
    * [.setQuality(level)](#module_GraphSceneShadows.GraphSceneShadows+setQuality) ⇒ <code>this</code>
    * [.dispose()](#module_GraphSceneShadows.GraphSceneShadows+dispose)

<a name="new_module_GraphSceneShadows.GraphSceneShadows_new"></a>

### new exports.GraphSceneShadows(options)
**Throws**:

- <code>TypeError</code> If `renderer`, `scene`, or `camera` are not the expected types.


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

**Example**  
```js
const shadows = new GraphSceneShadows({ renderer, scene, camera });
await shadows.enable('pcf-soft');
shadows.setQuality('high');
```
**Example**  
```js
// CSM for large terrains
await shadows.enable('csm');
```
<a name="module_GraphSceneShadows.GraphSceneShadows+mode"></a>

### graphSceneShadows.mode
The currently active mode, or `null` when shadows are disabled. @returns {string|null}

**Kind**: instance property of [<code>GraphSceneShadows</code>](#module_GraphSceneShadows.GraphSceneShadows)  
<a name="module_GraphSceneShadows.GraphSceneShadows+quality"></a>

### graphSceneShadows.quality
The current quality level. @returns {string}

**Kind**: instance property of [<code>GraphSceneShadows</code>](#module_GraphSceneShadows.GraphSceneShadows)  
<a name="module_GraphSceneShadows.GraphSceneShadows+enable"></a>

### graphSceneShadows.enable(mode) ⇒ <code>\*</code>
Enable shadows with the given mode.

Returns a `Promise<this>` so that `csm` mode (which lazy-loads a module)
and standard modes share the same calling convention. For non-CSM modes
the promise resolves immediately.

Calling `enable` while a previous mode is active tears down the previous
mode first. Calling `enable('csm')` while a prior CSM load is still in
flight cancels that load.

**Kind**: instance method of [<code>GraphSceneShadows</code>](#module_GraphSceneShadows.GraphSceneShadows)  
**Throws**:

- <code>TypeError</code> If `mode` is not recognised.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| mode | <code>\*</code> | 

**Example**  
```js
await shadows.enable('pcf-soft');
```
**Example**  
```js
await shadows.enable('csm');
```
<a name="module_GraphSceneShadows.GraphSceneShadows+disable"></a>

### graphSceneShadows.disable() ⇒ <code>this</code>
Disable shadows and tear down any active CSM instance.

**Kind**: instance method of [<code>GraphSceneShadows</code>](#module_GraphSceneShadows.GraphSceneShadows)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
shadows.disable();
```
<a name="module_GraphSceneShadows.GraphSceneShadows+setQuality"></a>

### graphSceneShadows.setQuality(level) ⇒ <code>this</code>
Set the shadow map resolution. Applies immediately to every shadow-casting
light in the scene; the new size takes effect on the next rendered frame.

Call `setQuality` before `enable('csm')` to control CSM cascade map size;
changing quality after CSM is active does not resize the CSM maps (recreate
with `disable()` → `setQuality()` → `enable('csm')`).

**Kind**: instance method of [<code>GraphSceneShadows</code>](#module_GraphSceneShadows.GraphSceneShadows)  
**Throws**:

- <code>TypeError</code> If `level` is not recognised.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| level | <code>\*</code> | 

**Example**  
```js
shadows.setQuality('high');
```
<a name="module_GraphSceneShadows.GraphSceneShadows+dispose"></a>

### graphSceneShadows.dispose()
Remove all shadow resources and loop callbacks.
Idempotent — safe to call twice.

**Kind**: instance method of [<code>GraphSceneShadows</code>](#module_GraphSceneShadows.GraphSceneShadows)  
**Example**  
```js
shadows.dispose();
```
