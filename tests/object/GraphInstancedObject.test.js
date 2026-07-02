import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { GraphInstancedObject } from '../../src/object/GraphInstancedObject.js';
import { loop } from '../../src/core/Graph3DLoop.js';

const ZERO_MATRIX_ELEMENTS = new Array(16).fill(0);

function makeInstanced({ scene = new THREE.Scene(), name = 'a', count = 10 } = {}) {
  return new GraphInstancedObject({
    scene,
    name,
    geometry: new THREE.BoxGeometry(),
    material: new THREE.MeshBasicMaterial(),
    count,
  });
}

function makeCamera({ position = [0, 0, 10], lookAt = [0, 0, 0] } = {}) {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(...position);
  camera.lookAt(...lookAt);
  camera.updateProjectionMatrix();
  return camera;
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('GraphInstancedObject constructor', () => {
  it('throws TypeError when geometry is not a THREE.BufferGeometry', () => {
    expect(
      () =>
        new GraphInstancedObject({
          scene: new THREE.Scene(),
          name: 'a',
          geometry: {},
          material: new THREE.MeshBasicMaterial(),
          count: 1,
        }),
    ).toThrow(TypeError);
  });

  it('throws TypeError when material is not a THREE.Material or array of them', () => {
    expect(
      () =>
        new GraphInstancedObject({
          scene: new THREE.Scene(),
          name: 'a',
          geometry: new THREE.BoxGeometry(),
          material: {},
          count: 1,
        }),
    ).toThrow(TypeError);
  });

  it('accepts an array of materials', () => {
    const obj = new GraphInstancedObject({
      scene: new THREE.Scene(),
      name: 'a',
      geometry: new THREE.BoxGeometry(),
      material: [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()],
      count: 1,
    });
    expect(obj.three).toBeInstanceOf(THREE.InstancedMesh);
  });

  it('throws TypeError when count is not a positive integer', () => {
    expect(() => makeInstanced({ count: 0 })).toThrow(TypeError);
    expect(() => makeInstanced({ count: 1.5 })).toThrow(TypeError);
  });

  it('wraps a THREE.InstancedMesh and adds it to the scene', () => {
    const scene = new THREE.Scene();
    const obj = makeInstanced({ scene, count: 100 });
    expect(obj.three).toBeInstanceOf(THREE.InstancedMesh);
    expect(obj.three.count).toBe(100);
    expect(scene.children).toContain(obj.three);
  });

  it('propagates an invalid octreeBounds as a TypeError', () => {
    expect(() =>
      new GraphInstancedObject({
        scene: new THREE.Scene(),
        name: 'a',
        geometry: new THREE.BoxGeometry(),
        material: new THREE.MeshBasicMaterial(),
        count: 1,
        octreeBounds: {},
      }),
    ).toThrow(TypeError);
  });
});

// ── material getter ────────────────────────────────────────────────────────────

describe('GraphInstancedObject.material', () => {
  it('returns the underlying material', () => {
    const material = new THREE.MeshBasicMaterial();
    const obj = new GraphInstancedObject({
      scene: new THREE.Scene(),
      name: 'a',
      geometry: new THREE.BoxGeometry(),
      material,
      count: 1,
    });
    expect(obj.material).toBe(material);
  });

  it('throws after dispose', () => {
    const obj = makeInstanced();
    obj.dispose();
    expect(() => obj.material).toThrow(/GraphInstancedObject\.material: object 'a' has been disposed/);
  });
});

// ── capacity / isInstanced ───────────────────────────────────────────────────

describe('GraphInstancedObject.capacity', () => {
  it('returns the count passed to the constructor', () => {
    const obj = makeInstanced({ count: 42 });
    expect(obj.capacity).toBe(42);
  });

  it('does not change when setInstanceCount renders fewer instances', () => {
    const obj = makeInstanced({ count: 42 });
    obj.setInstanceCount(10);
    expect(obj.capacity).toBe(42);
  });
});

describe('GraphInstancedObject.isInstanced', () => {
  it('is true — GraphInstancedObject supports indexed instance access', () => {
    expect(makeInstanced().isInstanced).toBe(true);
  });
});

// ── setInstanceCount ───────────────────────────────────────────────────────────

describe('GraphInstancedObject.setInstanceCount', () => {
  it('sets the rendered instance count', () => {
    const obj = makeInstanced({ count: 10 });
    obj.setInstanceCount(3);
    expect(obj.three.count).toBe(3);
  });

  it('throws RangeError when n exceeds capacity', () => {
    const obj = makeInstanced({ count: 10 });
    expect(() => obj.setInstanceCount(11)).toThrow(RangeError);
  });

  it('throws TypeError for a negative or non-integer n', () => {
    const obj = makeInstanced({ count: 10 });
    expect(() => obj.setInstanceCount(-1)).toThrow(TypeError);
    expect(() => obj.setInstanceCount(1.5)).toThrow(TypeError);
  });
});

// ── Per-instance transform ────────────────────────────────────────────────────

describe('GraphInstancedObject transform setters', () => {
  it('setInstanceMatrix writes the matrix directly', () => {
    const obj = makeInstanced();
    const m = new THREE.Matrix4().makeTranslation(1, 2, 3);
    obj.setInstanceMatrix(0, m);

    const readBack = new THREE.Matrix4();
    obj.three.getMatrixAt(0, readBack);
    expect(readBack.elements).toEqual(m.elements);
  });

  it('setInstanceMatrix throws TypeError for a non-Matrix4', () => {
    const obj = makeInstanced();
    expect(() => obj.setInstanceMatrix(0, {})).toThrow(TypeError);
  });

  it('setInstancePosition preserves prior scale and rotation', () => {
    const obj = makeInstanced();
    obj.setInstanceScale(0, 2, 3, 4);
    obj.setInstanceRotation(0, new THREE.Euler(0, Math.PI / 2, 0));
    obj.setInstancePosition(0, 5, 6, 7);

    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const readBack = new THREE.Matrix4();
    obj.three.getMatrixAt(0, readBack);
    readBack.decompose(position, quaternion, scale);

    expect(position.toArray()).toEqual([5, 6, 7]);
    expect(scale.toArray()).toEqual([2, 3, 4]);
    expect(quaternion.equals(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)))).toBe(
      true,
    );
  });

  it('setInstancePosition throws TypeError for non-finite values', () => {
    const obj = makeInstanced();
    expect(() => obj.setInstancePosition(0, NaN, 0, 0)).toThrow(TypeError);
  });

  it('setInstanceRotation throws TypeError for a non-Euler', () => {
    const obj = makeInstanced();
    expect(() => obj.setInstanceRotation(0, {})).toThrow(TypeError);
  });

  it('setInstanceScale throws TypeError for non-finite values', () => {
    const obj = makeInstanced();
    expect(() => obj.setInstanceScale(0, 1, Infinity, 1)).toThrow(TypeError);
  });

  it('all transform setters throw RangeError for an out-of-bounds index', () => {
    const obj = makeInstanced({ count: 5 });
    expect(() => obj.setInstanceMatrix(5, new THREE.Matrix4())).toThrow(RangeError);
    expect(() => obj.setInstancePosition(-1, 0, 0, 0)).toThrow(RangeError);
    expect(() => obj.setInstanceRotation(5, new THREE.Euler())).toThrow(RangeError);
    expect(() => obj.setInstanceScale(5, 1, 1, 1)).toThrow(RangeError);
  });
});

// ── Per-instance color ─────────────────────────────────────────────────────────

describe('GraphInstancedObject.setInstanceColor', () => {
  it('accepts a THREE.Color, a hex number, and a CSS string', () => {
    const obj = makeInstanced();
    obj.setInstanceColor(0, new THREE.Color(0x112233));
    obj.setInstanceColor(1, 0xff0000);
    obj.setInstanceColor(2, 'crimson');

    const readBack = new THREE.Color();
    obj.three.getColorAt(1, readBack);
    expect(readBack.getHex()).toBe(0xff0000);
  });

  it('creates the instanceColor InstancedBufferAttribute on first use', () => {
    const obj = makeInstanced();
    expect(obj.three.instanceColor).toBeNull();
    obj.setInstanceColor(0, 'white');
    expect(obj.three.instanceColor).toBeInstanceOf(THREE.InstancedBufferAttribute);
  });

  it('throws RangeError for an out-of-bounds index', () => {
    const obj = makeInstanced({ count: 5 });
    expect(() => obj.setInstanceColor(5, 'white')).toThrow(RangeError);
  });
});

// ── instanceId ─────────────────────────────────────────────────────────────────

describe('GraphInstancedObject instanceId', () => {
  it('is created with sequential ids 0..count-1', () => {
    const obj = makeInstanced({ count: 4 });
    const attribute = obj.three.geometry.getAttribute('instanceId');
    expect(attribute).toBeInstanceOf(THREE.InstancedBufferAttribute);
    expect(Array.from(attribute.array)).toEqual([0, 1, 2, 3]);
  });

  it('is reserved — defineAttribute refuses to redefine it', () => {
    const obj = makeInstanced();
    expect(() => obj.defineAttribute('instanceId', 1)).toThrow(/already exists/);
  });
});

// ── Picking ────────────────────────────────────────────────────────────────────

describe('GraphInstancedObject.pick', () => {
  function makePickable(count = 3) {
    const obj = makeInstanced({ count });
    for (let i = 0; i < count; i++) {
      obj.setInstanceMatrix(i, new THREE.Matrix4().makeTranslation(i * 3, 0, 0));
    }
    obj.commitMatrix();
    return obj;
  }

  it('returns the instance index of the closest hit', () => {
    const obj = makePickable();
    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(3, 0, 5), new THREE.Vector3(0, 0, -1));
    expect(obj.pick(raycaster)).toBe(1);
  });

  it('returns null on a miss', () => {
    const obj = makePickable();
    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(1000, 1000, 1000), new THREE.Vector3(0, 0, -1));
    expect(obj.pick(raycaster)).toBeNull();
  });

  it('does not hit-test instances beyond the active setInstanceCount', () => {
    const obj = makePickable();
    obj.setInstanceCount(1);
    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(3, 0, 5), new THREE.Vector3(0, 0, -1)); // aimed at instance 1
    expect(obj.pick(raycaster)).toBeNull();
  });

  it('throws TypeError for a non-Raycaster', () => {
    const obj = makeInstanced();
    expect(() => obj.pick({})).toThrow(TypeError);
  });

  it('finds an instance at its new position after being moved (octree updated incrementally)', () => {
    const obj = makePickable();
    obj.setInstanceMatrix(1, new THREE.Matrix4().makeTranslation(50, 0, 0));
    obj.commitMatrix();

    const oldSpot = new THREE.Raycaster();
    oldSpot.set(new THREE.Vector3(3, 0, 5), new THREE.Vector3(0, 0, -1));
    expect(obj.pick(oldSpot)).toBeNull();

    const newSpot = new THREE.Raycaster();
    newSpot.set(new THREE.Vector3(50, 0, 5), new THREE.Vector3(0, 0, -1));
    expect(obj.pick(newSpot)).toBe(1);
  });

  it('never-positioned instances (default degenerate matrix) are not pickable', () => {
    const obj = makeInstanced({ count: 2 });
    obj.setInstanceMatrix(0, new THREE.Matrix4().makeTranslation(0, 0, 0));
    obj.commitMatrix();
    // Instance 1 was never given a transform — it has no octree entry and
    // should never surface as a pick candidate, however the ray is aimed.
    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
    expect(obj.pick(raycaster)).toBe(0);
  });
});

// ── Frustum culling ──────────────────────────────────────────────────────────

describe('GraphInstancedObject frustum culling', () => {
  it('throws TypeError for a non-Camera', () => {
    const obj = makeInstanced();
    expect(() => obj.enableInstanceCulling({ camera: {} })).toThrow(TypeError);
  });

  it('throws TypeError for a non-positive-integer everyNthFrame', () => {
    const obj = makeInstanced();
    const camera = makeCamera();
    expect(() => obj.enableInstanceCulling({ camera, everyNthFrame: 0 })).toThrow(TypeError);
    expect(() => obj.enableInstanceCulling({ camera, everyNthFrame: 1.5 })).toThrow(TypeError);
  });

  it('registers a callback with the shared loop and removes it on disable', () => {
    const obj = makeInstanced({ count: 1 });
    const addSpy = vi.spyOn(loop, 'add');
    const removeSpy = vi.spyOn(loop, 'remove');

    obj.enableInstanceCulling({ camera: makeCamera() });
    expect(addSpy).toHaveBeenCalledOnce();

    obj.disableInstanceCulling();
    expect(removeSpy).toHaveBeenCalledWith(addSpy.mock.calls[0][0]);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('zeroes the matrix of an out-of-frustum instance and preserves an in-frustum one', () => {
    const obj = makeInstanced({ count: 2 });
    obj.setInstanceMatrix(0, new THREE.Matrix4());
    obj.setInstanceMatrix(1, new THREE.Matrix4().makeTranslation(1000, 0, 0));
    obj.commitMatrix();

    obj.enableInstanceCulling({ camera: makeCamera() });

    const m0 = new THREE.Matrix4();
    const m1 = new THREE.Matrix4();
    obj.three.getMatrixAt(0, m0);
    obj.three.getMatrixAt(1, m1);
    expect(m0.equals(new THREE.Matrix4())).toBe(true);
    expect(m1.elements).toEqual(ZERO_MATRIX_ELEMENTS);
  });

  it('reflects a visible instance moving after culling is already enabled, without re-enabling', () => {
    const obj = makeInstanced({ count: 1 });
    obj.setInstanceMatrix(0, new THREE.Matrix4()); // at the origin — inside the frustum
    obj.commitMatrix();

    obj.enableInstanceCulling({ camera: makeCamera() });
    const readBack = new THREE.Matrix4();
    obj.three.getMatrixAt(0, readBack);
    expect(readBack.elements).not.toEqual(ZERO_MATRIX_ELEMENTS); // visible

    // Move it far outside the frustum while culling is still enabled — no
    // disableInstanceCulling()/enableInstanceCulling() round-trip.
    obj.setInstanceMatrix(0, new THREE.Matrix4().makeTranslation(1000, 0, 0));
    obj.updateCulling();

    obj.three.getMatrixAt(0, readBack);
    expect(readBack.elements).toEqual(ZERO_MATRIX_ELEMENTS); // now correctly culled
  });

  it('throttles recompute to every Nth call of updateCulling()', () => {
    const obj = makeInstanced({ count: 1 });
    obj.setInstanceMatrix(0, new THREE.Matrix4());
    obj.commitMatrix();
    const camera = makeCamera();

    obj.enableInstanceCulling({ camera, everyNthFrame: 3 });
    const readBack = new THREE.Matrix4();
    obj.three.getMatrixAt(0, readBack);
    expect(readBack.elements).not.toEqual(ZERO_MATRIX_ELEMENTS);

    // Move the camera far away so the (unchanged) precomputed bounding sphere
    // at the origin now falls outside the frustum — isolates whether a given
    // updateCulling() call actually recomputed.
    camera.position.set(10000, 0, 10);
    camera.lookAt(10000, 0, 0);
    camera.updateProjectionMatrix();

    obj.updateCulling(); // frame 1 of 3 — no recompute yet
    obj.three.getMatrixAt(0, readBack);
    expect(readBack.elements).not.toEqual(ZERO_MATRIX_ELEMENTS);

    obj.updateCulling(); // frame 2 of 3 — no recompute yet
    obj.three.getMatrixAt(0, readBack);
    expect(readBack.elements).not.toEqual(ZERO_MATRIX_ELEMENTS);

    obj.updateCulling(); // frame 3 of 3 — recomputes now
    obj.three.getMatrixAt(0, readBack);
    expect(readBack.elements).toEqual(ZERO_MATRIX_ELEMENTS);
  });

  it('updateCulling is a no-op when culling was never enabled', () => {
    const obj = makeInstanced();
    expect(() => obj.updateCulling()).not.toThrow();
  });

  it('disableInstanceCulling restores the real transform of a culled instance', () => {
    const obj = makeInstanced({ count: 2 });
    const translation = new THREE.Matrix4().makeTranslation(1000, 0, 0);
    obj.setInstanceMatrix(0, new THREE.Matrix4());
    obj.setInstanceMatrix(1, translation);
    obj.commitMatrix();

    obj.enableInstanceCulling({ camera: makeCamera() });
    obj.disableInstanceCulling();

    const readBack = new THREE.Matrix4();
    obj.three.getMatrixAt(1, readBack);
    expect(readBack.elements).toEqual(translation.elements);
  });

  it('disableInstanceCulling is a no-op when culling was never enabled', () => {
    const obj = makeInstanced();
    expect(() => obj.disableInstanceCulling()).not.toThrow();
  });

  it('re-enabling recaptures the precompute from the current state', () => {
    const obj = makeInstanced({ count: 1 });
    obj.setInstanceMatrix(0, new THREE.Matrix4().makeTranslation(1000, 0, 0));
    obj.commitMatrix();
    const camera = makeCamera();

    obj.enableInstanceCulling({ camera });
    let readBack = new THREE.Matrix4();
    obj.three.getMatrixAt(0, readBack);
    expect(readBack.elements).toEqual(ZERO_MATRIX_ELEMENTS); // culled — far outside frustum

    obj.disableInstanceCulling();
    obj.setInstanceMatrix(0, new THREE.Matrix4()); // move back to origin
    obj.commitMatrix();

    obj.enableInstanceCulling({ camera }); // re-precompute at the new position
    readBack = new THREE.Matrix4();
    obj.three.getMatrixAt(0, readBack);
    expect(readBack.equals(new THREE.Matrix4())).toBe(true); // visible now
  });

  it('dispose() unregisters the culling loop callback', () => {
    const obj = makeInstanced({ count: 1 });
    const removeSpy = vi.spyOn(loop, 'remove');

    obj.enableInstanceCulling({ camera: makeCamera() });
    obj.dispose();

    expect(removeSpy).toHaveBeenCalled();
    removeSpy.mockRestore();
  });
});

// ── Custom per-instance attributes ────────────────────────────────────────────

describe('GraphInstancedObject.defineAttribute / setInstanceAttribute', () => {
  it('defines a scalar attribute and writes/reads it via the geometry', () => {
    const obj = makeInstanced({ count: 5 });
    obj.defineAttribute('pulsePhase', 1);
    obj.setInstanceAttribute(2, 'pulsePhase', 0.75);

    const attribute = obj.three.geometry.getAttribute('pulsePhase');
    expect(attribute).toBeInstanceOf(THREE.InstancedBufferAttribute);
    expect(attribute.getX(2)).toBeCloseTo(0.75);
  });

  it('defines a vec3 attribute and writes/reads it', () => {
    const obj = makeInstanced({ count: 5 });
    obj.defineAttribute('categoryColor', 3);
    obj.setInstanceAttribute(1, 'categoryColor', [0.1, 0.2, 0.3]);

    const attribute = obj.three.geometry.getAttribute('categoryColor');
    expect(attribute.getX(1)).toBeCloseTo(0.1);
    expect(attribute.getY(1)).toBeCloseTo(0.2);
    expect(attribute.getZ(1)).toBeCloseTo(0.3);
  });

  it('throws TypeError for a non-string or empty name', () => {
    const obj = makeInstanced();
    expect(() => obj.defineAttribute('', 1)).toThrow(TypeError);
  });

  it('throws TypeError for an itemSize outside [1, 4]', () => {
    const obj = makeInstanced();
    expect(() => obj.defineAttribute('a', 0)).toThrow(TypeError);
    expect(() => obj.defineAttribute('a', 5)).toThrow(TypeError);
  });

  it('throws when the name collides with a built-in geometry attribute', () => {
    const obj = makeInstanced();
    expect(() => obj.defineAttribute('position', 3)).toThrow(/already exists/);
  });

  it('throws when the name collides with instanceMatrix/instanceColor', () => {
    const obj = makeInstanced();
    expect(() => obj.defineAttribute('instanceMatrix', 1)).toThrow(/already exists/);
    expect(() => obj.defineAttribute('instanceColor', 1)).toThrow(/already exists/);
  });

  it('throws when defining the same custom attribute twice', () => {
    const obj = makeInstanced();
    obj.defineAttribute('pulsePhase', 1);
    expect(() => obj.defineAttribute('pulsePhase', 1)).toThrow(/already exists/);
  });

  it('setInstanceAttribute throws when the attribute was never defined', () => {
    const obj = makeInstanced();
    expect(() => obj.setInstanceAttribute(0, 'missing', 1)).toThrow(/call defineAttribute/);
  });

  it('setInstanceAttribute throws TypeError for a non-finite scalar value', () => {
    const obj = makeInstanced();
    obj.defineAttribute('pulsePhase', 1);
    expect(() => obj.setInstanceAttribute(0, 'pulsePhase', NaN)).toThrow(TypeError);
  });

  it('setInstanceAttribute throws TypeError when the array length does not match itemSize', () => {
    const obj = makeInstanced();
    obj.defineAttribute('categoryColor', 3);
    expect(() => obj.setInstanceAttribute(0, 'categoryColor', [1, 2])).toThrow(TypeError);
  });

  it('setInstanceAttribute throws RangeError for an out-of-bounds index', () => {
    const obj = makeInstanced({ count: 5 });
    obj.defineAttribute('pulsePhase', 1);
    expect(() => obj.setInstanceAttribute(5, 'pulsePhase', 1)).toThrow(RangeError);
  });

  it('commitAttribute bumps the attribute version', () => {
    const obj = makeInstanced();
    obj.defineAttribute('pulsePhase', 1);
    const versionBefore = obj.three.geometry.getAttribute('pulsePhase').version;
    obj.commitAttribute('pulsePhase');
    expect(obj.three.geometry.getAttribute('pulsePhase').version).toBe(versionBefore + 1);
  });

  it('commitAttribute throws when the attribute was never defined', () => {
    const obj = makeInstanced();
    expect(() => obj.commitAttribute('missing')).toThrow(/call defineAttribute/);
  });
});

// ── Per-instance user data ────────────────────────────────────────────────────

describe('GraphInstancedObject instance user data', () => {
  it('stores and retrieves a datum per index', () => {
    const obj = makeInstanced();
    obj.setInstanceUserData(0, { category: 'Q1' });
    expect(obj.getInstanceUserData(0)).toEqual({ category: 'Q1' });
  });

  it('returns undefined for an index never set', () => {
    const obj = makeInstanced();
    expect(obj.getInstanceUserData(3)).toBeUndefined();
  });

  it('throws RangeError for an out-of-bounds index', () => {
    const obj = makeInstanced({ count: 5 });
    expect(() => obj.setInstanceUserData(5, {})).toThrow(RangeError);
    expect(() => obj.getInstanceUserData(5)).toThrow(RangeError);
  });
});

// ── Commit ─────────────────────────────────────────────────────────────────────

describe('GraphInstancedObject commit', () => {
  it('commitMatrix flags instanceMatrix.needsUpdate', () => {
    // needsUpdate has no getter in THREE — setting it true bumps .version instead.
    const obj = makeInstanced();
    const versionBefore = obj.three.instanceMatrix.version;
    obj.commitMatrix();
    expect(obj.three.instanceMatrix.version).toBe(versionBefore + 1);
  });

  it('commitColor flags instanceColor.needsUpdate once it exists', () => {
    const obj = makeInstanced();
    expect(() => obj.commitColor()).not.toThrow();

    obj.setInstanceColor(0, 'white');
    const versionBefore = obj.three.instanceColor.version;
    obj.commitColor();
    expect(obj.three.instanceColor.version).toBe(versionBefore + 1);
  });
});

// ── Disposal ───────────────────────────────────────────────────────────────────

describe('GraphInstancedObject disposal', () => {
  it('removes from the scene and is idempotent (see integration test for GPU-resource release)', () => {
    const scene = new THREE.Scene();
    const obj = makeInstanced({ scene });

    obj.dispose();

    expect(scene.children).not.toContain(obj.three);
    expect(() => obj.dispose()).not.toThrow();
  });

  it('all public methods throw after dispose', () => {
    const obj = makeInstanced();
    obj.dispose();
    const pattern = /GraphInstancedObject\.\w+: object 'a' has been disposed/;
    expect(() => obj.setInstanceCount(1)).toThrow(pattern);
    expect(() => obj.setInstanceMatrix(0, new THREE.Matrix4())).toThrow(pattern);
    expect(() => obj.setInstancePosition(0, 0, 0, 0)).toThrow(pattern);
    expect(() => obj.setInstanceRotation(0, new THREE.Euler())).toThrow(pattern);
    expect(() => obj.setInstanceScale(0, 1, 1, 1)).toThrow(pattern);
    expect(() => obj.setInstanceColor(0, 'white')).toThrow(pattern);
    expect(() => obj.setInstanceUserData(0, {})).toThrow(pattern);
    expect(() => obj.getInstanceUserData(0)).toThrow(pattern);
    expect(() => obj.defineAttribute('pulsePhase', 1)).toThrow(pattern);
    expect(() => obj.setInstanceAttribute(0, 'pulsePhase', 1)).toThrow(pattern);
    expect(() => obj.commitMatrix()).toThrow(pattern);
    expect(() => obj.commitColor()).toThrow(pattern);
    expect(() => obj.commitAttribute('pulsePhase')).toThrow(pattern);
    expect(() => obj.pick(new THREE.Raycaster())).toThrow(pattern);
    expect(() => obj.enableInstanceCulling({ camera: makeCamera() })).toThrow(pattern);
    expect(() => obj.disableInstanceCulling()).toThrow(pattern);
    expect(() => obj.updateCulling()).toThrow(pattern);
    expect(() => obj.material).toThrow(pattern);
  });
});
