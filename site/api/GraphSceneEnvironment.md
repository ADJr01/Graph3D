# GraphSceneEnvironment

<a name="module_GraphSceneEnvironment.GraphSceneEnvironment"></a>

## GraphSceneEnvironment
Manages the environment (HDR lighting, background, fog) of a THREE.Scene.

`setHDR`/`setSkybox` accept `.hdr` and `.exr` files — including an object
URL from a `<input type="file">` picker, for a developer letting an end
user supply their own HDRI.

HDR textures loaded via `setHDR` are ref-counted across all instances:
the same URL loads once and the textures are disposed only when the last
instance that holds a reference calls `dispose()` or loads a different HDR.

**Built-in presets** — pass a preset name instead of a URL to `setHDR`:
- `'studio-1k'`
- `'cinema-night'`
- `'daylight'`

**Kind**: static class of [<code>GraphSceneEnvironment</code>](#module_GraphSceneEnvironment)  

* [.GraphSceneEnvironment](#module_GraphSceneEnvironment.GraphSceneEnvironment)
    * [new exports.GraphSceneEnvironment(options)](#new_module_GraphSceneEnvironment.GraphSceneEnvironment_new)
    * [.fogPreset](#module_GraphSceneEnvironment.GraphSceneEnvironment+fogPreset) ⇒ <code>string</code> \| <code>null</code>
    * [.setHDR(url, [options])](#module_GraphSceneEnvironment.GraphSceneEnvironment+setHDR) ⇒ <code>\*</code>
    * [.setBackground(value)](#module_GraphSceneEnvironment.GraphSceneEnvironment+setBackground) ⇒ <code>this</code>
    * [.setFog(input)](#module_GraphSceneEnvironment.GraphSceneEnvironment+setFog) ⇒ <code>this</code>
    * [.setSkybox(input)](#module_GraphSceneEnvironment.GraphSceneEnvironment+setSkybox) ⇒ <code>\*</code>
    * [.clear()](#module_GraphSceneEnvironment.GraphSceneEnvironment+clear) ⇒ <code>this</code>
    * [.dispose()](#module_GraphSceneEnvironment.GraphSceneEnvironment+dispose)

<a name="new_module_GraphSceneEnvironment.GraphSceneEnvironment_new"></a>

### new exports.GraphSceneEnvironment(options)
**Throws**:

- <code>TypeError</code> If `renderer` or `scene` are not the expected types.


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

**Example**  
```js
const env = new GraphSceneEnvironment({ renderer, scene });
await env.setHDR('studio-1k');
env.setFog('volumetric-cinematic');
// or with custom params:
env.setFog({ type: 'exponential', color: 0x112244, density: 0.02 });
```
<a name="module_GraphSceneEnvironment.GraphSceneEnvironment+fogPreset"></a>

### graphSceneEnvironment.fogPreset ⇒ <code>string</code> \| <code>null</code>
The active named fog preset, or `null` when no preset is active.
Volumetric preset names are also stored in `scene.userData.graph3d_fogPreset`
so that future postfx passes can detect them.

**Kind**: instance property of [<code>GraphSceneEnvironment</code>](#module_GraphSceneEnvironment.GraphSceneEnvironment)  
<a name="module_GraphSceneEnvironment.GraphSceneEnvironment+setHDR"></a>

### graphSceneEnvironment.setHDR(url, [options]) ⇒ <code>\*</code>
Load an HDR or EXR file and apply it as the scene environment map (for PBR
reflections) and optionally as the scene background.

Accepts a URL string (`.hdr` or `.exr`, own asset or remote) or a
built-in preset name (`'studio-1k'`, `'cinema-night'`, `'daylight'`).
Textures are ref-counted across instances sharing the same URL — the file
is fetched and processed only once.

For a user-supplied HDRI (e.g. an `<input type="file">` picker), pass
`URL.createObjectURL(file) + '#' + file.name` — object URLs carry no
extension on their own, and the `#name.ext` suffix is how the loader is
selected (see `_equirectExtension`).

The previous HDR's ref is only released once the new one has finished loading,
so a rejected load (bad URL, missing file) leaves the previously-applied HDR
fully intact rather than disposing it out from under the scene. Calling
`setHDR()` again before a prior call resolves supersedes it: the earlier
call releases its own ref instead of leaking it or clobbering the newer state
(and never touches the loading overlay, which belongs to the newer call).

Loading never blocks the calling code — the network fetch is already
async, so `await`-ing this call never freezes the tab. What it does
pause is the shared `Graph3DLoop` (the one RAF loop for the whole page,
per CLAUDE.md's single-loop guarantee): the loop stops for the duration
of the load and restarts once the HDR is applied (or the load fails), so
nothing animates behind the loader. A full overlay — "loading assets"
plus a spinner — covers the renderer's canvas for the same duration.
Overlapping `setHDR()` calls (this instance or another scene's) share one
ref-counted pause, so the loop only resumes once the last of them settles
— and `dispose()` force-releases this instance's share immediately, so a
load that never resolves can't leave the shared loop paused forever.
For the HDR to be visible in the very *first* rendered frame, `await`
this method before calling the chart's `render()` — it's still safe to
call at any other time; the environment/background apply the moment
loading completes.

**Kind**: instance method of [<code>GraphSceneEnvironment</code>](#module_GraphSceneEnvironment.GraphSceneEnvironment)  
**Throws**:

- <code>Error</code> If the HDR file cannot be loaded.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| url | <code>string</code> |  | URL or built-in preset name. |
| [options] | <code>Object</code> |  |  |
| [options.asBackground] | <code>boolean</code> | <code>true</code> | Also set as scene.background. |

**Example**  
```js
await env.setHDR('studio-1k'); // call before chart.render() for the first frame to include it
```
**Example**  
```js
await env.setHDR('/textures/custom.hdr', { asBackground: false });
```
**Example**  
```js
await env.setHDR(URL.createObjectURL(file) + '#' + file.name); // user-picked file
```
<a name="module_GraphSceneEnvironment.GraphSceneEnvironment+setBackground"></a>

### graphSceneEnvironment.setBackground(value) ⇒ <code>this</code>
Set the scene background.

- `null` / `undefined` — clear the background.
- `number` or `string` — parsed as a hex colour (`0xff0000`, `'#ff0000'`).
- `THREE.Color` — used directly.
- `THREE.Texture` / `THREE.CubeTexture` — set directly; caller owns lifecycle.

**Kind**: instance method of [<code>GraphSceneEnvironment</code>](#module_GraphSceneEnvironment.GraphSceneEnvironment)  
**Throws**:

- <code>TypeError</code> If `value` is none of the accepted types.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| value | <code>null</code> \| <code>number</code> \| <code>string</code> \| <code>THREE.Color</code> \| <code>THREE.Texture</code> \| <code>THREE.CubeTexture</code> | 

**Example**  
```js
env.setBackground(0x112233);
```
**Example**  
```js
env.setBackground(new THREE.Color('skyblue'));
```
**Example**  
```js
env.setBackground(null); // transparent / no background
```
<a name="module_GraphSceneEnvironment.GraphSceneEnvironment+setFog"></a>

### graphSceneEnvironment.setFog(input) ⇒ <code>this</code>
Configure scene fog using a named preset or a custom options object.

**String presets** (recommended — good defaults included):
- `'linear'` — cool grey-blue linear fog
- `'exponential'` — muted blue-grey exponential haze
- `'volumetric-low'` — warm atmospheric volumetric haze (renders as exponential fog; not yet wired to a postfx pass)
- `'volumetric-cinematic'` — deep-blue night volumetric (renders as exponential fog; auto-activates `postfx`'s `godRays` pass once `graph3d.postfx` is accessed)

**Object form** (custom values, existing behavior):
- `{ type: 'linear', color?, near?, far? }`
- `{ type: 'exponential', color?, density? }`

Volumetric presets always render as exponential fog (there is no
raymarched fog-volume renderer) and emit a `console.warn` saying so, and
store the preset name in `scene.userData.graph3d_fogPreset` so `postfx`'s
`godRays` pass can detect it.

**Kind**: instance method of [<code>GraphSceneEnvironment</code>](#module_GraphSceneEnvironment.GraphSceneEnvironment)  
**Throws**:

- <code>TypeError</code> If the preset name or fog type is not recognised.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| input | <code>Object</code> | 

**Example**  
```js
env.setFog('volumetric-cinematic');
```
**Example**  
```js
env.setFog({ type: 'linear', color: 0xcccccc, near: 10, far: 100 });
```
<a name="module_GraphSceneEnvironment.GraphSceneEnvironment+setSkybox"></a>

### graphSceneEnvironment.setSkybox(input) ⇒ <code>\*</code>
Set the scene background to a cube skybox or an equirectangular image.

- Array of 6 URL strings → loaded as a `THREE.CubeTexture` (±X, ±Y, ±Z order).
- Single URL string → loaded as an equirectangular texture. Use `.hdr` or
  `.exr` for HDR equirects; other extensions are loaded via `THREE.TextureLoader`.

The textures set here are **not** ref-counted; the caller is responsible for
disposing them if needed. Does not affect `scene.environment`.

**Kind**: instance method of [<code>GraphSceneEnvironment</code>](#module_GraphSceneEnvironment.GraphSceneEnvironment)  
**Throws**:

- <code>TypeError</code> If `input` is not a 6-element array or a string.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| input | <code>\*</code> | 

**Example**  
```js
await env.setSkybox(['+x.png', '-x.png', '+y.png', '-y.png', '+z.png', '-z.png']);
```
**Example**  
```js
await env.setSkybox('/textures/sky.hdr');
```
<a name="module_GraphSceneEnvironment.GraphSceneEnvironment+clear"></a>

### graphSceneEnvironment.clear() ⇒ <code>this</code>
Remove the environment map, background, and fog from the scene.
Releases the ref-counted HDR texture if one was set via `setHDR`.

**Kind**: instance method of [<code>GraphSceneEnvironment</code>](#module_GraphSceneEnvironment.GraphSceneEnvironment)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
env.clear();
```
<a name="module_GraphSceneEnvironment.GraphSceneEnvironment+dispose"></a>

### graphSceneEnvironment.dispose()
Release held HDR texture references.
Idempotent — safe to call twice.
Does NOT null `scene.environment`/`scene.background` — call `clear()` first
if you need the scene reset.

**Kind**: instance method of [<code>GraphSceneEnvironment</code>](#module_GraphSceneEnvironment.GraphSceneEnvironment)  
**Example**  
```js
env.dispose();
```
