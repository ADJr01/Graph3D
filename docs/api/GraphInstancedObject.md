# GraphInstancedObject

<a name="module_GraphInstancedObject.GraphInstancedObject"></a>

## GraphInstancedObject
Primary rendering primitive for any chart with more than ~50 datums.Wraps a single `THREE.InstancedMesh` and exposes a per-instance mutationAPI (position/rotation/scale/color/matrix/user data, plus customshader-driving attributes via `defineAttribute`) instead of one`THREE.Mesh` per datum. Every instance also gets a stable `instanceId`attribute and can be hit-tested via `pick(raycaster)`. Optional per-instancefrustum culling is available via `enableInstanceCulling`.An internal `Octree` tracks every positioned instance's world position andbounding radius, updated incrementally by `setInstanceMatrix`/`setInstancePosition`/`setInstanceRotation`/`setInstanceScale` — `pick()`and culling both query it for candidates instead of brute-force testingevery instance, which is what makes both fast at million-instance scale.An instance that has never had its transform set has no octree entry yet(nothing to pick or cull — it's still at its degenerate default matrix).`geometry` and `material` are consumed exclusively by this instance — theyare disposed alongside it in `dispose()`, so do not share the samegeometry/material objects across multiple `GraphInstancedObject`s.Per-instance setters (`setInstance*`) write directly into the underlying`InstancedBufferAttribute`s but do not upload to the GPU. Call`commitMatrix()`/`commitColor()`/`commitAttribute()` once after a batch ofwrites to flag the attributes for upload — this keeps a chart's `update()`loop to a single GPU sync per frame instead of one per datum.The bulk setters (`setAllPositions`/`setAllScales`/`setAllColors`) acceptan optional `{ duration, easing }` (Prompt 92): with `duration` set, thewhole array animates toward its target over the shared RAF loop instead ofwriting immediately, self-committing every frame — no manual `commit*()`call needed for that path.

**Kind**: static class of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject)  

* [.GraphInstancedObject](#module_GraphInstancedObject.GraphInstancedObject)
    * [new exports.GraphInstancedObject(options)](#new_module_GraphInstancedObject.GraphInstancedObject_new)
    * [.material](#module_GraphInstancedObject.GraphInstancedObject+material) ⇒ <code>\*</code>
    * [.capacity](#module_GraphInstancedObject.GraphInstancedObject+capacity) ⇒ <code>number</code>
    * [.count](#module_GraphInstancedObject.GraphInstancedObject+count) ⇒ <code>number</code>
    * [.isInstanced](#module_GraphInstancedObject.GraphInstancedObject+isInstanced) ⇒ <code>true</code>
    * [.octree](#module_GraphInstancedObject.GraphInstancedObject+octree) ⇒ <code>Octree</code>
    * [.setInstanceCount(n)](#module_GraphInstancedObject.GraphInstancedObject+setInstanceCount) ⇒ <code>this</code>
    * [.setInstanceMatrix(i, matrix4)](#module_GraphInstancedObject.GraphInstancedObject+setInstanceMatrix) ⇒ <code>this</code>
    * [.setInstancePosition(i, x, y, z)](#module_GraphInstancedObject.GraphInstancedObject+setInstancePosition) ⇒ <code>this</code>
    * [.setInstanceRotation(i, euler)](#module_GraphInstancedObject.GraphInstancedObject+setInstanceRotation) ⇒ <code>this</code>
    * [.setInstanceScale(i, sx, sy, sz)](#module_GraphInstancedObject.GraphInstancedObject+setInstanceScale) ⇒ <code>this</code>
    * [.getInstancePosition(i)](#module_GraphInstancedObject.GraphInstancedObject+getInstancePosition) ⇒ <code>THREE.Vector3</code>
    * [.getInstanceRotation(i)](#module_GraphInstancedObject.GraphInstancedObject+getInstanceRotation) ⇒ <code>THREE.Euler</code>
    * [.getInstanceScale(i)](#module_GraphInstancedObject.GraphInstancedObject+getInstanceScale) ⇒ <code>THREE.Vector3</code>
    * [.setInstanceVisible(i, visible)](#module_GraphInstancedObject.GraphInstancedObject+setInstanceVisible) ⇒ <code>this</code>
    * [.setAllPositions(positions, [options])](#module_GraphInstancedObject.GraphInstancedObject+setAllPositions) ⇒ <code>this</code>
    * [.setAllScales(scales, [options])](#module_GraphInstancedObject.GraphInstancedObject+setAllScales) ⇒ <code>this</code>
    * [.setInstanceColor(i, color)](#module_GraphInstancedObject.GraphInstancedObject+setInstanceColor) ⇒ <code>this</code>
    * [.getInstanceColor(i)](#module_GraphInstancedObject.GraphInstancedObject+getInstanceColor) ⇒ <code>THREE.Color</code>
    * [.setAllColors(colors, [options])](#module_GraphInstancedObject.GraphInstancedObject+setAllColors) ⇒ <code>this</code>
    * [.hasAttribute(name)](#module_GraphInstancedObject.GraphInstancedObject+hasAttribute) ⇒ <code>boolean</code>
    * [.defineAttribute(name, itemSize)](#module_GraphInstancedObject.GraphInstancedObject+defineAttribute) ⇒ <code>this</code>
    * [.setInstanceAttribute(i, name, value)](#module_GraphInstancedObject.GraphInstancedObject+setInstanceAttribute) ⇒ <code>this</code>
    * [.getInstanceAttribute(i, name)](#module_GraphInstancedObject.GraphInstancedObject+getInstanceAttribute) ⇒ <code>\*</code>
    * [.pick(raycaster)](#module_GraphInstancedObject.GraphInstancedObject+pick) ⇒ <code>number</code> \| <code>null</code>
    * [.pickDetailed(raycaster)](#module_GraphInstancedObject.GraphInstancedObject+pickDetailed) ⇒ <code>Object</code>
    * [.enableInstanceCulling(options)](#module_GraphInstancedObject.GraphInstancedObject+enableInstanceCulling) ⇒ <code>this</code>
    * [.disableInstanceCulling()](#module_GraphInstancedObject.GraphInstancedObject+disableInstanceCulling) ⇒ <code>this</code>
    * [.updateCulling()](#module_GraphInstancedObject.GraphInstancedObject+updateCulling) ⇒ <code>this</code>
    * [.setInstanceUserData(i, datum)](#module_GraphInstancedObject.GraphInstancedObject+setInstanceUserData) ⇒ <code>this</code>
    * [.getInstanceUserData(i)](#module_GraphInstancedObject.GraphInstancedObject+getInstanceUserData) ⇒ <code>\*</code>
    * [.commitMatrix()](#module_GraphInstancedObject.GraphInstancedObject+commitMatrix) ⇒ <code>this</code>
    * [.commitColor()](#module_GraphInstancedObject.GraphInstancedObject+commitColor) ⇒ <code>this</code>
    * [.commitAttribute(name)](#module_GraphInstancedObject.GraphInstancedObject+commitAttribute) ⇒ <code>this</code>
    * [.dispose()](#module_GraphInstancedObject.GraphInstancedObject+dispose)

<a name="new_module_GraphInstancedObject.GraphInstancedObject_new"></a>

### new exports.GraphInstancedObject(options)
**Throws**:

- <code>TypeError</code> If `geometry` is not a `THREE.BufferGeometry`.
- <code>TypeError</code> If `material` is not a `THREE.Material` (or array of them).
- <code>TypeError</code> If `count` is not a positive integer.
- <code>TypeError</code> If `octreeBounds` is provided but not a `THREE.Box3`.


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

**Example**  
```js
const bars = new GraphInstancedObject({  scene: graphScene.three,  name: 'bars',  geometry: new THREE.BoxGeometry(),  material: new THREE.MeshStandardMaterial(),  count: 100_000,});bars.setInstancePosition(0, 1, 2, 3).setInstanceColor(0, 'crimson');bars.commitMatrix();bars.commitColor();
```
<a name="module_GraphInstancedObject.GraphInstancedObject+material"></a>

### graphInstancedObject.material ⇒ <code>\*</code>
This batch's material, as a lazy accessor so the return type can changewithout touching call sites. Currently the raw `THREE.Material` (orarray) — Phase 6 will wrap it in a `GraphObjectMaterial`, but `object/`cannot import from `material/` (a higher layer, per CLAUDE.md §1.4), sothat wrapping has to be added once `material/` exists, not here.

**Kind**: instance property of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
bars.material.color.set('crimson');
```
<a name="module_GraphInstancedObject.GraphInstancedObject+capacity"></a>

### graphInstancedObject.capacity ⇒ <code>number</code>
Number of instance slots currently allocated. `setInstanceCount` mayrender anywhere from 0 up to this many, and grows it automatically(reallocating at the next power of two) when asked to render more.

**Kind**: instance property of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
<a name="module_GraphInstancedObject.GraphInstancedObject+count"></a>

### graphInstancedObject.count ⇒ <code>number</code>
Number of instance slots currently rendered (`THREE.InstancedMesh.count`)— always `<= capacity`. Slots at or beyond this index aren't drawn evenif allocated. Complements `capacity`/`setInstanceCount`; exists forcallers (e.g. `GraphScene.selectAll`, the join system's slot allocator)that need to know how much of the batch is "live" right now.

**Kind**: instance property of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
bars.count; // 42
```
<a name="module_GraphInstancedObject.GraphInstancedObject+isInstanced"></a>

### graphInstancedObject.isInstanced ⇒ <code>true</code>
**Kind**: instance property of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
<a name="module_GraphInstancedObject.GraphInstancedObject+octree"></a>

### graphInstancedObject.octree ⇒ <code>Octree</code>
Escape hatch to the internal spatial index — mirrors `GraphObject`'s own`get three()`. Exists for `Graph3D.devtools.octreeDebugOverlay` (Prompt178) to visualize node bounds; queries/picking should keep using`pick()`/`pickDetailed()` rather than reaching in here directly.

**Kind**: instance property of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Example**  
```js
bars.octree.dumpBounds();
```
<a name="module_GraphInstancedObject.GraphInstancedObject+setInstanceCount"></a>

### graphInstancedObject.setInstanceCount(n) ⇒ <code>this</code>
Set how many of the allocated instance slots are actually rendered. If`n` exceeds the current `capacity`, first grows capacity to the nextpower of two at or above `n` (`THREE.MathUtils.ceilPowerOfTwo`),reallocating `instanceMatrix`/`instanceColor` and every geometry-levelper-instance attribute (`instanceId`, plus any defined via`defineAttribute`) and copying every existing instance's data across.Existing instance indices — and their octree entries — keep theirmeaning across a grow; nothing is remapped.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>TypeError</code> If `n` is not a non-negative integer.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| n | <code>number</code> | 

**Example**  
```js
bars.setInstanceCount(42); // grows capacity first if 42 > bars.capacity
```
<a name="module_GraphInstancedObject.GraphInstancedObject+setInstanceMatrix"></a>

### graphInstancedObject.setInstanceMatrix(i, matrix4) ⇒ <code>this</code>
Set the full transform matrix for one instance directly.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>RangeError</code> If `i` is out of bounds.
- <code>TypeError</code> If `matrix4` is not a `THREE.Matrix4`.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| i | <code>number</code> | 
| matrix4 | <code>THREE.Matrix4</code> | 

**Example**  
```js
bars.setInstanceMatrix(0, new THREE.Matrix4().makeTranslation(1, 0, 0));
```
<a name="module_GraphInstancedObject.GraphInstancedObject+setInstancePosition"></a>

### graphInstancedObject.setInstancePosition(i, x, y, z) ⇒ <code>this</code>
Set one instance's position, preserving its current rotation and scale.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>RangeError</code> If `i` is out of bounds.
- <code>TypeError</code> If `x`, `y`, or `z` is not a finite number.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| i | <code>number</code> | 
| x | <code>number</code> | 
| y | <code>number</code> | 
| z | <code>number</code> | 

**Example**  
```js
bars.setInstancePosition(0, 1, 2, 3);
```
<a name="module_GraphInstancedObject.GraphInstancedObject+setInstanceRotation"></a>

### graphInstancedObject.setInstanceRotation(i, euler) ⇒ <code>this</code>
Set one instance's rotation, preserving its current position and scale.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>RangeError</code> If `i` is out of bounds.
- <code>TypeError</code> If `euler` is not a `THREE.Euler`.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| i | <code>number</code> | 
| euler | <code>THREE.Euler</code> | 

**Example**  
```js
bars.setInstanceRotation(0, new THREE.Euler(0, Math.PI / 2, 0));
```
<a name="module_GraphInstancedObject.GraphInstancedObject+setInstanceScale"></a>

### graphInstancedObject.setInstanceScale(i, sx, sy, sz) ⇒ <code>this</code>
Set one instance's scale, preserving its current position and rotation.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>RangeError</code> If `i` is out of bounds.
- <code>TypeError</code> If `sx`, `sy`, or `sz` is not a finite number.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| i | <code>number</code> | 
| sx | <code>number</code> | 
| sy | <code>number</code> | 
| sz | <code>number</code> | 

**Example**  
```js
bars.setInstanceScale(0, 1, 2, 1);
```
<a name="module_GraphInstancedObject.GraphInstancedObject+getInstancePosition"></a>

### graphInstancedObject.getInstancePosition(i) ⇒ <code>THREE.Vector3</code>
Read one instance's current position — a fresh `THREE.Vector3` (mutatingit has no effect on the instance). Exists for read-modify-write callers(e.g. `Selection.attr('position.x', ...)`, Prompt 75) that need to changeone component without disturbing the others.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>RangeError</code> If `i` is out of bounds.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| i | <code>number</code> | 

**Example**  
```js
const p = bars.getInstancePosition(0);
```
<a name="module_GraphInstancedObject.GraphInstancedObject+getInstanceRotation"></a>

### graphInstancedObject.getInstanceRotation(i) ⇒ <code>THREE.Euler</code>
Read one instance's current rotation — a fresh `THREE.Euler` (mutating ithas no effect on the instance).

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>RangeError</code> If `i` is out of bounds.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| i | <code>number</code> | 

**Example**  
```js
const r = bars.getInstanceRotation(0);
```
<a name="module_GraphInstancedObject.GraphInstancedObject+getInstanceScale"></a>

### graphInstancedObject.getInstanceScale(i) ⇒ <code>THREE.Vector3</code>
Read one instance's current scale — a fresh `THREE.Vector3` (mutating ithas no effect on the instance).

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>RangeError</code> If `i` is out of bounds.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| i | <code>number</code> | 

**Example**  
```js
const s = bars.getInstanceScale(0);
```
<a name="module_GraphInstancedObject.GraphInstancedObject+setInstanceVisible"></a>

### graphInstancedObject.setInstanceVisible(i, visible) ⇒ <code>this</code>
Show or hide one instance without shifting any other instance's index(unlike `setInstanceCount`). Hiding captures the instance's realtransform and swaps in the same degenerate zero matrix`enableInstanceCulling` uses to cull instances out of the frustum;showing restores the captured transform. Call `commitMatrix()` after abatch of calls to upload the change.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>RangeError</code> If `i` is out of bounds.
- <code>TypeError</code> If `visible` is not a boolean.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| i | <code>number</code> | 
| visible | <code>boolean</code> | 

**Example**  
```js
bars.setInstanceVisible(0, false).commitMatrix();
```
<a name="module_GraphInstancedObject.GraphInstancedObject+setAllPositions"></a>

### graphInstancedObject.setAllPositions(positions, [options]) ⇒ <code>this</code>
Overwrite every instance's position in one pass, preserving eachinstance's current rotation and scale. Reuses this object's scratchmatrix/vector/quaternion across the whole array — no per-instanceallocation — so chart `update()` should call this instead of looping`setInstancePosition` over tens of thousands of instances.With `options.duration` set (Prompt 92), this doesn't memcpy `positions`in immediately: it snapshots every instance's *current* position as thetween start, then interpolates the whole array toward `positions` onceper frame (via the shared RAF loop — no `setTimeout`) until `duration`elapses, at which point it lands exactly on `positions`. A later call toany `setAllPositions`/`setInstancePosition` cancels an in-flight one.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>TypeError</code> If `positions` is not a `Float32Array` of length `capacity * 3`.
- <code>TypeError</code> If `duration` is not a non-negative number, or `easing` doesn't resolve.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| positions | <code>Float32Array</code> | Flat `[x0, y0, z0, x1, y1, z1, ...]`, length `capacity * 3`. |
| [options] | <code>function</code> | `duration` in milliseconds (`0`, the default, writes immediately). |

**Example**  
```js
bars.setAllPositions(new Float32Array([0, 0, 0, 1, 0, 0])); // capacity === 2
```
**Example**  
```js
bars.setAllPositions(nextPositions, { duration: 600, easing: 'easeOutCubic' });
```
<a name="module_GraphInstancedObject.GraphInstancedObject+setAllScales"></a>

### graphInstancedObject.setAllScales(scales, [options]) ⇒ <code>this</code>
Overwrite every instance's scale in one pass, preserving each instance'scurrent position and rotation. Reuses this object's scratch matrix/vector/quaternion across the whole array — no per-instance allocation.With `options.duration` set (Prompt 92), animates the whole array toward`scales` over time instead of writing it immediately — see`setAllPositions`'s doc for the exact behavior; same conventions apply here.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>TypeError</code> If `scales` is not a `Float32Array` of length `capacity * 3`.
- <code>TypeError</code> If `duration` is not a non-negative number, or `easing` doesn't resolve.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| scales | <code>Float32Array</code> | Flat `[sx0, sy0, sz0, sx1, sy1, sz1, ...]`, length `capacity * 3`. |
| [options] | <code>function</code> | `duration` in milliseconds (`0`, the default, writes immediately). |

**Example**  
```js
bars.setAllScales(new Float32Array([1, 2, 1, 1, 3, 1])); // capacity === 2
```
**Example**  
```js
bars.setAllScales(nextScales, { duration: 600 });
```
<a name="module_GraphInstancedObject.GraphInstancedObject+setInstanceColor"></a>

### graphInstancedObject.setInstanceColor(i, color) ⇒ <code>this</code>
Set one instance's color. Accepts anything `THREE.Color.set()` accepts(a `THREE.Color`, a hex number, or a CSS color string).

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>RangeError</code> If `i` is out of bounds.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| i | <code>number</code> | 
| color | <code>THREE.Color</code> \| <code>number</code> \| <code>string</code> | 

**Example**  
```js
bars.setInstanceColor(0, 'crimson');
```
<a name="module_GraphInstancedObject.GraphInstancedObject+getInstanceColor"></a>

### graphInstancedObject.getInstanceColor(i) ⇒ <code>THREE.Color</code>
Read one instance's current color — a fresh `THREE.Color` (mutating ithas no effect on the instance). Before any `setInstanceColor`/`setAllColors` call, no `instanceColor` buffer exists yet, so everyinstance renders at the shared material's color unmultiplied; thisreturns that material color in that case, matching what's actuallyon screen. Exists for read-modify-write callers (e.g.`SelectionTransition.attr('color', ...)`, Prompt 91) that need thecurrent value before writing an interpolated one.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>RangeError</code> If `i` is out of bounds.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| i | <code>number</code> | 

**Example**  
```js
const c = bars.getInstanceColor(0);
```
<a name="module_GraphInstancedObject.GraphInstancedObject+setAllColors"></a>

### graphInstancedObject.setAllColors(colors, [options]) ⇒ <code>this</code>
Overwrite every instance's color in one pass via a direct typed-arraycopy into the underlying `InstancedBufferAttribute` — no per-instance`THREE.Color` allocation, unlike looping `setInstanceColor`. Values arewritten as-is (same raw RGB floats `THREE.Color.toArray()` produces),so build `colors` with `THREE.Color` up front if conversion fromhex/CSS strings is needed.With `options.duration` set (Prompt 92), animates the whole array toward`colors` over time instead of writing it immediately — see`setAllPositions`'s doc for the exact behavior; same conventions apply here.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>TypeError</code> If `colors` is not a `Float32Array` of length `capacity * 3`.
- <code>TypeError</code> If `duration` is not a non-negative number, or `easing` doesn't resolve.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| colors | <code>Float32Array</code> | Flat `[r0, g0, b0, r1, g1, b1, ...]`, length `capacity * 3`. |
| [options] | <code>function</code> | `duration` in milliseconds (`0`, the default, writes immediately). |

**Example**  
```js
bars.setAllColors(new Float32Array([1, 0, 0, 0, 1, 0])); // capacity === 2
```
**Example**  
```js
bars.setAllColors(nextColors, { duration: 600 });
```
<a name="module_GraphInstancedObject.GraphInstancedObject+hasAttribute"></a>

### graphInstancedObject.hasAttribute(name) ⇒ <code>boolean</code>
Whether a per-instance attribute named `name` already exists — eitherbuilt-in (`instanceId`) or previously defined via `defineAttribute`.Lets a caller (e.g. `Selection.attr`, Prompt 75) avoid `defineAttribute`'s"already exists" throw when it may run more than once for the same name.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| name | <code>string</code> | 

**Example**  
```js
if (!bars.hasAttribute('pulsePhase')) bars.defineAttribute('pulsePhase', 1);
```
<a name="module_GraphInstancedObject.GraphInstancedObject+defineAttribute"></a>

### graphInstancedObject.defineAttribute(name, itemSize) ⇒ <code>this</code>
Define a new per-instance attribute backed by an `InstancedBufferAttribute`,for driving custom vertex-shader effects per datum (e.g. a per-bar pulsephase, a per-point category id).

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>TypeError</code> If `name` is not a non-empty string.
- <code>TypeError</code> If `itemSize` is not an integer in [1, 4].
- <code>Error</code> If an attribute named `name` already exists (built-in or custom).
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> |  |
| itemSize | <code>number</code> | Components per instance, 1-4 (maps to a   `float`/`vec2`/`vec3`/`vec4` shader attribute). |

**Example**  
```js
bars.defineAttribute('pulsePhase', 1);
```
<a name="module_GraphInstancedObject.GraphInstancedObject+setInstanceAttribute"></a>

### graphInstancedObject.setInstanceAttribute(i, name, value) ⇒ <code>this</code>
Write one instance's value into a custom attribute defined via `defineAttribute`.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>RangeError</code> If `i` is out of bounds.
- <code>Error</code> If no attribute named `name` was defined.
- <code>TypeError</code> If `value` doesn't match the attribute's `itemSize`.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| i | <code>number</code> |  |
| name | <code>string</code> |  |
| value | <code>\*</code> | A single number when `itemSize`   is 1, otherwise an array/typed array of exactly `itemSize` numbers. |

**Example**  
```js
bars.setInstanceAttribute(0, 'pulsePhase', Math.random());
```
<a name="module_GraphInstancedObject.GraphInstancedObject+getInstanceAttribute"></a>

### graphInstancedObject.getInstanceAttribute(i, name) ⇒ <code>\*</code>
Read one instance's current value from a custom attribute defined via`defineAttribute`. Exists for read-modify-write callers (e.g.`SelectionTransition.attr(name, ...)`, Prompt 91) that need the currentvalue before writing an interpolated one.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Returns**: <code>\*</code> - A single number when the attribute's  `itemSize` is 1, otherwise a plain array of `itemSize` numbers.  
**Throws**:

- <code>RangeError</code> If `i` is out of bounds.
- <code>Error</code> If no attribute named `name` was defined, or called after `dispose()`.


| Param | Type |
| --- | --- |
| i | <code>number</code> | 
| name | <code>string</code> | 

**Example**  
```js
bars.getInstanceAttribute(0, 'pulsePhase');
```
<a name="module_GraphInstancedObject.GraphInstancedObject+pick"></a>

### graphInstancedObject.pick(raycaster) ⇒ <code>number</code> \| <code>null</code>
Cast a ray and return the instance index of the closest hit, or `null`if the ray hits none of the currently rendered instances (respects`setInstanceCount`).Queries the internal octree for candidate instances first, then raycaststhe real geometry only against those — accurate down to the exactgeometry hit, but touching far fewer instances than a brute-force testof every one once the octree is doing its job.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Returns**: <code>number</code> \| <code>null</code> - The instance index, or `null` on a miss.  
**Throws**:

- <code>TypeError</code> If `raycaster` is not a `THREE.Raycaster`.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| raycaster | <code>THREE.Raycaster</code> | 

**Example**  
```js
const hitIndex = bars.pick(raycaster); // 42, or null
```
<a name="module_GraphInstancedObject.GraphInstancedObject+pickDetailed"></a>

### graphInstancedObject.pickDetailed(raycaster) ⇒ <code>Object</code>
Same octree-accelerated hit-test as `pick()`, but returns the fullintersection detail — instance index, world-space hit point, and raydistance — instead of just the index. `pick()` only ever needed theindex (`ScatterChart.pick()`, Prompt 134); the centralized picking layer(`interact/Picker`, Prompt 147) additionally needs the exactray-surface point, so this shares the same private traversal ratherthan re-running it (CLAUDE.md §1.1 DRY).

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>TypeError</code> If `raycaster` is not a `THREE.Raycaster`.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| raycaster | <code>THREE.Raycaster</code> | 

**Example**  
```js
const hit = bars.pickDetailed(raycaster); // { instanceIndex: 42, point, distance }, or null
```
<a name="module_GraphInstancedObject.GraphInstancedObject+enableInstanceCulling"></a>

### graphInstancedObject.enableInstanceCulling(options) ⇒ <code>this</code>
Enable per-instance frustum culling against `camera`. Captures everyinstance's current transform as its restore point, then each time`updateCulling()` runs — auto-wired here to the shared `loop`, throttledto every `everyNthFrame`-th call — queries the internal octree for whichinstances are inside the frustum *right now*. Instances outside get adegenerate (zero) matrix; instances inside are restored to theircaptured transform, kept in sync as `setInstanceMatrix`/`Position`/`Rotation`/`Scale` are called while culling is active — so unlike afrozen precompute, moving a visible instance after enabling culling isreflected on the next pass without re-enabling.While an instance is culled, its matrix is degenerate — avoid calling`setInstancePosition`/`Rotation`/`Scale` on a possibly-culled index(`disableInstanceCulling()` first if you need to).

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>TypeError</code> If `camera` is not a `THREE.Camera`.
- <code>TypeError</code> If `everyNthFrame` is not a positive integer.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

**Example**  
```js
bars.enableInstanceCulling({ camera: graphScene.camera.three, everyNthFrame: 3 });
```
<a name="module_GraphInstancedObject.GraphInstancedObject+disableInstanceCulling"></a>

### graphInstancedObject.disableInstanceCulling() ⇒ <code>this</code>
Disable frustum culling and restore every instance to its capturedtransform. No-op if culling was never enabled.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
bars.disableInstanceCulling();
```
<a name="module_GraphInstancedObject.GraphInstancedObject+updateCulling"></a>

### graphInstancedObject.updateCulling() ⇒ <code>this</code>
Advance the culling throttle by one frame; only re-tests the frustum andrewrites the instance matrix array every `everyNthFrame`-th call. Calledautomatically once per real frame while culling is enabled (wired to theshared `loop` by `enableInstanceCulling`) — exposed publicly so a customrender loop can drive it manually instead. No-op if culling is disabled.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
bars.updateCulling();
```
<a name="module_GraphInstancedObject.GraphInstancedObject+setInstanceUserData"></a>

### graphInstancedObject.setInstanceUserData(i, datum) ⇒ <code>this</code>
Attach an arbitrary datum to one instance (e.g. the source data-boundobject), for later retrieval by picking/tooltips.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>RangeError</code> If `i` is out of bounds.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| i | <code>number</code> | 
| datum | <code>\*</code> | 

**Example**  
```js
bars.setInstanceUserData(0, { category: 'Q1', value: 42 });
```
<a name="module_GraphInstancedObject.GraphInstancedObject+getInstanceUserData"></a>

### graphInstancedObject.getInstanceUserData(i) ⇒ <code>\*</code>
Read the datum previously attached via `setInstanceUserData`.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Returns**: <code>\*</code> - The stored datum, or `undefined` if never set.  
**Throws**:

- <code>RangeError</code> If `i` is out of bounds.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| i | <code>number</code> | 

**Example**  
```js
bars.getInstanceUserData(0); // { category: 'Q1', value: 42 }
```
<a name="module_GraphInstancedObject.GraphInstancedObject+commitMatrix"></a>

### graphInstancedObject.commitMatrix() ⇒ <code>this</code>
Flag the instance matrix buffer for GPU upload. Call once after a batchof `setInstanceMatrix`/`setInstancePosition`/`setInstanceRotation`/`setInstanceScale` calls, not after each one.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
bars.commitMatrix();
```
<a name="module_GraphInstancedObject.GraphInstancedObject+commitColor"></a>

### graphInstancedObject.commitColor() ⇒ <code>this</code>
Flag the instance color buffer for GPU upload. Call once after a batchof `setInstanceColor` calls, not after each one. No-op if no instancecolor has ever been set.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
bars.commitColor();
```
<a name="module_GraphInstancedObject.GraphInstancedObject+commitAttribute"></a>

### graphInstancedObject.commitAttribute(name) ⇒ <code>this</code>
Flag a custom attribute (defined via `defineAttribute`) for GPU upload.Call once after a batch of `setInstanceAttribute` calls for thatattribute, not after each one.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Throws**:

- <code>Error</code> If no attribute named `name` was defined.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| name | <code>string</code> | 

**Example**  
```js
bars.commitAttribute('pulsePhase');
```
<a name="module_GraphInstancedObject.GraphInstancedObject+dispose"></a>

### graphInstancedObject.dispose()
Release the instance matrix/color GPU buffers, dispose `geometry` and`material`, and unregister via `GraphObject.dispose()`. Idempotent.

**Kind**: instance method of [<code>GraphInstancedObject</code>](#module_GraphInstancedObject.GraphInstancedObject)  
**Example**  
```js
bars.dispose();
```
