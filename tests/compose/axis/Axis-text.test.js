import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { scale } from '../../../src/compose/scale/index.js';

// Mirrors tests/material/text/SDFText.test.js's mocking approach — Axis's
// real-text path (options.camera) goes through the exact same SDFText.create()
// atlas load, so it needs the same fetch/TextureLoader stubs to run offline.
// Same file-level ordering constraint as that file too: SDFText's atlas cache
// is memoized at module scope and stays warm after the first successful load,
// so any test relying on a *failed* load must run before the first successful
// one in this file.
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

const { Axis } = await import('../../../src/compose/axis/Axis.js');
const { loop } = await import('../../../src/core/Graph3DLoop.js');

function mockMetrics() {
  return {
    pages: ['roboto-msdf.png'],
    chars: [
      { id: 48, x: 0, y: 0, width: 10, height: 20, xoffset: 0, yoffset: 0, xadvance: 12 }, // '0'
      { id: 49, x: 10, y: 0, width: 10, height: 20, xoffset: 0, yoffset: 0, xadvance: 12 }, // '1'
    ],
    common: { scaleW: 128, scaleH: 128, lineHeight: 24 },
    info: { size: 20 },
    kernings: [],
  };
}

function mockFetchOnce() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => mockMetrics() })));
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  textureLoadImpl = (_url, onLoad) => onLoad({ isTexture: true, dispose: vi.fn() });
});

// ── Failure path (must run first — see the file-level note above) ─────────

describe('Axis.render — options.camera failure handling', () => {
  it('a failed atlas load is logged, not thrown, and adds no ticklabel meshes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const s = scale.linear().domain([0, 1]).range([0, 1]);
    const axis = new Axis().scale(s).tickCount(2).render(scene, 'a', { camera });
    await flush();

    expect(errorSpy).toHaveBeenCalled();
    expect(scene.children.some((c) => c.name.startsWith('a_ticklabel_'))).toBe(false);
    axis.dispose();
    errorSpy.mockRestore();
  });
});

// ── Validation (no atlas load involved) ────────────────────────────────────

describe('Axis.render — options.camera validation', () => {
  it('rejects a non-camera options.camera', () => {
    const scene = new THREE.Scene();
    const s = scale.linear().domain([0, 1]).range([0, 1]);
    const axis = new Axis().scale(s);
    expect(() => axis.render(scene, 'a', { camera: {} })).toThrow(TypeError);
  });

  it('without camera: no ticklabel meshes are added (existing metadata-only behavior)', async () => {
    const scene = new THREE.Scene();
    const s = scale.linear().domain([0, 1]).range([0, 1]);
    new Axis().scale(s).tickCount(2).render(scene, 'a');
    await flush();
    expect(scene.children.some((c) => c.name.includes('ticklabel'))).toBe(false);
  });
});

// ── Successful creation (warms the shared atlas cache from here on) ───────

describe('Axis.render — options.camera success', () => {
  it('builds one real ticklabel mesh per tick, added to the scene', async () => {
    mockFetchOnce();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const s = scale.linear().domain([0, 1]).range([0, 1]);
    const axis = new Axis().scale(s).tickCount(2).render(scene, 'a', { camera });
    await flush();

    const labelMeshes = scene.children.filter((c) => c.name.startsWith('a_ticklabel_'));
    expect(labelMeshes.length).toBe(axis.labels.length);
    for (const mesh of labelMeshes) expect(mesh).toBeInstanceOf(THREE.Mesh);
    axis.dispose();
  });

  it('billboards ticklabel meshes toward the camera every frame', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    camera.quaternion.set(0.1, 0.2, 0.3, 0.9).normalize();
    const s = scale.linear().domain([0, 1]).range([0, 1]);
    const axis = new Axis().scale(s).tickCount(1).render(scene, 'a', { camera });
    await flush();

    loop.start();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const [mesh] = scene.children.filter((c) => c.name.startsWith('a_ticklabel_'));
    expect(mesh.quaternion.x).toBeCloseTo(camera.quaternion.x);
    expect(mesh.quaternion.w).toBeCloseTo(camera.quaternion.w);
    axis.dispose();
  });

  it('dispose() removes ticklabel meshes and stops billboarding without throwing', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const s = scale.linear().domain([0, 1]).range([0, 1]);
    const axis = new Axis().scale(s).tickCount(2).render(scene, 'a', { camera });
    await flush();

    expect(scene.children.some((c) => c.name.startsWith('a_ticklabel_'))).toBe(true);
    expect(() => axis.dispose()).not.toThrow();
    expect(scene.children.some((c) => c.name.startsWith('a_ticklabel_'))).toBe(false);
  });
});
