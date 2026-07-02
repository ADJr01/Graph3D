import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Selection } from '../../../src/compose/selection/Selection.js';
import { GraphMesh } from '../../../src/object/GraphMesh.js';
import { GraphInstancedObject } from '../../../src/object/GraphInstancedObject.js';

function makeMeshes(scene, data) {
  return data.map((datum, i) => {
    const mesh = new GraphMesh({ scene, name: `m${i}`, geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial() });
    mesh.setUserData('datum', datum);
    return mesh;
  });
}

function makeInstanced(scene, data) {
  const object = new GraphInstancedObject({ scene, name: 'batch', geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial(), count: data.length });
  data.forEach((datum, i) => object.setInstanceUserData(i, datum));
  return object;
}

function meshesSelection(data) {
  const scene = new THREE.Scene();
  const meshes = makeMeshes(scene, data);
  return { selection: new Selection({ type: 'meshes', meshes }), meshes };
}

function instancedSelection(data) {
  const scene = new THREE.Scene();
  const object = makeInstanced(scene, data);
  const indices = Uint32Array.from(data.map((_, i) => i));
  return { selection: new Selection({ type: 'instanced', object, indices }), object };
}

// ── filter ───────────────────────────────────────────────────────────────

describe('Selection.filter', () => {
  it('meshes backend: keeps members the predicate accepts, sharing the same GraphMesh references', () => {
    const { selection, meshes } = meshesSelection([{ v: 1 }, { v: 2 }, { v: 3 }]);
    const filtered = selection.filter((d) => d.v > 1);
    expect(filtered.size()).toBe(2);
    expect(filtered.data()).toEqual([{ v: 2 }, { v: 3 }]);
    filtered.attr('color', 'red');
    expect(meshes[1].material.color.getHex()).toBe(new THREE.Color('red').getHex());
    expect(meshes[0].material.color.getHex()).not.toBe(new THREE.Color('red').getHex());
  });

  it('instanced backend: narrows indices, sharing the same GraphInstancedObject', () => {
    const { selection, object } = instancedSelection([{ v: 1 }, { v: 2 }, { v: 3 }]);
    const filtered = selection.filter((d) => d.v !== 2);
    expect(filtered.size()).toBe(2);
    filtered.attr('position.x', 99);
    expect(object.getInstancePosition(0).x).toBe(99);
    expect(object.getInstancePosition(1).x).not.toBe(99);
    expect(object.getInstancePosition(2).x).toBe(99);
  });

  it('predicate receives (datum, index) using positions local to the current selection', () => {
    const { selection } = meshesSelection([{}, {}, {}]);
    const seen = [];
    selection.filter((d, i) => {
      seen.push(i);
      return true;
    });
    expect(seen).toEqual([0, 1, 2]);
  });

  it('does not mutate the original selection', () => {
    const { selection } = meshesSelection([{ v: 1 }, { v: 2 }]);
    selection.filter((d) => d.v > 1);
    expect(selection.size()).toBe(2);
  });

  it('throws TypeError for a non-function predicate', () => {
    const { selection } = meshesSelection([{}]);
    expect(() => selection.filter('nope')).toThrow(TypeError);
  });

  it('an empty result is empty()', () => {
    const { selection } = meshesSelection([{ v: 1 }]);
    expect(selection.filter((d) => d.v > 100).empty()).toBe(true);
  });
});

// ── each ─────────────────────────────────────────────────────────────────

describe('Selection.each', () => {
  it('calls fn(datum, index, handle) once per node in order', () => {
    const { selection } = meshesSelection([{ v: 'a' }, { v: 'b' }]);
    const calls = [];
    selection.each((datum, index, handle) => calls.push({ datum, index, handleDatum: handle.datum, handleIndex: handle.index }));
    expect(calls).toEqual([
      { datum: { v: 'a' }, index: 0, handleDatum: { v: 'a' }, handleIndex: 0 },
      { datum: { v: 'b' }, index: 1, handleDatum: { v: 'b' }, handleIndex: 1 },
    ]);
  });

  it('returns this for chaining', () => {
    const { selection } = meshesSelection([{}]);
    expect(selection.each(() => {})).toBe(selection);
  });

  it('throws TypeError for a non-function fn', () => {
    const { selection } = meshesSelection([{}]);
    expect(() => selection.each(null)).toThrow(TypeError);
  });
});

// ── sort ─────────────────────────────────────────────────────────────────

describe('Selection.sort', () => {
  it('returns a new Selection reordered by the comparator', () => {
    const { selection } = meshesSelection([{ v: 3 }, { v: 1 }, { v: 2 }]);
    const sorted = selection.sort((a, b) => a.v - b.v);
    expect(sorted).not.toBe(selection);
    expect(sorted.data()).toEqual([{ v: 1 }, { v: 2 }, { v: 3 }]);
  });

  it('does not change the original selection order', () => {
    const { selection } = meshesSelection([{ v: 3 }, { v: 1 }, { v: 2 }]);
    selection.sort((a, b) => a.v - b.v);
    expect(selection.data()).toEqual([{ v: 3 }, { v: 1 }, { v: 2 }]);
  });

  it('instanced backend: reorders the indices mapping without writing any instance buffer', () => {
    const { selection, object } = instancedSelection([{ v: 3 }, { v: 1 }, { v: 2 }]);
    object.setInstancePosition(0, 30, 0, 0).setInstancePosition(1, 10, 0, 0).setInstancePosition(2, 20, 0, 0);
    const commitSpy = vi.spyOn(object, 'commitMatrix');

    const sorted = selection.sort((a, b) => a.v - b.v);

    expect(sorted.data()).toEqual([{ v: 1 }, { v: 2 }, { v: 3 }]);
    // the underlying instance positions are untouched by sort itself
    expect(object.getInstancePosition(0).x).toBe(30);
    expect(object.getInstancePosition(1).x).toBe(10);
    expect(object.getInstancePosition(2).x).toBe(20);
    expect(commitSpy).not.toHaveBeenCalled();
  });

  it('throws TypeError for a non-function comparator', () => {
    const { selection } = meshesSelection([{}]);
    expect(() => selection.sort(1)).toThrow(TypeError);
  });
});

// ── merge ────────────────────────────────────────────────────────────────

describe('Selection.merge', () => {
  it('meshes backend: concatenates both selections', () => {
    const { selection: a } = meshesSelection([{ v: 1 }]);
    const { selection: b } = meshesSelection([{ v: 2 }, { v: 3 }]);
    const merged = a.merge(b);
    expect(merged.data()).toEqual([{ v: 1 }, { v: 2 }, { v: 3 }]);
  });

  it('instanced backend: concatenates indices when both share the same GraphInstancedObject', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{ v: 1 }, { v: 2 }, { v: 3 }]);
    const a = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) });
    const b = new Selection({ type: 'instanced', object, indices: Uint32Array.from([2, 1]) });
    const merged = a.merge(b);
    expect(merged.data()).toEqual([{ v: 1 }, { v: 3 }, { v: 2 }]);
  });

  it('does not deduplicate overlapping members', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{ v: 1 }, { v: 2 }]);
    const a = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1]) });
    const b = new Selection({ type: 'instanced', object, indices: Uint32Array.from([1]) });
    expect(a.merge(b).data()).toEqual([{ v: 1 }, { v: 2 }, { v: 2 }]);
  });

  it('throws when merging a meshes selection with an instanced selection', () => {
    const { selection: meshes } = meshesSelection([{}]);
    const { selection: instanced } = instancedSelection([{}]);
    expect(() => meshes.merge(instanced)).toThrow(/cannot merge/);
  });

  it('throws when merging two instanced selections over different GraphInstancedObjects', () => {
    const { selection: a } = instancedSelection([{}]);
    const { selection: b } = instancedSelection([{}]);
    expect(() => a.merge(b)).toThrow(/same GraphInstancedObject/);
  });

  it('throws TypeError when other is not a Selection', () => {
    const { selection } = meshesSelection([{}]);
    expect(() => selection.merge({})).toThrow(TypeError);
  });

  it("meshes backend: carries a from-scratch join's mesh template forward, so a merged selection can still enter() new members later", () => {
    const scene = new THREE.Scene();
    const template = { scene, name: 'pt', geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial() };
    const a = new Selection({ type: 'meshes', meshes: [], template });
    const { selection: b } = meshesSelection([{ v: 1 }]);

    const merged = a.merge(b);
    const joined = merged.data([{ v: 1 }, { v: 2 }], (d) => d.v);
    expect(() => joined.enter()).not.toThrow();
    expect(joined.enter().size()).toBe(1);
  });
});

// ── call ─────────────────────────────────────────────────────────────────

describe('Selection.call', () => {
  it('calls fn(selection, ...args) and returns this', () => {
    const { selection } = meshesSelection([{}]);
    const fn = vi.fn();
    const result = selection.call(fn, 1, 2);
    expect(fn).toHaveBeenCalledWith(selection, 1, 2);
    expect(result).toBe(selection);
  });

  it('supports chaining a reusable behavior into an attr() pipeline', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{}]);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) });
    const highlight = (sel) => sel.attr('color', 'gold');
    selection.call(highlight).attr('position.x', 1);
    expect(object.getInstancePosition(0).x).toBe(1);
  });

  it('throws TypeError for a non-function fn', () => {
    const { selection } = meshesSelection([{}]);
    expect(() => selection.call(undefined)).toThrow(TypeError);
  });
});
