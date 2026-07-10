import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { recomputeNormals, fixWinding } from '../../src/object/normals.js';

function singleTriangleGeometry({ indexed = true } = {}) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  if (indexed) geometry.setIndex([0, 1, 2]);
  return geometry;
}

describe('recomputeNormals', () => {
  it('throws TypeError for a non-BufferGeometry', () => {
    expect(() => recomputeNormals(null)).toThrow(TypeError);
  });

  it('computes a correct face normal for a simple indexed triangle', () => {
    const geometry = singleTriangleGeometry({ indexed: true });
    recomputeNormals(geometry);
    const normal = geometry.getAttribute('normal');
    expect(normal).toBeDefined();
    const n = new THREE.Vector3().fromBufferAttribute(normal, 0);
    expect(n.z).toBeCloseTo(1); // (1,0,0) x (0,1,0) = (0,0,1)
  });

  it('returns the same geometry instance (mutates in place, chainable)', () => {
    const geometry = singleTriangleGeometry();
    expect(recomputeNormals(geometry)).toBe(geometry);
  });

  it('{smooth:false} de-indexes an indexed geometry so each triangle gets its own flat normal', () => {
    // Two triangles sharing an edge, indexed — smooth shading would average
    // their normals at the shared vertices. This box has adjoining faces at
    // different angles, so a real difference between smooth vs. flat is
    // observable.
    const box = new THREE.BoxGeometry(1, 1, 1);
    expect(box.getIndex()).not.toBeNull();

    recomputeNormals(box, { smooth: false });
    expect(box.getIndex()).toBeNull(); // de-indexed

    // Flat: every vertex of a given face shares the exact same normal.
    const normal = box.getAttribute('normal');
    const n0 = new THREE.Vector3().fromBufferAttribute(normal, 0);
    const n1 = new THREE.Vector3().fromBufferAttribute(normal, 1);
    const n2 = new THREE.Vector3().fromBufferAttribute(normal, 2);
    expect(n0.equals(n1)).toBe(true);
    expect(n1.equals(n2)).toBe(true);
  });
});

describe('fixWinding', () => {
  it('throws TypeError for a non-BufferGeometry', () => {
    expect(() => fixWinding(null)).toThrow(TypeError);
  });

  it('reverses the computed face normal for an indexed triangle', () => {
    const geometry = singleTriangleGeometry({ indexed: true });
    recomputeNormals(geometry);
    const before = new THREE.Vector3().fromBufferAttribute(geometry.getAttribute('normal'), 0).clone();

    fixWinding(geometry);
    const after = new THREE.Vector3().fromBufferAttribute(geometry.getAttribute('normal'), 0);

    expect(after.z).toBeCloseTo(-before.z);
  });

  it('swaps the index buffer\'s triangle winding without touching vertex positions', () => {
    const geometry = singleTriangleGeometry({ indexed: true });
    fixWinding(geometry);
    expect([...geometry.getIndex().array]).toEqual([0, 2, 1]);
  });

  it('reverses a non-indexed geometry by swapping the attribute entries directly', () => {
    const geometry = singleTriangleGeometry({ indexed: false });
    expect(geometry.getIndex()).toBeNull();

    fixWinding(geometry);

    const position = geometry.getAttribute('position');
    expect(new THREE.Vector3().fromBufferAttribute(position, 0)).toEqual(new THREE.Vector3(0, 0, 0));
    expect(new THREE.Vector3().fromBufferAttribute(position, 1)).toEqual(new THREE.Vector3(0, 1, 0)); // was vertex 2
    expect(new THREE.Vector3().fromBufferAttribute(position, 2)).toEqual(new THREE.Vector3(1, 0, 0)); // was vertex 1
  });

  it('leaves geometry with no normal attribute alone (does not add one)', () => {
    const geometry = singleTriangleGeometry({ indexed: true });
    expect(geometry.getAttribute('normal')).toBeUndefined();
    fixWinding(geometry);
    expect(geometry.getAttribute('normal')).toBeUndefined();
  });

  it('returns the same geometry instance (mutates in place, chainable)', () => {
    const geometry = singleTriangleGeometry();
    expect(fixWinding(geometry)).toBe(geometry);
  });
});
