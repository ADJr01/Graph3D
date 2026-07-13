# SDFText

<a name="module_SDFText.SDFText"></a>

## SDFText
GPU-rendered, resolution-independent text — samples a bundled MSDF
(multi-channel signed distance field) Roboto atlas, staying crisp at any
viewing distance (no blur, no pixelation), unlike canvas-sprite text
(banned after Phase 6, CLAUDE.md §2). Not a `GraphObject` subclass — plain
composition, exposing the raw `THREE.Mesh` via `.mesh`/`.three` for the
caller to `scene.add()` directly, or wrap in their own `GraphMesh` if they
want registry/disposal-tracking (`new GraphMesh({ scene, name,
geometry: text.mesh.geometry, material: text.mesh.material })`).

**Kind**: static class of [<code>SDFText</code>](#module_SDFText)  

* [.SDFText](#module_SDFText.SDFText)
    * [new exports.SDFText(mesh)](#new_module_SDFText.SDFText_new)
    * _instance_
        * [.mesh](#module_SDFText.SDFText+mesh) ⇒ <code>THREE.Mesh</code>
        * [.three](#module_SDFText.SDFText+three)
        * [.width](#module_SDFText.SDFText+width)
        * [.height](#module_SDFText.SDFText+height)
        * [.dispose()](#module_SDFText.SDFText+dispose) ⇒ <code>void</code>
    * _static_
        * [.create(text, [options])](#module_SDFText.SDFText.create) ⇒ <code>\*</code>

<a name="new_module_SDFText.SDFText_new"></a>

### new exports.SDFText(mesh)

| Param | Type | Description |
| --- | --- | --- |
| mesh | <code>THREE.Mesh</code> | @param {number} width @param {number} height |

**Example**  
```js
const label = await SDFText.create('42%', { fontSize: 0.5, color: '#39ff14' });
scene.add(label.mesh);
// ... later:
label.dispose();
```
**Example**  
```js
const title = await SDFText.create('Revenue', {
  outline: { color: '#000000', width: 0.2 },
  glow: { color: '#66ccff', intensity: 1.5 },
  align: 'center',
});
```
<a name="module_SDFText.SDFText+mesh"></a>

### sdfText.mesh ⇒ <code>THREE.Mesh</code>
The rendered `THREE.Mesh` — add it to a scene yourself (`scene.add(text.mesh)`).

**Kind**: instance property of [<code>SDFText</code>](#module_SDFText.SDFText)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

<a name="module_SDFText.SDFText+three"></a>

### sdfText.three
Alias for `.mesh`, matching `object/`'s wrapper classes' `.three` escape hatch. @returns {THREE.Mesh}

**Kind**: instance property of [<code>SDFText</code>](#module_SDFText.SDFText)  
<a name="module_SDFText.SDFText+width"></a>

### sdfText.width
This text block's total rendered width, in world units (`fontSize`-scaled). @returns {number}

**Kind**: instance property of [<code>SDFText</code>](#module_SDFText.SDFText)  
<a name="module_SDFText.SDFText+height"></a>

### sdfText.height
This text block's total rendered height, in world units (`fontSize`-scaled). @returns {number}

**Kind**: instance property of [<code>SDFText</code>](#module_SDFText.SDFText)  
<a name="module_SDFText.SDFText+dispose"></a>

### sdfText.dispose() ⇒ <code>void</code>
Dispose this text block's own geometry and material. Does **not**
dispose the shared MSDF atlas texture — every `SDFText` instance reuses
the same cached texture (loaded once, see `loadAtlas`), so disposing it
per-instance would break every other still-alive `SDFText`.
Idempotent.

**Kind**: instance method of [<code>SDFText</code>](#module_SDFText.SDFText)  
**Example**  
```js
text.dispose();
```
<a name="module_SDFText.SDFText.create"></a>

### SDFText.create(text, [options]) ⇒ <code>\*</code>
Build a text mesh. Async because loading the (lazily-fetched, cached)
MSDF atlas is inherently asynchronous.

**Kind**: static method of [<code>SDFText</code>](#module_SDFText.SDFText)  
**Throws**:

- <code>TypeError</code> If `text` is not a string, or a numeric option isn't a finite number.
- <code>TypeError</code> If `align` is not `'left'|'center'|'right'`.
- <code>Error</code> If the bundled atlas fails to load (see `loadAtlas`).


| Param | Type |
| --- | --- |
| text | <code>string</code> | 
| [options] | <code>Object</code> | 

**Example**  
```js
const label = await SDFText.create('Hello', { fontSize: 0.4 });
```
