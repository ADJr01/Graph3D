# PostFX

<a name="module_PostFX.PostFX"></a>

## PostFX
Thin, chart-agnostic wrapper around Three.js's `EffectComposer`. Owns the
base `RenderPass` plus a named set of optional passes, keeping them sorted
into a canonical chain order no matter what sequence `enable()` was called
in. Chart types (Phase 8) and users request effects through this public
API — no chart type is allowed to build its own `EffectComposer`
(`CLAUDE.md` §2).

Concrete passes ship in later prompts (Prompt 117+) via
`PostFX.registerPass()` — this class only owns the composition mechanics:
enable/disable/configure, ordering, resizing, and disposal.

**Kind**: static class of [<code>PostFX</code>](#module_PostFX)  

* [.PostFX](#module_PostFX.PostFX)
    * [new exports.PostFX(options)](#new_module_PostFX.PostFX_new)
    * _instance_
        * [.enable(name, [opts])](#module_PostFX.PostFX+enable) ⇒ <code>this</code>
        * [.disable(name)](#module_PostFX.PostFX+disable) ⇒ <code>this</code>
        * [.configure(name, opts)](#module_PostFX.PostFX+configure) ⇒ <code>this</code>
        * [.preset(name)](#module_PostFX.PostFX+preset) ⇒ <code>this</code>
        * [.enabled()](#module_PostFX.PostFX+enabled) ⇒ <code>\*</code>
        * [.pipeline(order)](#module_PostFX.PostFX+pipeline) ⇒ <code>this</code>
        * [.setSceneCamera(scene, camera)](#module_PostFX.PostFX+setSceneCamera) ⇒ <code>void</code>
        * [.setSize(width, height)](#module_PostFX.PostFX+setSize) ⇒ <code>void</code>
        * [.render([deltaSeconds])](#module_PostFX.PostFX+render) ⇒ <code>void</code>
        * [.dispose()](#module_PostFX.PostFX+dispose) ⇒ <code>void</code>
    * _static_
        * [.registerPass(name, definition)](#module_PostFX.PostFX.registerPass) ⇒ <code>void</code>
        * [.registerPreset(name, passOpts)](#module_PostFX.PostFX.registerPreset) ⇒ <code>void</code>

<a name="new_module_PostFX.PostFX_new"></a>

### new exports.PostFX(options)
**Throws**:

- <code>TypeError</code> If `renderer`, `scene`, or `camera` is missing.
- <code>Error</code> If constructed from the UMD `<script>`-tag build without the
  `three/addons/postprocessing/{EffectComposer,RenderPass}.js` globals set (`core/umdCompat.js`).


| Param | Type | Description |
| --- | --- | --- |
| options | <code>Object</code> |  |
| options.renderer | <code>WebGLRenderer</code> |  |
| options.scene | <code>Scene</code> |  |
| options.camera | <code>Camera</code> |  |
| [options.capabilities] | <code>Capabilities</code> | Passed through to passes' `canEnable`/`create` as `ctx.capabilities`   (e.g. `ssr`'s weak-GPU auto-disable). Optional — omitting it just means   capability-gated passes can't gate on anything. |

**Example**  
```js
PostFX.registerPass('bloom', {
  order: 10,
  create: ({ renderer }, opts) => new UnrealBloomPass(undefined, opts.strength),
});

const fx = graph3d.postfx; // lazily created, bound to the active scene
fx.enable('bloom', { strength: 1.2 });
fx.configure('bloom', { strength: 0.8 });
fx.enabled(); // ['bloom']
fx.disable('bloom');
```
<a name="module_PostFX.PostFX+enable"></a>

### postFX.enable(name, [opts]) ⇒ <code>this</code>
Turn on a registered pass. Calling `enable()` again on an
already-enabled pass is equivalent to `configure()` with the new options.

**Kind**: instance method of [<code>PostFX</code>](#module_PostFX.PostFX)  
**Throws**:

- <code>TypeError</code> If `name` is not a non-empty string.
- <code>Error</code> If `name` is not a registered pass, or if disposed.
- <code>Error</code> If constructed from the UMD `<script>`-tag build without
  the pass's required `three/addons`/`three/examples/jsm` global set (`core/umdCompat.js`).


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| name | <code>string</code> |  | A name previously passed to `registerPass()`. |
| [opts] | <code>Object</code> | <code>{}</code> |  |

**Example**  
```js
fx.enable('bloom', { strength: 1.2 });
```
<a name="module_PostFX.PostFX+disable"></a>

### postFX.disable(name) ⇒ <code>this</code>
Turn off a pass, disposing its GPU resources. No-op if `name` isn't
currently enabled (mirrors `Set`/`Map`-delete semantics used elsewhere
in this codebase, e.g. `Graph3DLoop.remove`).

**Kind**: instance method of [<code>PostFX</code>](#module_PostFX.PostFX)  
**Throws**:

- <code>Error</code> If disposed.


| Param | Type |
| --- | --- |
| name | <code>string</code> | 

**Example**  
```js
fx.disable('bloom');
```
<a name="module_PostFX.PostFX+configure"></a>

### postFX.configure(name, opts) ⇒ <code>this</code>
Update options on an already-enabled pass.

**Kind**: instance method of [<code>PostFX</code>](#module_PostFX.PostFX)  
**Throws**:

- <code>Error</code> If `name` is not currently enabled, or if disposed.


| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> |  |
| opts | <code>Object</code> | Shallow-merged into the pass's stored options. |

**Example**  
```js
fx.configure('bloom', { strength: 0.5 });
```
<a name="module_PostFX.PostFX+preset"></a>

### postFX.preset(name) ⇒ <code>this</code>
Replace whatever passes are currently active with a named, tuned bundle.
Disables every currently-enabled pass first, then enables exactly the
preset's passes — a deterministic "look" swap, not a merge with
whatever was on before. Also clears any `pipeline()` order override, for
the same reason: a preset is a fresh, deterministic bundle, not a merge.

**Kind**: instance method of [<code>PostFX</code>](#module_PostFX.PostFX)  
**Throws**:

- <code>Error</code> If `name` is not a registered preset, or if disposed.


| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | A name previously passed to `registerPreset()`. |

**Example**  
```js
fx.preset('cinematic');
```
<a name="module_PostFX.PostFX+enabled"></a>

### postFX.enabled() ⇒ <code>\*</code>
**Kind**: instance method of [<code>PostFX</code>](#module_PostFX.PostFX)  
**Returns**: <code>\*</code> - Names of currently-enabled passes, in their actual
  chain order (ascending `order`, or `pipeline()`'s override if set —
  not `enable()` call order).  
**Throws**:

- <code>Error</code> If disposed.

**Example**  
```js
fx.enabled(); // ['ssao', 'bloom', 'fxaa']
```
<a name="module_PostFX.PostFX+pipeline"></a>

### postFX.pipeline(order) ⇒ <code>this</code>
Escape hatch (Prompt 123) for full manual control over the pass chain's
render order, overriding the registered `order`-field auto-sort that
`enable()`/`disable()` normally maintain. Every registered pass still
declares its own `order` (used by presets, by passes enabled after this
override is set, and as the automatic sort whenever no override is
active) — `pipeline()` doesn't change or remove that, it just lets one
call fully override the *current* chain sequence for cases the fixed
`order` values can't express (e.g. wanting `bloom` before `ssao` for a
specific look).

The override is a live filter, not a frozen snapshot: if a pass named in
`order` is later `disable()`d, it's simply skipped; if a *new* pass is
`enable()`d afterward that wasn't named in `order`, it's appended at the
end (sorted among any other such newcomers by their own registered
`order`) rather than silently dropped from the chain.

**Kind**: instance method of [<code>PostFX</code>](#module_PostFX.PostFX)  
**Throws**:

- <code>TypeError</code> If `order` is neither `null` nor an array.
- <code>Error</code> If `order` contains a name that isn't currently enabled,
  a duplicate name, or omits a currently-enabled pass; or if disposed.


| Param | Type | Description |
| --- | --- | --- |
| order | <code>\*</code> | Every currently-enabled pass name, exactly   once, in the desired render sequence. Pass `null` to clear the   override and return to automatic `order`-based sorting. |

**Example**  
```js
fx.enable('ssao').enable('bloom').enable('fxaa');
fx.pipeline(['bloom', 'ssao', 'fxaa']); // bloom now runs first
fx.pipeline(null); // back to automatic order-based sorting
```
<a name="module_PostFX.PostFX+setSceneCamera"></a>

### postFX.setSceneCamera(scene, camera) ⇒ <code>void</code>
Point the base render pass at a different scene/camera. `Graph3D` calls
this every frame so `postfx` keeps following whichever scene is active.

**Kind**: instance method of [<code>PostFX</code>](#module_PostFX.PostFX)  
**Throws**:

- <code>Error</code> If disposed.


| Param | Type |
| --- | --- |
| scene | <code>Scene</code> | 
| camera | <code>Camera</code> | 

**Example**  
```js
fx.setSceneCamera(scene.three, scene.camera.three);
```
<a name="module_PostFX.PostFX+setSize"></a>

### postFX.setSize(width, height) ⇒ <code>void</code>
Resize the composer's internal render targets and every active pass.

**Kind**: instance method of [<code>PostFX</code>](#module_PostFX.PostFX)  
**Throws**:

- <code>Error</code> If disposed.


| Param | Type |
| --- | --- |
| width | <code>number</code> | 
| height | <code>number</code> | 

**Example**  
```js
fx.setSize(window.innerWidth, window.innerHeight);
```
<a name="module_PostFX.PostFX+render"></a>

### postFX.render([deltaSeconds]) ⇒ <code>void</code>
Render one frame through the full pass chain.

**Kind**: instance method of [<code>PostFX</code>](#module_PostFX.PostFX)  
**Throws**:

- <code>Error</code> If disposed.


| Param | Type |
| --- | --- |
| [deltaSeconds] | <code>number</code> | 

**Example**  
```js
fx.render(deltaSeconds);
```
<a name="module_PostFX.PostFX+dispose"></a>

### postFX.dispose() ⇒ <code>void</code>
Release every active pass and the composer's render targets.
Idempotent — safe to call twice.

**Kind**: instance method of [<code>PostFX</code>](#module_PostFX.PostFX)  
**Example**  
```js
fx.dispose();
```
<a name="module_PostFX.PostFX.registerPass"></a>

### PostFX.registerPass(name, definition) ⇒ <code>void</code>
Register a named pass type so it can be turned on with `enable(name)`.
Called once per pass module at import time (Prompt 117+) — the registry
is shared by every `PostFX` instance on the page, not per-instance state.

**Kind**: static method of [<code>PostFX</code>](#module_PostFX.PostFX)  
**Throws**:

- <code>TypeError</code> If `name` is not a non-empty string, `definition.create`
  is not a function, or `definition.order` is not a finite number.


| Param | Type |
| --- | --- |
| name | <code>string</code> | 
| definition | <code>PostFXPassDefinition</code> | 

**Example**  
```js
PostFX.registerPass('vignette', { order: 90, create: () => new VignettePass() });
```
<a name="module_PostFX.PostFX.registerPreset"></a>

### PostFX.registerPreset(name, passOpts) ⇒ <code>void</code>
Register a named preset — a bundle of pass+options combinations applied
atomically by `preset(name)`. Called once per preset module at import
time (`postfx/presets.js`), same rationale as `registerPass`.

**Kind**: static method of [<code>PostFX</code>](#module_PostFX.PostFX)  
**Throws**:

- <code>TypeError</code> If `name` is not a non-empty string, or `passOpts` is
  not a plain object.


| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> |  |
| passOpts | <code>\*</code> | Map of registered pass name to   the options `enable()` should be called with for that pass. |

**Example**  
```js
PostFX.registerPreset('minimal', { fxaa: {} });
```
