import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { Selection } from '../../../src/compose/selection/Selection.js';
import { SelectionTransition } from '../../../src/compose/selection/SelectionTransition.js';
import { GraphMesh } from '../../../src/object/GraphMesh.js';
import { GraphInstancedObject } from '../../../src/object/GraphInstancedObject.js';

// ── RAF mock helpers (mirrors tests/anim/Transition.test.js) ──────────────────
// SelectionTransition drives itself via the shared anim/loop singletons, so
// RAF must be mocked. Every test below ticks its transition(s) all the way to
// completion, which makes SelectionTransition#finish() unregister its
// internal timeline from `anim` — that self-cleanup keeps the singleton empty
// between tests without needing a `registered`/afterEach list.

let rafCallback = null;
let rafIdCounter = 1;

function tick(now) {
  expect(rafCallback, 'tick() called but no RAF was scheduled').not.toBeNull();
  const cb = rafCallback;
  rafCallback = null;
  cb(now);
}

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
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeMesh(scene, name, datum, material) {
  const mesh = new GraphMesh({ scene, name, geometry: new THREE.BoxGeometry(), material: material ?? new THREE.MeshBasicMaterial() });
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

// ── construction / chaining ─────────────────────────────────────────────────

describe('Selection.transition()', () => {
  it('returns a SelectionTransition; every builder method returns this', () => {
    const scene = new THREE.Scene();
    const selection = new Selection({ type: 'meshes', meshes: [makeMesh(scene, 'a', { v: 1 })] });
    const t = selection.transition();
    expect(t).toBeInstanceOf(SelectionTransition);
    expect(t.duration(1)).toBe(t);
    expect(t.delay(0)).toBe(t);
    expect(t.easing('linear')).toBe(t);
    expect(t.on('start', () => {})).toBe(t);
    // No attr()/style()/remove() call was made, so no internal timeline was
    // ever created/registered — nothing to tick or drain here.
  });
});

// ── duration / delay / easing / on validation ───────────────────────────────

describe('duration / delay / easing / on validation', () => {
  function makeTransition() {
    const scene = new THREE.Scene();
    return new Selection({ type: 'meshes', meshes: [makeMesh(scene, 'a', { v: 1 })] }).transition();
  }

  it('duration() throws for a negative number', () => {
    expect(() => makeTransition().duration(-1)).toThrow(TypeError);
  });

  it('delay() accepts a number or a function, throws otherwise', () => {
    const t = makeTransition();
    expect(() => t.delay(100)).not.toThrow();
    expect(() => t.delay(() => 50)).not.toThrow();
    expect(() => t.delay('nope')).toThrow(TypeError);
  });

  it('easing() throws for an unresolvable name', () => {
    expect(() => makeTransition().easing('not-a-curve')).toThrow(TypeError);
  });

  it("on() throws for an unrecognized event or a non-function handler; accepts 'interrupt' (Prompt 93)", () => {
    const t = makeTransition();
    expect(() => t.on('bogus', () => {})).toThrow(TypeError);
    expect(() => t.on('start', 'nope')).toThrow(TypeError);
    expect(() => t.on('interrupt', () => {})).not.toThrow();
  });
});

// ── attr(): transform components ────────────────────────────────────────────

describe('attr(): position/rotation/scale', () => {
  it('meshes backend: animates from the current value toward the target', () => {
    const scene = new THREE.Scene();
    const mesh = makeMesh(scene, 'a', { v: 1 });
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    selection.transition().duration(1000).attr('position.y', 10);

    tick(0);
    tick(500); // delta 0.5s
    expect(mesh.getPosition().y).toBeCloseTo(5);
    tick(1000); // delta 0.5s more -> finishes
    expect(mesh.getPosition().y).toBeCloseTo(10);
  });

  it('instanced backend: animates and commits the matrix once per frame, not per instance', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, 'a', 4);
    object.setInstancePosition(0, 0, 0, 0);
    object.setInstancePosition(1, 0, 0, 0);
    const commitSpy = vi.spyOn(object, 'commitMatrix');
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1]) });
    selection.transition().duration(1000).attr('position.y', 10);

    tick(0);
    tick(500);
    expect(object.getInstancePosition(0).y).toBeCloseTo(5);
    expect(object.getInstancePosition(1).y).toBeCloseTo(5);
    expect(commitSpy).toHaveBeenCalledTimes(2); // once per tick() call above, not once per instance
    tick(1000);
    expect(object.getInstancePosition(0).y).toBeCloseTo(10);
  });

  it("throws for 'visible' — a boolean toggle has no meaningful tween", () => {
    const scene = new THREE.Scene();
    const selection = new Selection({ type: 'meshes', meshes: [makeMesh(scene, 'a', { v: 1 })] });
    expect(() => selection.transition().attr('visible', true)).toThrow(TypeError);
  });

  it('throws for a malformed transform sub-path', () => {
    const scene = new THREE.Scene();
    const selection = new Selection({ type: 'meshes', meshes: [makeMesh(scene, 'a', { v: 1 })] });
    expect(() => selection.transition().attr('position.w', 1)).toThrow(TypeError);
  });
});

// ── attr(): color ────────────────────────────────────────────────────────────

describe("attr('color')", () => {
  it('meshes backend: interpolates the material color', () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshBasicMaterial({ color: '#000000' });
    const mesh = makeMesh(scene, 'a', { v: 1 }, material);
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    selection.transition().duration(1000).attr('color', '#ffffff');

    tick(0);
    tick(500);
    expect(material.color.r).toBeCloseTo(0.5, 1);
    tick(1000);
    expect(material.color.r).toBeCloseTo(1);
  });

  it('instanced backend: interpolates from the default (material) color when never set', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, 'a', 2);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) });
    selection.transition().duration(1000).attr('color', '#000000');

    tick(0);
    tick(1000);
    expect(object.getInstanceColor(0).r).toBeCloseTo(0);
  });
});

// ── attr(): opacity ──────────────────────────────────────────────────────────

describe("attr('opacity')", () => {
  it('meshes backend: interpolates material opacity from its current value', () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshBasicMaterial({ opacity: 1 });
    const mesh = makeMesh(scene, 'a', { v: 1 }, material);
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    selection.transition().duration(1000).attr('opacity', 0);

    tick(0);
    tick(500);
    expect(material.opacity).toBeCloseTo(0.5);
    tick(1000);
    expect(material.opacity).toBeCloseTo(0);
  });

  it('instanced backend: defaults the "from" value to 1 when the attribute was never written', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, 'a', 2);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) });
    selection.transition().duration(1000).attr('opacity', 0);

    tick(0);
    tick(500);
    expect(object.getInstanceAttribute(0, 'opacity')).toBeCloseTo(0.5);
    tick(1000);
    expect(object.getInstanceAttribute(0, 'opacity')).toBeCloseTo(0);
  });
});

// ── attr(): custom instanced attributes ─────────────────────────────────────

describe('attr(): custom instanced attribute', () => {
  it('animates a previously-defined attribute', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, 'a', 2);
    object.defineAttribute('pulse', 1);
    object.setInstanceAttribute(0, 'pulse', 0);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) });
    selection.transition().duration(1000).attr('pulse', 1);

    tick(0);
    tick(500);
    expect(object.getInstanceAttribute(0, 'pulse')).toBeCloseTo(0.5);
    tick(1000);
  });

  it('throws on a meshes backend', () => {
    const scene = new THREE.Scene();
    const selection = new Selection({ type: 'meshes', meshes: [makeMesh(scene, 'a', { v: 1 })] });
    expect(() => selection.transition().attr('pulse', 1)).toThrow(Error);
  });

  it('throws for an undefined instanced attribute', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, 'a', 2);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) });
    expect(() => selection.transition().attr('nope', 1)).toThrow(Error);
  });
});

// ── style() ──────────────────────────────────────────────────────────────────

describe('style()', () => {
  it('meshes backend: animates an arbitrary numeric material property', () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ roughness: 0 });
    const mesh = makeMesh(scene, 'a', { v: 1 }, material);
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    selection.transition().duration(1000).style('roughness', 1);

    tick(0);
    tick(500);
    expect(material.roughness).toBeCloseTo(0.5);
    tick(1000);
    expect(material.roughness).toBeCloseTo(1);
  });

  it("delegates 'color'/'opacity' to attr()", () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshBasicMaterial({ opacity: 1 });
    const mesh = makeMesh(scene, 'a', { v: 1 }, material);
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    selection.transition().duration(1000).style('opacity', 0);

    tick(0);
    tick(1000);
    expect(material.opacity).toBeCloseTo(0);
  });

  it('instanced backend: animates a shared material-global prop once, warning about the limitation', () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ roughness: 0 });
    const object = new GraphInstancedObject({ scene, name: 'a', geometry: new THREE.BoxGeometry(), material, count: 3 });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1, 2]) });
    selection.transition().duration(1000).style('roughness', 1);

    expect(warnSpy).toHaveBeenCalledOnce();
    tick(0);
    tick(1000);
    expect(material.roughness).toBeCloseTo(1);
  });

  it('throws when no material in the selection has the given property', () => {
    const scene = new THREE.Scene();
    const selection = new Selection({ type: 'meshes', meshes: [makeMesh(scene, 'a', { v: 1 })] });
    expect(() => selection.transition().style('roughness', 1)).toThrow(Error);
  });
});

// ── delay() staggering ───────────────────────────────────────────────────────

describe('delay() staggering', () => {
  it('offsets each node\'s start by its own resolved delay', () => {
    const scene = new THREE.Scene();
    const meshA = makeMesh(scene, 'a', { i: 0 });
    const meshB = makeMesh(scene, 'b', { i: 1 });
    const selection = new Selection({ type: 'meshes', meshes: [meshA, meshB] });
    selection
      .transition()
      .duration(1000)
      .delay((d) => d.i * 100)
      .attr('position.y', 10);

    tick(0);
    tick(500); // elapsed 500ms
    expect(meshA.getPosition().y).toBeCloseTo(5); // delay 0: t = 500/1000
    expect(meshB.getPosition().y).toBeCloseTo(4); // delay 100: t = 400/1000
    tick(1600); // elapsed 1600ms, both long past their end
    expect(meshA.getPosition().y).toBeCloseTo(10);
    expect(meshB.getPosition().y).toBeCloseTo(10);
  });

  it('throws when the delay function resolves to a negative number', () => {
    const scene = new THREE.Scene();
    const selection = new Selection({ type: 'meshes', meshes: [makeMesh(scene, 'a', { v: 1 })] });
    expect(() => selection.transition().delay(() => -1).attr('position.y', 1)).toThrow(TypeError);
  });
});

// ── on('start') / on('end') ──────────────────────────────────────────────────

describe("on('start') / on('end')", () => {
  it("'start' fires once elapsed time reaches the earliest scheduled delay", () => {
    const scene = new THREE.Scene();
    const onStart = vi.fn();
    const selection = new Selection({ type: 'meshes', meshes: [makeMesh(scene, 'a', { v: 1 })] });
    selection.transition().duration(1000).delay(200).on('start', onStart).attr('position.y', 1);

    tick(0);
    tick(100); // before the delay
    expect(onStart).not.toHaveBeenCalled();
    tick(300); // elapsed 300ms, past the 200ms delay
    expect(onStart).toHaveBeenCalledOnce();
    tick(1300);
  });

  it("'end' fires once every scheduled node finishes", () => {
    const scene = new THREE.Scene();
    const onEnd = vi.fn();
    const selection = new Selection({ type: 'meshes', meshes: [makeMesh(scene, 'a', { v: 1 })] });
    selection.transition().duration(1000).on('end', onEnd).attr('position.y', 1);

    tick(0);
    tick(500);
    expect(onEnd).not.toHaveBeenCalled();
    tick(1000);
    expect(onEnd).toHaveBeenCalledOnce();
  });
});

// ── remove() ───────────────────────────────────────────────────────────────

describe('remove()', () => {
  it('defers removal until the transition completes', () => {
    const scene = new THREE.Scene();
    const mesh = makeMesh(scene, 'a', { v: 1 });
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    selection.transition().duration(200).attr('opacity', 0).remove();

    tick(0);
    tick(100); // elapsed 100ms < 200ms duration
    expect(() => mesh.getPosition()).not.toThrow();
    tick(300); // elapsed 300ms >= 200ms duration
    expect(() => mesh.getPosition()).toThrow(/disposed/);
  });

  it('works with no scheduled attr()/style() calls, respecting duration/delay alone', () => {
    const scene = new THREE.Scene();
    const mesh = makeMesh(scene, 'a', { v: 1 });
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    selection.transition().duration(100).remove();

    tick(0);
    tick(50);
    expect(() => mesh.getPosition()).not.toThrow();
    tick(200);
    expect(() => mesh.getPosition()).toThrow(/disposed/);
  });
});

// ── multiple attr() calls with independent per-call duration ────────────────

describe('multiple attr() calls', () => {
  it('each call captures its own duration; total length is the longest one', () => {
    const scene = new THREE.Scene();
    const mesh = makeMesh(scene, 'a', { v: 1 }, new THREE.MeshBasicMaterial({ opacity: 1 }));
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    const onEnd = vi.fn();
    selection
      .transition()
      .duration(200)
      .attr('opacity', 0)
      .duration(1000)
      .on('end', onEnd)
      .attr('position.y', 10);

    tick(0);
    tick(200); // the opacity job (200ms) is done; the position job (1000ms) isn't
    expect(mesh.material.opacity).toBeCloseTo(0);
    expect(mesh.getPosition().y).toBeCloseTo(2);
    expect(onEnd).not.toHaveBeenCalled();
    tick(1000); // elapsed 1000ms: both done
    expect(mesh.getPosition().y).toBeCloseTo(10);
    expect(onEnd).toHaveBeenCalledOnce();
  });
});

// ── Interrupt semantics (Prompt 93) ─────────────────────────────────────────

describe('interrupt semantics', () => {
  it('meshes backend: a later transition on the same mesh+path interrupts the earlier one and continues from its current value', () => {
    const scene = new THREE.Scene();
    const mesh = makeMesh(scene, 'a', { v: 1 });
    const onInterrupt = vi.fn();
    new Selection({ type: 'meshes', meshes: [mesh] })
      .transition()
      .duration(1000)
      .on('interrupt', onInterrupt)
      .attr('position.y', 10);

    tick(0);
    tick(500); // y = 5

    new Selection({ type: 'meshes', meshes: [mesh] }).transition().duration(1000).attr('position.y', 20);
    expect(onInterrupt).toHaveBeenCalledOnce();

    tick(750); // 250ms into the new transition
    expect(mesh.getPosition().y).toBeCloseTo(8.75); // 5 + (20 - 5) * 0.25, not from 0

    tick(1750); // new transition finishes
    expect(mesh.getPosition().y).toBeCloseTo(20);
  });

  it('instanced backend: interrupting one raw index leaves a different index on the same path unaffected', () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, 'a', 2);
    const onInterrupt = vi.fn();
    new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1]) })
      .transition()
      .duration(1000)
      .on('interrupt', onInterrupt)
      .attr('position.y', 10);

    tick(0);
    tick(500); // both indices at y = 5

    // A new transition targets only raw index 0.
    new Selection({ type: 'instanced', object, indices: Uint32Array.from([0]) }).transition().duration(1000).attr('position.y', 20);
    expect(onInterrupt).toHaveBeenCalledOnce();

    tick(1500);
    expect(object.getInstancePosition(1).y).toBeCloseTo(10); // original transition: unaffected, ran to completion
    expect(object.getInstancePosition(0).y).toBeCloseTo(20); // new transition: picked up from 5, finished at 20
  });

  it('interrupts a still-staggered (not yet started) node without affecting an already-animating sibling node', () => {
    const scene = new THREE.Scene();
    const meshA = makeMesh(scene, 'a', { i: 0 });
    const meshB = makeMesh(scene, 'b', { i: 1 });
    const onInterrupt = vi.fn();
    new Selection({ type: 'meshes', meshes: [meshA, meshB] })
      .transition()
      .duration(1000)
      .delay((d) => d.i * 500) // meshA: 0ms, meshB: 500ms
      .on('interrupt', onInterrupt)
      .attr('position.y', 10);

    tick(0);
    tick(400); // meshA is 40% through; meshB is still within its 500ms delay, unstarted
    expect(meshA.getPosition().y).toBeCloseTo(4);
    expect(meshB.getPosition().y).toBe(0);

    // A new transition targets only meshB, which hasn't started animating yet.
    new Selection({ type: 'meshes', meshes: [meshB] }).transition().duration(1000).attr('position.y', 100);
    expect(onInterrupt).toHaveBeenCalledOnce();

    tick(1400);
    expect(meshA.getPosition().y).toBeCloseTo(10); // original transition: meshA finished normally
    expect(meshB.getPosition().y).toBeCloseTo(100); // new transition: picked up from 0 (never animated yet), finished at 100
    // The original transition's own total duration is 1500ms (meshB's 500ms delay + 1000ms
    // duration), so it hasn't finished yet at 1400ms elapsed — drain it so it self-unregisters
    // before the next test, instead of leaking a still-registered timeline into it.
    tick(1600);
  });

  it("still fires 'end' when only some of its nodes were interrupted", () => {
    const scene = new THREE.Scene();
    const meshA = makeMesh(scene, 'a', { i: 0 });
    const meshB = makeMesh(scene, 'b', { i: 1 });
    const onEnd = vi.fn();
    new Selection({ type: 'meshes', meshes: [meshA, meshB] }).transition().duration(1000).on('end', onEnd).attr('position.y', 10);

    tick(0);
    new Selection({ type: 'meshes', meshes: [meshA] }).transition().duration(1000).attr('position.y', 99);

    tick(1000);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('instanced backend: a later global material-prop transition interrupts an earlier one on the same prop', () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ roughness: 0 });
    const object = new GraphInstancedObject({ scene, name: 'a', geometry: new THREE.BoxGeometry(), material, count: 2 });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onInterrupt = vi.fn();
    new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1]) })
      .transition()
      .duration(1000)
      .on('interrupt', onInterrupt)
      .style('roughness', 1);

    tick(0);
    tick(500); // roughness = 0.5

    new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1]) }).transition().duration(1000).style('roughness', 0);
    expect(onInterrupt).toHaveBeenCalledOnce();

    tick(1500);
    expect(material.roughness).toBeCloseTo(0); // picked up from 0.5, not the original job's 0-start
  });

  it('two transitions on the same node but different paths do not interrupt each other', () => {
    const scene = new THREE.Scene();
    const mesh = makeMesh(scene, 'a', { v: 1 });
    const onInterrupt = vi.fn();
    new Selection({ type: 'meshes', meshes: [mesh] }).transition().duration(1000).on('interrupt', onInterrupt).attr('position.y', 10);
    new Selection({ type: 'meshes', meshes: [mesh] }).transition().duration(1000).attr('opacity', 0);

    expect(onInterrupt).not.toHaveBeenCalled();
    tick(0);
    tick(500);
    expect(mesh.getPosition().y).toBeCloseTo(5); // still animating normally
    tick(1000);
  });
});
