import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GraphMesh } from '../../src/object/GraphMesh.js';

function makeMesh({ scene = new THREE.Scene(), name = 'a' } = {}) {
  return new GraphMesh({
    scene,
    name,
    geometry: new THREE.BoxGeometry(),
    material: new THREE.MeshBasicMaterial(),
  });
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('GraphMesh constructor', () => {
  it('throws TypeError when geometry is not a THREE.BufferGeometry', () => {
    expect(
      () =>
        new GraphMesh({
          scene: new THREE.Scene(),
          name: 'a',
          geometry: {},
          material: new THREE.MeshBasicMaterial(),
        }),
    ).toThrow(TypeError);
  });

  it('throws TypeError when material is not a THREE.Material or array of them', () => {
    expect(
      () =>
        new GraphMesh({
          scene: new THREE.Scene(),
          name: 'a',
          geometry: new THREE.BoxGeometry(),
          material: {},
        }),
    ).toThrow(TypeError);
  });

  it('accepts an array of materials', () => {
    const mesh = new GraphMesh({
      scene: new THREE.Scene(),
      name: 'a',
      geometry: new THREE.BoxGeometry(),
      material: [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()],
    });
    expect(mesh.three).toBeInstanceOf(THREE.Mesh);
  });

  it('wraps a THREE.Mesh and adds it to the scene', () => {
    const scene = new THREE.Scene();
    const mesh = makeMesh({ scene });
    expect(mesh.three).toBeInstanceOf(THREE.Mesh);
    expect(scene.children).toContain(mesh.three);
  });
});

// ── material getter ────────────────────────────────────────────────────────────

describe('GraphMesh.material', () => {
  it('returns the underlying material', () => {
    const material = new THREE.MeshBasicMaterial();
    const mesh = new GraphMesh({
      scene: new THREE.Scene(),
      name: 'a',
      geometry: new THREE.BoxGeometry(),
      material,
    });
    expect(mesh.material).toBe(material);
  });

  it('throws after dispose', () => {
    const mesh = makeMesh();
    mesh.dispose();
    expect(() => mesh.material).toThrow(/GraphMesh\.material: object 'a' has been disposed/);
  });
});

// ── isInstanced ────────────────────────────────────────────────────────────────

describe('GraphMesh.isInstanced', () => {
  it('is false — GraphMesh is a single-transform wrapper', () => {
    const mesh = makeMesh();
    expect(mesh.isInstanced).toBe(false);
  });
});

// ── Transform ──────────────────────────────────────────────────────────────────

describe('GraphMesh transform', () => {
  it('setPosition sets position', () => {
    const mesh = makeMesh();
    mesh.setPosition(1, 2, 3);
    expect(mesh.three.position.toArray()).toEqual([1, 2, 3]);
  });

  it('setPosition throws TypeError for non-finite values', () => {
    const mesh = makeMesh();
    expect(() => mesh.setPosition(NaN, 0, 0)).toThrow(TypeError);
  });

  it('setRotation copies a THREE.Euler', () => {
    const mesh = makeMesh();
    mesh.setRotation(new THREE.Euler(0, Math.PI / 2, 0));
    expect(mesh.three.rotation.y).toBeCloseTo(Math.PI / 2);
  });

  it('setRotation throws TypeError for a non-Euler', () => {
    const mesh = makeMesh();
    expect(() => mesh.setRotation({})).toThrow(TypeError);
  });

  it('setRotationDegrees converts degrees to radians', () => {
    const mesh = makeMesh();
    mesh.setRotationDegrees(0, 90, 0);
    expect(mesh.three.rotation.y).toBeCloseTo(Math.PI / 2);
  });

  it('setRotationDegrees throws TypeError for non-finite values', () => {
    const mesh = makeMesh();
    expect(() => mesh.setRotationDegrees(0, NaN, 0)).toThrow(TypeError);
  });

  it('setScale sets scale', () => {
    const mesh = makeMesh();
    mesh.setScale(1, 2, 3);
    expect(mesh.three.scale.toArray()).toEqual([1, 2, 3]);
  });

  it('setScale throws TypeError for non-finite values', () => {
    const mesh = makeMesh();
    expect(() => mesh.setScale(1, Infinity, 1)).toThrow(TypeError);
  });

  it('translate offsets the current position', () => {
    const mesh = makeMesh();
    mesh.setPosition(1, 1, 1);
    mesh.translate(1, -1, 2);
    expect(mesh.three.position.toArray()).toEqual([2, 0, 3]);
  });

  it('translate throws TypeError for non-finite values', () => {
    const mesh = makeMesh();
    expect(() => mesh.translate(NaN, 0, 0)).toThrow(TypeError);
  });

  it('rotateBy composes onto the current rotation', () => {
    const mesh = makeMesh();
    mesh.setRotation(new THREE.Euler(0, 0, 0));
    mesh.rotateBy(new THREE.Euler(0, Math.PI / 2, 0));
    const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    expect(mesh.three.quaternion.angleTo(expected)).toBeCloseTo(0);
  });

  it('rotateBy throws TypeError for a non-Euler', () => {
    const mesh = makeMesh();
    expect(() => mesh.rotateBy({})).toThrow(TypeError);
  });

  it('lookAt orients the mesh toward a point', () => {
    const mesh = makeMesh();
    mesh.setPosition(0, 0, 5);
    mesh.lookAt(0, 0, 0);
    // Facing -z (default THREE forward) toward the origin from (0,0,5) means no extra rotation needed.
    expect(mesh.three.rotation.y).toBeCloseTo(0);
  });

  it('lookAt throws TypeError for non-finite values', () => {
    const mesh = makeMesh();
    expect(() => mesh.lookAt(NaN, 0, 0)).toThrow(TypeError);
  });

  it('getPosition/getRotation/getScale return fresh copies reflecting current state', () => {
    const mesh = makeMesh();
    mesh.setPosition(1, 2, 3).setRotation(new THREE.Euler(0, Math.PI / 2, 0)).setScale(4, 5, 6);

    const position = mesh.getPosition();
    expect(position.toArray()).toEqual([1, 2, 3]);
    position.x = 999; // mutating the copy must not affect the mesh
    expect(mesh.three.position.x).toBe(1);

    expect(mesh.getRotation().y).toBeCloseTo(Math.PI / 2);
    expect(mesh.getScale().toArray()).toEqual([4, 5, 6]);
  });

  it('setVisible toggles THREE.Object3D.visible', () => {
    const mesh = makeMesh();
    expect(mesh.three.visible).toBe(true);
    mesh.setVisible(false);
    expect(mesh.three.visible).toBe(false);
    mesh.setVisible(true);
    expect(mesh.three.visible).toBe(true);
  });

  it('setVisible throws TypeError for a non-boolean', () => {
    const mesh = makeMesh();
    expect(() => mesh.setVisible(0)).toThrow(TypeError);
  });
});

// ── Vertex-level ───────────────────────────────────────────────────────────────

describe('GraphMesh vertex API', () => {
  it('getVertices returns a fresh Vector3 per vertex', () => {
    const mesh = makeMesh();
    const vertices = mesh.getVertices();
    expect(vertices.length).toBe(mesh.three.geometry.getAttribute('position').count);
    expect(vertices[0]).toBeInstanceOf(THREE.Vector3);

    vertices[0].x = 999; // mutating the returned copy must not affect the geometry
    expect(mesh.three.geometry.getAttribute('position').getX(0)).not.toBe(999);
  });

  it('setVertex writes one vertex position', () => {
    const mesh = makeMesh();
    mesh.setVertex(0, 1, 2, 3);
    const position = mesh.three.geometry.getAttribute('position');
    expect([position.getX(0), position.getY(0), position.getZ(0)]).toEqual([1, 2, 3]);
  });

  it('setVertex throws RangeError for an out-of-bounds index', () => {
    const mesh = makeMesh();
    const count = mesh.three.geometry.getAttribute('position').count;
    expect(() => mesh.setVertex(count, 0, 0, 0)).toThrow(RangeError);
  });

  it('setVertex throws TypeError for non-finite values', () => {
    const mesh = makeMesh();
    expect(() => mesh.setVertex(0, NaN, 0, 0)).toThrow(TypeError);
  });

  it('setVertices writes every vertex position', () => {
    const mesh = makeMesh();
    const count = mesh.three.geometry.getAttribute('position').count;
    const updated = mesh.getVertices().map((v) => ({ x: v.x + 1, y: v.y, z: v.z }));
    mesh.setVertices(updated);
    const position = mesh.three.geometry.getAttribute('position');
    for (let i = 0; i < count; i++) {
      expect(position.getX(i)).toBeCloseTo(updated[i].x);
    }
  });

  it('setVertices throws TypeError when the array length is wrong', () => {
    const mesh = makeMesh();
    expect(() => mesh.setVertices([{ x: 0, y: 0, z: 0 }])).toThrow(TypeError);
  });

  it('setVertices throws TypeError for a malformed entry', () => {
    const mesh = makeMesh();
    const count = mesh.three.geometry.getAttribute('position').count;
    const bad = new Array(count).fill({ x: 0 }); // missing y/z
    expect(() => mesh.setVertices(bad)).toThrow(TypeError);
  });

  it('commit flags the position attribute for GPU upload', () => {
    const mesh = makeMesh();
    const position = mesh.three.geometry.getAttribute('position');
    const versionBefore = position.version;
    mesh.commit();
    expect(position.version).toBe(versionBefore + 1);
  });
});

// ── Cloning ────────────────────────────────────────────────────────────────────

describe('GraphMesh cloning', () => {
  it('clone() shares geometry/material and copies the transform', () => {
    const scene = new THREE.Scene();
    const mesh = makeMesh({ scene });
    mesh.setPosition(1, 2, 3).setScale(2, 2, 2);

    const clone = mesh.clone('a_clone');

    expect(clone.three.geometry).toBe(mesh.three.geometry);
    expect(clone.three.material).toBe(mesh.three.material);
    expect(clone.three.position.toArray()).toEqual([1, 2, 3]);
    expect(clone.three.scale.toArray()).toEqual([2, 2, 2]);
    expect(clone.name).toBe('a_clone');
    expect(scene.children).toContain(clone.three);
  });

  it('clone() defaults to the same name', () => {
    const mesh = makeMesh({ name: 'original' });
    expect(mesh.clone().name).toBe('original');
  });

  it('deepClone() copies geometry/material independently', () => {
    const mesh = makeMesh();
    mesh.setPosition(1, 2, 3);

    const clone = mesh.deepClone('a_deep');

    expect(clone.three.geometry).not.toBe(mesh.three.geometry);
    expect(clone.three.material).not.toBe(mesh.three.material);
    expect(clone.three.position.toArray()).toEqual([1, 2, 3]);

    // Independently disposable: disposing the original must not affect the clone's geometry.
    mesh.dispose();
    expect(() => clone.three.geometry.getAttribute('position')).not.toThrow();
  });

  it('deepClone() clones every material in an array', () => {
    const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    const mesh = new GraphMesh({
      scene: new THREE.Scene(),
      name: 'a',
      geometry: new THREE.BoxGeometry(),
      material: materials,
    });
    const clone = mesh.deepClone();
    expect(clone.three.material).not.toBe(materials);
    expect(clone.three.material[0]).not.toBe(materials[0]);
    expect(clone.three.material[1]).not.toBe(materials[1]);
  });
});

// ── Disposal ───────────────────────────────────────────────────────────────────

describe('GraphMesh disposal', () => {
  it('removes from the scene and is idempotent', () => {
    const scene = new THREE.Scene();
    const mesh = makeMesh({ scene });

    mesh.dispose();

    expect(scene.children).not.toContain(mesh.three);
    expect(() => mesh.dispose()).not.toThrow();
  });

  it('all public methods throw after dispose', () => {
    const mesh = makeMesh();
    mesh.dispose();
    const pattern = /GraphMesh\.\w+: object 'a' has been disposed/;
    expect(() => mesh.setPosition(0, 0, 0)).toThrow(pattern);
    expect(() => mesh.setRotation(new THREE.Euler())).toThrow(pattern);
    expect(() => mesh.setRotationDegrees(0, 0, 0)).toThrow(pattern);
    expect(() => mesh.setScale(1, 1, 1)).toThrow(pattern);
    expect(() => mesh.translate(0, 0, 0)).toThrow(pattern);
    expect(() => mesh.rotateBy(new THREE.Euler())).toThrow(pattern);
    expect(() => mesh.lookAt(0, 0, 0)).toThrow(pattern);
    expect(() => mesh.getVertices()).toThrow(pattern);
    expect(() => mesh.setVertex(0, 0, 0, 0)).toThrow(pattern);
    expect(() => mesh.setVertices([])).toThrow(pattern);
    expect(() => mesh.commit()).toThrow(pattern);
    expect(() => mesh.clone()).toThrow(pattern);
    expect(() => mesh.deepClone()).toThrow(pattern);
    expect(() => mesh.material).toThrow(pattern);
    expect(() => mesh.getPosition()).toThrow(pattern);
    expect(() => mesh.getRotation()).toThrow(pattern);
    expect(() => mesh.getScale()).toThrow(pattern);
    expect(() => mesh.setVisible(true)).toThrow(pattern);
  });
});
