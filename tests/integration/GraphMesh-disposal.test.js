import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { GraphMesh } from '../../src/object/GraphMesh.js';

function makeMesh({ scene = new THREE.Scene() } = {}) {
  return new GraphMesh({
    scene,
    name: 'a',
    geometry: new THREE.BoxGeometry(),
    material: new THREE.MeshBasicMaterial(),
  });
}

describe('GraphMesh disposal', () => {
  it('creates and disposes 1 000 instances without throwing or leaking scene children', () => {
    const scene = new THREE.Scene();
    for (let i = 0; i < 1_000; i++) {
      makeMesh({ scene }).dispose();
    }
    expect(scene.children.length).toBe(0);
  });

  it('disposes geometry and material', () => {
    const mesh = makeMesh();
    const geometrySpy = vi.spyOn(mesh.three.geometry, 'dispose');
    const materialSpy = vi.spyOn(mesh.three.material, 'dispose');

    mesh.dispose();

    expect(geometrySpy).toHaveBeenCalledOnce();
    expect(materialSpy).toHaveBeenCalledOnce();
  });

  it('disposes every material in an array-material mesh', () => {
    const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    const mesh = new GraphMesh({
      scene: new THREE.Scene(),
      name: 'a',
      geometry: new THREE.BoxGeometry(),
      material: materials,
    });
    const spies = materials.map((m) => vi.spyOn(m, 'dispose'));

    mesh.dispose();

    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });

  it('double-dispose is idempotent and does not re-dispose geometry/material', () => {
    const mesh = makeMesh();
    const geometrySpy = vi.spyOn(mesh.three.geometry, 'dispose');
    const materialSpy = vi.spyOn(mesh.three.material, 'dispose');

    mesh.dispose();
    mesh.dispose();

    expect(geometrySpy).toHaveBeenCalledOnce();
    expect(materialSpy).toHaveBeenCalledOnce();
  });

  it('all public methods throw after dispose with a descriptive error', () => {
    const mesh = makeMesh();
    mesh.dispose();
    const pattern = /GraphMesh\.\w+: object 'a' has been disposed/;
    expect(() => mesh.setPosition(0, 0, 0)).toThrow(pattern);
    expect(() => mesh.setVertex(0, 0, 0, 0)).toThrow(pattern);
    expect(() => mesh.commit()).toThrow(pattern);
  });
});
