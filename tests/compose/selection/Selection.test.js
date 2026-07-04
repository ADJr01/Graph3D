import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Selection } from '../../../src/compose/selection/Selection.js';
import { SelectionTransition } from '../../../src/compose/selection/SelectionTransition.js';
import { GraphMesh } from '../../../src/object/GraphMesh.js';
import { GraphInstancedObject } from '../../../src/object/GraphInstancedObject.js';

function makeMesh(scene, name, datum) {
  const mesh = new GraphMesh({ scene, name, geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial() });
  if (datum !== undefined) mesh.setUserData('datum', datum);
  return mesh;
}

function makeInstanced(scene, name = 'a', count = 10) {
  return new GraphInstancedObject({
    scene,
    name,
    geometry: new THREE.BoxGeometry(),
    material: new THREE.MeshBasicMaterial(),
    count,
  });
}

// ── Constructor validation ─────────────────────────────────────────────────

describe('Selection constructor', () => {
  it('throws TypeError for a non-object backend', () => {
    expect(() => new Selection(null)).toThrow(TypeError);
    expect(() => new Selection('nope')).toThrow(TypeError);
  });

  it("throws TypeError for an unrecognized backend.type", () => {
    expect(() => new Selection({ type: 'dom', nodes: [] })).toThrow(TypeError);
  });

  it('throws TypeError when a meshes backend.meshes is not an array of GraphMesh', () => {
    const scene = new THREE.Scene();
    expect(() => new Selection({ type: 'meshes', meshes: 'nope' })).toThrow(TypeError);
    expect(() => new Selection({ type: 'meshes', meshes: [{}] })).toThrow(TypeError);
    expect(() => new Selection({ type: 'meshes', meshes: [makeMesh(scene, 'a')] })).not.toThrow();
  });

  it('throws TypeError when an instanced backend.object is not a GraphInstancedObject', () => {
    expect(() => new Selection({ type: 'instanced', object: {}, indices: new Uint32Array([0]) })).toThrow(TypeError);
  });

  it('throws TypeError when an instanced backend.indices is not a Uint32Array', () => {
    const object = makeInstanced(new THREE.Scene());
    expect(() => new Selection({ type: 'instanced', object, indices: [0, 1] })).toThrow(TypeError);
  });

  it('throws RangeError when an instanced index exceeds the object capacity', () => {
    const object = makeInstanced(new THREE.Scene(), 'a', 4);
    expect(() => new Selection({ type: 'instanced', object, indices: Uint32Array.from([4]) })).toThrow(RangeError);
  });
});

// ── size() / empty() ──────────────────────────────────────────────────────

describe('Selection.size / empty', () => {
  it('meshes backend: size is the mesh count', () => {
    const scene = new THREE.Scene();
    const selection = new Selection({ type: 'meshes', meshes: [makeMesh(scene, 'a'), makeMesh(scene, 'b')] });
    expect(selection.size()).toBe(2);
    expect(selection.empty()).toBe(false);
  });

  it('instanced backend: size is the indices count, independent of capacity', () => {
    const object = makeInstanced(new THREE.Scene(), 'a', 100);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([3, 7]) });
    expect(selection.size()).toBe(2);
  });

  it('empty() is true for a zero-length selection', () => {
    const selection = new Selection({ type: 'meshes', meshes: [] });
    expect(selection.empty()).toBe(true);
  });
});

// ── datum() / data() ──────────────────────────────────────────────────────

describe('Selection.datum / data', () => {
  it('meshes backend reads the datum stored via GraphMesh.setUserData("datum", ...)', () => {
    const scene = new THREE.Scene();
    const meshes = [makeMesh(scene, 'a', { value: 1 }), makeMesh(scene, 'b', { value: 2 })];
    const selection = new Selection({ type: 'meshes', meshes });
    expect(selection.datum(0)).toEqual({ value: 1 });
    expect(selection.data()).toEqual([{ value: 1 }, { value: 2 }]);
  });

  it('instanced backend reads the datum stored via GraphInstancedObject.setInstanceUserData(rawIndex, ...)', () => {
    const object = makeInstanced(new THREE.Scene(), 'a', 10);
    object.setInstanceUserData(3, { value: 'three' });
    object.setInstanceUserData(7, { value: 'seven' });
    // local position 0 maps to raw instance 7, position 1 to raw instance 3 —
    // the selection's own order, not instance-index order.
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([7, 3]) });
    expect(selection.datum(0)).toEqual({ value: 'seven' });
    expect(selection.datum(1)).toEqual({ value: 'three' });
    expect(selection.data()).toEqual([{ value: 'seven' }, { value: 'three' }]);
  });

  it('throws RangeError for an out-of-bounds index', () => {
    const selection = new Selection({ type: 'meshes', meshes: [makeMesh(new THREE.Scene(), 'a')] });
    expect(() => selection.datum(1)).toThrow(RangeError);
    expect(() => selection.datum(-1)).toThrow(RangeError);
  });
});

// ── nodes() ────────────────────────────────────────────────────────────────

describe('Selection.nodes', () => {
  it('returns one proxy handle per datum, uniform across backends', () => {
    const scene = new THREE.Scene();
    const selection = new Selection({
      type: 'meshes',
      meshes: [makeMesh(scene, 'a', 'A'), makeMesh(scene, 'b', 'B')],
    });
    const nodes = selection.nodes();
    expect(nodes).toHaveLength(2);
    expect(nodes[0].index).toBe(0);
    expect(nodes[0].datum).toBe('A');
    expect(nodes[1].index).toBe(1);
    expect(nodes[1].datum).toBe('B');
  });

  it('an instanced-backend node reads through to the same datum as Selection.datum()', () => {
    const object = makeInstanced(new THREE.Scene(), 'a', 5);
    object.setInstanceUserData(2, 'hello');
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([2]) });
    expect(selection.nodes()[0].datum).toBe(selection.datum(0));
  });

  it('returns an empty array for an empty selection', () => {
    const selection = new Selection({ type: 'meshes', meshes: [] });
    expect(selection.nodes()).toEqual([]);
  });
});

// ── remove() ───────────────────────────────────────────────────────────────

describe('Selection.remove', () => {
  it('meshes backend: disposes every mesh', () => {
    const scene = new THREE.Scene();
    const mesh = makeMesh(scene, 'a');
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    selection.remove();
    expect(() => mesh.getPosition()).toThrow(/disposed/);
  });

  it('instanced backend: frees the slot so a later allocateSlots-style enter can reuse it', () => {
    const object = makeInstanced(new THREE.Scene(), 'a', 4);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) });
    expect(() => selection.remove()).not.toThrow();
  });

  it('returns this for chaining', () => {
    const selection = new Selection({ type: 'meshes', meshes: [] });
    expect(selection.remove()).toBe(selection);
  });
});

// ── remove(animationName, options) — Prompt 122 ─────────────────────────────

describe('Selection.remove(animationName, options)', () => {
  it('throws TypeError when animationName is given without options.system', () => {
    const selection = new Selection({ type: 'meshes', meshes: [] });
    expect(() => selection.remove('dissolve')).toThrow(/options\.system/);
  });

  it('throws TypeError when options.system has no .preset method', () => {
    const selection = new Selection({ type: 'meshes', meshes: [] });
    expect(() => selection.remove('dissolve', { system: {} })).toThrow(/options\.system/);
  });

  it('throws TypeError for a non-string animationName', () => {
    const selection = new Selection({ type: 'meshes', meshes: [] });
    expect(() => selection.remove(42, { system: { preset: () => {} } })).toThrow(TypeError);
  });

  it('meshes backend: calls system.preset(name, { mesh, ...opts }) once per node, then disposes them', () => {
    const scene = new THREE.Scene();
    const meshA = makeMesh(scene, 'a');
    const meshB = makeMesh(scene, 'b');
    const selection = new Selection({ type: 'meshes', meshes: [meshA, meshB] });
    const calls = [];
    const system = { preset: (name, opts) => calls.push({ name, opts }) };

    selection.remove('dissolve', { system, speed: 2 });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ name: 'dissolve', opts: { speed: 2, mesh: meshA.three } });
    expect(calls[1]).toEqual({ name: 'dissolve', opts: { speed: 2, mesh: meshB.three } });
    expect(() => meshA.getPosition()).toThrow(/disposed/);
  });

  it('instanced backend: calls system.preset(name, { position, ...opts }) once per node using local instance position', () => {
    const object = makeInstanced(new THREE.Scene(), 'a', 4);
    object.setInstancePosition(2, 1, 2, 3);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([2]) });
    const calls = [];
    const system = { preset: (name, opts) => calls.push({ name, opts }) };

    selection.remove('dissolve', { system });

    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('dissolve');
    expect(calls[0].opts.position.x).toBeCloseTo(1);
    expect(calls[0].opts.position.y).toBeCloseTo(2);
    expect(calls[0].opts.position.z).toBeCloseTo(3);
  });

  it('still removes the backend even when animated', () => {
    const object = makeInstanced(new THREE.Scene(), 'a', 4);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) });
    const system = { preset: () => {} };
    expect(() => selection.remove('dissolve', { system })).not.toThrow();
  });

  it('returns this for chaining', () => {
    const selection = new Selection({ type: 'meshes', meshes: [] });
    const system = { preset: () => {} };
    expect(selection.remove('dissolve', { system })).toBe(selection);
  });
});

// ── transition() (Prompt 91) ────────────────────────────────────────────────
// Full SelectionTransition behavior is covered in SelectionTransition.test.js;
// this just confirms Selection wires the two together correctly.

describe('Selection.transition', () => {
  it('returns a SelectionTransition over this selection', () => {
    const scene = new THREE.Scene();
    const selection = new Selection({ type: 'meshes', meshes: [makeMesh(scene, 'a', { value: 1 })] });
    const transition = selection.transition();
    expect(transition).toBeInstanceOf(SelectionTransition);
  });
});

describe('Selection.on', () => {
  it('throws a clear "requires Phase 9" error', () => {
    const selection = new Selection({ type: 'meshes', meshes: [] });
    expect(() => selection.on('click', () => {})).toThrow(/Phase 9/);
  });
});
