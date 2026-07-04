import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { sampleMeshSurface } from '../../../src/postfx/particles/meshSampling.js';

describe('sampleMeshSurface', () => {
  it('throws TypeError when the geometry has no position attribute', () => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry());
    expect(() => sampleMeshSurface(mesh, 1)).toThrow(/no position attribute/);
  });

  it('returns count points and count normals', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    const { points, normals } = sampleMeshSurface(mesh, 50);
    expect(points).toHaveLength(50);
    expect(normals).toHaveLength(50);
  });

  it('samples points that lie within the plane bounds and normals that face +z', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    mesh.updateWorldMatrix(true, false);
    const { points, normals } = sampleMeshSurface(mesh, 100);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(-1.0001);
      expect(p.x).toBeLessThanOrEqual(1.0001);
      expect(p.y).toBeGreaterThanOrEqual(-1.0001);
      expect(p.y).toBeLessThanOrEqual(1.0001);
      expect(p.z).toBeCloseTo(0);
    }
    for (const n of normals) {
      expect(n.z).toBeCloseTo(1);
    }
  });

  it('transforms sampled points and normals by the mesh world matrix', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    mesh.position.set(10, 0, 0);
    mesh.updateWorldMatrix(true, false);
    const { points } = sampleMeshSurface(mesh, 20);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(8.9999);
      expect(p.x).toBeLessThanOrEqual(11.0001);
    }
  });

  it('works with indexed and non-indexed geometry alike', () => {
    const indexed = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    expect(indexed.geometry.index).not.toBeNull();
    const nonIndexed = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).toNonIndexed());
    expect(nonIndexed.geometry.index).toBeNull();

    expect(() => sampleMeshSurface(indexed, 10)).not.toThrow();
    expect(() => sampleMeshSurface(nonIndexed, 10)).not.toThrow();
  });

  it('samples every triangle of a multi-triangle geometry (area-weighted, not just the first)', () => {
    // Two widely separated triangles via a custom BufferGeometry: sampling
    // enough points should hit both, not just triangle 0.
    const positions = new Float32Array([
      // Triangle A near origin
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      // Triangle B far away
      100, 100, 0, 101, 100, 0, 100, 101, 0,
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mesh = new THREE.Mesh(geometry);
    mesh.updateWorldMatrix(true, false);

    const { points } = sampleMeshSurface(mesh, 200);
    const hitsNearOrigin = points.some((p) => p.x < 10);
    const hitsFarTriangle = points.some((p) => p.x > 90);
    expect(hitsNearOrigin).toBe(true);
    expect(hitsFarTriangle).toBe(true);
  });
});
