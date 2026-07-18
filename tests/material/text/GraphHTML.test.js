import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

// Mirrors tests/compose/axis/Axis-text.test.js's mocking approach — graphHTML's
// SDFText fallback path goes through the exact same SDFText.create() atlas
// load, so it needs the same fetch/TextureLoader stubs to run offline.
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

const { graphHTML, isHTMLInCanvasSupported } = await import('../../../src/material/text/GraphHTML.js');
const { GraphMesh } = await import('../../../src/object/GraphMesh.js');
const { GraphInstancedObject } = await import('../../../src/object/GraphInstancedObject.js');
const { loop } = await import('../../../src/core/Graph3DLoop.js');

function mockMetrics() {
  return {
    pages: ['roboto-msdf.png'],
    chars: [{ id: 48, x: 0, y: 0, width: 10, height: 20, xoffset: 0, yoffset: 0, xadvance: 12 }],
    common: { scaleW: 128, scaleH: 128, lineHeight: 24 },
    info: { size: 20 },
    kernings: [],
  };
}

function mockFetchOnce() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => mockMetrics() })));
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// This jsdom environment has no `canvas` package installed, so
// `CanvasRenderingContext2D` isn't even declared as a global (unlike a real
// browser, where it always exists whether or not `drawElementImage` is on
// it) — define a stand-in so tests can stub the one method they need.
if (typeof globalThis.CanvasRenderingContext2D === 'undefined') {
  globalThis.CanvasRenderingContext2D = class CanvasRenderingContext2D {};
}

const ORIGINAL_GET_CONTEXT = HTMLCanvasElement.prototype.getContext;

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

afterEach(() => {
  vi.unstubAllGlobals();
  textureLoadImpl = (_url, onLoad) => onLoad({ isTexture: true, dispose: vi.fn() });
  delete CanvasRenderingContext2D.prototype.drawElementImage;
  HTMLCanvasElement.prototype.getContext = ORIGINAL_GET_CONTEXT;
});

describe('isHTMLInCanvasSupported', () => {
  it('is false in this test environment (no drawElementImage)', () => {
    expect(isHTMLInCanvasSupported()).toBe(false);
  });

  it('is true once CanvasRenderingContext2D.prototype.drawElementImage exists', () => {
    CanvasRenderingContext2D.prototype.drawElementImage = vi.fn();
    expect(isHTMLInCanvasSupported()).toBe(true);
  });
});

describe('graphHTML — validation', () => {
  it('throws for an unrecognized target shape', () => {
    const camera = new THREE.PerspectiveCamera();
    expect(() => graphHTML({}, { html: '<b>x</b>', camera })).toThrow(TypeError);
  });

  it('throws when options.html is not a string', () => {
    const { mesh } = buildMeshTarget();
    const camera = new THREE.PerspectiveCamera();
    expect(() => graphHTML(mesh, { html: 42, camera })).toThrow(TypeError);
  });

  it('throws when options.camera is not a THREE.Camera', () => {
    const { mesh } = buildMeshTarget();
    expect(() => graphHTML(mesh, { html: 'x', camera: {} })).toThrow(TypeError);
  });

  it('throws for a { scene, position } target with a non-finite position', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    expect(() => graphHTML({ scene, position: { x: NaN, y: 0, z: 0 } }, { html: 'x', camera })).toThrow(TypeError);
  });
});

describe('graphHTML — fallback (SDFText) path', () => {
  it('builds a real mesh, added to the target scene, at the target position', async () => {
    mockFetchOnce();
    const { scene, mesh } = buildMeshTarget();
    const camera = new THREE.PerspectiveCamera();
    const handle = graphHTML(mesh, { html: '<b>42%</b>', camera });
    await handle.ready;

    expect(handle.isExperimental).toBe(false);
    expect(handle.mesh).toBeInstanceOf(THREE.Mesh);
    expect(scene.children).toContain(handle.mesh);
    // Recentered via SDFText's `centerOffset` (x unaffected here — "42%"
    // matches no glyph in the single-glyph mock atlas, so width is 0 — but
    // y shifts by +height/2 since a block always has a line height).
    expect(handle.mesh.position.x).toBeCloseTo(1);
    expect(handle.mesh.position.y).toBeCloseTo(2.18);
    expect(handle.mesh.position.z).toBeCloseTo(3);
  });

  it('centers non-zero-width text on the target position, not its left edge', async () => {
    mockFetchOnce();
    const { mesh } = buildMeshTarget();
    const camera = new THREE.PerspectiveCamera();
    // '0' is the mock atlas's one real glyph (xadvance 12, fontSize 0.3,
    // baseSize 20 → unitScale 0.015): four of them give a known, non-zero
    // block width of 4 * 12 * 0.015 = 0.72, so centerOffset.x is -0.36 —
    // this is the regression test for the misaligned-label bug (labels
    // anchored at their left edge instead of centered over their target).
    const handle = graphHTML(mesh, { html: '<b>x</b>', text: '0000', camera });
    await handle.ready;

    expect(handle.mesh.position.x).toBeCloseTo(1 - 0.36);
    expect(handle.mesh.position.z).toBeCloseTo(3);
  });

  it('resolves an { object, index } instanced target via world-space localToWorld', async () => {
    mockFetchOnce();
    const scene = new THREE.Scene();
    const bars = new GraphInstancedObject({
      scene,
      name: 'bars',
      geometry: new THREE.BoxGeometry(1, 1, 1),
      material: new THREE.MeshBasicMaterial(),
      count: 3,
    });
    bars.three.position.set(10, 0, 0);
    bars.setInstancePosition(1, 2, 0, 0);
    scene.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera();

    const handle = graphHTML({ object: bars, index: 1 }, { html: 'x', camera });
    await handle.ready;

    expect(handle.mesh.position.x).toBeCloseTo(12);
  });

  it('resolves a { scene, position } target directly', async () => {
    mockFetchOnce();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const handle = graphHTML({ scene, position: { x: 5, y: 6, z: 7 } }, { html: 'x', camera });
    await handle.ready;
    expect(scene.children).toContain(handle.mesh);
    expect(handle.mesh.position.x).toBeCloseTo(5);
  });

  it('dispose() removes the mesh from the scene, is idempotent, and nulls handle.mesh', async () => {
    mockFetchOnce();
    const { scene, mesh } = buildMeshTarget();
    const camera = new THREE.PerspectiveCamera();
    const handle = graphHTML(mesh, { html: 'x', camera });
    await handle.ready;
    const built = handle.mesh;

    handle.dispose();
    expect(scene.children).not.toContain(built);
    expect(handle.mesh).toBe(null);
    expect(() => handle.dispose()).not.toThrow();
  });

  it('dispose() called before ready resolves discards the in-flight build safely', async () => {
    mockFetchOnce();
    const { scene, mesh } = buildMeshTarget();
    const camera = new THREE.PerspectiveCamera();
    const handle = graphHTML(mesh, { html: 'x', camera });

    handle.dispose();
    await handle.ready;

    expect(handle.mesh).toBe(null);
    expect(scene.children).toEqual([mesh.three]);
  });

  it('billboards the built mesh toward the camera every frame', async () => {
    mockFetchOnce();
    const { mesh } = buildMeshTarget();
    const camera = new THREE.PerspectiveCamera();
    camera.quaternion.set(0.1, 0.2, 0.3, 0.9).normalize();
    const handle = graphHTML(mesh, { html: 'x', camera });
    await handle.ready;

    loop.start();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(handle.mesh.quaternion.x).toBeCloseTo(camera.quaternion.x);
    expect(handle.mesh.quaternion.w).toBeCloseTo(camera.quaternion.w);
    handle.dispose();
  });
});

describe('graphHTML — experimental (HTML-in-Canvas) path', () => {
  function stubDrawElementImage(impl = vi.fn()) {
    CanvasRenderingContext2D.prototype.drawElementImage = impl;
    HTMLCanvasElement.prototype.getContext = vi.fn(function (type) {
      return type === '2d' ? { drawElementImage: impl } : null;
    });
  }

  it('builds a CanvasTexture-backed mesh without touching the SDFText fallback', async () => {
    stubDrawElementImage();
    const { scene, mesh } = buildMeshTarget();
    const camera = new THREE.PerspectiveCamera();

    const handle = graphHTML(mesh, { html: '<b>Custom</b>', camera });
    await handle.ready;

    expect(handle.isExperimental).toBe(true);
    expect(scene.children).toContain(handle.mesh);
    expect(handle.mesh.material.map).toBeInstanceOf(THREE.CanvasTexture);
    handle.dispose();
  });

  it('falls back to SDFText when the experimental path throws at runtime', async () => {
    mockFetchOnce();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => {
      throw new Error('drawElementImage boom');
    });
    CanvasRenderingContext2D.prototype.drawElementImage = vi.fn();
    const { mesh } = buildMeshTarget();
    const camera = new THREE.PerspectiveCamera();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handle = graphHTML(mesh, { html: 'x', camera });
    await handle.ready;

    expect(handle.isExperimental).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
    handle.dispose();
  });
});
