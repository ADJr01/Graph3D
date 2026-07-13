# LOD

<a name="module_LOD.LOD"></a>

## LOD
Camera-distance-driven level-of-detail, as a standalone engine for any
duck-typed chart-like target (`.data()`/`.update()`/`.scene`) — the same
algorithm `GraphChart.enableLOD()` (Prompt 163, `chart/GraphChart.js`)
runs inline for its own instances (`chart/` never imports `stream/`,
CLAUDE.md §1.4, so that method can't delegate here; see its own doc
comment). Use this class directly when driving LOD on something other
than a `GraphChart` — e.g. a raw `GraphInstancedObject` wrapped in a
minimal adapter.

Every frame (`core/Graph3DLoop`), checks `camera`'s distance to
`chart.scene.position` and, when it crosses into a different `levels`
bucket, re-decimates the dataset snapshotted at construction time down to
that bucket's `maxPoints` (`compose/transform`'s existing
`transform.decimate` — CLAUDE.md §1.1 DRY, no second decimation algorithm
here) and re-binds it via `chart.data(subset, keyFn) + chart.update()`.

**Kind**: static class of [<code>LOD</code>](#module_LOD)  

* [.LOD](#module_LOD.LOD)
    * [new exports.LOD(options)](#new_module_LOD.LOD_new)
    * [.currentMaxPoints](#module_LOD.LOD+currentMaxPoints) ⇒ <code>number</code> \| <code>null</code>
    * [.dispose()](#module_LOD.LOD+dispose)

<a name="new_module_LOD.LOD_new"></a>

### new exports.LOD(options)
**Throws**:

- <code>TypeError</code> If `chart` doesn't expose `data()`/`update()`, `camera` doesn't expose `position.distanceTo`, or `levels` is invalid.


| Param | Type | Description |
| --- | --- | --- |
| options | <code>object</code> |  |
| options.chart | <code>Object</code> | Duck-typed — needs `data()`/`data(arr, keyFn)`/`update()`/`scene.position`. |
| options.camera | <code>function</code> | Duck-typed to `.position.distanceTo`. |
| options.levels | <code>Object</code> |  |
| [options.keyFn] | <code>function</code> | Must match whatever `keyFn` `chart`'s data was originally bound with, or re-decimated frames will misjoin. Defaults to identity. |

**Example**  
```js
const lod = new LOD({
  chart,
  camera: scene.camera.three,
  levels: [
    { maxDistance: 20, maxPoints: 5000 },
    { maxDistance: 100, maxPoints: 500 },
  ],
});
lod.dispose(); // stops the per-frame check
```
<a name="module_LOD.LOD+currentMaxPoints"></a>

### loD.currentMaxPoints ⇒ <code>number</code> \| <code>null</code>
**Kind**: instance property of [<code>LOD</code>](#module_LOD.LOD)  
**Returns**: <code>number</code> \| <code>null</code> - The currently applied level's `maxPoints`, or `null` before the first check has run.  
<a name="module_LOD.LOD+dispose"></a>

### loD.dispose()
Stops the per-frame distance check. Idempotent.

**Kind**: instance method of [<code>LOD</code>](#module_LOD.LOD)  
**Example**  
```js
lod.dispose();
```
