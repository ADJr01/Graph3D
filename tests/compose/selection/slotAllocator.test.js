import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GraphInstancedObject } from '../../../src/object/GraphInstancedObject.js';
import { allocateSlots, freeSlots } from '../../../src/compose/selection/slotAllocator.js';

function makeInstanced(count = 4) {
  return new GraphInstancedObject({
    scene: new THREE.Scene(),
    name: 'batch',
    geometry: new THREE.BoxGeometry(),
    material: new THREE.MeshBasicMaterial(),
    count,
  });
}

describe('allocateSlots', () => {
  it('hands out fresh, ascending indices when the free-list is empty', () => {
    // A freshly constructed object's initial `count` may already be
    // legitimately in use by the Selection the join started from —
    // setInstanceCount(0) marks "nothing here is used yet" explicitly.
    const object = makeInstanced(8);
    object.setInstanceCount(0);
    expect(Array.from(allocateSlots(object, 3))).toEqual([0, 1, 2]);
  });

  it("a freshly constructed object's initial count is treated as already in use — allocation starts past it", () => {
    const object = makeInstanced(8);
    expect(Array.from(allocateSlots(object, 2))).toEqual([8, 9]);
  });

  it('grows object.count to cover every allocated fresh index, never shrinking it', () => {
    const object = makeInstanced(2);
    allocateSlots(object, 5);
    expect(object.count).toBeGreaterThanOrEqual(5);
  });

  it('grows capacity (pow2) when fresh allocation exceeds it', () => {
    const object = makeInstanced(2);
    allocateSlots(object, 5);
    expect(object.capacity).toBe(8); // ceilPowerOfTwo(5)
  });

  it('recycles freed indices before handing out fresh ones', () => {
    const object = makeInstanced(8);
    object.setInstanceCount(0);
    const first = allocateSlots(object, 3); // [0, 1, 2]
    freeSlots(object, [first[1]]); // free index 1
    const second = allocateSlots(object, 1);
    expect(second[0]).toBe(first[1]);
  });

  it('a recycled index is visible again, and re-hiding it after reuse captures the NEW occupant\'s transform, not the freed one\'s', () => {
    const object = makeInstanced(8);
    const [index] = allocateSlots(object, 1);
    object.setInstancePosition(index, 5, 5, 5);
    freeSlots(object, [index]);
    allocateSlots(object, 1); // recycles `index`, restoring it visible
    object.setInstancePosition(index, 9, 9, 9); // the new occupant's real transform

    object.setInstanceVisible(index, false); // must capture (9,9,9), not the stale (5,5,5)
    object.setInstanceVisible(index, true);

    expect(object.getInstancePosition(index).toArray()).toEqual([9, 9, 9]);
  });

  it('two independent GraphInstancedObjects never share a free-list', () => {
    const a = makeInstanced(4);
    const b = makeInstanced(4);
    a.setInstanceCount(0);
    b.setInstanceCount(0);
    freeSlots(a, [0]);
    expect(Array.from(allocateSlots(b, 1))).toEqual([0]); // fresh, not recycled from `a`
  });
});

describe('freeSlots', () => {
  it('hides every freed instance', () => {
    const object = makeInstanced(4);
    allocateSlots(object, 2);
    object.setInstancePosition(0, 1, 1, 1);
    freeSlots(object, [0]);
    expect(object.getInstancePosition(0).toArray()).toEqual([0, 0, 0]); // degenerate/hidden
  });
});

describe('allocateSlots + freeSlots: churn', () => {
  it('10,000 join cycles with churning keys cause zero capacity thrash beyond pow2 growth', () => {
    const object = makeInstanced(1);
    let live = [];
    let maxCapacitySeen = 0;
    for (let cycle = 0; cycle < 10_000; cycle++) {
      // Churn: free everything from the previous cycle, allocate a same-sized fresh batch.
      freeSlots(object, live);
      live = Array.from(allocateSlots(object, 5));
      maxCapacitySeen = Math.max(maxCapacitySeen, object.capacity);
    }
    // A steady-state churn of 5 live slots should never need more than the
    // pow2 ceiling above 5 (8) once warmed up — proves the free-list is
    // actually being reused, not leaking a fresh index every cycle.
    expect(object.capacity).toBe(maxCapacitySeen);
    expect(object.capacity).toBeLessThanOrEqual(8);
  });
});
