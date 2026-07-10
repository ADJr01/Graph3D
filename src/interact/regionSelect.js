import * as THREE from 'three';

// Reused across projectToScreen()/worldPositionOf() calls to avoid a
// per-datum allocation — region queries (Brush/Lasso) test every datum of
// every registered chart on drag-end, unlike Picker's single ray per
// pickAt() call.
const projectedScratch = new THREE.Vector3();
const worldPositionScratch = new THREE.Vector3();
const localPositionScratch = new THREE.Vector3();
const matrixScratch = new THREE.Matrix4();
const quaternionScratch = new THREE.Quaternion();
const scaleScratch = new THREE.Vector3();

/**
 * Projects a world-space position to canvas-local pixel coordinates
 * (top-left origin, matching `Picker.pickAt(x, y)`'s own coordinate space —
 * `event.offsetX`/`offsetY` on the canvas, not `clientX`/`clientY`).
 * @param {THREE.Vector3} worldPosition
 * @param {THREE.Camera} camera
 * @param {{width: number, height: number}} domElement
 * @returns {{x: number, y: number}|null} `null` if the position projects
 *   behind the camera or outside its near/far planes (NDC `z` outside
 *   `[-1, 1]`) — a datum there isn't visible regardless of its screen `x`/`y`,
 *   so a brush/lasso region must not match it.
 */
export function projectToScreen(worldPosition, camera, domElement) {
  projectedScratch.copy(worldPosition).project(camera);
  if (projectedScratch.z < -1 || projectedScratch.z > 1) return null;
  return {
    x: ((projectedScratch.x + 1) / 2) * domElement.width,
    y: ((1 - projectedScratch.y) / 2) * domElement.height,
  };
}

/**
 * A chart's backend's `i`-th member's *world* position. `GraphMesh.getPosition()`/
 * `GraphInstancedObject.getInstancePosition()` (used by `compose/selection/attr.js`'s
 * `TRANSFORM_ACCESSORS` for `Selection.attr('position.*', ...)`) decompose the
 * *local* transform only — fine for a relative read-modify-write on the same
 * node, but wrong here: `projectToScreen` needs the true world position, so
 * this reads straight off the underlying `THREE.Object3D`/`InstancedMesh`
 * instead, combining an instanced member's local instance matrix with the
 * batch's own `matrixWorld` (mirrors `GraphInstancedObject`'s own internal
 * `#pickMeshScratch.matrixWorld.multiplyMatrices(...)` pattern used by `pick()`).
 * Exported (Prompt 155) so `FocusFollower` can resolve a keyboard-focused
 * datum's world position the same way `matchedIndicesForChart` already does
 * for a screen-projected one — no second copy of this matrix math.
 * @param {{type: 'meshes', meshes: import('../object/GraphMesh.js').GraphMesh[]}|{type: 'instanced', object: import('../object/GraphInstancedObject.js').GraphInstancedObject, indices: Uint32Array}} backend
 * @param {number} i
 * @returns {THREE.Vector3} A scratch vector — clone it before storing.
 */
export function worldPositionOf(backend, i) {
  if (backend.type === 'meshes') {
    return backend.meshes[i].three.getWorldPosition(worldPositionScratch);
  }
  const instancedMesh = backend.object.three;
  instancedMesh.getMatrixAt(backend.indices[i], matrixScratch);
  matrixScratch.premultiply(instancedMesh.matrixWorld);
  matrixScratch.decompose(worldPositionScratch, quaternionScratch, scaleScratch);
  return worldPositionScratch;
}

/**
 * The inverse of `worldPositionOf`: converts a *world* position into the
 * local coordinate frame `Selection.attr('position.*', ...)` reads/writes for
 * the backend's `i`-th member. `PointerRouter`'s drag gesture (Prompt 154)
 * computes a new world position on every `pointermove` (unprojecting the
 * pointer through the camera onto a plane at the datum's original depth) and
 * must convert it back before writing — for the identical reason
 * `worldPositionOf`'s own doc comment gives in the other direction: the
 * `position.*` accessors are local-only.
 * @param {{type: 'meshes', meshes: import('../object/GraphMesh.js').GraphMesh[]}|{type: 'instanced', object: import('../object/GraphInstancedObject.js').GraphInstancedObject, indices: Uint32Array}} backend
 * @param {number} i
 * @param {THREE.Vector3} worldPosition
 * @returns {THREE.Vector3} A scratch vector — clone it before storing.
 */
export function localPositionFromWorld(backend, i, worldPosition) {
  localPositionScratch.copy(worldPosition);
  if (backend.type === 'meshes') {
    const mesh = backend.meshes[i].three;
    return mesh.parent ? mesh.parent.worldToLocal(localPositionScratch) : localPositionScratch;
  }
  return backend.object.three.worldToLocal(localPositionScratch);
}

/**
 * Every local index (`0..chart.selection().size()-1`, the same convention
 * `Selection.datum(index)` uses) whose datum's screen-projected position
 * satisfies `containsFn(x, y)` — the shared "which datums fall inside this
 * screen region" query behind both `Brush` and `Lasso`.
 * @param {import('../chart/GraphChart.js').GraphChart} chart
 * @param {THREE.Camera} camera
 * @param {{width: number, height: number}} domElement
 * @param {(x: number, y: number) => boolean} containsFn
 * @returns {Set<number>}
 */
export function matchedIndicesForChart(chart, camera, domElement, containsFn) {
  // matrixWorld is only ever recomputed by a real WebGLRenderer.render()
  // call — a drag-end query requested between frames would otherwise
  // silently test against a stale world transform (the same gap Picker's
  // own pickAt() closes for its ray, Prompt 147).
  chart.scene.updateMatrixWorld(true);

  const selection = chart.selection();
  const backend = selection.backend;
  const size = selection.size();
  const matched = new Set();
  for (let i = 0; i < size; i++) {
    const screenPoint = projectToScreen(worldPositionOf(backend, i), camera, domElement);
    if (screenPoint !== null && containsFn(screenPoint.x, screenPoint.y)) matched.add(i);
  }
  return matched;
}
