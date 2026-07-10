import * as THREE from 'three';

const NON_INDEX_TRIANGLE_ATTRIBUTES = ['position', 'normal', 'uv', 'color'];

/** @param {THREE.BufferAttribute} attribute Mutated in place: swaps vertex 1 and 2 within every triangle triplet. */
function swapAttributeTriangleVertices(attribute) {
  const itemSize = attribute.itemSize;
  const scratch = new Array(itemSize);
  const triangleCount = Math.floor(attribute.count / 3);
  for (let t = 0; t < triangleCount; t++) {
    const b = t * 3 + 1;
    const c = t * 3 + 2;
    for (let k = 0; k < itemSize; k++) scratch[k] = attribute.getComponent(b, k);
    for (let k = 0; k < itemSize; k++) attribute.setComponent(b, k, attribute.getComponent(c, k));
    for (let k = 0; k < itemSize; k++) attribute.setComponent(c, k, scratch[k]);
  }
  attribute.needsUpdate = true;
}

/**
 * Recomputes `geometry`'s vertex normals — a thin, documented wrapper over
 * `THREE.BufferGeometry.computeVertexNormals()` (this library's established
 * "expose THREE's real feature, don't reinvent it" rule, same as
 * `material/presets/pbr.js`), plus the one piece of real logic THREE
 * doesn't give you directly: `{ smooth: false }` for flat shading.
 *
 * `computeVertexNormals()` always *averages* a vertex's adjacent face
 * normals when that vertex is shared across triangles (indexed geometry's
 * whole point) — that's smooth shading. There's no vertex sharing to
 * average over once a geometry is de-indexed (each triangle owns 3 private
 * vertices), so the same call naturally yields one normal per face instead:
 * flat shading. `{ smooth: false }` on an indexed geometry de-indexes it
 * first for exactly that reason; `{ smooth: true }` (the default) leaves
 * indexing alone and just calls `computeVertexNormals()` — which will
 * *not* smooth an already non-indexed geometry, since there's nothing
 * shared left to average (a caveat inherited directly from THREE's own
 * method, not something this wrapper can paper over without a full
 * `mergeVertices`-style pass, which is a bigger feature this thin wrapper
 * deliberately doesn't take on).
 * @param {THREE.BufferGeometry} geometry Mutated in place.
 * @param {{smooth?: boolean}} [options]
 * @param {boolean} [options.smooth=true]
 * @returns {THREE.BufferGeometry} `geometry`, for chaining.
 * @throws {TypeError} If `geometry` isn't a `THREE.BufferGeometry`.
 * @example recomputeNormals(mesh.three.geometry, { smooth: false }); // flat-shaded look
 */
export function recomputeNormals(geometry, options = {}) {
  if (!(geometry instanceof THREE.BufferGeometry)) {
    throw new TypeError(`recomputeNormals: expected a THREE.BufferGeometry, received ${JSON.stringify(geometry)}.`);
  }
  const { smooth = true } = options;
  if (!smooth && geometry.getIndex()) {
    const nonIndexed = geometry.toNonIndexed();
    geometry.setIndex(null);
    for (const name of Object.keys(nonIndexed.attributes)) {
      geometry.setAttribute(name, nonIndexed.attributes[name]);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Reverses `geometry`'s triangle winding order — the fix for a mesh that
 * looks "inside out" (backface culling hides the faces you'd expect to
 * see, or lighting looks inverted) because it was authored/generated with
 * the opposite winding convention THREE expects (counter-clockwise = front,
 * when viewed from the side the normal points toward).
 *
 * This is a uniform, whole-geometry reversal — swapping vertex 2 and 3
 * within every triangle (indexed geometry: swaps index-buffer entries only;
 * non-indexed: swaps `position`/`normal`/`uv`/`color` attribute entries
 * directly, since there's no index to redirect) — **not** an adaptive
 * per-triangle consistency repair. If only *some* of a mesh's triangles
 * are backwards (a genuinely malformed mesh, not just globally inverted),
 * this will flip the correct ones too; it solves the "the whole thing is
 * inside out" case, which is what a coordinate-system mismatch or a
 * `scale.x = -1` mistake actually produces.
 *
 * Recomputes vertex normals afterward whenever a `normal` attribute exists
 * — reversing winding flips which side is "front" without touching the
 * normal attribute itself, so previously-correct normals would otherwise
 * end up facing the *old* front (now the back). Regenerating them from the
 * new winding (via `recomputeNormals`, not a second normal-flipping
 * implementation — CLAUDE.md §1.1 DRY) is the only way to guarantee they're
 * actually correct afterward, since we can't assume the original normals
 * were valid to begin with (that's frequently the same bug).
 * @param {THREE.BufferGeometry} geometry Mutated in place.
 * @returns {THREE.BufferGeometry} `geometry`, for chaining.
 * @throws {TypeError} If `geometry` isn't a `THREE.BufferGeometry`.
 * @example fixWinding(mesh.three.geometry); // mesh was rendering inside-out
 */
export function fixWinding(geometry) {
  if (!(geometry instanceof THREE.BufferGeometry)) {
    throw new TypeError(`fixWinding: expected a THREE.BufferGeometry, received ${JSON.stringify(geometry)}.`);
  }
  const index = geometry.getIndex();
  if (index) {
    const array = index.array;
    const triangleCount = Math.floor(array.length / 3);
    for (let t = 0; t < triangleCount; t++) {
      const b = t * 3 + 1;
      const c = t * 3 + 2;
      const tmp = array[b];
      array[b] = array[c];
      array[c] = tmp;
    }
    index.needsUpdate = true;
  } else {
    for (const name of NON_INDEX_TRIANGLE_ATTRIBUTES) {
      const attribute = geometry.getAttribute(name);
      if (attribute) swapAttributeTriangleVertices(attribute);
    }
  }
  if (geometry.getAttribute('normal')) recomputeNormals(geometry, { smooth: true });
  return geometry;
}
