import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

// Mirrors tests/material/label/Label.test.js's mocking approach — syncLabels
// builds real Label instances, which go through the same SDFText.create()
// atlas load, so it needs the same fetch/TextureLoader stubs to run offline.
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    TextureLoader: vi.fn(function MockTextureLoader() {
      this.load = vi.fn((url, onLoad) => onLoad({ isTexture: true, dispose: vi.fn() }));
    }),
  };
});

vi.mock('../../../src/core/Graph3DLoop.js', () => ({
  loop: { add: vi.fn(), remove: vi.fn() },
}));

const { Selection } = await import('../../../src/compose/selection/Selection.js');
const { syncLabels, removeLabels } = await import('../../../src/compose/selection/labels.js');
const { GraphMesh } = await import('../../../src/object/GraphMesh.js');
const { GraphInstancedObject } = await import('../../../src/object/GraphInstancedObject.js');
const { loop } = await import('../../../src/core/Graph3DLoop.js');

function mockMetrics() {
  return {
    pages: ['roboto-msdf.png'],
    chars: [{ id: 48, x: 0, y: 0, width: 10, height: 20, xoffset: 0, yoffset: 0, xadvance: 12 }], // '0'
    common: { scaleW: 128, scaleH: 128, lineHeight: 24 },
    info: { size: 20 },
    kernings: [],
  };
}

vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => mockMetrics() })));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.clearAllMocks();
});

function meshesSelection(scene, data) {
  const meshes = data.map((datum, i) => {
    const mesh = new GraphMesh({ scene, name: `m${i}`, geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial() });
    mesh.setPosition(i, i * 2, 0).setUserData('datum', datum);
    return mesh;
  });
  return new Selection({ type: 'meshes', meshes });
}

function instancedSelection(scene, data) {
  const object = new GraphInstancedObject({ scene, name: 'batch', geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial(), count: data.length });
  data.forEach((datum, i) => {
    object.setInstanceUserData(i, datum);
    object.setInstancePosition(i, i, i * 2, 0);
  });
  return { selection: new Selection({ type: 'instanced', object, indices: Uint32Array.from(data.map((_, i) => i)) }), object };
}

describe('syncLabels — meshes backend', () => {
  it('creates one Label mesh per member, added to the scene', async () => {
    const scene = new THREE.Scene();
    const selection = meshesSelection(scene, [{ value: 1 }, { value: 2 }]);

    syncLabels(selection, (d) => `${d.value}`);
    await flush();

    const labelMeshes = scene.children.filter((c) => c.name.startsWith('label_sync_'));
    expect(labelMeshes.length).toBe(2);
  });

  it('positions each label at its member\'s own position plus options.offset', async () => {
    const scene = new THREE.Scene();
    const selection = meshesSelection(scene, [{ value: 1 }]);

    syncLabels(selection, (d) => `${d.value}`, { offset: { y: 0.5 } });
    await flush();

    const l = selection.backend.meshes[0].getUserData('label');
    // member 0 is at (0, 0, 0); anchor 'center' (default) additionally
    // offsets by SDFText's centerOffset for a single '0' glyph.
    const p = l.mesh.getPosition();
    expect(p.y).toBeCloseTo(0.5 + 0.6); // +0.5 offset, +0.6 centerOffset.y (see Label.test.js's identical math)
  });

  it('calling syncLabels again updates the same Label in place, not a duplicate', async () => {
    const scene = new THREE.Scene();
    const selection = meshesSelection(scene, [{ value: 1 }]);

    syncLabels(selection, (d) => `${d.value}`);
    await flush();
    const firstLabel = selection.backend.meshes[0].getUserData('label');

    syncLabels(selection, (d) => `${d.value * 2}`);
    await flush();
    const secondLabel = selection.backend.meshes[0].getUserData('label');

    expect(secondLabel).toBe(firstLabel);
    expect(scene.children.filter((c) => c.name.startsWith('label_sync_')).length).toBe(1);
  });

  it('returns the same selection instance, for .call() chaining', () => {
    const scene = new THREE.Scene();
    const selection = meshesSelection(scene, [{ value: 1 }]);
    expect(syncLabels(selection, 'x')).toBe(selection);
  });

  it('anchor "start" places the label at the member\'s exact position (no centerOffset)', async () => {
    const scene = new THREE.Scene();
    const selection = meshesSelection(scene, [{ value: 1 }]);

    syncLabels(selection, (d) => `${d.value}`, { anchor: 'start' });
    await flush();

    const l = selection.backend.meshes[0].getUserData('label');
    const p = l.mesh.getPosition();
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });
});

describe('syncLabels — instanced backend', () => {
  it('creates one Label mesh per member, added to the scene', async () => {
    const scene = new THREE.Scene();
    const { selection } = instancedSelection(scene, [{ value: 1 }, { value: 2 }, { value: 3 }]);

    syncLabels(selection, (d) => `${d.value}`);
    await flush();

    const labelMeshes = scene.children.filter((c) => c.name.startsWith('label_sync_'));
    expect(labelMeshes.length).toBe(3);
  });

  it('calling syncLabels again updates the same Label in place, not a duplicate', async () => {
    const scene = new THREE.Scene();
    const { selection } = instancedSelection(scene, [{ value: 1 }]);

    syncLabels(selection, (d) => `${d.value}`);
    await flush();
    const labelCountAfterFirst = scene.children.filter((c) => c.name.startsWith('label_sync_')).length;

    syncLabels(selection, (d) => `${d.value * 2}`);
    await flush();

    expect(scene.children.filter((c) => c.name.startsWith('label_sync_')).length).toBe(labelCountAfterFirst);
    expect(labelCountAfterFirst).toBe(1);
  });

  it('two different GraphInstancedObjects keep independent label storage', async () => {
    const scene = new THREE.Scene();
    const a = instancedSelection(scene, [{ value: 1 }]);
    const b = instancedSelection(scene, [{ value: 1 }]);

    syncLabels(a.selection, 'a');
    syncLabels(b.selection, 'b');
    await flush();

    expect(scene.children.filter((c) => c.name.startsWith('label_sync_')).length).toBe(2);
  });
});

describe('removeLabels', () => {
  it('disposes each member\'s label and removes its mesh from the scene (meshes backend)', async () => {
    const scene = new THREE.Scene();
    const selection = meshesSelection(scene, [{ value: 1 }]);
    syncLabels(selection, 'x');
    await flush();
    expect(scene.children.filter((c) => c.name.startsWith('label_sync_')).length).toBe(1);

    removeLabels(selection);
    expect(scene.children.filter((c) => c.name.startsWith('label_sync_')).length).toBe(0);
  });

  it('disposes each member\'s label and removes its mesh from the scene (instanced backend)', async () => {
    const scene = new THREE.Scene();
    const { selection } = instancedSelection(scene, [{ value: 1 }]);
    syncLabels(selection, 'x');
    await flush();
    expect(scene.children.filter((c) => c.name.startsWith('label_sync_')).length).toBe(1);

    removeLabels(selection);
    expect(scene.children.filter((c) => c.name.startsWith('label_sync_')).length).toBe(0);
  });

  it('is a no-op for members syncLabels was never called on', () => {
    const scene = new THREE.Scene();
    const selection = meshesSelection(scene, [{ value: 1 }]);
    expect(() => removeLabels(selection)).not.toThrow();
  });

  it('a subsequent syncLabels call after removeLabels creates a fresh label, not a disposed one', async () => {
    const scene = new THREE.Scene();
    const selection = meshesSelection(scene, [{ value: 1 }]);
    syncLabels(selection, 'x');
    await flush();
    const disposed = selection.backend.meshes[0].getUserData('label');

    removeLabels(selection);
    syncLabels(selection, 'y');
    await flush();
    const fresh = selection.backend.meshes[0].getUserData('label');

    expect(fresh).not.toBe(disposed);
    expect(fresh.mesh).not.toBeNull();
  });

  it('returns the same selection instance, for .call() chaining', () => {
    const scene = new THREE.Scene();
    const selection = meshesSelection(scene, [{ value: 1 }]);
    expect(removeLabels(selection)).toBe(selection);
  });
});

describe('syncLabels + removeLabels — enter/update/exit lifecycle parity with Selection.join()', () => {
  it('churns membership across many join cycles: label count always matches live member count, no leaks', async () => {
    const scene = new THREE.Scene();
    const ids = ['a', 'b', 'c', 'd'];

    function layoutBars(selection) {
      selection.call(syncLabels, (d) => `${d.value}`);
    }

    let selection = new Selection({
      type: 'meshes',
      meshes: [],
      template: { scene, name: 'bar', geometry: new THREE.BoxGeometry(), material: new THREE.MeshStandardMaterial() },
    });

    function update(dataset) {
      const joined = selection.data(dataset, (d) => d.id);
      selection = joined.join(
        (entered) => layoutBars(entered),
        (updated) => layoutBars(updated),
        (exited) => exited.call(removeLabels).remove(),
      );
    }

    let seed = 1;
    function pseudoRandom() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }

    for (let cycle = 0; cycle < 30; cycle++) {
      const active = ids.filter(() => pseudoRandom() < 0.6);
      const dataset = active.map((id) => ({ id, value: Math.floor(pseudoRandom() * 100) }));
      update(dataset);
      await flush();

      expect(selection.size()).toBe(dataset.length);
      const barMeshes = scene.children.filter((c) => c.name.startsWith('bar_'));
      const labelMeshes = scene.children.filter((c) => c.name.startsWith('label_sync_'));
      expect(barMeshes.length).toBe(dataset.length);
      expect(labelMeshes.length).toBe(dataset.length);
    }
  });
});

describe('syncLabels — billboarding', () => {
  it('options.billboard registers the label mesh with the shared loop', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const selection = meshesSelection(scene, [{ value: 1 }]);

    syncLabels(selection, 'x', { billboard: camera });
    await flush();

    expect(loop.add).toHaveBeenCalledOnce();
  });
});
