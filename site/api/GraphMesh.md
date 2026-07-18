# GraphMesh

<a name="module_GraphMesh.GraphMesh"></a>

## GraphMesh
Mutation API for a single mesh — the low-instance-count path
(`GraphObjectFactory` keeps individual `GraphMesh`es, rather than folding
into one `GraphInstancedObject`, when `count <= 50`, for inspectability)
and for any one-off user-added mesh that doesn't need instancing at all.

`geometry` and `material` are consumed exclusively by this instance and are
disposed alongside it in `dispose()` (see `GraphInstancedObject`'s
ownership note for the same rule). `clone()` shares them with the
original — cheap, but only one of the two clones should ever be disposed.
`deepClone()` clones the geometry/material too, producing a fully
independent copy that's safe to dispose on its own.

**Kind**: static class of [<code>GraphMesh</code>](#module_GraphMesh)  

* [.GraphMesh](#module_GraphMesh.GraphMesh)
    * [new exports.GraphMesh(options)](#new_module_GraphMesh.GraphMesh_new)
    * [.material](#module_GraphMesh.GraphMesh+material) ⇒ <code>\*</code>
    * [.getPosition()](#module_GraphMesh.GraphMesh+getPosition) ⇒ <code>THREE.Vector3</code>
    * [.getRotation()](#module_GraphMesh.GraphMesh+getRotation) ⇒ <code>THREE.Euler</code>
    * [.getScale()](#module_GraphMesh.GraphMesh+getScale) ⇒ <code>THREE.Vector3</code>
    * [.setPosition(x, y, z)](#module_GraphMesh.GraphMesh+setPosition) ⇒ <code>this</code>
    * [.setRotation(euler)](#module_GraphMesh.GraphMesh+setRotation) ⇒ <code>this</code>
    * [.setRotationDegrees(x, y, z)](#module_GraphMesh.GraphMesh+setRotationDegrees) ⇒ <code>this</code>
    * [.setScale(sx, sy, sz)](#module_GraphMesh.GraphMesh+setScale) ⇒ <code>this</code>
    * [.translate(dx, dy, dz)](#module_GraphMesh.GraphMesh+translate) ⇒ <code>this</code>
    * [.rotateBy(euler)](#module_GraphMesh.GraphMesh+rotateBy) ⇒ <code>this</code>
    * [.lookAt(x, y, z)](#module_GraphMesh.GraphMesh+lookAt) ⇒ <code>this</code>
    * [.setVisible(visible)](#module_GraphMesh.GraphMesh+setVisible) ⇒ <code>this</code>
    * [.getVertices()](#module_GraphMesh.GraphMesh+getVertices) ⇒ <code>\*</code>
    * [.setVertex(i, x, y, z)](#module_GraphMesh.GraphMesh+setVertex) ⇒ <code>this</code>
    * [.setVertices(vertices)](#module_GraphMesh.GraphMesh+setVertices) ⇒ <code>this</code>
    * [.commit()](#module_GraphMesh.GraphMesh+commit) ⇒ <code>this</code>
    * [.clone([name])](#module_GraphMesh.GraphMesh+clone) ⇒ <code>GraphMesh</code>
    * [.deepClone([name])](#module_GraphMesh.GraphMesh+deepClone) ⇒ <code>GraphMesh</code>
    * [.dispose()](#module_GraphMesh.GraphMesh+dispose)

<a name="new_module_GraphMesh.GraphMesh_new"></a>

### new exports.GraphMesh(options)
**Throws**:

- <code>TypeError</code> If `geometry` is not a `THREE.BufferGeometry`.
- <code>TypeError</code> If `material` is not a `THREE.Material` (or array of them).


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

**Example**  
```js
const mesh = new GraphMesh({ scene: graphScene.three, name: 'bar_0', geometry, material });
mesh.setPosition(1, 2, 3).setScale(1, 2, 1);
const vertex = mesh.getVertices()[0];
mesh.setVertex(0, vertex.x, vertex.y + 1, vertex.z).commit();
```
<a name="module_GraphMesh.GraphMesh+material"></a>

### graphMesh.material ⇒ <code>\*</code>
This mesh's material, as a lazy accessor so the return type can change
without touching call sites. Currently the raw `THREE.Material` (or
array) — Phase 6 will wrap it in a `GraphObjectMaterial`, but `object/`
cannot import from `material/` (a higher layer, per CLAUDE.md §1.4), so
that wrapping has to be added once `material/` exists, not here.

**Kind**: instance property of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
mesh.material.color.set('crimson');
```
<a name="module_GraphMesh.GraphMesh+getPosition"></a>

### graphMesh.getPosition() ⇒ <code>THREE.Vector3</code>
Read the mesh's current position — a fresh `THREE.Vector3` (mutating it
has no effect on the mesh; call `setPosition` to write changes back).
Exists for read-modify-write callers (e.g. `Selection.attr('position.x', ...)`,
Prompt 75) that need to change one component without disturbing the others.

**Kind**: instance method of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
const p = mesh.getPosition(); mesh.setPosition(p.x + 1, p.y, p.z);
```
<a name="module_GraphMesh.GraphMesh+getRotation"></a>

### graphMesh.getRotation() ⇒ <code>THREE.Euler</code>
Read the mesh's current rotation — a fresh `THREE.Euler` (mutating it has
no effect on the mesh; call `setRotation` to write changes back).

**Kind**: instance method of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
const r = mesh.getRotation(); r.y += Math.PI / 2; mesh.setRotation(r);
```
<a name="module_GraphMesh.GraphMesh+getScale"></a>

### graphMesh.getScale() ⇒ <code>THREE.Vector3</code>
Read the mesh's current scale — a fresh `THREE.Vector3` (mutating it has
no effect on the mesh; call `setScale` to write changes back).

**Kind**: instance method of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
const s = mesh.getScale(); mesh.setScale(s.x, s.y * 2, s.z);
```
<a name="module_GraphMesh.GraphMesh+setPosition"></a>

### graphMesh.setPosition(x, y, z) ⇒ <code>this</code>
Set the mesh's position.

**Kind**: instance method of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
**Throws**:

- <code>TypeError</code> If `x`, `y`, or `z` is not a finite number.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| x | <code>number</code> | 
| y | <code>number</code> | 
| z | <code>number</code> | 

**Example**  
```js
mesh.setPosition(1, 2, 3);
```
<a name="module_GraphMesh.GraphMesh+setRotation"></a>

### graphMesh.setRotation(euler) ⇒ <code>this</code>
Set the mesh's rotation from a `THREE.Euler` (radians).

**Kind**: instance method of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
**Throws**:

- <code>TypeError</code> If `euler` is not a `THREE.Euler`.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| euler | <code>THREE.Euler</code> | 

**Example**  
```js
mesh.setRotation(new THREE.Euler(0, Math.PI / 2, 0));
```
<a name="module_GraphMesh.GraphMesh+setRotationDegrees"></a>

### graphMesh.setRotationDegrees(x, y, z) ⇒ <code>this</code>
Set the mesh's rotation from degrees, for callers who'd rather not
convert to radians themselves.

**Kind**: instance method of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
**Throws**:

- <code>TypeError</code> If `x`, `y`, or `z` is not a finite number.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| x | <code>number</code> | 
| y | <code>number</code> | 
| z | <code>number</code> | 

**Example**  
```js
mesh.setRotationDegrees(0, 90, 0);
```
<a name="module_GraphMesh.GraphMesh+setScale"></a>

### graphMesh.setScale(sx, sy, sz) ⇒ <code>this</code>
Set the mesh's scale.

**Kind**: instance method of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
**Throws**:

- <code>TypeError</code> If `sx`, `sy`, or `sz` is not a finite number.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| sx | <code>number</code> | 
| sy | <code>number</code> | 
| sz | <code>number</code> | 

**Example**  
```js
mesh.setScale(1, 2, 1);
```
<a name="module_GraphMesh.GraphMesh+translate"></a>

### graphMesh.translate(dx, dy, dz) ⇒ <code>this</code>
Offset the mesh's current position.

**Kind**: instance method of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
**Throws**:

- <code>TypeError</code> If `dx`, `dy`, or `dz` is not a finite number.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| dx | <code>number</code> | 
| dy | <code>number</code> | 
| dz | <code>number</code> | 

**Example**  
```js
mesh.translate(0, 1, 0);
```
<a name="module_GraphMesh.GraphMesh+rotateBy"></a>

### graphMesh.rotateBy(euler) ⇒ <code>this</code>
Rotate the mesh relative to its current rotation, in its local frame.

**Kind**: instance method of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
**Throws**:

- <code>TypeError</code> If `euler` is not a `THREE.Euler`.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| euler | <code>THREE.Euler</code> | 

**Example**  
```js
mesh.rotateBy(new THREE.Euler(0, Math.PI / 8, 0));
```
<a name="module_GraphMesh.GraphMesh+lookAt"></a>

### graphMesh.lookAt(x, y, z) ⇒ <code>this</code>
Orient the mesh to face a world-space point.

**Kind**: instance method of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
**Throws**:

- <code>TypeError</code> If `x`, `y`, or `z` is not a finite number.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| x | <code>number</code> | 
| y | <code>number</code> | 
| z | <code>number</code> | 

**Example**  
```js
mesh.lookAt(0, 0, 0);
```
<a name="module_GraphMesh.GraphMesh+setVisible"></a>

### graphMesh.setVisible(visible) ⇒ <code>this</code>
Show or hide the mesh (`THREE.Object3D.visible`) without removing it
from the scene or disturbing its transform.

**Kind**: instance method of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
**Throws**:

- <code>TypeError</code> If `visible` is not a boolean.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| visible | <code>boolean</code> | 

**Example**  
```js
mesh.setVisible(false);
```
<a name="module_GraphMesh.GraphMesh+getVertices"></a>

### graphMesh.getVertices() ⇒ <code>\*</code>
Read every vertex position as a fresh array of `THREE.Vector3` (not live
references — mutating the returned vectors has no effect on the mesh;
use `setVertex`/`setVertices` to write changes back).

**Kind**: instance method of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
const vertices = mesh.getVertices();
```
<a name="module_GraphMesh.GraphMesh+setVertex"></a>

### graphMesh.setVertex(i, x, y, z) ⇒ <code>this</code>
Write one vertex position. Does not upload to the GPU — call `commit()`
once after a batch of writes.

**Kind**: instance method of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
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
mesh.setVertex(0, 1, 2, 3).commit();
```
<a name="module_GraphMesh.GraphMesh+setVertices"></a>

### graphMesh.setVertices(vertices) ⇒ <code>this</code>
Write every vertex position in one call. Does not upload to the GPU —
call `commit()` afterward.

**Kind**: instance method of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
**Throws**:

- <code>TypeError</code> If `vertices` isn't an array with exactly one entry
  per vertex, or an entry is missing numeric `x`/`y`/`z`.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| vertices | <code>Object</code> | Exactly one   entry per existing vertex, each with numeric `x`/`y`/`z`. |

**Example**  
```js
mesh.setVertices(mesh.getVertices().map(v => ({ x: v.x, y: v.y * 2, z: v.z }))).commit();
```
<a name="module_GraphMesh.GraphMesh+commit"></a>

### graphMesh.commit() ⇒ <code>this</code>
Flag the position buffer for GPU upload. Call once after a batch of
`setVertex`/`setVertices` calls, not after each one.

**Kind**: instance method of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
mesh.commit();
```
<a name="module_GraphMesh.GraphMesh+clone"></a>

### graphMesh.clone([name]) ⇒ <code>GraphMesh</code>
Shallow clone: a new `GraphMesh` with the same transform, sharing this
mesh's geometry and material. Cheap, but only one of the two `GraphMesh`
instances should ever be disposed — disposing both would double-free the
shared geometry/material. Use `deepClone()` if you need two
independently-disposable copies.

**Kind**: instance method of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| [name] | <code>string</code> | Defaults to this mesh's own name. |

**Example**  
```js
const ghost = mesh.clone('bar_0_ghost');
```
<a name="module_GraphMesh.GraphMesh+deepClone"></a>

### graphMesh.deepClone([name]) ⇒ <code>GraphMesh</code>
Deep clone: a new `GraphMesh` with the same transform, and its own
independent copy of the geometry and material — safe to dispose
independently of the original.

**Kind**: instance method of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| [name] | <code>string</code> | Defaults to this mesh's own name. |

**Example**  
```js
const copy = mesh.deepClone('bar_0_copy');
```
<a name="module_GraphMesh.GraphMesh+dispose"></a>

### graphMesh.dispose()
Dispose `geometry` and `material` and unregister via `GraphObject.dispose()`.
Idempotent. Do not call on a `GraphMesh` produced by `clone()` unless its
sibling clone (or the original) has already been disposed or discarded —
see the `clone()` sharing caveat.

**Kind**: instance method of [<code>GraphMesh</code>](#module_GraphMesh.GraphMesh)  
**Example**  
```js
mesh.dispose();
```
