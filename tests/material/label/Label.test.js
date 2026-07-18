import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import * as THREE from 'three';

// Mirrors tests/compose/axis/Axis-text.test.js's mocking approach — Label's
// entire mesh goes through the same SDFText.create() atlas load, so it needs
// the same fetch/TextureLoader stubs to run offline. Same file-level ordering
// constraint too: SDFText's atlas cache is memoized at module scope and stays
// warm after the first successful load, so the one test relying on a
// *failed* load runs first in this file, before anything else has a chance
// to succeed — every other describe block below mocks fetch to succeed by
// default (harmless no-op once the cache is warm).
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

vi.mock('../../../src/core/Graph3DLoop.js', () => ({
  loop: { add: vi.fn(), remove: vi.fn() },
}));

const { label, Label } = await import('../../../src/material/label/index.js');
const { loop } = await import('../../../src/core/Graph3DLoop.js');

function mockMetrics() {
  return {
    pages: ['roboto-msdf.png'],
    // '0' is narrower than '1' so a text() change produces a measurably
    // different width/centerOffset, proving a rebuild actually happened.
    chars: [
      { id: 48, x: 0, y: 0, width: 10, height: 20, xoffset: 0, yoffset: 0, xadvance: 12 },
      { id: 49, x: 10, y: 0, width: 5, height: 20, xoffset: 0, yoffset: 0, xadvance: 30 },
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
  vi.clearAllMocks();
  textureLoadImpl = (_url, onLoad) => onLoad({ isTexture: true, dispose: vi.fn() });
});

// ── Failure path (must run first — see the file-level note above) ─────────

describe('Label render — failure handling', () => {
  it('a failed atlas load is logged, not thrown, and adds no mesh', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const scene = new THREE.Scene();
    const l = label().text('0').render(scene, 'a');
    await flush();

    expect(errorSpy).toHaveBeenCalled();
    expect(l.mesh).toBeNull();
    expect(scene.children.length).toBe(0);
    errorSpy.mockRestore();
  });
});

// ── Validation (fetch mocked to succeed for any incidental .render() call) ─

describe('Label validation', () => {
  beforeEach(() => mockFetchOnce());

  it('label() returns a Label instance', () => {
    expect(label()).toBeInstanceOf(Label);
  });

  it('every chainable setter returns the same instance', () => {
    const l = label();
    expect(l.text('a')).toBe(l);
    expect(l.position({ x: 0, y: 0, z: 0 })).toBe(l);
    expect(l.font({ fontSize: 0.5 })).toBe(l);
    expect(l.anchor('start')).toBe(l);
    expect(l.billboard(null)).toBe(l);
  });

  it('text() rejects a non-string', () => {
    expect(() => label().text(42)).toThrow(TypeError);
  });

  it('position() rejects non-finite coordinates', () => {
    expect(() => label().position({ x: NaN, y: 0, z: 0 })).toThrow(TypeError);
    expect(() => label().position({})).toThrow(TypeError);
  });

  it('font() rejects a non-object', () => {
    expect(() => label().font(null)).toThrow(TypeError);
    expect(() => label().font('bold')).toThrow(TypeError);
  });

  it('anchor() rejects anything other than center/start', () => {
    expect(() => label().anchor('top')).toThrow(TypeError);
  });

  it('billboard() rejects a non-Camera, non-null value', () => {
    expect(() => label().billboard({})).toThrow(TypeError);
  });

  it('render() rejects a non-Scene', () => {
    expect(() => label().render({}, 'a')).toThrow(TypeError);
  });

  it('render() rejects a non-string or empty name', () => {
    const scene = new THREE.Scene();
    expect(() => label().render(scene, '')).toThrow(TypeError);
    expect(() => label().render(scene, 42)).toThrow(TypeError);
  });

  it('render() twice throws', async () => {
    const scene = new THREE.Scene();
    const l = label().render(scene, 'a');
    expect(() => l.render(scene, 'b')).toThrow(/already been rendered/);
    await flush();
  });

  it('every public method throws after dispose()', () => {
    const l = label();
    l.dispose();
    expect(() => l.text('a')).toThrow(/disposed/);
    expect(() => l.position({ x: 0, y: 0, z: 0 })).toThrow(/disposed/);
    expect(() => l.font({})).toThrow(/disposed/);
    expect(() => l.anchor('start')).toThrow(/disposed/);
    expect(() => l.billboard(null)).toThrow(/disposed/);
    expect(() => l.render(new THREE.Scene(), 'a')).toThrow(/disposed/);
  });

  it('dispose() before render() is a safe no-op', () => {
    expect(() => label().dispose()).not.toThrow();
  });

  it('.mesh is null before render() resolves', () => {
    expect(label().mesh).toBeNull();
  });
});

// ── Build / update (SDFText mocked to succeed) ─────────────────────────────

describe('Label render/update — success', () => {
  beforeEach(() => mockFetchOnce());

  it('builds one real mesh, added to the scene under the given name', async () => {
    const scene = new THREE.Scene();
    const l = label().text('0').render(scene, 'my_label');
    await flush();

    expect(l.mesh).not.toBeNull();
    expect(l.mesh.three).toBeInstanceOf(THREE.Mesh);
    expect(scene.children).toContain(l.mesh.three);
    expect(l.mesh.name).toBe('my_label');
  });

  it('.ready resolves once the build settles, and .mesh is non-null by then', async () => {
    const scene = new THREE.Scene();
    const l = label().text('0').render(scene, 'a');
    await l.ready;
    expect(l.mesh).not.toBeNull();
  });

  it('.ready resolves to a new promise for each subsequent update', async () => {
    const scene = new THREE.Scene();
    const l = label().text('0').render(scene, 'a');
    const firstReady = l.ready;
    await firstReady;

    l.text('1');
    const secondReady = l.ready;
    expect(secondReady).not.toBe(firstReady);
    await secondReady;
    expect(l.mesh).not.toBeNull();
  });

  it('anchor "center" (default) offsets the mesh by -width/2, +height/2 so it centers on .position()', async () => {
    const scene = new THREE.Scene();
    const l = label().text('0').position({ x: 5, y: 5, z: 0 }).render(scene, 'a');
    await flush();

    // fontSize 1, baseSize 20 -> unitScale 0.05; '0' xadvance 12 -> width 0.6;
    // lineHeight 24 -> height 1.2. centerOffset = {x: -0.3, y: 0.6}.
    const p = l.mesh.getPosition();
    expect(p.x).toBeCloseTo(4.7);
    expect(p.y).toBeCloseTo(5.6);
  });

  it('anchor "start" places the block\'s natural top-left origin at .position()', async () => {
    const scene = new THREE.Scene();
    const l = label().text('0').position({ x: 5, y: 5, z: 0 }).anchor('start').render(scene, 'a');
    await flush();

    const p = l.mesh.getPosition();
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(5);
  });

  it('text() after render() rebuilds the mesh geometry on the same underlying mesh', async () => {
    const scene = new THREE.Scene();
    const l = label().text('0').render(scene, 'a');
    await flush();
    const three = l.mesh.three;
    const firstGeometry = three.geometry;

    l.text('1');
    await flush();

    expect(l.mesh.three).toBe(three); // same underlying mesh, not a new one
    expect(three.geometry).not.toBe(firstGeometry); // new geometry, since '1' is a different width
    expect(scene.children.filter((c) => c === three).length).toBe(1); // still exactly one scene entry
  });

  it('position() after render() repositions without rebuilding geometry', async () => {
    const scene = new THREE.Scene();
    const l = label().text('0').render(scene, 'a');
    await flush();
    const geometryBefore = l.mesh.three.geometry;

    l.position({ x: 9, y: 9, z: 9 });

    expect(l.mesh.three.geometry).toBe(geometryBefore); // unchanged — no rebuild
    const p = l.mesh.getPosition();
    expect(p.z).toBeCloseTo(9); // z has no anchor offset applied
  });

  it('only the latest of several rapid text() calls wins once builds settle', async () => {
    const scene = new THREE.Scene();
    const l = label().text('0').render(scene, 'a');
    l.text('1');
    l.text('0');
    await flush();

    expect(scene.children.filter((c) => c.name === 'a').length).toBe(1);
  });
});

describe('Label billboarding', () => {
  beforeEach(() => mockFetchOnce());

  it('billboard(camera) registers the mesh; the shared tick copies the camera quaternion', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    camera.quaternion.set(0.1, 0.2, 0.3, 0.9).normalize();

    const l = label().text('0').billboard(camera).render(scene, 'a');
    await flush();

    expect(loop.add).toHaveBeenCalledOnce();
    const tick = loop.add.mock.calls[0][0];
    tick();
    expect(l.mesh.three.quaternion.toArray()).toEqual(camera.quaternion.toArray());

    l.dispose();
    expect(loop.remove).toHaveBeenCalledOnce();
  });

  it('billboard(null) after billboard(camera) unregisters', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const l = label().text('0').billboard(camera).render(scene, 'a');
    await flush();
    expect(loop.add).toHaveBeenCalledOnce();

    l.billboard(null);
    expect(loop.remove).toHaveBeenCalledOnce();

    l.dispose();
    expect(loop.remove).toHaveBeenCalledOnce(); // not called again — already unregistered
  });
});

describe('Label dispose', () => {
  beforeEach(() => mockFetchOnce());

  it('dispose() while the initial build is in flight discards the result', async () => {
    const scene = new THREE.Scene();
    const l = label().text('0').render(scene, 'a');
    l.dispose();
    await flush();

    expect(scene.children.length).toBe(0);
    expect(l.mesh).toBeNull();
  });

  it('dispose() removes the mesh from the scene and is idempotent', async () => {
    const scene = new THREE.Scene();
    const l = label().text('0').render(scene, 'a');
    await flush();
    expect(scene.children.length).toBe(1);

    expect(() => {
      l.dispose();
      l.dispose();
    }).not.toThrow();
    expect(scene.children.length).toBe(0);
  });
});
