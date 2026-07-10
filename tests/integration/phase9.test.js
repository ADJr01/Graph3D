import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { ScatterChart } from '../../src/chart/ScatterChart.js';
import { BarChart } from '../../src/chart/BarChart.js';
import { Picker } from '../../src/interact/Picker.js';
import { PointerRouter } from '../../src/interact/PointerRouter.js';
import { Brush } from '../../src/interact/Brush.js';
import { KeyboardNav } from '../../src/interact/KeyboardNav.js';
import { INSTANCING_THRESHOLD } from '../../src/object/GraphObjectFactory.js';

// Phase 9 cross-cutting integration tests (Prompt 158), covering the six
// checklist items literally named by the prompt. Every `interact/` class
// already has thorough unit-level coverage from its own prompt (147–156) —
// not re-tested here. What's new: (a) picking's closest-hit resolution
// *across* backend types (existing tests only compare two meshes-backed
// charts, or a single instanced chart in isolation) and octree spatial
// correctness among several simultaneously-visible instances (existing
// instanced-pick tests only ever have one on-screen candidate); (b) a real
// pointer event — not a direct `stateMachine.setState()` call — driving the
// default hover/select visual all the way through to the actual mesh
// material/scale (`PointerRouter.test.js` only checks the resulting state
// *string*; `StateMachine.test.js` only checks the visual from a direct
// `setState()` call — nothing connects the two); (c) `Brush`'s brute-force
// screen-projection match cross-validated against `Picker`'s independent
// octree-backed pick at the same points, on the same instanced batch; (d)
// keyboard-nav robustness when a chart's `data()` changes between
// keypresses (documented as "recomputed fresh on every keypress" but never
// actually exercised); (e) `Selection.on()` scope-filtering firing from a
// *real* click (every existing test calls `Selection.dispatch()` directly).
// Cross-filter *propagation* (item (d) in the prompt's own wording) — a
// `chart.on('select')`-driven source chaining `link()` calls A -> B -> C —
// is covered in `tests/interact/CrossFilter.test.js` instead (its natural
// home, alongside `link()`'s other tests), not duplicated here.

afterEach(() => {
  vi.restoreAllMocks();
});

function makeDomElement() {
  return { addEventListener: vi.fn(), removeEventListener: vi.fn() };
}

function listenerFor(domElement, type) {
  return domElement.addEventListener.mock.calls.find(([eventType]) => eventType === type)[1];
}

function makePerspectiveCamera() {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return camera;
}

// -5..5 world frustum over a 100x100 canvas: world x=0/y=0 -> screen (50,50),
// 10 screen px per world unit, screenY = 50 - 10*worldY (top-left origin).
function makeOrthoCamera() {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return camera;
}

const CANVAS = { width: 100, height: 100 };
const CENTER = { offsetX: 50, offsetY: 50, shiftKey: false };
const MISS = { offsetX: 0, offsetY: 0, shiftKey: false };

function makeScatterChart(rows) {
  const chart = new ScatterChart(new THREE.Scene()).x((d) => d.x).y((d) => d.y).z((d) => d.z);
  chart.data(rows, (d) => d.id);
  chart.render();
  return chart;
}

describe('Picking correctness (Prompt 158)', () => {
  it('resolves the closer hit when a meshes-backed and an instanced-backed chart overlap on the same ray', () => {
    const meshChart = makeScatterChart([{ id: 'near', x: 0, y: 0, z: 3 }, { id: 'miss', x: 1000, y: 0, z: 0 }]);
    const rows = Array.from({ length: INSTANCING_THRESHOLD + 2 }, (_, i) => ({ id: `far${i}`, x: i === 0 ? 0 : 1000 + i, y: 0, z: -3 }));
    const instancedChart = makeScatterChart(rows);
    expect(instancedChart.selection().backend.type).toBe('instanced');

    const picker = new Picker({ camera: makePerspectiveCamera(), domElement: CANVAS });
    picker.register(meshChart).register(instancedChart);

    const hit = picker.pickAt(CENTER.offsetX, CENTER.offsetY);
    expect(hit.chart).toBe(meshChart); // z=3 (distance 7) beats z=-3 (distance 13)
  });

  it('resolves the correct id among several simultaneously on-screen instances, not just "a" hit', () => {
    const rows = [
      { id: 'left', x: -2, y: 0, z: 0 },
      { id: 'right', x: 2, y: 0, z: 0 },
      ...Array.from({ length: INSTANCING_THRESHOLD }, (_, i) => ({ id: `pad${i}`, x: 1000 + i, y: 0, z: 0 })),
    ];
    const chart = makeScatterChart(rows);
    expect(chart.selection().backend.type).toBe('instanced');

    const picker = new Picker({ camera: makeOrthoCamera(), domElement: CANVAS });
    picker.register(chart);

    expect(picker.pickAt(30, 50).datum.id).toBe('left'); // world x=-2 -> screen x=30
    expect(picker.pickAt(70, 50).datum.id).toBe('right'); // world x=2 -> screen x=70
  });
});

describe('State transitions — a real pointer event drives the real visual effect (Prompt 158)', () => {
  function makeHoverableChart() {
    return makeScatterChart([{ id: 0, x: 0, y: 0, z: 0 }]);
  }

  it('a real pointermove hover swaps the material and bumps scale by the default 1.05x', () => {
    const chart = makeHoverableChart();
    const picker = new Picker({ camera: makePerspectiveCamera(), domElement: CANVAS });
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const datum = chart.data()[0];
    const mesh = chart.selection().backend.meshes[0];
    const originalMaterial = mesh.material;
    const before = mesh.getScale();

    listenerFor(domElement, 'pointermove')(CENTER);

    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('hovered');
    expect(mesh.material).not.toBe(originalMaterial); // default neonEdge effect cloned+swapped it
    const after = mesh.getScale();
    expect(after.x).toBeCloseTo(before.x * 1.05, 5);
  });

  it('moving off the hovered datum restores the pre-hover scale', () => {
    const chart = makeHoverableChart();
    const picker = new Picker({ camera: makePerspectiveCamera(), domElement: CANVAS });
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const datum = chart.data()[0];
    const mesh = chart.selection().backend.meshes[0];
    const before = mesh.getScale();

    listenerFor(domElement, 'pointermove')(CENTER);
    listenerFor(domElement, 'pointermove')(MISS);

    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('default');
    const after = mesh.getScale();
    expect(after.x).toBeCloseTo(before.x, 5);
  });

  it('a real click selects the datum, swapping the material via the select effect without changing scale', () => {
    const chart = makeHoverableChart();
    const picker = new Picker({ camera: makePerspectiveCamera(), domElement: CANVAS });
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const datum = chart.data()[0];
    const mesh = chart.selection().backend.meshes[0];
    const originalMaterial = mesh.material;
    const before = mesh.getScale();

    listenerFor(domElement, 'click')(CENTER);

    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('selected');
    expect(mesh.material).not.toBe(originalMaterial);
    const after = mesh.getScale();
    expect(after.x).toBeCloseTo(before.x, 5); // selectStyle's default scale is 1 (no bump)
  });
});

describe('Brush matches an independently-verified octree pick query (Prompt 158)', () => {
  it('the instanced datums Brush matches are exactly the ones independently pickable inside the rect', () => {
    const inside = [{ id: 'a', x: -1, y: 0 }, { id: 'b', x: 0, y: 1 }, { id: 'c', x: 1, y: -1 }];
    const outside = [{ id: 'd', x: 4, y: 4 }, { id: 'e', x: -4, y: -4 }];
    const pad = Array.from({ length: INSTANCING_THRESHOLD }, (_, i) => ({ id: `pad${i}`, x: 1000 + i, y: 0 }));
    const chart = makeScatterChart([...inside, ...outside, ...pad].map((d) => ({ ...d, z: 0 })));
    expect(chart.selection().backend.type).toBe('instanced');

    // Independently confirm every "inside" datum is octree-pickable at its own projected screen position.
    const picker = new Picker({ camera: makeOrthoCamera(), domElement: CANVAS });
    picker.register(chart);
    for (const row of inside) {
      const hit = picker.pickAt(50 + row.x * 10, 50 - row.y * 10);
      expect(hit?.datum.id).toBe(row.id);
    }

    // Brush a rect covering world [-2, 2] x [-2, 2] -> screen [30, 70] x [30, 70].
    // Brush's own domElement (unlike PointerRouter's) needs real width/height —
    // matchedIndicesForChart projects world positions through it directly,
    // rather than through a separate Picker.domElement.
    const domElement = { ...CANVAS, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const brush = new Brush({ camera: makeOrthoCamera(), domElement });
    brush.register(chart);
    const onSelect = vi.fn();
    brush.on('select', onSelect);
    listenerFor(domElement, 'pointerdown')({ offsetX: 30, offsetY: 30 });
    listenerFor(domElement, 'pointerup')({ offsetX: 70, offsetY: 70 });

    expect(onSelect).toHaveBeenCalledTimes(1);
    const [selection] = onSelect.mock.calls[0];
    const matchedIds = new Set(selection.data().map((d) => d.id));
    expect(matchedIds).toEqual(new Set(inside.map((row) => row.id)));
  });
});

describe('KeyboardNav completeness — chart data changing between keypresses (Prompt 158)', () => {
  function makeBarChart(rows) {
    const chart = new BarChart(new THREE.Scene()).x((d) => d.id).y((d) => d.value);
    chart.data(rows, (d) => d.id);
    chart.render();
    return chart;
  }

  function tab(domElement, shiftKey = false) {
    listenerFor(domElement, 'keydown')({ key: 'Tab', shiftKey, preventDefault: vi.fn() });
  }

  it('Tab does not throw and re-clamps when the chart shrinks after the focus cursor was at the old last entry', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    const chart = makeBarChart([{ id: 0, value: 1 }, { id: 1, value: 2 }, { id: 2, value: 3 }]);
    nav.register(chart);

    tab(domElement);
    tab(domElement);
    tab(domElement); // focus index -> 2 (3rd of 3)
    expect(nav.liveRegion.textContent).toContain('3 of 3');

    chart.data([{ id: 0, value: 1 }], (d) => d.id); // shrinks to a single row
    chart.render();

    expect(() => tab(domElement)).not.toThrow();
    expect(nav.liveRegion.textContent).toContain('1 of 1');
    nav.dispose();
  });

  it('Tab reaches newly-added entries once the chart grows after a keypress', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    const chart = makeBarChart([{ id: 0, value: 1 }]);
    nav.register(chart);

    tab(domElement);
    expect(nav.liveRegion.textContent).toContain('1 of 1');

    chart.data([{ id: 0, value: 1 }, { id: 1, value: 2 }], (d) => d.id); // grows to two rows
    chart.render();

    tab(domElement);
    expect(nav.liveRegion.textContent).toContain('2 of 2');
    nav.dispose();
  });
});

describe('Selection.on scope-filtering fires only for the matching datum, via a real click (Prompt 158)', () => {
  it('meshes backend: only the filter()-scoped handler for the clicked datum fires', () => {
    const chart = makeScatterChart([{ id: 0, x: 0, y: 0, z: 0 }, { id: 1, x: 1000, y: 0, z: 0 }]);
    const targetHandler = vi.fn();
    const otherHandler = vi.fn();
    chart.selection().filter((d) => d.id === 0).on('click', targetHandler);
    chart.selection().filter((d) => d.id === 1).on('click', otherHandler);

    const picker = new Picker({ camera: makePerspectiveCamera(), domElement: CANVAS });
    picker.register(chart);
    const domElement = makeDomElement();
    new PointerRouter({ picker, domElement });

    listenerFor(domElement, 'click')(CENTER);

    expect(targetHandler).toHaveBeenCalledTimes(1);
    expect(otherHandler).not.toHaveBeenCalled();
  });

  it('instanced backend: same scoping through a real click', () => {
    const rows = Array.from({ length: INSTANCING_THRESHOLD + 2 }, (_, i) => ({ id: i, x: i === 3 ? 0 : 1000 + i, y: 0, z: 0 }));
    const chart = makeScatterChart(rows);
    expect(chart.selection().backend.type).toBe('instanced');
    const targetHandler = vi.fn();
    const otherHandler = vi.fn();
    chart.selection().filter((d) => d.id === 3).on('click', targetHandler);
    chart.selection().filter((d) => d.id === 7).on('click', otherHandler);

    const picker = new Picker({ camera: makePerspectiveCamera(), domElement: CANVAS });
    picker.register(chart);
    const domElement = makeDomElement();
    new PointerRouter({ picker, domElement });

    listenerFor(domElement, 'click')(CENTER);

    expect(targetHandler).toHaveBeenCalledTimes(1);
    expect(otherHandler).not.toHaveBeenCalled();
  });
});
