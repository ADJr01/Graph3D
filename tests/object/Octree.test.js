import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Octree } from '../../src/object/Octree.js';

function makeOctree(options = {}) {
  return new Octree({
    bounds: new THREE.Box3(new THREE.Vector3(-10, -10, -10), new THREE.Vector3(10, 10, 10)),
    ...options,
  });
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('Octree constructor', () => {
  it('throws TypeError when bounds is not a THREE.Box3', () => {
    expect(() => new Octree({ bounds: {} })).toThrow(TypeError);
  });

  it('throws TypeError for a non-positive-integer maxItemsPerNode', () => {
    expect(() => makeOctree({ maxItemsPerNode: 0 })).toThrow(TypeError);
  });

  it('throws TypeError for a non-positive-integer maxDepth', () => {
    expect(() => makeOctree({ maxDepth: 0 })).toThrow(TypeError);
  });
});

// ── insert / remove ────────────────────────────────────────────────────────────

describe('Octree.insert / remove', () => {
  it('throws TypeError for an invalid id', () => {
    const octree = makeOctree();
    expect(() => octree.insert({}, new THREE.Vector3())).toThrow(TypeError);
  });

  it('throws TypeError for a non-Vector3 position', () => {
    const octree = makeOctree();
    expect(() => octree.insert(1, [0, 0, 0])).toThrow(TypeError);
  });

  it('throws TypeError for an invalid radius', () => {
    const octree = makeOctree();
    expect(() => octree.insert(1, new THREE.Vector3(), -1)).toThrow(TypeError);
  });

  it('throws Error when inserting a duplicate id', () => {
    const octree = makeOctree();
    octree.insert(1, new THREE.Vector3(0, 0, 0));
    expect(() => octree.insert(1, new THREE.Vector3(1, 1, 1))).toThrow(/already exists/);
  });

  it('remove() throws Error for an id that was never inserted', () => {
    const octree = makeOctree();
    expect(() => octree.remove('missing')).toThrow(/no item with id/);
  });

  it('remove() makes the item unreachable by subsequent queries', () => {
    const octree = makeOctree();
    octree.insert(1, new THREE.Vector3(1, 1, 1));
    octree.remove(1);
    expect(octree.queryAABB(new THREE.Box3(new THREE.Vector3(-10, -10, -10), new THREE.Vector3(10, 10, 10)))).toEqual([]);
  });

  it('an id can be re-inserted after being removed', () => {
    const octree = makeOctree();
    octree.insert(1, new THREE.Vector3(1, 1, 1));
    octree.remove(1);
    expect(() => octree.insert(1, new THREE.Vector3(2, 2, 2))).not.toThrow();
  });
});

// ── Queries ────────────────────────────────────────────────────────────────────

describe('Octree queries', () => {
  it('queryAABB returns ids whose bounding sphere intersects the box', () => {
    const octree = makeOctree();
    octree.insert('inside', new THREE.Vector3(1, 1, 1));
    octree.insert('outside', new THREE.Vector3(9, 9, 9));

    const hits = octree.queryAABB(new THREE.Box3(new THREE.Vector3(-2, -2, -2), new THREE.Vector3(2, 2, 2)));
    expect(hits).toEqual(['inside']);
  });

  it('queryRadius returns ids within range, accounting for item radius', () => {
    const octree = makeOctree();
    octree.insert('near', new THREE.Vector3(3, 0, 0));
    octree.insert('far', new THREE.Vector3(9, 0, 0));

    const hits = octree.queryRadius(new THREE.Vector3(0, 0, 0), 5);
    expect(hits).toEqual(['near']);
  });

  it('queryRay returns ids whose bounding sphere the ray crosses', () => {
    const octree = makeOctree();
    octree.insert('hit', new THREE.Vector3(0, 0, 0), 1);
    octree.insert('miss', new THREE.Vector3(5, 5, 5), 0.1);

    const ray = new THREE.Ray(new THREE.Vector3(0, 0, -10), new THREE.Vector3(0, 0, 1));
    expect(octree.queryRay(ray)).toEqual(['hit']);
  });

  it('queryFrustum returns ids whose bounding sphere is inside the frustum', () => {
    const octree = makeOctree();
    octree.insert('visible', new THREE.Vector3(0, 0, 0));
    octree.insert('behind', new THREE.Vector3(0, 0, 1000));

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 20);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );

    expect(octree.queryFrustum(frustum)).toEqual(['visible']);
  });

  it('throws TypeError for a mistyped query argument', () => {
    const octree = makeOctree();
    expect(() => octree.queryAABB({})).toThrow(TypeError);
    expect(() => octree.queryRadius({}, 1)).toThrow(TypeError);
    expect(() => octree.queryRadius(new THREE.Vector3(), -1)).toThrow(TypeError);
    expect(() => octree.queryRay({})).toThrow(TypeError);
    expect(() => octree.queryFrustum({})).toThrow(TypeError);
  });
});

// ── Subdivision ────────────────────────────────────────────────────────────────

describe('Octree subdivision', () => {
  it('still finds every item correctly after subdividing past maxItemsPerNode', () => {
    const octree = makeOctree({ maxItemsPerNode: 2 });
    const positions = [
      [-5, -5, -5], [5, -5, -5], [-5, 5, -5], [5, 5, -5],
      [-5, -5, 5],  [5, -5, 5],  [-5, 5, 5],  [5, 5, 5],
      [0, 0, 0],
    ];
    positions.forEach((p, i) => octree.insert(i, new THREE.Vector3(...p)));

    const all = octree.queryAABB(new THREE.Box3(new THREE.Vector3(-10, -10, -10), new THREE.Vector3(10, 10, 10)));
    expect(new Set(all)).toEqual(new Set(positions.map((_, i) => i)));
  });

  it('does not miss a boundary-straddling item queried from a neighboring octant', () => {
    // maxItemsPerNode: 1 forces an immediate split at the root.
    const octree = makeOctree({ maxItemsPerNode: 1 });
    // Stored in the low-x octant (x < 0 relative to the root's center), but its
    // radius reaches well past x=0 into the high-x octant.
    octree.insert('straddler', new THREE.Vector3(-0.5, -5, -5), 2);
    octree.insert('other', new THREE.Vector3(5, 5, 5));

    // A tiny query sphere entirely on the high-x side — without expanding a
    // node's pruning bounds by its maxRadius, this would be pruned away.
    const hits = octree.queryRadius(new THREE.Vector3(1, -5, -5), 0.1);
    expect(hits).toEqual(['straddler']);
  });
});
