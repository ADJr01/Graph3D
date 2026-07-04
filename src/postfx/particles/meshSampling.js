import * as THREE from 'three';

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _edgeAB = new THREE.Vector3();
const _edgeAC = new THREE.Vector3();
const _triangle = new THREE.Triangle();

/**
 * @param {THREE.BufferAttribute} positionAttr
 * @param {THREE.BufferAttribute|null} index
 * @param {number} triangleIndex
 */
function readTriangle(positionAttr, index, triangleIndex) {
  const base = triangleIndex * 3;
  const i0 = index ? index.getX(base) : base;
  const i1 = index ? index.getX(base + 1) : base + 1;
  const i2 = index ? index.getX(base + 2) : base + 2;
  _vA.fromBufferAttribute(positionAttr, i0);
  _vB.fromBufferAttribute(positionAttr, i1);
  _vC.fromBufferAttribute(positionAttr, i2);
}

/**
 * Area-weighted random point sampling across a mesh's triangles, transformed
 * into world space — the standard technique for "particles emitted from a
 * surface" effects (`ParticleSystem.spawnAt`, the `dissolve` preset). Uses
 * the geometry's raw (un-skinned, un-morphed) triangle data; skinned/morphed
 * meshes sample from their rest pose, not their currently-posed shape (see
 * `skipping_list.md`).
 *
 * @param {THREE.Mesh} mesh - Must have `matrixWorld` up to date (call
 *   `mesh.updateWorldMatrix(true, false)` first if it may be stale).
 * @param {number} count
 * @returns {{ points: THREE.Vector3[], normals: THREE.Vector3[] }} World-space
 *   positions and face normals, one pair per sample.
 * @throws {TypeError} If `mesh.geometry` has no `position` attribute.
 */
export function sampleMeshSurface(mesh, count) {
  const geometry = mesh.geometry;
  const positionAttr = geometry.attributes.position;
  if (!positionAttr) {
    throw new TypeError('sampleMeshSurface: mesh.geometry has no position attribute.');
  }
  const index = geometry.index;
  const triangleCount = (index ? index.count : positionAttr.count) / 3;

  const areas = new Float64Array(triangleCount);
  let totalArea = 0;
  for (let t = 0; t < triangleCount; t++) {
    readTriangle(positionAttr, index, t);
    const area = _triangle.set(_vA, _vB, _vC).getArea();
    areas[t] = area;
    totalArea += area;
  }

  const points = new Array(count);
  const normals = new Array(count);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  for (let i = 0; i < count; i++) {
    let remaining = Math.random() * totalArea;
    let t = 0;
    while (t < triangleCount - 1 && remaining > areas[t]) {
      remaining -= areas[t];
      t++;
    }
    readTriangle(positionAttr, index, t);

    let u = Math.random();
    let v = Math.random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    _edgeAB.copy(_vB).sub(_vA);
    _edgeAC.copy(_vC).sub(_vA);
    const point = new THREE.Vector3()
      .copy(_vA)
      .addScaledVector(_edgeAB, u)
      .addScaledVector(_edgeAC, v)
      .applyMatrix4(mesh.matrixWorld);
    const normal = _triangle.set(_vA, _vB, _vC).getNormal(new THREE.Vector3()).applyMatrix3(normalMatrix).normalize();

    points[i] = point;
    normals[i] = normal;
  }
  return { points, normals };
}
