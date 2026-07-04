import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { Transition, GraphAnimTimeline, anim, Selection } from '../../src/index.js';
import { GraphMesh } from '../../src/object/GraphMesh.js';
import { GraphInstancedObject } from '../../src/object/GraphInstancedObject.js';

// Phase 5 cross-cutting integration tests (Prompt 98): (a) targets reached
// within tolerance, (b) .then() sequencing, (c) interrupt state pickup, (d)
// reduced-motion snap, (e) SelectionTransition parity meshes vs instanced,
// (f) stagger delay fn per datum, (g) exit .remove() frees slots only after
// completion. Individual behaviors already have thorough unit coverage in
// tests/anim/ and tests/compose/selection/ — this file proves they hold when
// exercised together, closer to how a real chart would use them.

// ── RAF mock helpers (mirrors tests/compose/selection/SelectionTransition.test.js) ─
// Needed for SelectionTransition scenarios, whose internal timeline isn't
// returned to the caller the way Transition.to() returns its GraphAnimTimeline
// (which can be driven directly via .update(), no RAF mocking required).

let rafCallback = null;
let rafIdCounter = 1;

function tick(now) {
  expect(rafCallback, 'tick() called but no RAF was scheduled').not.toBeNull();
  const cb = rafCallback;
  rafCallback = null;
  cb(now);
}

let registered = [];

beforeEach(() => {
  rafCallback = null;
  rafIdCounter = 1;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb) => {
      rafCallback = cb;
      return rafIdCounter++;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn(() => { rafCallback = null; }));
  registered = [];
});

afterEach(() => {
  for (const tl of registered) anim.remove(tl);
  anim.respectReducedMotion = false;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeMesh(scene, name, datum, material) {
  const mesh = new GraphMesh({ scene, name, geometry: new THREE.BoxGeometry(), material: material ?? new THREE.MeshBasicMaterial() });
  mesh.setUserData('datum', datum);
  return mesh;
}

function makeInstanced(scene, name, count, material) {
  return new GraphInstancedObject({ scene, name, geometry: new THREE.BoxGeometry(), material: material ?? new THREE.MeshBasicMaterial(), count });
}

/** Scans every rendered raw index on `object` for the one whose bound datum matches `predicate`. */
function findRawIndex(object, predicate) {
  for (let i = 0; i < object.capacity; i++) {
    if (predicate(object.getInstanceUserData(i))) return i;
  }
  return -1;
}

describe('Phase 5 integration', () => {
  it('(a) a Transition reaches its exact target value at t=1', () => {
    const target = { x: 0, y: 0 };
    const tl = new Transition(target).duration(1000).easing('easeOutBounce').to({ x: 42, y: -7 });
    registered.push(tl);
    tl.update(1);
    expect(target.x).toBeCloseTo(42, 9);
    expect(target.y).toBeCloseTo(-7, 9);
  });

  it('(a) a SelectionTransition reaches its exact target values at t=1', () => {
    const scene = new THREE.Scene();
    const mesh = makeMesh(scene, 'a', { v: 1 });
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    selection.transition().duration(1000).attr('position.y', 7.5).attr('color', '#ff00ff');

    tick(0);
    tick(1000);
    expect(mesh.getPosition().y).toBeCloseTo(7.5, 9);
    expect(mesh.material.color.getHexString()).toBe('ff00ff');
  });

  it('(b) .then() sequencing runs groups strictly in order, not in parallel', () => {
    const target = { x: 0, y: 0 };
    const tl = new GraphAnimTimeline(target);
    const onGroup1 = vi.fn();
    tl.to({ x: 10 }, { duration: 1 })
      .onGroupComplete(onGroup1)
      .then()
      .to({ y: 10 }, { duration: 1 })
      .play();

    tl.update(1); // first group only
    expect(target.x).toBeCloseTo(10);
    expect(target.y).toBe(0);
    expect(onGroup1).toHaveBeenCalledOnce();

    tl.update(1); // second group
    expect(target.y).toBeCloseTo(10);
  });

  it('(c) interrupt: a superseding Transition picks up from the interpolated value, not the original start', () => {
    const target = { x: 0 };
    const tl1 = new Transition(target).duration(1000).to({ x: 100 });
    registered.push(tl1);
    tl1.update(0.5); // x = 50

    const tl2 = new Transition(target).duration(1000).to({ x: 0 });
    registered.push(tl2);
    expect(target.x).toBeCloseTo(50); // unchanged by scheduling tl2

    tl2.update(1);
    expect(target.x).toBeCloseTo(0); // finished from 50, not from tl1's original start of 0->100
  });

  it('(c) interrupt: a SelectionTransition on the instanced backend picks up per-raw-index', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, 'a', 2);
    new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1]) }).transition().duration(1000).attr('position.y', 10);

    tick(0);
    tick(500); // both raw indices at y = 5

    new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) }).transition().duration(1000).attr('position.y', 50);
    tick(1500);

    expect(object.getInstancePosition(0).y).toBeCloseTo(50); // picked up from 5, not from 0
    expect(object.getInstancePosition(1).y).toBeCloseTo(10); // unaffected, ran to completion
  });

  it('(d) respectReducedMotion snaps a Transition to its end value on the very next tick', () => {
    const target = { x: 0 };
    const tl = new Transition(target).duration(5000).to({ x: 10 });
    registered.push(tl);
    anim.respectReducedMotion = true;
    // respectReducedMotion is applied by GraphAnim's own per-frame tick, which
    // substitutes the real delta with the timeline's full duration — calling
    // timeline.update() directly bypasses that substitution entirely, so this
    // must go through the shared RAF/anim path via tick(), not tl.update().
    tick(0);
    tick(16); // one tiny real frame
    expect(target.x).toBeCloseTo(10);
  });

  it('(d) respectReducedMotion snaps a SelectionTransition to its end values', () => {
    const scene = new THREE.Scene();
    const mesh = makeMesh(scene, 'a', { v: 1 });
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    anim.respectReducedMotion = true;
    selection.transition().duration(5000).attr('position.y', 10);
    tick(16);
    expect(mesh.getPosition().y).toBeCloseTo(10);
  });

  it('(e) identical SelectionTransition config produces identical results on meshes vs instanced backends', () => {
    const scene = new THREE.Scene();
    const datum = { value: 42 };

    const mesh = makeMesh(scene, 'a', datum, new THREE.MeshBasicMaterial({ color: '#000000' }));
    const meshSelection = new Selection({ type: 'meshes', meshes: [mesh] });

    const object = makeInstanced(scene, 'b', 1, new THREE.MeshBasicMaterial({ color: '#000000' }));
    object.setInstanceUserData(0, datum);
    const instancedSelection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) });

    const configure = (selection) =>
      selection
        .transition()
        .duration(1000)
        .easing('easeOutCubic')
        .attr('position.y', (d) => d.value / 10)
        .attr('color', '#ffffff');

    configure(meshSelection);
    configure(instancedSelection);

    tick(0);
    tick(500);

    // 5 decimal places, not 9 — the meshes path (THREE.Matrix4.decompose) and
    // instanced path (also matrix-decompose based) can differ by a couple of
    // Float32-epsilon units; genuine cross-backend parity, not bit-identical output.
    expect(mesh.getPosition().y).toBeCloseTo(object.getInstancePosition(0).y, 5);
    const meshColor = mesh.material.color;
    const instColor = object.getInstanceColor(0);
    expect(meshColor.r).toBeCloseTo(instColor.r, 5);
    expect(meshColor.g).toBeCloseTo(instColor.g, 5);
    expect(meshColor.b).toBeCloseTo(instColor.b, 5);

    tick(1000);
    // 5 decimal places, not 9 — the meshes path (THREE.Matrix4.decompose) and
    // instanced path (also matrix-decompose based) can differ by a couple of
    // Float32-epsilon units; genuine cross-backend parity, not bit-identical output.
    expect(mesh.getPosition().y).toBeCloseTo(object.getInstancePosition(0).y, 5);
  });

  it('(f) a per-datum stagger delay fn produces different start times keyed by datum, not array order', () => {
    const scene = new THREE.Scene();
    const meshA = makeMesh(scene, 'a', { rank: 2 }); // should start LAST despite being first in the array
    const meshB = makeMesh(scene, 'b', { rank: 0 }); // should start FIRST
    const selection = new Selection({ type: 'meshes', meshes: [meshA, meshB] });
    const STAGGER_MS = 200;
    selection
      .transition()
      .duration(1000)
      .delay((d) => d.rank * STAGGER_MS)
      .attr('position.y', 10);

    tick(0);
    tick(100); // 100ms elapsed: meshA (delay 400ms) hasn't started; meshB (delay 0ms) is 10% through
    expect(meshA.getPosition().y).toBe(0);
    expect(meshB.getPosition().y).toBeCloseTo(1);

    tick(1500); // drain for cleanup
  });

  it('(g) exit .remove() frees the instanced slot only once its transition completes, not immediately', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, 'a', 4);
    let selection = new Selection({ type: 'instanced', object, indices: new Uint32Array(0) });

    function update(dataset, exitFn) {
      const joined = selection.data(dataset, (d) => d.id);
      selection = joined.join(
        (entered) => entered,
        (updated) => updated,
        exitFn ?? ((exited) => exited.remove()),
      );
    }

    update([{ id: 'a' }, { id: 'b' }]);
    const bIndex = findRawIndex(object, (datum) => datum?.id === 'b');
    expect(bIndex).toBeGreaterThanOrEqual(0);

    update([{ id: 'a' }], (exited) => exited.transition().duration(1000).attr('opacity', 0).remove());
    tick(0);
    tick(500); // halfway through the exit fade — b's slot must still read as occupied

    update([{ id: 'a' }, { id: 'c' }]); // a fresh entrant must NOT be handed b's still-fading slot
    const cIndexMidway = findRawIndex(object, (datum) => datum?.id === 'c');
    expect(cIndexMidway).not.toBe(bIndex);

    tick(1500); // finish b's exit transition — its slot is now genuinely free

    update([{ id: 'a' }, { id: 'c' }, { id: 'd' }]);
    const dIndex = findRawIndex(object, (datum) => datum?.id === 'd');
    expect(dIndex).toBe(bIndex); // now reused
  });
});
