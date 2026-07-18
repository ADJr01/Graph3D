# GraphObjectFactory

<a name="module_GraphObjectFactory.GraphObjectFactory"></a>

## GraphObjectFactory
Static factories for the five base chart primitives. Each picks`GraphMesh[]` or `GraphInstancedObject` per `INSTANCING_THRESHOLD` andreturns default (unit-scale) geometry ready for the caller to position,scale, and color per datum via the APIs those classes already expose.

**Kind**: static class of [<code>GraphObjectFactory</code>](#module_GraphObjectFactory)  

* [.GraphObjectFactory](#module_GraphObjectFactory.GraphObjectFactory)
    * [new exports.GraphObjectFactory()](#new_module_GraphObjectFactory.GraphObjectFactory_new)
    * [.createMesh(name, options)](#module_GraphObjectFactory.GraphObjectFactory.createMesh) ⇒ <code>GraphMesh</code>
    * [.createBars(count, options)](#module_GraphObjectFactory.GraphObjectFactory.createBars) ⇒ <code>\*</code>
    * [.createPoints(count, options)](#module_GraphObjectFactory.GraphObjectFactory.createPoints) ⇒ <code>\*</code>
    * [.createLineSegments(count, options)](#module_GraphObjectFactory.GraphObjectFactory.createLineSegments) ⇒ <code>\*</code>
    * [.createSurfaceTiles(count, options)](#module_GraphObjectFactory.GraphObjectFactory.createSurfaceTiles) ⇒ <code>\*</code>
    * [.createNodes(count, options)](#module_GraphObjectFactory.GraphObjectFactory.createNodes) ⇒ <code>\*</code>
    * [.createTriangleMesh(name, options)](#module_GraphObjectFactory.GraphObjectFactory.createTriangleMesh) ⇒ <code>GraphMesh</code>

<a name="new_module_GraphObjectFactory.GraphObjectFactory_new"></a>

### new exports.GraphObjectFactory()
**Example**  
```js
const bars = GraphObjectFactory.createBars(100_000, { scene: graphScene.three, name: 'bars' });// bars is a single GraphInstancedObject — bars.setInstancePosition(...), etc.const points = GraphObjectFactory.createPoints(12, { scene: graphScene.three, name: 'pt' });// points is a GraphMesh[] of length 12 — points[0].setPosition(...), etc.
```
<a name="module_GraphObjectFactory.GraphObjectFactory.createMesh"></a>

### GraphObjectFactory.createMesh(name, options) ⇒ <code>GraphMesh</code>
A single independently-disposable `GraphMesh`, cloning `geometry`/`material` so it owns them outright (matches the per-mesh cloning `build()`already does below `instancingThreshold` — factored out here so the joinsystem's enter-materialization (`compose/selection/join.js`, Prompt 79)can create one new mesh at a time without duplicating that clone logic,CLAUDE.md §1.1 DRY two-strike rule).

**Kind**: static method of [<code>GraphObjectFactory</code>](#module_GraphObjectFactory.GraphObjectFactory)  
**Throws**:

- <code>TypeError</code> If `geometry`/`material` don't match `GraphMesh`'s constructor requirements.


| Param | Type |
| --- | --- |
| name | <code>string</code> | 
| options | <code>Object</code> | 

**Example**  
```js
GraphObjectFactory.createMesh('bar_3', { scene, geometry, material });
```
<a name="module_GraphObjectFactory.GraphObjectFactory.createBars"></a>

### GraphObjectFactory.createBars(count, options) ⇒ <code>\*</code>
Bar-chart bars: unit boxes, meant to be scaled per datum along Y.

**Kind**: static method of [<code>GraphObjectFactory</code>](#module_GraphObjectFactory.GraphObjectFactory)  
**Throws**:

- <code>TypeError</code> If `count` or `options.instancingThreshold` is not a positive integer.


| Param | Type |
| --- | --- |
| count | <code>number</code> | 
| options | <code>Object</code> | 

**Example**  
```js
GraphObjectFactory.createBars(100_000, { scene, name: 'bars' });
```
<a name="module_GraphObjectFactory.GraphObjectFactory.createPoints"></a>

### GraphObjectFactory.createPoints(count, options) ⇒ <code>\*</code>
Scatter-plot points: small spheres, real 3D objects (not `THREE.Points`sprites) so each one is individually pickable/raycastable.

**Kind**: static method of [<code>GraphObjectFactory</code>](#module_GraphObjectFactory.GraphObjectFactory)  
**Throws**:

- <code>TypeError</code> If `count` or `options.instancingThreshold` is not a positive integer.


| Param | Type |
| --- | --- |
| count | <code>number</code> | 
| options | <code>Object</code> | 

**Example**  
```js
GraphObjectFactory.createPoints(1_000_000, { scene, name: 'scatter' });
```
<a name="module_GraphObjectFactory.GraphObjectFactory.createLineSegments"></a>

### GraphObjectFactory.createLineSegments(count, options) ⇒ <code>\*</code>
Line segments: a thin unit-length box along X, meant to be positioned ata segment's midpoint, rotated to its orientation, and scaled along X toits length.

**Kind**: static method of [<code>GraphObjectFactory</code>](#module_GraphObjectFactory.GraphObjectFactory)  
**Throws**:

- <code>TypeError</code> If `count` or `options.instancingThreshold` is not a positive integer.


| Param | Type |
| --- | --- |
| count | <code>number</code> | 
| options | <code>Object</code> | 

**Example**  
```js
GraphObjectFactory.createLineSegments(500, { scene, name: 'edges' });
```
<a name="module_GraphObjectFactory.GraphObjectFactory.createSurfaceTiles"></a>

### GraphObjectFactory.createSurfaceTiles(count, options) ⇒ <code>\*</code>
Surface-plot tiles: a unit quad, meant to be positioned/rotated per grid cell.

**Kind**: static method of [<code>GraphObjectFactory</code>](#module_GraphObjectFactory.GraphObjectFactory)  
**Throws**:

- <code>TypeError</code> If `count` or `options.instancingThreshold` is not a positive integer.


| Param | Type |
| --- | --- |
| count | <code>number</code> | 
| options | <code>Object</code> | 

**Example**  
```js
GraphObjectFactory.createSurfaceTiles(2_500, { scene, name: 'surface' });
```
<a name="module_GraphObjectFactory.GraphObjectFactory.createNodes"></a>

### GraphObjectFactory.createNodes(count, options) ⇒ <code>\*</code>
Node-link graph nodes: spheres, larger and more detailed by default than`createPoints` since nodes are typically a chart's focal elements.

**Kind**: static method of [<code>GraphObjectFactory</code>](#module_GraphObjectFactory.GraphObjectFactory)  
**Throws**:

- <code>TypeError</code> If `count` or `options.instancingThreshold` is not a positive integer.


| Param | Type |
| --- | --- |
| count | <code>number</code> | 
| options | <code>Object</code> | 

**Example**  
```js
GraphObjectFactory.createNodes(30, { scene, name: 'node' });
```
<a name="module_GraphObjectFactory.GraphObjectFactory.createTriangleMesh"></a>

### GraphObjectFactory.createTriangleMesh(name, options) ⇒ <code>GraphMesh</code>
A single continuous triangulated mesh built directly from a generator'sraw `{positions, indices, normals}` output (`generator.surface()`,`generator.arc()`, `generator.area()`, Prompt 135) — unlike every otherfactory above, this is never instanced: a heightfield or an extrudedwall is one continuous surface, not N independent datums, so there's no`count`/`INSTANCING_THRESHOLD` dispatch to make.

**Kind**: static method of [<code>GraphObjectFactory</code>](#module_GraphObjectFactory.GraphObjectFactory)  
**Throws**:

- <code>TypeError</code> If `positions`/`normals` aren't `Float32Array`, or `indices` isn't `Uint32Array`.


| Param | Type |
| --- | --- |
| name | <code>string</code> | 
| options | <code>Object</code> | 

**Example**  
```js
GraphObjectFactory.createTriangleMesh('terrain', { scene, ...surfaceBuffers });
```
