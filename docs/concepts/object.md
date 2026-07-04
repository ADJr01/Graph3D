# Object & Mesh — Phase 3

Object & Mesh is Layer 3 of Graph3D.js. It wraps every renderable entity — from a handful of hand-placed meshes to a million-instance point cloud — behind one consistent API (`dispose()`, `setUserData()`, per-instance mutation), and provides the spatial index (`Octree`) that makes picking and frustum culling fast at scale.

---

## `GraphObject` — the base wrapper

Every chart-facing object type extends `GraphObject`. It adds `three` to `scene` on construction, auto-registers itself under `name` in a per-scene registry, and owns the disposal pattern every subclass follows:

```js
const obj = new GraphMesh({ scene: graphScene.three, name: 'bar_0', geometry, material });
obj.setUserData('value', 42);
obj.getUserData('value'); // 42
obj.dispose();
```

Subclasses that must reallocate their wrapped `THREE.Object3D` in place — `GraphInstancedObject` rebuilding a larger `InstancedMesh` when growing capacity — use the protected `_replaceThree(three)` hook instead of disposing and reconstructing the whole wrapper. It carries over `name` and scene attachment; it does not dispose the outgoing object, since the caller controls exactly when that happens relative to the swap.

---

## The instancing decision: `GraphMesh` vs. `GraphInstancedObject`

This is the single most important performance decision the library makes on a chart-builder's behalf. `GraphObjectFactory` (below) makes it automatically per call, dispatching on datum count against `INSTANCING_THRESHOLD`:

| | `GraphMesh[]` (one `THREE.Mesh` per datum) | `GraphInstancedObject` (one `THREE.InstancedMesh`) |
|---|---|---|
| **When** | `count <= INSTANCING_THRESHOLD` (default `50`) | `count > INSTANCING_THRESHOLD` |
| **Draw calls** | One per datum | One for the whole batch |
| **Inspectability** | Each datum is its own scene-graph node — visible and individually selectable in DevTools | One scene-graph node; individual datums are addressed by index, not by node |
| **Per-datum cost** | Negligible at low counts, but scales linearly — thousands of draw calls will stall the GPU command buffer | Near-zero marginal cost per datum; the only path that scales to millions |
| **Picking** | Native `THREE.Raycaster` hit-testing per mesh | `pick(raycaster)`, octree-accelerated |
| **Use for** | Small, frequently-inspected datasets; one-off scene dressing | Bar/scatter/node-link/heatmap charts at realistic data sizes |

Override the boundary per call via `options.instancingThreshold` — there is no global switch, since different chart types may want different cutoffs.

```js
import { GraphObjectFactory, INSTANCING_THRESHOLD } from 'graph3d.js';

GraphObjectFactory.createBars(12, { scene, name: 'bars' });        // GraphMesh[12]
GraphObjectFactory.createBars(100_000, { scene, name: 'bars' });    // one GraphInstancedObject
GraphObjectFactory.createBars(60, { scene, name: 'bars', instancingThreshold: 100 }); // GraphMesh[60]
```

---

## `GraphMesh`

Transform and vertex-level mutation for a single mesh:

```js
mesh.setPosition(1, 2, 3).setScale(1, 2, 1).lookAt(0, 0, 0);

const vertex = mesh.getVertices()[0];
mesh.setVertex(0, vertex.x, vertex.y + 1, vertex.z).commit(); // commit() uploads to the GPU
```

`clone()` shares `geometry`/`material` with the original (cheap, but only one of the two should ever be disposed); `deepClone()` clones them too, producing a fully independent, independently-disposable copy.

---

## `GraphInstancedObject`

Wraps one `THREE.InstancedMesh` and exposes per-instance mutation instead of one mesh per datum:

```js
const bars = new GraphInstancedObject({
  scene: graphScene.three,
  name: 'bars',
  geometry: new THREE.BoxGeometry(),
  material: new THREE.MeshStandardMaterial(),
  count: 100_000,
});

bars.setInstancePosition(0, 1, 2, 3).setInstanceColor(0, 'crimson');
bars.commitMatrix().commitColor(); // one GPU upload per batch, not per instance
```

### Bulk, zero-allocation setters

`setAllPositions`/`setAllScales`/`setAllColors` accept a flat `Float32Array` covering every instance in one pass, reusing internal scratch objects — the path a chart's `update()` should take over looping the single-instance setters across tens of thousands of datums.

Pass `{ duration, easing }` (Prompt 92) to animate instead of snapping: the current array is captured as the tween start, and the whole buffer interpolates toward the target once per frame (via the shared RAF loop, `easing` resolved through `anim/GraphAnimCurve`) until `duration` (milliseconds) elapses, committing automatically — no manual `commit*()` call needed for that path. A later call on the same bulk setter cancels an in-flight one rather than fighting it.

```js
bars.setAllPositions(nextPositions, { duration: 600, easing: 'easeOutCubic' });
```

### Custom per-instance attributes

`defineAttribute(name, itemSize)` adds an `InstancedBufferAttribute` for driving custom vertex-shader effects (a per-bar pulse phase, a per-point category id) via `onBeforeCompile` shader injection — see `examples/03-instanced/main.js` for the full pattern (a single `rotationPhase` attribute plus a shared time uniform spinning 100,000 bars with zero per-frame CPU matrix writes).

### Capacity growth

`setInstanceCount(n)` renders anywhere from 0 up to the currently allocated capacity. If `n` exceeds it, capacity first grows to `THREE.MathUtils.ceilPowerOfTwo(n)`: `instanceMatrix`, `instanceColor`, `instanceId`, and every attribute defined via `defineAttribute` are reallocated and every existing instance's data copied across. Existing instance indices — and their octree entries — keep their meaning across a grow; nothing is remapped. The old `InstancedMesh`/geometry are properly disposed (`dispatchEvent({ type: 'dispose' })` + `geometry.dispose()`) rather than mutated in place, since classic `WebGLRenderer` cannot resize a buffer attribute in place.

```js
bars.setInstanceCount(150_000); // capacity was 131_072 -> grows to 262_144, then renders 150_000
```

### Picking

`pick(raycaster)` queries the internal `Octree` for candidate instances along the ray, then raycasts only the real geometry of those candidates — accurate down to the exact geometry hit, without brute-force testing every instance:

```js
const hitIndex = bars.pick(raycaster); // 42, or null on a miss
```

An instance that has never had its transform set has no octree entry yet and is not pickable — it's still sitting at `InstancedMesh`'s identity-matrix default.

### Frustum culling

`enableInstanceCulling({ camera, everyNthFrame })` captures every instance's current transform, then re-queries the octree against the camera frustum every `everyNthFrame`-th frame (auto-wired to the shared `loop`), giving culled instances a degenerate (zero) matrix and restoring visible ones. Moving a visible instance while culling is active is reflected on the next pass without re-enabling. `disableInstanceCulling()` restores every instance and unwires the loop callback.

---

## `Octree`

Spatial index over `id -> (position, radius)` entries — the shared backbone behind both `pick()` and instance culling:

```js
const octree = new Octree({ bounds: new THREE.Box3(min, max) });
octree.insert(0, new THREE.Vector3(1, 2, 3), 0.5);
octree.queryRay(raycaster.ray);       // candidate ids along a ray
octree.queryFrustum(camera.frustum);  // candidate ids inside a frustum
octree.queryRadius(point, radius);    // candidate ids within a sphere
octree.queryAABB(box);                // candidate ids within a box
octree.remove(0);
```

Queries return candidates whose bounding sphere intersects the query shape; callers do their own precise test (a real raycast, in `pick()`'s case) against just those candidates. A leaf subdivides once it holds more than `maxItemsPerNode` (default `8`) items, capped at `maxDepth` (default `8`).

**Sizing `bounds` matters at scale.** `GraphInstancedObject`'s default bounds (±10,000 on each axis) are generous enough for typical example/normalized data, but a dense cluster of a million points packed into a much smaller region will still only subdivide down to `maxDepth`, leaving each leaf holding far more than `maxItemsPerNode` items — turning every query into a near-linear scan. Pass a tight `octreeBounds` matching the actual data extent in that case (see `examples/03-million/main.js`, which bounds a ~126-unit cloud instead of the ±10,000-unit default to keep `pick()` sub-frame at a million instances).

---

## `GraphObjectFactory`

Static factories for the five base chart primitives, each returning `GraphMesh[]` or one `GraphInstancedObject` per the instancing decision above:

| Method | Default geometry | Meant for |
|---|---|---|
| `createBars(count, options)` | Unit box | Bar charts — scale per datum along Y |
| `createPoints(count, options)` | Small sphere | Scatter plots |
| `createLineSegments(count, options)` | Thin box along X | Line/edge segments — position at midpoint, rotate, scale along X to length |
| `createSurfaceTiles(count, options)` | Unit quad | Surface-plot grid cells |
| `createNodes(count, options)` | Larger sphere | Node-link graph nodes |

`geometry`/`material` options override the defaults; both are cloned per `GraphMesh` below the threshold (each needs an independently-disposable copy) and consumed directly by the one `GraphInstancedObject` above it.

---

## `GraphObjectLoader`

Loads GLTF/GLB (+ optional Draco/KTX2), OBJ (+ MTL), and FBX. Ref-counted per URL — the network fetch + parse happens once no matter how many callers load the same URL; each caller gets an independent, independently-disposable clone of the resolved root, and the underlying cached root is only disposed once every clone has been released. Mirrors `GraphSceneEnvironment`'s HDR ref-counting (Phase 2).

---

## Disposal Contract

```js
bars.dispose();
// releases instanceMatrix/instanceColor GPU buffers (via the mesh's own
// 'dispose' event), disposes geometry and material, unregisters from the
// scene registry. Idempotent.
```

- Idempotent — every Phase 3 class's `dispose()` is safe to call twice.
- After disposal, every public method throws `"<ClassName>.<method>: object '<name>' has been disposed."`.
- `geometry`/`material` passed to `GraphMesh`/`GraphInstancedObject` are consumed exclusively by that instance and disposed alongside it — do not share the same geometry/material objects across multiple instances (clone first if you need to).
- Disposal tests in `tests/integration/*-disposal.test.js` construct-and-dispose each class 1000x and assert no throw and no leaked scene children; `tests/integration/phase3.test.js` additionally covers a 1,000,000-instance create+dispose cycle, octree-vs-brute-force query parity at 10K points, cross-grow attribute integrity, and the instancing-threshold boundary end-to-end (see Prompt 52).
