import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GraphMesh } from '../../src/object/GraphMesh.js';
import { GraphInstancedObject } from '../../src/object/GraphInstancedObject.js';
import { assignDepthJitter } from '../../src/object/depthOffset.js';

function makeMesh(scene, name) {
  return new GraphMesh({
    scene,
    name,
    geometry: new THREE.BoxGeometry(),
    material: new THREE.MeshBasicMaterial(),
  });
}

function meshesSelection(rows) {
  const scene = new THREE.Scene();
  const meshes = rows.map((row, i) => makeMesh(scene, `m${i}`));
  return {
    backend: { type: 'meshes', meshes },
    data: () => rows,
  };
}

function instancedSelection(rows) {
  const scene = new THREE.Scene();
  const object = new GraphInstancedObject({
    scene,
    name: 'a',
    geometry: new THREE.BoxGeometry(),
    material: new THREE.MeshBasicMaterial(),
    count: rows.length,
  });
  const indices = Uint32Array.from(rows.map((_, i) => i));
  return {
    backend: { type: 'instanced', object, indices },
    data: () => rows,
  };
}

describe('assignDepthJitter', () => {
  it('throws TypeError when selection lacks backend/data()', () => {
    expect(() => assignDepthJitter(null, (d) => d.name)).toThrow(TypeError);
    expect(() => assignDepthJitter({}, (d) => d.name)).toThrow(TypeError);
    expect(() => assignDepthJitter({ backend: {} }, (d) => d.name)).toThrow(TypeError);
  });

  it('throws TypeError when keyFn is not a function', () => {
    const selection = meshesSelection([{ name: 'a' }]);
    expect(() => assignDepthJitter(selection, 'nope')).toThrow(TypeError);
  });

  it('throws TypeError when options.spacing is not a positive number', () => {
    const selection = meshesSelection([{ name: 'a' }]);
    expect(() => assignDepthJitter(selection, (d) => d.name, { spacing: 0 })).toThrow(TypeError);
    expect(() => assignDepthJitter(selection, (d) => d.name, { spacing: -1 })).toThrow(TypeError);
    expect(() => assignDepthJitter(selection, (d) => d.name, { spacing: 'nope' })).toThrow(TypeError);
  });

  it('throws TypeError for an unrecognized backend type', () => {
    const selection = { backend: { type: 'bogus' }, data: () => [{ name: 'a' }] };
    expect(() => assignDepthJitter(selection, (d) => d.name)).toThrow(TypeError);
  });

  it('assigns every member a distinct z-offset (meshes backend)', () => {
    const rows = [{ name: 'B' }, { name: 'A' }, { name: 'C' }];
    const selection = meshesSelection(rows);
    const offsets = assignDepthJitter(selection, (d) => d.name);

    expect(offsets.size).toBe(3);
    const values = [...offsets.values()];
    expect(new Set(values).size).toBe(3); // all distinct

    // Symmetric around 0.
    expect(values.reduce((a, b) => a + b, 0)).toBeCloseTo(0);

    // Actually written onto each mesh's position.z.
    for (let i = 0; i < rows.length; i++) {
      const mesh = selection.backend.meshes[i];
      expect(mesh.getPosition().z).toBeCloseTo(offsets.get(rows[i].name));
    }
  });

  it('assigns every member a distinct z-offset (instanced backend)', () => {
    const rows = [{ name: 'B' }, { name: 'A' }, { name: 'C' }];
    const selection = instancedSelection(rows);
    const offsets = assignDepthJitter(selection, (d) => d.name);

    expect(offsets.size).toBe(3);
    for (let i = 0; i < rows.length; i++) {
      const p = selection.backend.object.getInstancePosition(i);
      expect(p.z).toBeCloseTo(offsets.get(rows[i].name));
    }
  });

  it('is deterministic regardless of the array order data() returns members in', () => {
    const selectionA = meshesSelection([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
    const selectionB = meshesSelection([{ name: 'C' }, { name: 'B' }, { name: 'A' }]);

    const offsetsA = assignDepthJitter(selectionA, (d) => d.name);
    const offsetsB = assignDepthJitter(selectionB, (d) => d.name);

    expect(offsetsA.get('A')).toBeCloseTo(offsetsB.get('A'));
    expect(offsetsA.get('B')).toBeCloseTo(offsetsB.get('B'));
    expect(offsetsA.get('C')).toBeCloseTo(offsetsB.get('C'));
  });

  it('respects a custom spacing', () => {
    const rows = [{ name: 'A' }, { name: 'B' }];
    const selection = meshesSelection(rows);
    const offsets = assignDepthJitter(selection, (d) => d.name, { spacing: 1 });
    const [a, b] = [...offsets.values()];
    expect(Math.abs(a - b)).toBeCloseTo(1);
  });

  it('breaks exact depth-coincidence between two rows that fully overlap in x/y — the z-fighting scenario', () => {
    // Two bars occupying the identical x/y footprint (as they briefly do
    // mid-swap in a bar-chart-race transition) — before assignDepthJitter,
    // both sit at z=0 (generator.bar()'s default), which is exactly the
    // z-fighting setup described in depthOffset.js's own doc comment.
    const rows = [{ name: 'Leader' }, { name: 'Runner-up' }];
    const selection = meshesSelection(rows);
    for (const mesh of selection.backend.meshes) mesh.setPosition(2, 0, 0);

    assignDepthJitter(selection, (d) => d.name);

    const [meshA, meshB] = selection.backend.meshes;
    expect(meshA.getPosition().z).not.toBeCloseTo(meshB.getPosition().z);
  });
});
