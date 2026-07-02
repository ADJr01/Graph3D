import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { GraphObjectLoader } from '../../src/object/GraphObjectLoader.js';
import { GraphObject } from '../../src/object/GraphObject.js';

function makeGroupWithMesh() {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  return group;
}

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: vi.fn(function MockGLTFLoader() {
    this.setDRACOLoader = vi.fn();
    this.setKTX2Loader = vi.fn();
    this.load = vi.fn((url, onLoad) => {
      onLoad({ scene: makeGroupWithMesh() });
    });
  }),
}));

vi.mock('three/examples/jsm/loaders/OBJLoader.js', () => ({
  OBJLoader: vi.fn(function MockOBJLoader() {
    this.setMaterials = vi.fn();
    this.load = vi.fn((url, onLoad) => {
      onLoad(makeGroupWithMesh());
    });
  }),
}));

vi.mock('three/examples/jsm/loaders/MTLLoader.js', () => ({
  MTLLoader: vi.fn(function MockMTLLoader() {
    this.load = vi.fn((url, onLoad) => {
      onLoad({ preload: vi.fn() });
    });
  }),
}));

vi.mock('three/examples/jsm/loaders/FBXLoader.js', () => ({
  FBXLoader: vi.fn(function MockFBXLoader() {
    this.load = vi.fn((url, onLoad) => {
      onLoad(makeGroupWithMesh());
    });
  }),
}));

vi.mock('three/examples/jsm/loaders/DRACOLoader.js', () => ({
  DRACOLoader: vi.fn(function MockDRACOLoader() {
    this.setDecoderPath = vi.fn();
  }),
}));

vi.mock('three/examples/jsm/loaders/KTX2Loader.js', () => ({
  KTX2Loader: vi.fn(function MockKTX2Loader() {
    this.setTranscoderPath = vi.fn();
    this.detectSupport = vi.fn();
  }),
}));

vi.mock('three/examples/jsm/utils/SkeletonUtils.js', () => ({
  // Real THREE clone(true) is a faithful stand-in here: our test fixtures have
  // no skeletons, and it correctly shares geometry/material across clones,
  // which is exactly the sharing behavior the ref-counted dispose tests need.
  clone: vi.fn((object) => object.clone(true)),
}));

// ── loadGLTF / loadOBJ / loadFBX ───────────────────────────────────────────────

describe('GraphObjectLoader.loadGLTF', () => {
  it('returns a GraphObject wrapping the loaded scene, added to the scene', async () => {
    const scene = new THREE.Scene();
    const obj = await GraphObjectLoader.loadGLTF('/models/a.glb', { scene, name: 'a' });
    expect(obj).toBeInstanceOf(GraphObject);
    expect(obj.three).toBeInstanceOf(THREE.Group);
    expect(scene.children).toContain(obj.three);
    obj.dispose();
  });

  it('throws TypeError for a non-string url', async () => {
    await expect(GraphObjectLoader.loadGLTF('')).rejects.toThrow(TypeError);
  });

  it('loads a URL only once across repeated calls, but returns independent clones', async () => {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    GLTFLoader.mockClear();
    const scene = new THREE.Scene();

    const a = await GraphObjectLoader.loadGLTF('/models/shared.glb', { scene, name: 'a' });
    const b = await GraphObjectLoader.loadGLTF('/models/shared.glb', { scene, name: 'b' });

    expect(GLTFLoader).toHaveBeenCalledOnce();
    expect(a.three).not.toBe(b.three);

    a.dispose();
    b.dispose();
  });

  it('shares geometry/material across clones and disposes only when the last clone is disposed', async () => {
    const scene = new THREE.Scene();
    const a = await GraphObjectLoader.loadGLTF('/models/refcount.glb', { scene, name: 'a' });
    const b = await GraphObjectLoader.loadGLTF('/models/refcount.glb', { scene, name: 'b' });

    const meshA = a.three.children[0];
    const meshB = b.three.children[0];
    expect(meshA.geometry).toBe(meshB.geometry);

    const geometrySpy = vi.spyOn(meshA.geometry, 'dispose');

    a.dispose();
    expect(geometrySpy).not.toHaveBeenCalled();

    b.dispose();
    expect(geometrySpy).toHaveBeenCalledOnce();
  });

  it('attaches configured Draco/KTX2 loaders to the GLTFLoader instance', async () => {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    GLTFLoader.mockClear();
    const renderer = { domElement: {} };
    GraphObjectLoader.configureDracoDecoder('/decoders/draco/');
    GraphObjectLoader.configureKTX2Transcoder('/decoders/basis/', renderer);

    const scene = new THREE.Scene();
    const obj = await GraphObjectLoader.loadGLTF('/models/compressed.glb', { scene, name: 'c' });

    const instance = GLTFLoader.mock.instances[0];
    expect(instance.setDRACOLoader).toHaveBeenCalledOnce();
    expect(instance.setKTX2Loader).toHaveBeenCalledOnce();

    obj.dispose();
  });
});

describe('GraphObjectLoader.loadOBJ', () => {
  it('returns a GraphObject wrapping the loaded object', async () => {
    const scene = new THREE.Scene();
    const obj = await GraphObjectLoader.loadOBJ('/models/a.obj', null, { scene, name: 'a' });
    expect(obj).toBeInstanceOf(GraphObject);
    expect(scene.children).toContain(obj.three);
    obj.dispose();
  });

  it('loads the companion MTL and attaches it via setMaterials', async () => {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
    const scene = new THREE.Scene();
    const obj = await GraphObjectLoader.loadOBJ('/models/b.obj', '/models/b.mtl', { scene, name: 'b' });

    const instance = OBJLoader.mock.instances.at(-1);
    expect(instance.setMaterials).toHaveBeenCalledOnce();
    obj.dispose();
  });

  it('caches url+mtlUrl combinations independently of the bare url', async () => {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
    OBJLoader.mockClear();
    const scene = new THREE.Scene();

    const bare = await GraphObjectLoader.loadOBJ('/models/c.obj', null, { scene, name: 'bare' });
    const withMtl = await GraphObjectLoader.loadOBJ('/models/c.obj', '/models/c.mtl', {
      scene,
      name: 'withMtl',
    });

    expect(OBJLoader).toHaveBeenCalledTimes(2);
    bare.dispose();
    withMtl.dispose();
  });

  it('throws TypeError for a non-string, non-empty mtlUrl', async () => {
    await expect(GraphObjectLoader.loadOBJ('/models/a.obj', '')).rejects.toThrow(TypeError);
  });
});

describe('GraphObjectLoader.loadFBX', () => {
  it('returns a GraphObject wrapping the loaded object', async () => {
    const scene = new THREE.Scene();
    const obj = await GraphObjectLoader.loadFBX('/models/a.fbx', { scene, name: 'a' });
    expect(obj).toBeInstanceOf(GraphObject);
    expect(scene.children).toContain(obj.three);
    obj.dispose();
  });

  it('throws TypeError for a non-string url', async () => {
    await expect(GraphObjectLoader.loadFBX(42)).rejects.toThrow(TypeError);
  });
});

// ── Draco/KTX2 configuration ───────────────────────────────────────────────────

describe('GraphObjectLoader Draco/KTX2 configuration', () => {
  it('configureDracoDecoder throws TypeError for a non-string path', () => {
    expect(() => GraphObjectLoader.configureDracoDecoder('')).toThrow(TypeError);
  });

  it('configureKTX2Transcoder throws TypeError for an invalid renderer', () => {
    expect(() => GraphObjectLoader.configureKTX2Transcoder('/decoders/basis/', {})).toThrow(TypeError);
  });
});
