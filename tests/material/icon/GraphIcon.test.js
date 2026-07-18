import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

// Mirrors tests/material/text/GraphHTML.test.js's TextureLoader mock — the
// exact loader graphIcon uses (no fallback path to also stub, unlike
// graphHTML's SDFText fallback).
let textureLoadImpl = (_url, onLoad) => onLoad({ isTexture: true, dispose: vi.fn() });

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    TextureLoader: vi.fn(function MockTextureLoader() {
      this.load = vi.fn((url, onLoad, onProgress, onError) => textureLoadImpl(url, onLoad, onError));
    }),
  };
});

const { graphIcon } = await import('../../../src/material/icon/GraphIcon.js');
const { GraphMesh } = await import('../../../src/object/GraphMesh.js');
const { GraphInstancedObject } = await import('../../../src/object/GraphInstancedObject.js');

function buildMeshTarget() {
  const scene = new THREE.Scene();
  const mesh = new GraphMesh({
    scene,
    name: 'bar',
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshBasicMaterial(),
  });
  mesh.setPosition(1, 2, 3);
  scene.updateMatrixWorld(true);
  return { scene, mesh };
}

function buildInstancedTarget() {
  const scene = new THREE.Scene();
  const bars = new GraphInstancedObject({
    scene,
    name: 'bars',
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshBasicMaterial(),
    count: 3,
  });
  bars.setInstancePosition(1, 2, 0, 0);
  scene.updateMatrixWorld(true);
  return { scene, bars };
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

afterEach(() => {
  textureLoadImpl = (_url, onLoad) => onLoad({ isTexture: true, dispose: vi.fn() });
});

describe('graphIcon — validation', () => {
  it('throws for an unrecognized target shape', () => {
    const camera = new THREE.PerspectiveCamera();
    expect(() => graphIcon({}, { src: 'icon.svg', camera })).toThrow(TypeError);
  });

  it('throws when options.src is not a string', () => {
    const { mesh } = buildMeshTarget();
    const camera = new THREE.PerspectiveCamera();
    expect(() => graphIcon(mesh, { src: 42, camera })).toThrow(TypeError);
  });

  it('throws when options.camera is not a THREE.Camera', () => {
    const { mesh } = buildMeshTarget();
    expect(() => graphIcon(mesh, { src: 'icon.svg', camera: {} })).toThrow(TypeError);
  });

  it('throws when width/height are not positive finite numbers', () => {
    const { mesh } = buildMeshTarget();
    const camera = new THREE.PerspectiveCamera();
    expect(() => graphIcon(mesh, { src: 'icon.svg', camera, width: -1 })).toThrow(TypeError);
    expect(() => graphIcon(mesh, { src: 'icon.svg', camera, height: 0 })).toThrow(TypeError);
  });

  it('throws when options.offset does not resolve to a finite {x,y,z}', () => {
    const { mesh } = buildMeshTarget();
    const camera = new THREE.PerspectiveCamera();
    expect(() => graphIcon(mesh, { src: 'icon.svg', camera, offset: { y: NaN } })).toThrow(TypeError);
  });
});

describe('graphIcon — placement', () => {
  it('builds a real mesh, added to the target scene, at the target position plus offset', async () => {
    const { scene, mesh } = buildMeshTarget();
    const camera = new THREE.PerspectiveCamera();
    const handle = graphIcon(mesh, { src: 'btc.svg', camera, offset: { y: 0.5 } });
    await handle.ready;

    expect(handle.mesh).toBeInstanceOf(THREE.Mesh);
    expect(scene.children).toContain(handle.mesh);
    expect(handle.mesh.position.x).toBeCloseTo(1);
    expect(handle.mesh.position.y).toBeCloseTo(2.5);
    expect(handle.mesh.position.z).toBeCloseTo(3);
    handle.dispose();
  });

  it('resolves an { object, index } instanced target via world-space localToWorld', async () => {
    const { bars } = buildInstancedTarget();
    const camera = new THREE.PerspectiveCamera();
    const handle = graphIcon({ object: bars, index: 1 }, { src: 'eth.svg', camera });
    await handle.ready;

    expect(handle.mesh.position.x).toBeCloseTo(2);
    handle.dispose();
  });
});

describe('graphIcon — follow', () => {
  it('follow:true re-reads a moved instanced target position on the next tick', async () => {
    const { bars } = buildInstancedTarget();
    const camera = new THREE.PerspectiveCamera();
    const handle = graphIcon({ object: bars, index: 1 }, { src: 'eth.svg', camera, follow: true });
    await handle.ready;
    expect(handle.mesh.position.x).toBeCloseTo(2);

    bars.setInstancePosition(1, 9, 0, 0);
    await nextFrame();

    expect(handle.mesh.position.x).toBeCloseTo(9);
    handle.dispose();
  });

  it('follow:false snapshots the position once and ignores a later instance move', async () => {
    const { bars } = buildInstancedTarget();
    const camera = new THREE.PerspectiveCamera();
    const handle = graphIcon({ object: bars, index: 1 }, { src: 'eth.svg', camera, follow: false });
    await handle.ready;
    expect(handle.mesh.position.x).toBeCloseTo(2);

    bars.setInstancePosition(1, 9, 0, 0);
    await nextFrame();

    expect(handle.mesh.position.x).toBeCloseTo(2);
    handle.dispose();
  });

  it('re-evaluates an offset callback every tick while follow:true', async () => {
    const { bars } = buildInstancedTarget();
    const camera = new THREE.PerspectiveCamera();
    let barTop = 0.5;
    const handle = graphIcon({ object: bars, index: 1 }, { src: 'eth.svg', camera, offset: () => ({ y: barTop }) });
    await handle.ready;
    expect(handle.mesh.position.y).toBeCloseTo(0.5);

    barTop = 3;
    await nextFrame();

    expect(handle.mesh.position.y).toBeCloseTo(3);
    handle.dispose();
  });

  it('billboards the built mesh toward the camera every frame', async () => {
    const { mesh } = buildMeshTarget();
    const camera = new THREE.PerspectiveCamera();
    camera.quaternion.set(0.1, 0.2, 0.3, 0.9).normalize();
    const handle = graphIcon(mesh, { src: 'icon.svg', camera });
    await handle.ready;

    await nextFrame();

    expect(handle.mesh.quaternion.x).toBeCloseTo(camera.quaternion.x);
    expect(handle.mesh.quaternion.w).toBeCloseTo(camera.quaternion.w);
    handle.dispose();
  });
});

describe('graphIcon — load failure', () => {
  it('rejects ready and adds nothing to the scene when the texture fails to load', async () => {
    textureLoadImpl = (_url, _onLoad, onError) => onError(new Error('404'));
    const { scene, mesh } = buildMeshTarget();
    const camera = new THREE.PerspectiveCamera();
    const handle = graphIcon(mesh, { src: 'missing.svg', camera });

    await expect(handle.ready).rejects.toThrow();
    expect(handle.mesh).toBe(null);
    expect(scene.children).toEqual([mesh.three]);
  });
});

describe('graphIcon — disposal', () => {
  it('dispose() removes the mesh from the scene, is idempotent, and nulls handle.mesh', async () => {
    const { scene, mesh } = buildMeshTarget();
    const camera = new THREE.PerspectiveCamera();
    const handle = graphIcon(mesh, { src: 'icon.svg', camera });
    await handle.ready;
    const built = handle.mesh;

    handle.dispose();
    expect(scene.children).not.toContain(built);
    expect(handle.mesh).toBe(null);
    expect(() => handle.dispose()).not.toThrow();
  });

  it('dispose() called before ready resolves discards the in-flight build safely', async () => {
    const { scene, mesh } = buildMeshTarget();
    const camera = new THREE.PerspectiveCamera();
    const handle = graphIcon(mesh, { src: 'icon.svg', camera });

    handle.dispose();
    await handle.ready;

    expect(handle.mesh).toBe(null);
    expect(scene.children).toEqual([mesh.three]);
  });
});
