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

function makeInstanced(scene, data, count = data.length) {
  const object = new GraphInstancedObject({ scene, name: 'batch', geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial(), count });
  data.forEach((datum, i) => object.setInstanceUserData(i, datum));
  return object;
}

function meshesSelection(data) {
  const scene = new THREE.Scene();
  return new Selection({ type: 'meshes', meshes: makeMeshes(scene, data) });
}

function instancedSelection(data) {
  const scene = new THREE.Scene();
  const object = makeInstanced(scene, data);
  return { selection: new Selection({ type: 'instanced', object, indices: Uint32Array.from(data.map((_, i) => i)) }), object };
}

// ── position.* / rotation.* / scale.* ──────────────────────────────────────

describe('Selection.attr transform components', () => {
  it('meshes backend: position.x changes only x', () => {
    const scene = new THREE.Scene();
    const mesh = new GraphMesh({ scene, name: 'a', geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial() });
    mesh.setPosition(1, 2, 3).setUserData('datum', {});
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    selection.attr('position.x', 99);
    expect(mesh.getPosition().toArray()).toEqual([99, 2, 3]);
  });

  it('meshes backend: rotation.y changes only y (radians)', () => {
    const scene = new THREE.Scene();
    const mesh = new GraphMesh({ scene, name: 'a', geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial() });
    mesh.setRotation(new THREE.Euler(0.1, 0, 0.3)).setUserData('datum', {});
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    selection.attr('rotation.y', Math.PI / 4);
    const r = mesh.getRotation();
    expect(r.x).toBeCloseTo(0.1);
    expect(r.y).toBeCloseTo(Math.PI / 4);
    expect(r.z).toBeCloseTo(0.3);
  });

  it('meshes backend: scale.z changes only z', () => {
    const scene = new THREE.Scene();
    const mesh = new GraphMesh({ scene, name: 'a', geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial() });
    mesh.setScale(2, 3, 4).setUserData('datum', {});
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    selection.attr('scale.z', 99);
    expect(mesh.getScale().toArray()).toEqual([2, 3, 99]);
  });

  it('instanced backend: position.x changes only x, committing the matrix once for the whole batch', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{}, {}, {}]);
    object.setInstancePosition(0, 1, 2, 3).setInstancePosition(1, 4, 5, 6).setInstancePosition(2, 7, 8, 9);
    const commitSpy = vi.spyOn(object, 'commitMatrix');
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1, 2]) });

    selection.attr('position.x', (d, i) => i * 100);

    expect(object.getInstancePosition(0).toArray()).toEqual([0, 2, 3]);
    expect(object.getInstancePosition(1).toArray()).toEqual([100, 5, 6]);
    expect(object.getInstancePosition(2).toArray()).toEqual([200, 8, 9]);
    expect(commitSpy).toHaveBeenCalledTimes(1);
  });

  it('a per-datum accessor function receives (datum, index)', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{ x: 10 }, { x: 20 }]);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1]) });
    selection.attr('position.x', (d, i) => d.x + i);
    expect(object.getInstancePosition(0).x).toBe(10);
    expect(object.getInstancePosition(1).x).toBe(21);
  });

  it('throws TypeError for an unknown transform sub-property', () => {
    const selection = meshesSelection([{}]);
    expect(() => selection.attr('position.w', 1)).toThrow(TypeError);
  });

  it('throws TypeError when the resolved value is not a finite number', () => {
    const selection = meshesSelection([{}]);
    expect(() => selection.attr('position.x', 'nope')).toThrow(TypeError);
  });
});

// ── color ────────────────────────────────────────────────────────────────

describe('Selection.attr color', () => {
  it('meshes backend writes to the material color', () => {
    const scene = new THREE.Scene();
    const mesh = new GraphMesh({ scene, name: 'a', geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial() });
    mesh.setUserData('datum', {});
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    selection.attr('color', 'red');
    expect(mesh.material.color.getHex()).toBe(new THREE.Color('red').getHex());
  });

  it('instanced backend writes to instanceColor, committing once', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{}, {}]);
    const commitSpy = vi.spyOn(object, 'commitColor');
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1]) });
    selection.attr('color', 'blue');
    const readBack = new THREE.Color().fromBufferAttribute(object.three.instanceColor, 0);
    expect(readBack.getHex()).toBe(new THREE.Color('blue').getHex());
    expect(commitSpy).toHaveBeenCalledTimes(1);
  });

  it('meshes backend throws when the material has no color property', () => {
    const scene = new THREE.Scene();
    const mesh = new GraphMesh({ scene, name: 'a', geometry: new THREE.BoxGeometry(), material: new THREE.ShaderMaterial() });
    mesh.setUserData('datum', {});
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    expect(() => selection.attr('color', 'red')).toThrow(/has no 'color' property/);
  });
});

// ── opacity ──────────────────────────────────────────────────────────────

describe('Selection.attr opacity', () => {
  it('meshes backend sets material.opacity and forces transparent', () => {
    const scene = new THREE.Scene();
    const mesh = new GraphMesh({ scene, name: 'a', geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial() });
    mesh.setUserData('datum', {});
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    selection.attr('opacity', 0.5);
    expect(mesh.material.opacity).toBe(0.5);
    expect(mesh.material.transparent).toBe(true);
  });

  it('meshes backend sets opacity on every material of a multi-material mesh', () => {
    const scene = new THREE.Scene();
    const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    const mesh = new GraphMesh({ scene, name: 'a', geometry: new THREE.BoxGeometry(), material: materials });
    mesh.setUserData('datum', {});
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    selection.attr('opacity', 0.3);
    expect(materials[0].opacity).toBe(0.3);
    expect(materials[1].opacity).toBe(0.3);
  });

  it('instanced backend auto-defines an opacity attribute and writes it, committing once', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{}, {}]);
    expect(object.hasAttribute('opacity')).toBe(false);
    const commitSpy = vi.spyOn(object, 'commitAttribute');
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1]) });
    selection.attr('opacity', (d, i) => (i === 0 ? 0.25 : 0.75));
    expect(object.hasAttribute('opacity')).toBe(true);
    expect(object.three.geometry.getAttribute('opacity').getX(0)).toBeCloseTo(0.25);
    expect(object.three.geometry.getAttribute('opacity').getX(1)).toBeCloseTo(0.75);
    expect(commitSpy).toHaveBeenCalledTimes(1);
  });

  it('a second opacity attr call reuses the already-defined attribute', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{}]);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) });
    selection.attr('opacity', 0.5);
    expect(() => selection.attr('opacity', 0.9)).not.toThrow();
    expect(object.three.geometry.getAttribute('opacity').getX(0)).toBeCloseTo(0.9);
  });
});

// ── visible ──────────────────────────────────────────────────────────────

describe('Selection.attr visible', () => {
  it('meshes backend toggles THREE.Object3D.visible', () => {
    const scene = new THREE.Scene();
    const mesh = new GraphMesh({ scene, name: 'a', geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial() });
    mesh.setUserData('datum', {});
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    selection.attr('visible', false);
    expect(mesh.three.visible).toBe(false);
    selection.attr('visible', true);
    expect(mesh.three.visible).toBe(true);
  });

  it('instanced backend hides/shows via a fresh Selection each time, preserving the real transform', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{}]);
    object.setInstancePosition(0, 1, 2, 3);
    new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) }).attr('visible', false);

    const hidden = new THREE.Matrix4();
    object.three.getMatrixAt(0, hidden);
    expect(hidden.elements).toEqual(new Array(16).fill(0));

    // a brand-new Selection instance still restores correctly — visibility
    // state lives on the GraphInstancedObject, not the (ephemeral) Selection.
    new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) }).attr('visible', true);
    expect(object.getInstancePosition(0).toArray()).toEqual([1, 2, 3]);
  });

  it('throws TypeError for a non-boolean resolved value', () => {
    const selection = meshesSelection([{}]);
    expect(() => selection.attr('visible', 1)).toThrow(TypeError);
  });
});

// ── custom instance attributes ─────────────────────────────────────────────

describe('Selection.attr custom attributes', () => {
  it('instanced backend writes to a pre-defined custom attribute', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{}, {}]);
    object.defineAttribute('pulsePhase', 1);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1]) });
    selection.attr('pulsePhase', (d, i) => i * 0.5);
    expect(object.three.geometry.getAttribute('pulsePhase').getX(1)).toBeCloseTo(0.5);
  });

  it('instanced backend throws when the attribute was never defined', () => {
    const { selection } = instancedSelection([{}]);
    expect(() => selection.attr('undefinedAttr', 1)).toThrow(/call defineAttribute/);
  });

  it('meshes backend throws for any custom attribute name', () => {
    const selection = meshesSelection([{}]);
    expect(() => selection.attr('pulsePhase', 1)).toThrow(/only supported on the instanced backend/);
  });
});

// ── nearest-path suggestion (Prompt 179) ────────────────────────────────────

describe('Selection.attr unknown-path nearest-path suggestion', () => {
  it('meshes backend: a near-miss of a fixed-vocabulary name throws a "did you mean" error instead of the generic one', () => {
    const selection = meshesSelection([{}]);
    expect(() => selection.attr('colour', 'red')).toThrow(/unknown path 'colour'\. Did you mean 'color'\?/);
  });

  it('instanced backend: a near-miss on an undefined attribute throws a "did you mean" error, not the generic defineAttribute message', () => {
    const { selection } = instancedSelection([{}]);
    expect(() => selection.attr('colour', 1)).toThrow(/unknown path 'colour'\. Did you mean 'color'\?/);
  });

  it('instanced backend: a custom attribute name unrelated to the fixed vocabulary still gets the original defineAttribute error', () => {
    const { selection } = instancedSelection([{}]);
    expect(() => selection.attr('pulsePhase', 1)).toThrow(/call defineAttribute/);
  });

  it('instanced backend: an already-defined attribute close to a reserved name is left alone (real, established usage)', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{}]);
    object.defineAttribute('colour', 1); // deliberately named, pre-registered
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) });
    expect(() => selection.attr('colour', 1)).not.toThrow();
  });
});

// ── misc ─────────────────────────────────────────────────────────────────

describe('Selection.attr misc', () => {
  it('returns this for chaining', () => {
    const selection = meshesSelection([{}]);
    expect(selection.attr('opacity', 1)).toBe(selection);
  });

  it('throws TypeError for an empty path', () => {
    const selection = meshesSelection([{}]);
    expect(() => selection.attr('', 1)).toThrow(TypeError);
  });

  it("throws TypeError for a non-transform path with a sub-property (e.g. 'color.r')", () => {
    const selection = meshesSelection([{}]);
    expect(() => selection.attr('color.r', 1)).toThrow(/does not take a sub-property/);
  });

  it('is a no-op (no throw, no commit) on an empty selection', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{}]);
    const commitMatrixSpy = vi.spyOn(object, 'commitMatrix');
    const commitColorSpy = vi.spyOn(object, 'commitColor');
    const commitAttributeSpy = vi.spyOn(object, 'commitAttribute');
    object.defineAttribute('pulsePhase', 1);
    const selection = new Selection({ type: 'instanced', object, indices: new Uint32Array(0) });

    expect(() => selection.attr('position.x', 1)).not.toThrow();
    expect(() => selection.attr('color', 'red')).not.toThrow();
    expect(() => selection.attr('opacity', 1)).not.toThrow();
    expect(() => selection.attr('visible', true)).not.toThrow();
    expect(() => selection.attr('pulsePhase', 1)).not.toThrow();

    expect(commitMatrixSpy).not.toHaveBeenCalled();
    expect(commitColorSpy).not.toHaveBeenCalled();
    expect(commitAttributeSpy).not.toHaveBeenCalled();
    expect(object.hasAttribute('opacity')).toBe(false); // auto-define also skipped when empty
  });
});

// ── backend parity (Prompt 75's explicit requirement) ──────────────────────

describe('Selection.attr backend parity', () => {
  it('identical attr() calls on identical data produce identical transforms/colors on both backends', () => {
    const data = [
      { x: 1, y: 2, z: 3, color: 'crimson' },
      { x: -4, y: 5, z: -6, color: 'seagreen' },
      { x: 0, y: 0, z: 0, color: 'gold' },
    ];

    const meshScene = new THREE.Scene();
    const meshes = makeMeshes(meshScene, data);
    const meshSelection = new Selection({ type: 'meshes', meshes });

    const instScene = new THREE.Scene();
    const object = makeInstanced(instScene, data);
    const instSelection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1, 2]) });

    for (const selection of [meshSelection, instSelection]) {
      selection
        .attr('position.x', (d) => d.x)
        .attr('position.y', (d) => d.y)
        .attr('position.z', (d) => d.z)
        .attr('rotation.y', (d) => d.x * 0.1)
        .attr('scale.x', (d) => 1 + Math.abs(d.y) * 0.1)
        .attr('color', (d) => d.color);
    }

    for (let i = 0; i < data.length; i++) {
      const meshPos = meshes[i].getPosition();
      const instPos = object.getInstancePosition(i);
      expect(instPos.toArray()).toEqual(meshPos.toArray());

      const meshRot = meshes[i].getRotation();
      const instRot = object.getInstanceRotation(i);
      expect(instRot.y).toBeCloseTo(meshRot.y, 5); // instanced path round-trips through a Float32Array matrix

      const meshScale = meshes[i].getScale();
      const instScale = object.getInstanceScale(i);
      expect(instScale.x).toBeCloseTo(meshScale.x, 5);

      const meshColor = meshes[i].material.color;
      const instColor = new THREE.Color().fromBufferAttribute(object.three.instanceColor, i);
      expect(instColor.getHex()).toBe(meshColor.getHex());
    }
  });
});
