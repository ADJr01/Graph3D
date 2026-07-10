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

---

## `assignDepthJitter` — z-fighting mitigation

User-requested (not tied to a numbered `prompts.md` prompt — see `examples/21-bar-race/`). No chart generator that lacks an explicit per-datum z-concept (`generator.bar()` included) varies `position.z` across datums — every one gets the same value. That's invisible while members stay in their own lane, but the moment two members' *other* axes cross at runtime (a `.transition()`-driven rank swap is the concrete case that surfaced this — see `examples/21-bar-race/main.js`), their geometry genuinely intersects in 3D, and identical z-depth means their faces go perfectly coplanar right where they overlap. A GPU depth buffer can't reliably resolve which coplanar surface is nearer, so it flickers (z-fighting) exactly where the two objects cross.

```js
chart.render();
assignDepthJitter(chart.selection(), (d) => d.name); // call once, not per-update()
```

- Duck-typed over `{ backend, data() }` — works with a real `compose/selection` `Selection` (e.g. `chart.selection()`) directly, with no import from `object/` back into `compose/` (`object/` only reads the same backend *shape* `compose/selection` already uses — `{type:'meshes', meshes}` / `{type:'instanced', object, indices}` — never the `Selection` class).
- Deterministic and stateless: offsets are derived by sorting the resolved keys, not by call order, so the same *set* of keys always produces the same key→offset mapping regardless of what order `.data()` happens to return them in for a given call (e.g. after a `.sort()`-driven re-rank).
- Writes via a relative `translate`/instance-position-delta, not an absolute set — there's no generic way to know a member's "un-jittered" z for an arbitrary chart type. Call it once, right after the selection's identities are known (typically straight after a chart's first `render()`); calling it again on the same selection stacks a second offset on top of the first.
- Scoped deliberately: it mitigates the coplanar-depth *symptom*, not the underlying "two objects visually pass through each other mid-transition" — a true collision-avoiding transition path (e.g. an arc) is a materially bigger feature nothing currently asks for.

---

## `validateGeometry` — structural/topological mesh diagnostics

Also user-requested. Scans a `THREE.BufferGeometry` for the errors that produce broken or invisible rendering rather than a thrown error: non-finite (`NaN`/`Infinity`) vertex data, degenerate (near-zero-area) triangles, per-vertex attributes whose entry count doesn't match `position`, and index-buffer entries pointing past the end of `position`. Unlike `assignDepthJitter`'s heuristic, these are always genuine bugs, so it reports with certainty:

```js
const { valid, issues } = validateGeometry(mesh.three.geometry);
if (!valid) console.warn(issues);
```

- **Explicit and opt-in — not automatic instrumentation.** CLAUDE.md §1.5 describes a dev-mode `assert(condition, message)` helper (stripped in production builds) that this was originally going to hook into for "self-check every mesh at creation time." That helper doesn't actually exist anywhere in this codebase (checked directly — described in the constitution, never built) — and wiring an O(vertices + triangles) scan into every single `GraphMesh`/`GraphInstancedObject` construction would be a real, unconditional performance cost on a library whose whole premise is scaling to millions of datums. So this stays a tool you call yourself while debugging a specific mesh, not something Graph3D runs on your behalf.
- **Real regression coverage, not just synthetic cases:** `tests/object/validateGeometry.test.js` validates every `GraphObjectFactory` built-in geometry (bars/points/line-segments/surface-tiles/nodes, both the meshes and instanced backend) reports clean — a genuine guard against the factory itself ever regressing.
- `options.degenerateEpsilon` (default `1e-10`) tunes the zero-area threshold — a real, but extremely thin, triangle from a user's own data shouldn't be misreported as a bug.

---

## `recomputeNormals` / `fixWinding` — normals & shading fixes

Also user-requested. Thin, documented wrappers over THREE's own geometry methods (`computeVertexNormals()`, index/attribute reversal) — this library's established "expose the real feature, don't reinvent it" rule (`material/presets/pbr.js` follows the same philosophy for materials).

```js
recomputeNormals(mesh.three.geometry, { smooth: false }); // flat-shaded look
fixWinding(mesh.three.geometry); // mesh renders "inside out" — wrong faces culled, lighting inverted
```

- **`recomputeNormals`**: `{ smooth: true }` (default) just calls `computeVertexNormals()` as-is. `{ smooth: false }` de-indexes first — `computeVertexNormals()` always *averages* a shared vertex's adjacent face normals, so de-indexing (each triangle gets 3 private vertices, nothing left to average) is what actually produces a flat-shaded look through the same underlying call. Caveat inherited directly from THREE, not papered over: `{ smooth: true }` on an *already* non-indexed geometry won't smooth it — there's nothing shared to average — and fixing that generically would need a `mergeVertices`-style pass, a bigger feature this thin wrapper deliberately doesn't take on.
- **`fixWinding`**: reverses every triangle's vertex order — the fix for a mesh generated/authored with the opposite winding convention THREE expects, causing inverted culling/lighting. This is a **uniform, whole-geometry** reversal, not adaptive per-triangle consistency repair — it solves "the whole thing is inside out" (a coordinate-system mismatch, a `scale.x = -1` mistake), not "some triangles are backwards and some aren't" (a genuinely malformed mesh needs a different, much larger algorithm this doesn't attempt). Recomputes normals afterward (via `recomputeNormals`, not a second implementation) whenever a `normal` attribute exists, since reversing winding flips which side is "front" without touching the normal attribute itself — old normals would otherwise end up facing the wrong way relative to the new winding.
