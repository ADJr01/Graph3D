# GPGPU

<a name="module_GPGPU.GPGPU"></a>

## GPGPU
GPU-accelerated many-body force computation (Prompt 165): render-target
ping-pong compute via `three/examples/jsm/misc/GPUComputationRenderer.js`
(lazy-loaded on first use, matching this codebase's established pattern
for optional three examples — see `GraphSceneCamera.enableOrbitControls`),
with a feature-detected CPU+worker fallback for when float render targets
aren't available.

`computeCharge(positions, options)` is the low-level primitive — a flat
`[x0,y0,z0,...]` buffer in, an equally-shaped acceleration buffer out,
`async` regardless of backend (a GPU readback and a worker round-trip are
both genuinely asynchronous; unifying the contract means callers never
need to branch on `backend`). `attach(sim)` is the actual "wire
`layout.force` to GPGPU above 5000 nodes" integration: it replaces a
`layout.force()` simulation's `'charge'` force with a wrapper that only
switches to GPGPU once the simulation's node count crosses `threshold`.

**Kind**: static class of [<code>GPGPU</code>](#module_GPGPU)  

* [.GPGPU](#module_GPGPU.GPGPU)
    * [new exports.GPGPU([options])](#new_module_GPGPU.GPGPU_new)
    * [.backend](#module_GPGPU.GPGPU+backend) ⇒ <code>\*</code>
    * [.computeCharge(positions, [options])](#module_GPGPU.GPGPU+computeCharge) ⇒ <code>\*</code>
    * [.attach(sim, [options])](#module_GPGPU.GPGPU+attach) ⇒ <code>this</code>
    * [.dispose()](#module_GPGPU.GPGPU+dispose)

<a name="new_module_GPGPU.GPGPU_new"></a>

### new exports.GPGPU([options])
**Throws**:

- <code>TypeError</code> If `threshold` isn't a positive number.


| Param | Type | Description |
| --- | --- | --- |
| [options] | <code>object</code> |  |
| [options.renderer] | <code>THREE.WebGLRenderer</code> | Required for the GPU backend; omit to force the worker fallback. |
| [options.capabilities] | <code>Capabilities</code> | `capabilities.floatTextures` gates the GPU backend. |
| [options.threshold] | <code>number</code> | Node count above which `attach()` switches a simulation's charge force to GPGPU. Default `5000`. |

**Example**  
```js
const gpgpu = new GPGPU({ renderer: graph3d.renderer.three, capabilities: probe.capabilities });
const sim = layout.force().nodes(hugeNodeSet).force('link', layout.force.link(links));
gpgpu.attach(sim); // 'charge' now runs on GPGPU once nodes.length > 5000
loop.add(() => { if (sim.active()) sim.tick(); });
gpgpu.dispose();
```
<a name="module_GPGPU.GPGPU+backend"></a>

### gpgpU.backend ⇒ <code>\*</code>
**Kind**: instance property of [<code>GPGPU</code>](#module_GPGPU.GPGPU)  
**Returns**: <code>\*</code> - Which backend `computeCharge()` currently dispatches to.  
<a name="module_GPGPU.GPGPU+computeCharge"></a>

### gpgpU.computeCharge(positions, [options]) ⇒ <code>\*</code>
Computes many-body charge accelerations for a flat `[x0,y0,z0,...]`
position buffer, via whichever `backend` is available.

**Kind**: instance method of [<code>GPGPU</code>](#module_GPGPU.GPGPU)  
**Returns**: <code>\*</code> - Accelerations, the same length as `positions`.  
**Throws**:

- <code>TypeError</code> If `positions` isn't a `Float32Array` with a length that's a multiple of 3.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| positions | <code>Float32Array</code> | 
| [options] | <code>Object</code> | 

**Example**  
```js
const accel = await gpgpu.computeCharge(new Float32Array([0, 0, 0, 1, 0, 0]), { strength: -30 });
```
<a name="module_GPGPU.GPGPU+attach"></a>

### gpgpU.attach(sim, [options]) ⇒ <code>this</code>
Wires GPGPU-accelerated charge computation into `sim` (a
`layout.force()` instance): replaces its `'charge'` force with a
wrapper that, once `sim.nodes().length` exceeds `threshold`, delegates
to `computeCharge()` instead of the main-thread Barnes-Hut
approximation. Below `threshold`, the wrapper is byte-for-byte
`layout.force.charge(strength, options)` — small simulations are
unaffected.

Both GPGPU backends are asynchronous (a GPU readback and a worker
round-trip can't complete inside `sim.tick()`'s single synchronous
call), so above `threshold` the wrapper applies the most recently
*resolved* acceleration (scaled by the current tick's `alpha`) every
tick, and kicks off a fresh background computation whenever the
previous one has finished — the simulation's charge force is correct
on average but lags real position changes by however many ticks the
round trip takes. `nodes()` before the first result resolves contribute
zero charge acceleration (harmless — other forces still apply immediately).

**Kind**: instance method of [<code>GPGPU</code>](#module_GPGPU.GPGPU)  
**Throws**:

- <code>TypeError</code> If `sim` doesn't expose `force()`/`nodes()`.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| sim | <code>object</code> | A `layout.force()` instance. |
| [options] | <code>Object</code> |  |

**Example**  
```js
gpgpu.attach(sim, { strength: -50 });
```
<a name="module_GPGPU.GPGPU+dispose"></a>

### gpgpU.dispose()
Releases the worker pool and/or `GPUComputationRenderer`, whichever
this instance ended up creating. Does not detach `attach()`'s force
wrapper from any simulation it was registered on — call `sim.force(
'charge', layout.force.charge(...))` to restore a plain CPU force
first, if `sim` outlives this `GPGPU` instance. Idempotent.

**Kind**: instance method of [<code>GPGPU</code>](#module_GPGPU.GPGPU)  
**Example**  
```js
gpgpu.dispose();
```
