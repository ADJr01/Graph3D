import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GraphObject } from '../../src/object/GraphObject.js';

function makeMesh() {
  return new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('GraphObject constructor', () => {
  it('throws TypeError when scene is not a THREE.Scene', () => {
    expect(() => new GraphObject({ scene: {}, name: 'a', three: makeMesh() })).toThrow(TypeError);
  });

  it('throws TypeError when name is missing or empty', () => {
    const scene = new THREE.Scene();
    expect(() => new GraphObject({ scene, name: '', three: makeMesh() })).toThrow(TypeError);
    expect(() => new GraphObject({ scene, three: makeMesh() })).toThrow(TypeError);
  });

  it('throws TypeError when three is not a THREE.Object3D', () => {
    const scene = new THREE.Scene();
    expect(() => new GraphObject({ scene, name: 'a', three: {} })).toThrow(TypeError);
  });

  it('adds three to the scene and sets three.name', () => {
    const scene = new THREE.Scene();
    const mesh = makeMesh();
    const obj = new GraphObject({ scene, name: 'bar_0', three: mesh });

    expect(scene.children).toContain(mesh);
    expect(mesh.name).toBe('bar_0');
    expect(obj.scene).toBe(scene);
    expect(obj.name).toBe('bar_0');
    expect(obj.three).toBe(mesh);
  });
});

// ── isInstanced ────────────────────────────────────────────────────────────────

describe('GraphObject.isInstanced', () => {
  it('defaults to false', () => {
    const scene = new THREE.Scene();
    const obj = new GraphObject({ scene, name: 'a', three: makeMesh() });
    expect(obj.isInstanced).toBe(false);
  });
});

// ── setName ────────────────────────────────────────────────────────────────────

describe('GraphObject.setName', () => {
  it('updates .name and three.name', () => {
    const scene = new THREE.Scene();
    const obj = new GraphObject({ scene, name: 'a', three: makeMesh() });

    obj.setName('b');

    expect(obj.name).toBe('b');
    expect(obj.three.name).toBe('b');
  });

  it('throws TypeError for a non-string or empty name', () => {
    const scene = new THREE.Scene();
    const obj = new GraphObject({ scene, name: 'a', three: makeMesh() });
    expect(() => obj.setName('')).toThrow(TypeError);
    expect(() => obj.setName(42)).toThrow(TypeError);
  });
});

// ── setUserData / getUserData ─────────────────────────────────────────────────

describe('GraphObject user data', () => {
  it('namespaces stored values under three.userData.graph3d', () => {
    const scene = new THREE.Scene();
    const obj = new GraphObject({ scene, name: 'a', three: makeMesh() });

    obj.setUserData('value', 42);

    expect(obj.three.userData.graph3d).toEqual({ value: 42 });
    expect(obj.getUserData('value')).toBe(42);
  });

  it('getUserData returns undefined for a key never set', () => {
    const scene = new THREE.Scene();
    const obj = new GraphObject({ scene, name: 'a', three: makeMesh() });
    expect(obj.getUserData('missing')).toBeUndefined();
  });

  it('does not collide with pre-existing userData set by other code', () => {
    const scene = new THREE.Scene();
    const mesh = makeMesh();
    mesh.userData.foreign = 'left alone';
    const obj = new GraphObject({ scene, name: 'a', three: mesh });

    obj.setUserData('value', 1);

    expect(mesh.userData.foreign).toBe('left alone');
  });

  it('throws TypeError for a non-string or empty key', () => {
    const scene = new THREE.Scene();
    const obj = new GraphObject({ scene, name: 'a', three: makeMesh() });
    expect(() => obj.setUserData('', 1)).toThrow(TypeError);
    expect(() => obj.getUserData('')).toThrow(TypeError);
  });
});

// ── Disposal ───────────────────────────────────────────────────────────────────

describe('GraphObject disposal', () => {
  it('removes three from the scene and is idempotent', () => {
    const scene = new THREE.Scene();
    const mesh = makeMesh();
    const obj = new GraphObject({ scene, name: 'a', three: mesh });

    obj.dispose();

    expect(scene.children).not.toContain(mesh);
    expect(() => obj.dispose()).not.toThrow();
  });

  it('all public methods throw after dispose', () => {
    const scene = new THREE.Scene();
    const obj = new GraphObject({ scene, name: 'a', three: makeMesh() });
    obj.dispose();
    const pattern = /GraphObject\.\w+: object 'a' has been disposed/;
    expect(() => obj.setName('b')).toThrow(pattern);
    expect(() => obj.setUserData('value', 1)).toThrow(pattern);
    expect(() => obj.getUserData('value')).toThrow(pattern);
  });
});
