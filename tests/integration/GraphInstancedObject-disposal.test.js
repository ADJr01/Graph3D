import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { GraphInstancedObject } from '../../src/object/GraphInstancedObject.js';

function makeInstanced({ scene = new THREE.Scene(), count = 10 } = {}) {
  return new GraphInstancedObject({
    scene,
    name: 'a',
    geometry: new THREE.BoxGeometry(),
    material: new THREE.MeshBasicMaterial(),
    count,
  });
}

describe('GraphInstancedObject disposal', () => {
  it('creates and disposes 1 000 instances without throwing or leaking scene children', () => {
    const scene = new THREE.Scene();
    for (let i = 0; i < 1_000; i++) {
      makeInstanced({ scene }).dispose();
    }
    expect(scene.children.length).toBe(0);
  });

  it('disposes geometry and material', () => {
    const obj = makeInstanced();
    const geometrySpy = vi.spyOn(obj.three.geometry, 'dispose');
    const materialSpy = vi.spyOn(obj.three.material, 'dispose');

    obj.dispose();

    expect(geometrySpy).toHaveBeenCalledOnce();
    expect(materialSpy).toHaveBeenCalledOnce();
  });

  it('disposes every material in an array-material instance', () => {
    const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    const obj = new GraphInstancedObject({
      scene: new THREE.Scene(),
      name: 'a',
      geometry: new THREE.BoxGeometry(),
      material: materials,
      count: 4,
    });
    const spies = materials.map((m) => vi.spyOn(m, 'dispose'));

    obj.dispose();

    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });

  it('dispatches a dispose event on the mesh so the renderer can free instance buffers', () => {
    const obj = makeInstanced();
    const listener = vi.fn();
    obj.three.addEventListener('dispose', listener);

    obj.dispose();

    expect(listener).toHaveBeenCalledOnce();
  });

  it('double-dispose is idempotent and does not re-dispose geometry/material', () => {
    const obj = makeInstanced();
    const geometrySpy = vi.spyOn(obj.three.geometry, 'dispose');
    const materialSpy = vi.spyOn(obj.three.material, 'dispose');

    obj.dispose();
    obj.dispose();

    expect(geometrySpy).toHaveBeenCalledOnce();
    expect(materialSpy).toHaveBeenCalledOnce();
  });

  it('all public methods throw after dispose with a descriptive error', () => {
    const obj = makeInstanced();
    obj.dispose();
    const pattern = /GraphInstancedObject\.\w+: object 'a' has been disposed/;
    expect(() => obj.setInstanceCount(1)).toThrow(pattern);
    expect(() => obj.setInstanceMatrix(0, new THREE.Matrix4())).toThrow(pattern);
    expect(() => obj.setInstanceColor(0, 'white')).toThrow(pattern);
    expect(() => obj.commitMatrix()).toThrow(pattern);
  });
});
