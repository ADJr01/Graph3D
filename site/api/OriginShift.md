# OriginShift

<a name="module_OriginShift.OriginShift"></a>

## OriginShift
Transparent world-origin shifting (Prompt 164): keeps the camera — and
everything else in the scene — near local `(0, 0, 0)` so float32 position
storage (vertex buffers, per-instance matrices, the camera's own
position) stays precise even when a scene spans a huge coordinate range.

Every frame (`core/Graph3DLoop`), checks the camera's distance from local
origin and, once it exceeds `threshold`, subtracts that distance's vector
from the camera *and* every top-level `scene` child in one shot — moving
everything together preserves every relative position and render output
exactly, while shrinking the absolute numbers float32 has to represent.
Nested content (children of a shifted top-level object, per-instance data
inside a `GraphInstancedObject`) moves for free through normal
`matrixWorld` composition — only top-level children need touching.

"Transparent": nothing else in the library needs to know this is running.
`GraphChart`/`GraphScene`/`GraphInstancedObject` write positions exactly
as they always have; `OriginShift` only ever adjusts `.position` on the
objects it's given, from outside — the same "attach externally, duck-typed
target" shape as `interact/FocusFollower`.

**Kind**: static class of [<code>OriginShift</code>](#module_OriginShift)  

* [.OriginShift](#module_OriginShift.OriginShift)
    * [new exports.OriginShift(options)](#new_module_OriginShift.OriginShift_new)
    * [.worldOffset](#module_OriginShift.OriginShift+worldOffset) ⇒ <code>Object</code>
    * [.dispose()](#module_OriginShift.OriginShift+dispose)

<a name="new_module_OriginShift.OriginShift_new"></a>

### new exports.OriginShift(options)
**Throws**:

- <code>TypeError</code> If `scene` doesn't expose a `children` array, `camera` doesn't expose a `position` with `length()`/`clone()`/`sub()`, or `threshold` isn't a positive number.


| Param | Type | Description |
| --- | --- | --- |
| options | <code>object</code> |  |
| options.scene | <code>Object</code> | Duck-typed to `.children` — e.g. a `THREE.Scene`. |
| options.camera | <code>Object</code> | Duck-typed to a `THREE.Vector3`-like `.position`. |
| [options.threshold] | <code>number</code> | Camera distance from local origin, beyond which a shift fires. Default `1000`. |

**Example**  
```js
const originShift = new OriginShift({ scene: scene.three, camera: scene.camera.three, threshold: 1000 });
originShift.worldOffset; // {x, y, z} — total shift applied so far; add to a local position to recover the true one
originShift.dispose();
```
<a name="module_OriginShift.OriginShift+worldOffset"></a>

### originShift.worldOffset ⇒ <code>Object</code>
Cumulative shift applied so far — add to a current local position to
recover the coordinate it would have had with no shifting ever applied.

**Kind**: instance property of [<code>OriginShift</code>](#module_OriginShift.OriginShift)  
<a name="module_OriginShift.OriginShift+dispose"></a>

### originShift.dispose()
Stops the per-frame distance check. Idempotent.

**Kind**: instance method of [<code>OriginShift</code>](#module_OriginShift.OriginShift)  
**Example**  
```js
originShift.dispose();
```
