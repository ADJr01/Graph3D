# ParticleSystem

<a name="module_ParticleSystem.ParticleSystem"></a>

## ParticleSystem
GPU-instanced particle system with a fixed-capacity ring-buffer pool
(Prompt 120) plus continuous force behaviors and named presets (Prompt
121). Renders every particle as one instanced draw call — either
camera-facing billboards (default) or a caller-supplied "mesh particle"
geometry. Two simulation backends, chosen once at construction from
`CapabilityProbe`:

- **GPU path** (`webgl2 && floatTextures`): position+age and
  velocity+lifetime each live in their own ping-ponged pair of
  floating-point `WebGLRenderTarget`s, advanced each `update()` by two
  `FullScreenQuad` shader passes run in sequence: (1) velocity += sum of
  active behaviors' acceleration × delta, (2) position += the
  *just-updated* velocity × delta. No per-particle JS work, scales to
  millions of particles. The velocity pass's fragment shader is rebuilt
  (not just re-uniformed) whenever the active behavior *set* changes —
  see `behaviorShaders.js`.
- **CPU path** (fallback, including iOS Safari without float-texture
  support): position/velocity/age/lifetime live in regular
  `InstancedBufferAttribute`s (velocity as a plain typed array, not a
  geometry attribute — the render shader never samples it), integrated in
  a JS loop every `update()` call — correct at any scale, just not
  GPU-parallel.

A particle "dies" once `age >= lifetime` (or was never spawned, i.e.
`lifetime <= 0`) — the shared fragment shader discards it; dead slots are
simply recycled by future `emit()` calls (a ring buffer, not a free-list —
emitting faster than particles die force-recycles the oldest ones).

The particle geometry does not participate in frustum culling
(`object.frustumCulled = false`) since its own local bounds are
meaningless — every particle's real position lives in the simulation
state, not in this object's geometry bounds. Keep the returned `.object`
at the identity transform; bake any offset into emitted particle positions
instead (the vertex shaders assume `modelViewMatrix` composes only the
scene's own view transform, not an additional per-system offset).

**Kind**: static class of [<code>ParticleSystem</code>](#module_ParticleSystem)  

* [.ParticleSystem](#module_ParticleSystem.ParticleSystem)
    * [new exports.ParticleSystem(options)](#new_module_ParticleSystem.ParticleSystem_new)
    * _instance_
        * [.activeBehaviors](#module_ParticleSystem.ParticleSystem+activeBehaviors) ⇒ <code>\*</code>
        * [.simMode](#module_ParticleSystem.ParticleSystem+simMode) ⇒ <code>\*</code>
        * [.billboard](#module_ParticleSystem.ParticleSystem+billboard) ⇒ <code>boolean</code>
        * [.capacity](#module_ParticleSystem.ParticleSystem+capacity) ⇒ <code>number</code>
        * [.object](#module_ParticleSystem.ParticleSystem+object) ⇒ <code>THREE.Mesh</code>
        * [.preset(name, [opts])](#module_ParticleSystem.ParticleSystem+preset) ⇒ <code>this</code>
        * [.addBehavior(name, [opts])](#module_ParticleSystem.ParticleSystem+addBehavior) ⇒ <code>this</code>
        * [.removeBehavior(name)](#module_ParticleSystem.ParticleSystem+removeBehavior) ⇒ <code>this</code>
        * [.configureBehavior(name, opts)](#module_ParticleSystem.ParticleSystem+configureBehavior) ⇒ <code>this</code>
        * [.spawnAt(source, [options])](#module_ParticleSystem.ParticleSystem+spawnAt) ⇒ <code>this</code>
        * [.emit(options)](#module_ParticleSystem.ParticleSystem+emit) ⇒ <code>this</code>
        * [.update(deltaSeconds)](#module_ParticleSystem.ParticleSystem+update) ⇒ <code>void</code>
        * [.dispose()](#module_ParticleSystem.ParticleSystem+dispose) ⇒ <code>void</code>
    * _static_
        * [.registerPreset(name, factory)](#module_ParticleSystem.ParticleSystem.registerPreset) ⇒ <code>void</code>

<a name="new_module_ParticleSystem.ParticleSystem_new"></a>

### new exports.ParticleSystem(options)
**Throws**:

- <code>TypeError</code> If `scene`, `camera`, or `renderer` is missing, if
  `capacity` isn't a positive integer, or if `geometry` is given but
  isn't a `THREE.BufferGeometry`.
- <code>Error</code> If the GPU-simulated path is selected and constructed from
  the UMD `<script>`-tag build without the `three/addons/postprocessing/Pass.js`
  global set (`core/umdCompat.js`).


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| options | <code>Object</code> |  |  |
| options.scene | <code>THREE.Scene</code> |  |  |
| options.camera | <code>THREE.Camera</code> |  | Billboards orient to face this camera. |
| options.renderer | <code>THREE.WebGLRenderer</code> |  |  |
| [options.capacity] | <code>number</code> | <code>10000</code> | Max simultaneous particles.   Rounded up to the nearest perfect square — the GPU path needs a square   simulation texture, and the CPU path uses the same rounded value so   `capacity` means the same thing either way. |
| [options.geometry] | <code>THREE.BufferGeometry</code> |  | Per-particle geometry   for "mesh particle" mode (not disposed by this class — only its   `position`/`index`/`uv` attributes are borrowed by reference into an   internal `InstancedBufferGeometry`). Omit for the default billboard   mode (a camera-facing unit quad this class owns and disposes). |
| [options.billboard] | <code>boolean</code> |  | Defaults to `true` when no   `geometry` is given, `false` otherwise. Set explicitly to billboard a   custom shape instead of letting it keep its own orientation. |
| [options.capabilities] | <code>Capabilities</code> |  | Selects the GPU-simulated path when `webgl2 && floatTextures`;   omitted or lacking either flag falls back to the CPU path (this is the   "feature-detect float-texture support and fall back to CPU update"   requirement — iOS Safari is the motivating case). |

**Example**  
```js
const rain = new ParticleSystem({
  scene: scene.three, camera: scene.camera.three, renderer: g.renderer.three,
  capacity: 100_000, capabilities: g.capabilities,
});
rain.addBehavior('gravity', { strength: 2 });
rain.emit({
  count: 1000,
  position: () => new THREE.Vector3((Math.random() - 0.5) * 20, 20, (Math.random() - 0.5) * 20),
  velocity: new THREE.Vector3(0, -10, 0),
  lifetime: 3,
  size: 0.1,
  color: 0x88aaff,
});
g.loop.add((dt) => rain.update(dt));
// later: rain.dispose();
```
<a name="module_ParticleSystem.ParticleSystem+activeBehaviors"></a>

### particleSystem.activeBehaviors ⇒ <code>\*</code>
**Kind**: instance property of [<code>ParticleSystem</code>](#module_ParticleSystem.ParticleSystem)  
**Returns**: <code>\*</code> - Names of currently-active behaviors.  
<a name="module_ParticleSystem.ParticleSystem+simMode"></a>

### particleSystem.simMode ⇒ <code>\*</code>
**Kind**: instance property of [<code>ParticleSystem</code>](#module_ParticleSystem.ParticleSystem)  
**Returns**: <code>\*</code> - Which simulation backend this instance selected.  
<a name="module_ParticleSystem.ParticleSystem+billboard"></a>

### particleSystem.billboard ⇒ <code>boolean</code>
**Kind**: instance property of [<code>ParticleSystem</code>](#module_ParticleSystem.ParticleSystem)  
**Returns**: <code>boolean</code> - Whether particles render as camera-facing billboards (`false` = mesh particles).  
<a name="module_ParticleSystem.ParticleSystem+capacity"></a>

### particleSystem.capacity ⇒ <code>number</code>
**Kind**: instance property of [<code>ParticleSystem</code>](#module_ParticleSystem.ParticleSystem)  
**Returns**: <code>number</code> - Actual pool size after rounding up to a perfect square.  
<a name="module_ParticleSystem.ParticleSystem+object"></a>

### particleSystem.object ⇒ <code>THREE.Mesh</code>
**Kind**: instance property of [<code>ParticleSystem</code>](#module_ParticleSystem.ParticleSystem)  
**Returns**: <code>THREE.Mesh</code> - The instanced object added to `scene` — do not move it (see class docs).  
<a name="module_ParticleSystem.ParticleSystem+preset"></a>

### particleSystem.preset(name, [opts]) ⇒ <code>this</code>
Applies a registered preset — typically one or more `emit()` calls, and
sometimes a continuous behavior (e.g. `'smoke'` adds `wind`/`curl`).
Behaviors a preset adds are persistent (like any `addBehavior` call) and
keyed by behavior name, not by preset — applying two presets that both
use e.g. `wind` means the second's settings win, since both write the
same `'wind'` slot (see `skipping_list.md`).

**Kind**: instance method of [<code>ParticleSystem</code>](#module_ParticleSystem.ParticleSystem)  
**Throws**:

- <code>Error</code> If `name` is not a registered preset, or if disposed.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| name | <code>string</code> |  | A name previously passed to `registerPreset()`. |
| [opts] | <code>Object</code> | <code>{}</code> | Forwarded to the preset's factory, merged   over its own tuned defaults. |

**Example**  
```js
rain.preset('dust');
```
**Example**  
```js
burst.preset('sparks', { count: 500, position: origin });
```
<a name="module_ParticleSystem.ParticleSystem+addBehavior"></a>

### particleSystem.addBehavior(name, [opts]) ⇒ <code>this</code>
Enable a continuous force behavior (accumulates into particle
acceleration every `update()`). Calling `addBehavior()` again with the
same `name` reconfigures it in place rather than stacking a second
instance — at most one active configuration per behavior name.

**Kind**: instance method of [<code>ParticleSystem</code>](#module_ParticleSystem.ParticleSystem)  
**Throws**:

- <code>TypeError</code> If `name` is not a known behavior.
- <code>Error</code> If disposed.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| name | <code>\*</code> |  |  |
| [opts] | <code>Object</code> | <code>{}</code> | Merged over the behavior's own defaults   (see `behaviors.js`'s `BEHAVIOR_DEFAULTS`). `direction`/`target`/   `center`/`axis` fields take a `THREE.Vector3` — held by reference, so   mutating the same object later live-updates the behavior. |

**Example**  
```js
rain.addBehavior('wind', { strength: 0.5, direction: new THREE.Vector3(1, 0, 0) });
```
<a name="module_ParticleSystem.ParticleSystem+removeBehavior"></a>

### particleSystem.removeBehavior(name) ⇒ <code>this</code>
Disable a previously-added behavior. No-op if `name` isn't active
(mirrors `PostFX.disable`'s `Map`-delete semantics).

**Kind**: instance method of [<code>ParticleSystem</code>](#module_ParticleSystem.ParticleSystem)  
**Throws**:

- <code>Error</code> If disposed.


| Param | Type |
| --- | --- |
| name | <code>string</code> | 

**Example**  
```js
rain.removeBehavior('wind');
```
<a name="module_ParticleSystem.ParticleSystem+configureBehavior"></a>

### particleSystem.configureBehavior(name, opts) ⇒ <code>this</code>
Update options on an already-active behavior.

**Kind**: instance method of [<code>ParticleSystem</code>](#module_ParticleSystem.ParticleSystem)  
**Throws**:

- <code>Error</code> If `name` is not currently active, or if disposed.


| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> |  |
| opts | <code>Object</code> | Shallow-merged into the behavior's current options. |

**Example**  
```js
rain.configureBehavior('wind', { strength: 1.5 });
```
<a name="module_ParticleSystem.ParticleSystem+spawnAt"></a>

### particleSystem.spawnAt(source, [options]) ⇒ <code>this</code>
Spawn `options.count` particles distributed across `source`'s surface
(area-weighted random triangle sampling — see `meshSampling.js`), with
velocity defaulting to outward along each sample's face normal times
`options.speed`. The common "burst/dissolve from a mesh's surface"
emitter (backs the `'dissolve'` preset when given a `mesh` option).

**Kind**: instance method of [<code>ParticleSystem</code>](#module_ParticleSystem.ParticleSystem)  
**Throws**:

- <code>TypeError</code> If `source` isn't a `THREE.Mesh` (or doesn't wrap one).
- <code>Error</code> If disposed.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| source | <code>Object</code> |  | A raw `THREE.Mesh`, or   anything exposing one as `.three` (duck-typed — matches `GraphMesh`   without importing `object/`, which `postfx/` must not do per CLAUDE.md   §1.4). |
| [options] | <code>Object</code> | <code>{}</code> |  |
| [options.count] | <code>number</code> | <code>100</code> |  |
| [options.speed] | <code>number</code> | <code>1</code> | Outward speed along the surface   normal; ignored if `options.velocity` is given. |
| [options.velocity] | <code>\*</code> |  | Overrides the default outward-normal velocity. |
| [options.lifetime] | <code>\*</code> |  |  |
| [options.size] | <code>\*</code> |  |  |
| [options.color] | <code>\*</code> |  |  |
| [options.blending] | <code>THREE.Blending</code> |  |  |

**Example**  
```js
rain.spawnAt(floorMesh, { count: 2000, speed: 2, lifetime: 1.5 });
```
<a name="module_ParticleSystem.ParticleSystem+emit"></a>

### particleSystem.emit(options) ⇒ <code>this</code>
Spawn `count` new particles into the next ring-buffer slots, recycling
the oldest ones if the pool is full. `position`/`velocity`/`lifetime`/
`size`/`color` each accept a fixed value or a `(index) => value`
function called once per particle (`index` runs 0..`count`-1 within
this batch) for per-particle variation.

**Kind**: instance method of [<code>ParticleSystem</code>](#module_ParticleSystem.ParticleSystem)  
**Throws**:

- <code>TypeError</code> If `count` is not a positive integer.
- <code>RangeError</code> If `count` exceeds `capacity`.
- <code>Error</code> If disposed.


| Param | Type | Description |
| --- | --- | --- |
| options | <code>Object</code> |  |
| options.count | <code>number</code> | Positive integer, at most `capacity`. |
| [options.position] | <code>\*</code> | Default `(0,0,0)`. |
| [options.velocity] | <code>\*</code> | Default `(0,0,0)`. |
| [options.lifetime] | <code>\*</code> | Seconds. Default `5`. |
| [options.size] | <code>\*</code> | Default `1`. |
| [options.color] | <code>\*</code> | Default `0xffffff`. |
| [options.blending] | <code>THREE.Blending</code> | Applied to the whole system's   shared material (one draw call, one blend mode) — omit to leave the   current blending mode untouched. |

**Example**  
```js
rain.emit({ count: 1000, velocity: new THREE.Vector3(0, -10, 0), lifetime: 3 });
```
<a name="module_ParticleSystem.ParticleSystem+update"></a>

### particleSystem.update(deltaSeconds) ⇒ <code>void</code>
Advances the simulation by `deltaSeconds` — call once per frame from the
shared render loop (`g.loop.add((dt) => system.update(dt))`; this class
never schedules its own `requestAnimationFrame`, per CLAUDE.md §2).

**Kind**: instance method of [<code>ParticleSystem</code>](#module_ParticleSystem.ParticleSystem)  
**Throws**:

- <code>Error</code> If disposed.


| Param | Type |
| --- | --- |
| deltaSeconds | <code>number</code> | 

**Example**  
```js
g.loop.add((dt) => system.update(dt));
```
<a name="module_ParticleSystem.ParticleSystem+dispose"></a>

### particleSystem.dispose() ⇒ <code>void</code>
Releases the geometry, material, and (GPU path) render targets/textures.
Idempotent — safe to call twice.

**Kind**: instance method of [<code>ParticleSystem</code>](#module_ParticleSystem.ParticleSystem)  
**Example**  
```js
rain.dispose();
```
<a name="module_ParticleSystem.ParticleSystem.registerPreset"></a>

### ParticleSystem.registerPreset(name, factory) ⇒ <code>void</code>
Register a named preset — a reusable "recipe" that calls `emit()`/
`addBehavior()`/`spawnAt()` on the `ParticleSystem` instance it's given
with tuned defaults. Shared by every instance (mirrors
`PostFX.registerPreset`); called once per preset module at import time
(`postfx/particles/presets.js`).

**Kind**: static method of [<code>ParticleSystem</code>](#module_ParticleSystem.ParticleSystem)  
**Throws**:

- <code>TypeError</code> If `name` is not a non-empty string, or `factory` is
  not a function.


| Param | Type |
| --- | --- |
| name | <code>string</code> | 
| factory | <code>\*</code> | 

**Example**  
```js
ParticleSystem.registerPreset('dust', (system, opts) => system.emit({...}));
```
