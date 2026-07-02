import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { GraphObjectLoader } from '../../src/object/GraphObjectLoader.js';

function makeGroupWithMesh() {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  return group;
}

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: vi.fn(function MockGLTFLoader() {
    this.setDRACOLoader = vi.fn();
    this.setKTX2Loader = vi.fn();
    this.load = vi.fn((url, onLoad) => onLoad({ scene: makeGroupWithMesh() }));
  }),
}));

vi.mock('three/examples/jsm/utils/SkeletonUtils.js', () => ({
  clone: vi.fn((object) => object.clone(true)),
}));

describe('GraphObjectLoader disposal', () => {
  it('creates and disposes 200 loaded models (unique URLs) without throwing or leaking scene children', async () => {
    const scene = new THREE.Scene();
    for (let i = 0; i < 200; i++) {
      const obj = await GraphObjectLoader.loadGLTF(`/models/loop-${i}.glb`, { scene, name: `m${i}` });
      obj.dispose();
    }
    expect(scene.children.length).toBe(0);
  });

  it('double-dispose is idempotent and only releases the cache ref once', async () => {
    const scene = new THREE.Scene();
    const obj = await GraphObjectLoader.loadGLTF('/models/double.glb', { scene, name: 'a' });
    const geometrySpy = vi.spyOn(obj.three.children[0].geometry, 'dispose');

    obj.dispose();
    obj.dispose();

    expect(geometrySpy).toHaveBeenCalledOnce();
  });
});
