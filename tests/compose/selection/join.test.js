import { describe, it, expect } from 'vitest';
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

function makeInstanced(scene, data, count = data.length) {
  const object = new GraphInstancedObject({ scene, name: 'batch', geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial(), count });
  data.forEach((datum, i) => object.setInstanceUserData(i, datum));
  return object;
}

// ── data() read form (no regression from the join overload) ────────────────

describe('Selection.data (no-arg read form still works)', () => {
  it('returns bound data unchanged when called with zero arguments', () => {
    const scene = new THREE.Scene();
    const selection = new Selection({ type: 'meshes', meshes: makeMeshes(scene, [{ v: 1 }, { v: 2 }]) });
    expect(selection.data()).toEqual([{ v: 1 }, { v: 2 }]);
  });
});

// ── data(newData, keyFn): update rebinding + counts ─────────────────────────

describe('Selection.data(newData, keyFn): input validation', () => {
  it('throws TypeError when newData is not an array', () => {
    const scene = new THREE.Scene();
    const selection = new Selection({ type: 'meshes', meshes: makeMeshes(scene, [{}]) });
    expect(() => selection.data('not an array')).toThrow(TypeError);
  });
});

describe('Selection.data(newData, keyFn): update selection', () => {
  it('IS the update selection — reading it reflects the newly bound data', () => {
    const scene = new THREE.Scene();
    const selection = new Selection({ type: 'meshes', meshes: makeMeshes(scene, [{ id: 'a', v: 1 }]) });
    const joined = selection.data([{ id: 'a', v: 99 }], (d) => d.id);
    expect(joined.size()).toBe(1);
    expect(joined.data()).toEqual([{ id: 'a', v: 99 }]);
  });

  it('meshes backend: update rebinding preserves mesh identity (same node, new datum)', () => {
    const scene = new THREE.Scene();
    const meshes = makeMeshes(scene, [{ id: 'a', v: 1 }]);
    const selection = new Selection({ type: 'meshes', meshes });
    selection.data([{ id: 'a', v: 99 }], (d) => d.id);
    expect(meshes[0].getUserData('datum')).toEqual({ id: 'a', v: 99 });
  });

  it('instanced backend: update rebinding preserves the raw instance slot', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{ id: 'a', v: 1 }]);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) });
    selection.data([{ id: 'a', v: 99 }], (d) => d.id);
    expect(object.getInstanceUserData(0)).toEqual({ id: 'a', v: 99 });
  });

  it('unkeyed join: positional overlap updates, extra tail enters/exits', () => {
    const scene = new THREE.Scene();
    const template = { scene, name: 'pt', geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial() };
    const selection = new Selection({ type: 'meshes', meshes: makeMeshes(scene, [{ v: 1 }, { v: 2 }]), template });
    const joined = selection.data([{ v: 10 }, { v: 20 }, { v: 30 }]);
    expect(joined.size()).toBe(2);
    expect(joined.enter().size()).toBe(1);
    expect(joined.exit().size()).toBe(0);
  });
});

// ── enter(): materialization ─────────────────────────────────────────────

describe('JoinResult.enter (materialization)', () => {
  it('instanced backend: allocates real instance slots and binds the entering datum', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{ id: 'a' }]);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) });
    const joined = selection.data([{ id: 'a' }, { id: 'b' }], (d) => d.id);

    const entered = joined.enter();
    expect(entered.size()).toBe(1);
    expect(entered.data()).toEqual([{ id: 'b' }]);
    // the entered slot is a real, distinct raw instance index
    expect(object.getInstanceUserData(1)).toEqual({ id: 'b' });
  });

  it('instanced backend: enter grows capacity via setInstanceCount when the free-list is empty', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{}], 1);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) });
    const joined = selection.data([{}, {}, {}]);
    joined.enter();
    expect(object.capacity).toBeGreaterThanOrEqual(3);
  });

  it('meshes backend with a template: creates real GraphMesh instances via GraphObjectFactory', () => {
    const scene = new THREE.Scene();
    const template = { scene, name: 'pt', geometry: new THREE.SphereGeometry(), material: new THREE.MeshBasicMaterial() };
    const selection = new Selection({ type: 'meshes', meshes: [], template });
    const joined = selection.data([{ v: 1 }, { v: 2 }]);

    const entered = joined.enter();
    expect(entered.size()).toBe(2);
    expect(entered.data()).toEqual([{ v: 1 }, { v: 2 }]);
    expect(entered.nodes().every((n) => typeof n.datum === 'object')).toBe(true);
  });

  it('meshes backend without a template: throws a clear error when there is something to enter', () => {
    const scene = new THREE.Scene();
    const selection = new Selection({ type: 'meshes', meshes: [] });
    const joined = selection.data([{ v: 1 }]);
    expect(() => joined.enter()).toThrow(/mesh template/);
  });

  it('meshes backend without a template: an empty enter set is a no-op, no throw', () => {
    const scene = new THREE.Scene();
    const selection = new Selection({ type: 'meshes', meshes: makeMeshes(scene, [{ id: 'a' }]) });
    const joined = selection.data([{ id: 'a' }], (d) => d.id); // nothing enters
    expect(() => joined.enter()).not.toThrow();
    expect(joined.enter().empty()).toBe(true);
  });

  it('instanced backend: an empty enter set is a no-op, no allocation', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{ id: 'a' }]);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) });
    const joined = selection.data([{ id: 'a' }], (d) => d.id); // nothing enters
    expect(joined.enter().empty()).toBe(true);
  });

  it('caches the materialized result — repeat calls do not re-allocate', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{}], 1);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) });
    const joined = selection.data([{}, {}]);
    const first = joined.enter();
    const second = joined.enter();
    expect(second).toBe(first);
  });
});

// ── exit() / remove() ────────────────────────────────────────────────────

describe('JoinResult.exit', () => {
  it('covers the departing members without removing them until .remove() is called', () => {
    const scene = new THREE.Scene();
    const meshes = makeMeshes(scene, [{ id: 'a' }, { id: 'b' }]);
    const selection = new Selection({ type: 'meshes', meshes }, );
    const wrapped = new Selection({ type: 'meshes', meshes });
    const joined = wrapped.data([{ id: 'a' }], (d) => d.id);
    const exited = joined.exit();
    expect(exited.size()).toBe(1);
    expect(exited.data()).toEqual([{ id: 'b' }]);
    expect(() => meshes[1].getPosition()).not.toThrow(); // still alive
  });

  it('meshes: .exit().remove() disposes the departing mesh', () => {
    const scene = new THREE.Scene();
    const meshes = makeMeshes(scene, [{ id: 'a' }, { id: 'b' }]);
    const selection = new Selection({ type: 'meshes', meshes });
    const joined = selection.data([{ id: 'a' }], (d) => d.id);
    joined.exit().remove();
    expect(() => meshes[1].getPosition()).toThrow(/disposed/);
  });

  it('instanced: .exit().remove() frees the slot for the next enter()', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{ id: 'a' }, { id: 'b' }]);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1]) });
    const joined = selection.data([{ id: 'a' }], (d) => d.id);
    joined.exit().remove();

    const reselected = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) });
    const rejoined = reselected.data([{ id: 'a' }, { id: 'c' }], (d) => d.id);
    expect(rejoined.enter().size()).toBe(1);
    expect(() => rejoined.enter()).not.toThrow();
  });
});

// ── join(enterFn, updateFn, exitFn) ─────────────────────────────────────

describe('JoinResult.join', () => {
  it('calls enterFn/updateFn/exitFn with the right selections and returns the enter+update merge', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{ id: 'a', v: 1 }, { id: 'b', v: 2 }]);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1]) });
    const joined = selection.data([{ id: 'a', v: 10 }, { id: 'c', v: 3 }], (d) => d.id);

    const calls = { enter: null, update: null, exit: null };
    const merged = joined.join(
      (enter) => { calls.enter = enter.data(); },
      (update) => { calls.update = update.data(); },
      (exit) => { calls.exit = exit.data(); },
    );

    expect(calls.enter).toEqual([{ id: 'c', v: 3 }]);
    expect(calls.update).toEqual([{ id: 'a', v: 10 }]);
    expect(calls.exit).toEqual([{ id: 'b', v: 2 }]);
    expect(merged.size()).toBe(2); // update (1) + enter (1)
  });

  it('defaults: exit is removed automatically when exitFn is omitted', () => {
    const scene = new THREE.Scene();
    const meshes = makeMeshes(scene, [{ id: 'a' }, { id: 'b' }]);
    const selection = new Selection({ type: 'meshes', meshes });
    const joined = selection.data([{ id: 'a' }], (d) => d.id);
    joined.join();
    expect(() => meshes[1].getPosition()).toThrow(/disposed/);
  });

  it('defaults: enter/update are no-ops when their callbacks are omitted (still materialized)', () => {
    const scene = new THREE.Scene();
    const template = { scene, name: 'pt', geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial() };
    const selection = new Selection({ type: 'meshes', meshes: [], template });
    const joined = selection.data([{ v: 1 }]);
    const merged = joined.join();
    expect(merged.size()).toBe(1);
  });
});
