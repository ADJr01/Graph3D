# Octree

<a name="module_Octree.Octree"></a>

## Octree
Spatial index over id → (position, radius) entries, for fast
frustum/ray/radius/AABB queries on instanced data — the shared backbone
for both picking and frustum culling on charts with millions of datums.

Queries return candidate ids whose bounding sphere intersects the query
shape; callers do their own precise hit-testing (e.g. a real raycast)
against just those candidates instead of every datum.

**Kind**: static class of [<code>Octree</code>](#module_Octree)  

* [.Octree](#module_Octree.Octree)
    * [new exports.Octree(options)](#new_module_Octree.Octree_new)
    * [.insert(id, position, [radius])](#module_Octree.Octree+insert)
    * [.remove(id)](#module_Octree.Octree+remove)
    * [.queryFrustum(frustum)](#module_Octree.Octree+queryFrustum) ⇒ <code>\*</code>
    * [.queryRay(ray)](#module_Octree.Octree+queryRay) ⇒ <code>\*</code>
    * [.queryRadius(point, radius)](#module_Octree.Octree+queryRadius) ⇒ <code>\*</code>
    * [.queryAABB(box)](#module_Octree.Octree+queryAABB) ⇒ <code>\*</code>
    * [.dumpBounds()](#module_Octree.Octree+dumpBounds) ⇒ <code>Object</code>

<a name="new_module_Octree.Octree_new"></a>

### new exports.Octree(options)
**Throws**:

- <code>TypeError</code> If `bounds` is not a `THREE.Box3`.
- <code>TypeError</code> If `maxItemsPerNode` or `maxDepth` is not a positive integer.


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

**Example**  
```js
const octree = new Octree({ bounds: new THREE.Box3(new THREE.Vector3(-50,-50,-50), new THREE.Vector3(50,50,50)) });
octree.insert(0, new THREE.Vector3(1, 2, 3), 0.5);
const hits = octree.queryRay(raycaster.ray);
octree.remove(0);
```
<a name="module_Octree.Octree+insert"></a>

### octree.insert(id, position, [radius])
Insert an item. `id` must not already be present.

**Kind**: instance method of [<code>Octree</code>](#module_Octree.Octree)  
**Throws**:

- <code>TypeError</code> If `id` is not a string/number, `position` is not a
  `THREE.Vector3`, or `radius` is not a finite number >= 0.
- <code>Error</code> If `id` is already present.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| id | <code>string</code> \| <code>number</code> |  |  |
| position | <code>THREE.Vector3</code> |  |  |
| [radius] | <code>number</code> | <code>0</code> | Bounding-sphere radius used by queries. |

**Example**  
```js
octree.insert(42, new THREE.Vector3(1, 2, 3), 0.5);
```
<a name="module_Octree.Octree+remove"></a>

### octree.remove(id)
Remove a previously inserted item.

**Kind**: instance method of [<code>Octree</code>](#module_Octree.Octree)  
**Throws**:

- <code>Error</code> If no item with `id` is present.


| Param | Type |
| --- | --- |
| id | <code>string</code> \| <code>number</code> | 

**Example**  
```js
octree.remove(42);
```
<a name="module_Octree.Octree+queryFrustum"></a>

### octree.queryFrustum(frustum) ⇒ <code>\*</code>
**Kind**: instance method of [<code>Octree</code>](#module_Octree.Octree)  
**Returns**: <code>\*</code> - ids whose bounding sphere intersects the frustum.  
**Throws**:

- <code>TypeError</code> If `frustum` is not a `THREE.Frustum`.


| Param | Type |
| --- | --- |
| frustum | <code>THREE.Frustum</code> | 

**Example**  
```js
octree.queryFrustum(camera.frustum);
```
<a name="module_Octree.Octree+queryRay"></a>

### octree.queryRay(ray) ⇒ <code>\*</code>
**Kind**: instance method of [<code>Octree</code>](#module_Octree.Octree)  
**Returns**: <code>\*</code> - ids whose bounding sphere the ray intersects.  
**Throws**:

- <code>TypeError</code> If `ray` is not a `THREE.Ray`.


| Param | Type |
| --- | --- |
| ray | <code>THREE.Ray</code> | 

**Example**  
```js
octree.queryRay(raycaster.ray);
```
<a name="module_Octree.Octree+queryRadius"></a>

### octree.queryRadius(point, radius) ⇒ <code>\*</code>
**Kind**: instance method of [<code>Octree</code>](#module_Octree.Octree)  
**Returns**: <code>\*</code> - ids whose bounding sphere intersects the query sphere.  
**Throws**:

- <code>TypeError</code> If `point` is not a `THREE.Vector3`, or `radius` is not a finite number >= 0.


| Param | Type |
| --- | --- |
| point | <code>THREE.Vector3</code> | 
| radius | <code>number</code> | 

**Example**  
```js
octree.queryRadius(new THREE.Vector3(0, 0, 0), 10);
```
<a name="module_Octree.Octree+queryAABB"></a>

### octree.queryAABB(box) ⇒ <code>\*</code>
**Kind**: instance method of [<code>Octree</code>](#module_Octree.Octree)  
**Returns**: <code>\*</code> - ids whose bounding sphere intersects the box.  
**Throws**:

- <code>TypeError</code> If `box` is not a `THREE.Box3`.


| Param | Type |
| --- | --- |
| box | <code>THREE.Box3</code> | 

**Example**  
```js
octree.queryAABB(new THREE.Box3(min, max));
```
<a name="module_Octree.Octree+dumpBounds"></a>

### octree.dumpBounds() ⇒ <code>Object</code>
Flat dump of every node in the tree — depth, bounds, and leaf item
count — for debug visualization only (`Graph3D.devtools.octreeDebugOverlay`,
Prompt 178). Not read by any query path.

**Kind**: instance method of [<code>Octree</code>](#module_Octree.Octree)  
**Example**  
```js
octree.dumpBounds().filter((node) => node.isLeaf && node.itemCount > 0);
```
