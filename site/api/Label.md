# Label

<a name="module_Label.Label"></a>

## Label
A chainable, disposable, GPU-text label — wraps `SDFText` + a real
`GraphMesh` behind one primitive, so `Axis`, `annotation.label`, and
`graphHTML` can each stop hand-rolling the same "build SDF text, recenter
it, billboard it, dispose it" sequence a third and fourth time (CLAUDE.md
§1.1's DRY two-strike rule — `Axis.js` and `GraphHTML.js`'s fallback path
were the first two independent copies; see improvement.md section (c)).

Calling `.text()`/`.font()`/`.anchor()` again after `.render()` rebuilds
the live mesh's geometry in place — the update capability `graphHTML()`
never got (`.claude/TODO.md`). `.position()` after `.render()` is cheap
(no rebuild, just repositions the existing mesh). Billboarding is opt-in
via `.billboard(camera)` and shares one `loop` registration across every
currently-billboarded label (`billboardRegistry.js`), not one per label.

**Kind**: static class of [<code>Label</code>](#module_Label)  

* [.Label](#module_Label.Label)
    * [new exports.Label()](#new_module_Label.Label_new)
    * [.mesh](#module_Label.Label+mesh) ⇒ <code>\*</code>
    * [.ready](#module_Label.Label+ready) ⇒ <code>\*</code>
    * [.text(value)](#module_Label.Label+text) ⇒ <code>this</code>
    * [.position(position)](#module_Label.Label+position) ⇒ <code>this</code>
    * [.font(options)](#module_Label.Label+font) ⇒ <code>this</code>
    * [.anchor(value)](#module_Label.Label+anchor) ⇒ <code>this</code>
    * [.billboard([camera])](#module_Label.Label+billboard) ⇒ <code>this</code>
    * [.render(scene, name)](#module_Label.Label+render) ⇒ <code>this</code>
    * [.dispose()](#module_Label.Label+dispose)

<a name="new_module_Label.Label_new"></a>

### new exports.Label()
**Example**  
```js
const l = label()
  .text('42%')
  .position({ x: 1, y: 2, z: 0 })
  .font({ fontSize: 0.3, color: '#ffffff' })
  .anchor('center')
  .billboard(camera)
  .render(scene, 'bar_0_label');
l.text('88%'); // updates the live mesh
l.dispose();
```
<a name="module_Label.Label+mesh"></a>

### label.mesh ⇒ <code>\*</code>
The underlying `GraphMesh`, once built — `null` before `.render()` and
while the initial build is still in flight (`SDFText.create()` is
inherently async, so the mesh doesn't exist synchronously).

**Kind**: instance property of [<code>Label</code>](#module_Label.Label)  
<a name="module_Label.Label+ready"></a>

### label.ready ⇒ <code>\*</code>
Resolves once the most recently requested build (from `.render()` or a
later `.text()`/`.font()`/`.anchor()` update) has settled — never
rejects, mirroring `graphHTML()`'s identical `.ready` (a failed build is
logged via `console.error`, not thrown). `.mesh` is reliably non-null
right after this resolves, unless the build failed or was superseded by
a newer update requested before it settled.

**Kind**: instance property of [<code>Label</code>](#module_Label.Label)  
**Example**  
```js
await l.render(scene, 'a').ready;
```
<a name="module_Label.Label+text"></a>

### label.text(value) ⇒ <code>this</code>
Set this label's text. Rebuilds the live mesh's geometry if already rendered.

**Kind**: instance method of [<code>Label</code>](#module_Label.Label)  
**Throws**:

- <code>TypeError</code> If `value` is not a string.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| value | <code>string</code> | 

<a name="module_Label.Label+position"></a>

### label.position(position) ⇒ <code>this</code>
Set this label's anchor position — the world-space point its text is
placed relative to (see `.anchor()` for how). Cheap after `.render()`:
repositions the existing mesh without rebuilding its geometry.

**Kind**: instance method of [<code>Label</code>](#module_Label.Label)  
**Throws**:

- <code>TypeError</code> If `position.x`/`.y`/`.z` isn't a finite number.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| position | <code>Object</code> | 

<a name="module_Label.Label+font"></a>

### label.font(options) ⇒ <code>this</code>
Set (merging with any previous call) this label's typography — the same
option set `SDFText.create()` accepts: `fontSize`, `letterSpacing`,
`align`, `color`, `outline`, `glow`. Rebuilds the live mesh's geometry
if already rendered.

**Kind**: instance method of [<code>Label</code>](#module_Label.Label)  
**Throws**:

- <code>TypeError</code> If `options` is not a plain object.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

<a name="module_Label.Label+anchor"></a>

### label.anchor(value) ⇒ <code>this</code>
Set where this label's text block sits relative to `.position()`:
`'center'` (default) centers the whole block on that point, via
`SDFText.centerOffset` — the same math `Axis`'s tick labels and
`graphHTML`'s SDFText fallback already use. `'start'` places the
block's natural top-left origin at that point instead. Rebuilds the
live mesh's geometry if already rendered (the offset is baked into the
next build's position, not applied via a transform).

**Kind**: instance method of [<code>Label</code>](#module_Label.Label)  
**Throws**:

- <code>TypeError</code> If `value` is not `'center'`/`'start'`.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| value | <code>\*</code> | 

<a name="module_Label.Label+billboard"></a>

### label.billboard([camera]) ⇒ <code>this</code>
Opt in (or out, via `null`) to billboarding — rotating this label's mesh
to face `camera` every frame. Backed by `billboardRegistry.js`'s single
shared `loop` callback, not a dedicated one per label.

**Kind**: instance method of [<code>Label</code>](#module_Label.Label)  
**Throws**:

- <code>TypeError</code> If `camera` is neither a `THREE.Camera` nor `null`.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Default |
| --- | --- | --- |
| [camera] | <code>\*</code> | <code></code> | 

<a name="module_Label.Label+render"></a>

### label.render(scene, name) ⇒ <code>this</code>
Builds this label into `scene` under `name`. Fire-and-forget, matching
`Axis.render({camera})`'s existing pattern: returns `this` synchronously
(`SDFText.create()` is inherently async), and the mesh joins `scene`
once that resolves. Call `.text()`/`.position()`/`.font()`/`.anchor()`
to update the label afterward — do not call `.render()` again.

**Kind**: instance method of [<code>Label</code>](#module_Label.Label)  
**Throws**:

- <code>TypeError</code> If `scene` is not a `THREE.Scene`, or `name` is not a non-empty string.
- <code>Error</code> If already rendered, or called after `dispose()`.


| Param | Type |
| --- | --- |
| scene | <code>Scene</code> | 
| name | <code>string</code> | 

<a name="module_Label.Label+dispose"></a>

### label.dispose()
Disposes the underlying mesh (if built) and unregisters from the
billboard registry. Idempotent; safe before `.render()` has ever been
called, and safe to call while the initial build is still in flight
(the in-flight `SDFText` is discarded once it resolves instead of being
added to the scene).

**Kind**: instance method of [<code>Label</code>](#module_Label.Label)  
**Example**  
```js
l.dispose();
```
