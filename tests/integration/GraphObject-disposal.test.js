import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GraphObject } from '../../src/object/GraphObject.js';

// GraphObject wraps a caller-supplied THREE.Object3D — it doesn't create the
// geometry/material itself, so it holds no GPU resources of its own here.
// Ownership of GPU resources belongs to subclasses (GraphMesh,
// GraphInstancedObject, Phase 3) that actually allocate them.

function makeMesh() {
  return new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
}

describe('GraphObject disposal', () => {
  it('creates and disposes 1 000 instances without throwing or leaking scene children', () => {
    const scene = new THREE.Scene();
    for (let i = 0; i < 1_000; i++) {
      const obj = new GraphObject({ scene, name: `obj_${i}`, three: makeMesh() });
      obj.dispose();
    }
    expect(scene.children.length).toBe(0);
  });

  it('double-dispose is idempotent', () => {
    const scene = new THREE.Scene();
    const obj = new GraphObject({ scene, name: 'a', three: makeMesh() });
    obj.dispose();
    expect(() => obj.dispose()).not.toThrow();
  });

  it('all public methods throw after dispose with a descriptive error', () => {
    const scene = new THREE.Scene();
    const obj = new GraphObject({ scene, name: 'a', three: makeMesh() });
    obj.dispose();
    const pattern = /GraphObject\.\w+: object 'a' has been disposed/;
    expect(() => obj.setName('b')).toThrow(pattern);
    expect(() => obj.setUserData('k', 1)).toThrow(pattern);
    expect(() => obj.getUserData('k')).toThrow(pattern);
  });
});
