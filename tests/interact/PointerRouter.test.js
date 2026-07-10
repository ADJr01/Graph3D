import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { PointerRouter } from '../../src/interact/PointerRouter.js';
import { Picker } from '../../src/interact/Picker.js';
import { BarChart } from '../../src/chart/BarChart.js';
import { loop } from '../../src/core/Graph3DLoop.js';
import { annotation } from '../../src/compose/annotation/index.js';

// vi.spyOn(loop, ...) is idempotent — spying on an already-spied method keeps
// accumulating call history across tests unless restored (same convention as
// tests/object/GraphInstancedObject.test.js).
afterEach(() => {
  vi.restoreAllMocks();
});

function makeScene() {
  return new THREE.Scene();
}

// Picker.pickAt() caches its result per (x, y) until the next `loop` frame
// (Prompt 147's "one pick per frame max") — tests that change which chart is
// registered *between* two clicks at the same coordinate must force that
// cache to expire first, or the second click would silently reuse the first
// click's stale hit. `fromIndex` must be `addSpy.mock.calls.length` captured
// *before* the click whose pick needs invalidating: `Picker.pickAt()` always
// runs first inside `PointerRouter`'s handlers, so the first new `loop.add`
// call after that snapshot is always Picker's own one-shot invalidate
// callback — not `.at(-1)`, which since Prompt 150 may instead be a
// `PhaseAnimator` tick registered by that same click's default hover/select
// effect application (StateMachine.setState → material.applyEffect).
function advanceFrame(addSpy, fromIndex) {
  addSpy.mock.calls[fromIndex][0]();
}

function makeCamera() {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return camera;
}

const CANVAS = { width: 100, height: 100 };
const CENTER = { offsetX: 50, offsetY: 50 };
const MISS = { offsetX: 0, offsetY: 0 };

function makeDomElement() {
  return { addEventListener: vi.fn(), removeEventListener: vi.fn() };
}

function listenerFor(domElement, type) {
  const call = domElement.addEventListener.mock.calls.find(([eventType]) => eventType === type);
  return call[1];
}

function makeChart(rows = [{ id: 0, x: 0, value: 1 }]) {
  const chart = new BarChart(makeScene()).x((d) => d.x).y((d) => d.value);
  chart.data(rows, (d) => d.id);
  chart.render();
  return chart;
}

function makePicker() {
  return new Picker({ camera: makeCamera(), domElement: CANVAS });
}

// Ortho projection is exact/linear (unlike perspective), which several
// suites below rely on to compute expected screen positions by hand — a
// -5..5 frustum over a 100x100 canvas maps world x=1 to screen x=60 (10px
// per world unit), world x=0 to screen center (50,50).
function makeOrthoCamera() {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return camera;
}

const ORTHO_CANVAS = { width: 100, height: 100 };

function makeOrthoPicker() {
  return new Picker({ camera: makeOrthoCamera(), domElement: ORTHO_CANVAS });
}

describe('PointerRouter constructor', () => {
  it('throws TypeError if picker is not a Picker instance', () => {
    expect(() => new PointerRouter({ picker: {}, domElement: makeDomElement() })).toThrow(TypeError);
  });

  it('throws TypeError if domElement lacks addEventListener/removeEventListener', () => {
    expect(() => new PointerRouter({ picker: makePicker(), domElement: {} })).toThrow(TypeError);
  });

  it('registers pointerdown/pointermove/pointerup/click listeners', () => {
    const domElement = makeDomElement();
    new PointerRouter({ picker: makePicker(), domElement });
    expect(domElement.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(domElement.addEventListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(domElement.addEventListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(domElement.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
  });
});

describe('PointerRouter.stateMachineFor', () => {
  it('lazily creates and caches one StateMachine per chart', () => {
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker: makePicker(), domElement });
    const chart = makeChart();
    const sm1 = router.stateMachineFor(chart);
    const sm2 = router.stateMachineFor(chart);
    expect(sm1).toBe(sm2);
    expect(sm1.chart).toBe(chart);
  });

  it('throws after dispose', () => {
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker: makePicker(), domElement });
    router.dispose();
    expect(() => router.stateMachineFor(makeChart())).toThrow(/disposed/);
  });
});

describe('PointerRouter hover-enter/leave', () => {
  it('transitions the hit datum to hovered, and back to default on leave', () => {
    const picker = makePicker();
    const chart = makeChart();
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const pointermove = listenerFor(domElement, 'pointermove');
    const datum = chart.data()[0];

    pointermove(CENTER);
    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('hovered');

    pointermove(MISS);
    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('default');
  });

  it('does not re-dispatch for repeated moves over the same datum', () => {
    const picker = makePicker();
    const chart = makeChart();
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const pointermove = listenerFor(domElement, 'pointermove');
    const handler = vi.fn();
    chart.selection().on('hover-enter', handler);

    pointermove(CENTER);
    pointermove(CENTER);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not clobber a selected datum back to hovered/default', () => {
    const picker = makePicker();
    const chart = makeChart();
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const pointermove = listenerFor(domElement, 'pointermove');
    const click = listenerFor(domElement, 'click');
    const datum = chart.data()[0];

    click({ ...CENTER, shiftKey: false });
    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('selected');

    pointermove(MISS);
    pointermove(CENTER);
    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('selected');
  });

  it('dispatches hover-enter/hover-leave via Selection.on regardless of selection state', () => {
    const picker = makePicker();
    const chart = makeChart();
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const pointermove = listenerFor(domElement, 'pointermove');
    const enter = vi.fn();
    const leave = vi.fn();
    chart.selection().on('hover-enter', enter).on('hover-leave', leave);

    pointermove(CENTER);
    pointermove(MISS);
    expect(enter).toHaveBeenCalledTimes(1);
    expect(leave).toHaveBeenCalledTimes(1);
  });
});

describe('PointerRouter click / select / shift-multi-select', () => {
  it('selects the clicked datum', () => {
    const picker = makePicker();
    const chart = makeChart();
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const click = listenerFor(domElement, 'click');
    const datum = chart.data()[0];

    click({ ...CENTER, shiftKey: false });
    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('selected');
  });

  it('a plain click on empty space deselects everything', () => {
    const picker = makePicker();
    const chart = makeChart();
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const click = listenerFor(domElement, 'click');
    const datum = chart.data()[0];

    click({ ...CENTER, shiftKey: false });
    click({ ...MISS, shiftKey: false });
    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('default');
  });

  it('a plain click on a new datum replaces the previous single selection', () => {
    const picker = makePicker();
    const chartA = makeChart([{ id: 0, x: 0, value: 1 }]);
    const chartB = makeChart([{ id: 0, x: 0, value: 1 }]);
    picker.register(chartA);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const click = listenerFor(domElement, 'click');
    const datumA = chartA.data()[0];
    const datumB = chartB.data()[0];

    const addSpy = vi.spyOn(loop, 'add');
    const callsBeforeFirstClick = addSpy.mock.calls.length;
    click({ ...CENTER, shiftKey: false });
    expect(router.stateMachineFor(chartA).stateOf(datumA)).toBe('selected');

    // Swap which chart is registered (rather than aiming a second click at a
    // precise off-center screen position, which would need real perspective
    // NDC math) to simulate clicking a different datum at the same ray.
    picker.unregister(chartA);
    picker.register(chartB);
    advanceFrame(addSpy, callsBeforeFirstClick);
    click({ ...CENTER, shiftKey: false });
    expect(router.stateMachineFor(chartA).stateOf(datumA)).toBe('default');
    expect(router.stateMachineFor(chartB).stateOf(datumB)).toBe('selected');
  });

  it('shift-click accumulates a multi-selection without clearing prior selections', () => {
    const picker = makePicker();
    const near = makeChart([{ id: 0, x: 0, value: 1 }]);
    const far = makeChart([{ id: 0, x: 0, value: 1 }]);
    // Both charts occupy the exact same ray for simplicity — this test only
    // cares about shift accumulating across separate StateMachine entries,
    // not spatial separation, so clicking the same screen point twice with
    // only one chart registered at a time isolates each chart's own state.
    picker.register(near);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const click = listenerFor(domElement, 'click');
    const nearDatum = near.data()[0];

    const addSpy = vi.spyOn(loop, 'add');
    const callsBeforeFirstClick = addSpy.mock.calls.length;
    click({ ...CENTER, shiftKey: false });
    expect(router.stateMachineFor(near).stateOf(nearDatum)).toBe('selected');

    picker.unregister(near);
    picker.register(far);
    advanceFrame(addSpy, callsBeforeFirstClick);
    const farDatum = far.data()[0];
    click({ ...CENTER, shiftKey: true });
    expect(router.stateMachineFor(far).stateOf(farDatum)).toBe('selected');
    // Shift-click must not have cleared the first chart's own selection.
    expect(router.stateMachineFor(near).stateOf(nearDatum)).toBe('selected');
  });

  it('shift-click on an already-selected datum toggles it off', () => {
    const picker = makePicker();
    const chart = makeChart();
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const click = listenerFor(domElement, 'click');
    const datum = chart.data()[0];

    click({ ...CENTER, shiftKey: false });
    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('selected');

    click({ ...CENTER, shiftKey: true });
    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('default');
  });

  it('dispatches click via Selection.on for a hit', () => {
    const picker = makePicker();
    const chart = makeChart();
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const click = listenerFor(domElement, 'click');
    const handler = vi.fn();
    chart.selection().on('click', handler);

    click({ ...CENTER, shiftKey: false });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('PointerRouter.dispose', () => {
  it('removes the registered listeners and is idempotent', () => {
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker: makePicker(), domElement });
    const pointerdown = listenerFor(domElement, 'pointerdown');
    const pointermove = listenerFor(domElement, 'pointermove');
    const pointerup = listenerFor(domElement, 'pointerup');
    const click = listenerFor(domElement, 'click');

    router.dispose();
    expect(domElement.removeEventListener).toHaveBeenCalledWith('pointerdown', pointerdown);
    expect(domElement.removeEventListener).toHaveBeenCalledWith('pointermove', pointermove);
    expect(domElement.removeEventListener).toHaveBeenCalledWith('pointerup', pointerup);
    expect(domElement.removeEventListener).toHaveBeenCalledWith('click', click);
    expect(() => router.dispose()).not.toThrow();
  });
});

describe('PointerRouter drag-and-drop', () => {
  it('pointerdown on a non-draggable chart does not start a drag', () => {
    const picker = makeOrthoPicker();
    const chart = makeChart();
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const pointerdown = listenerFor(domElement, 'pointerdown');
    const datum = chart.data()[0];
    const onDragStart = vi.fn();
    chart.selection().on('dragStart', onDragStart);

    pointerdown(CENTER);
    expect(onDragStart).not.toHaveBeenCalled();
    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('default');
  });

  it('pointerdown on empty space does not start a drag', () => {
    const picker = makeOrthoPicker();
    const chart = makeChart();
    chart.draggable(true);
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const pointerdown = listenerFor(domElement, 'pointerdown');
    const onDragStart = vi.fn();
    chart.selection().on('dragStart', onDragStart);

    pointerdown(MISS);
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('pointerdown on a draggable chart datum transitions it to dragging and dispatches dragStart', () => {
    const picker = makeOrthoPicker();
    const chart = makeChart();
    chart.draggable(true);
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const pointerdown = listenerFor(domElement, 'pointerdown');
    const datum = chart.data()[0];
    const onDragStart = vi.fn();
    chart.selection().on('dragStart', onDragStart);

    pointerdown(CENTER);
    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('dragging');
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  it('pointermove during a drag repositions the datum to the unprojected pointer position', () => {
    const picker = makeOrthoPicker();
    const chart = makeChart();
    chart.draggable(true);
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const pointerdown = listenerFor(domElement, 'pointerdown');
    const pointermove = listenerFor(domElement, 'pointermove');

    pointerdown(CENTER);
    // screen x=80 -> ndcX=0.6 -> world x=0.6*5=3 under the -5..5 ortho frustum above.
    pointermove({ offsetX: 80, offsetY: 50 });

    const datum = chart.data()[0];
    const backend = chart.selection().filter((d) => d === datum).backend;
    const position = backend.type === 'meshes' ? backend.meshes[0].getPosition() : backend.object.getInstancePosition(backend.indices[0]);
    expect(position.x).toBeCloseTo(3, 5);
  });

  it('pointermove during a drag does not also fire hover-enter/leave', () => {
    const picker = makeOrthoPicker();
    const chart = makeChart();
    chart.draggable(true);
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const pointerdown = listenerFor(domElement, 'pointerdown');
    const pointermove = listenerFor(domElement, 'pointermove');
    const enter = vi.fn();
    chart.selection().on('hover-enter', enter);

    pointerdown(CENTER);
    pointermove({ offsetX: 80, offsetY: 50 });
    expect(enter).not.toHaveBeenCalled();
  });

  it('pointerup ends the drag, dispatches dragEnd, and restores the default state', () => {
    const picker = makeOrthoPicker();
    const chart = makeChart();
    chart.draggable(true);
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const pointerdown = listenerFor(domElement, 'pointerdown');
    const pointerup = listenerFor(domElement, 'pointerup');
    const datum = chart.data()[0];
    const onDragEnd = vi.fn();
    chart.selection().on('dragEnd', onDragEnd);

    pointerdown(CENTER);
    pointerup(CENTER);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('default');
  });

  it('restores the selected state (not default) if the datum was selected before the drag started', () => {
    const picker = makeOrthoPicker();
    const chart = makeChart();
    chart.draggable(true);
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const datum = chart.data()[0];
    router.stateMachineFor(chart).setState(datum, 'selected');

    const pointerdown = listenerFor(domElement, 'pointerdown');
    const pointerup = listenerFor(domElement, 'pointerup');
    pointerdown(CENTER);
    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('dragging');
    pointerup(CENTER);
    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('selected');
  });

  it('pointerup with no active drag is a no-op', () => {
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker: makeOrthoPicker(), domElement });
    const pointerup = listenerFor(domElement, 'pointerup');
    expect(() => pointerup(CENTER)).not.toThrow();
  });

  it('suppresses the click that immediately follows a drag pointerup, but not a later, unrelated click', () => {
    const picker = makeOrthoPicker();
    const chart = makeChart();
    chart.draggable(true);
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const pointerdown = listenerFor(domElement, 'pointerdown');
    const pointerup = listenerFor(domElement, 'pointerup');
    const click = listenerFor(domElement, 'click');
    const datum = chart.data()[0];

    pointerdown(CENTER);
    pointerup(CENTER);
    click({ ...CENTER, shiftKey: false });
    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('default');

    click({ ...CENTER, shiftKey: false });
    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('selected');
  });
});

describe('PointerRouter.selectedEntries', () => {
  it('returns an empty array when nothing is selected', () => {
    const router = new PointerRouter({ picker: makePicker(), domElement: makeDomElement() });
    expect(router.selectedEntries()).toEqual([]);
  });

  it('returns {chart, datum} pairs for the current selection', () => {
    const picker = makePicker();
    const chart = makeChart();
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const click = listenerFor(domElement, 'click');
    const datum = chart.data()[0];

    click({ ...CENTER, shiftKey: false });
    expect(router.selectedEntries()).toEqual([{ chart, datum }]);
  });

  it('throws after dispose', () => {
    const router = new PointerRouter({ picker: makePicker(), domElement: makeDomElement() });
    router.dispose();
    expect(() => router.selectedEntries()).toThrow(/disposed/);
  });
});

describe('PointerRouter.registerLabel / unregisterLabel', () => {
  it('throws TypeError for a non-label object', () => {
    const router = new PointerRouter({ picker: makeOrthoPicker(), domElement: makeDomElement() });
    expect(() => router.registerLabel({})).toThrow(TypeError);
    expect(() => router.registerLabel('not a label')).toThrow(TypeError);
    expect(() => router.registerLabel(null)).toThrow(TypeError);
  });

  it('register/unregister return this, and throw after dispose', () => {
    const router = new PointerRouter({ picker: makeOrthoPicker(), domElement: makeDomElement() });
    const label = annotation.label({ text: 'x' });
    expect(router.registerLabel(label)).toBe(router);
    expect(router.unregisterLabel(label)).toBe(router);
    router.dispose();
    expect(() => router.registerLabel(label)).toThrow(/disposed/);
    expect(() => router.unregisterLabel(label)).toThrow(/disposed/);
  });
});

describe('PointerRouter label click hit-testing', () => {
  it('fires emit("click") when a click lands within the hit radius of the projected label position', () => {
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker: makeOrthoPicker(), domElement });
    const label = annotation.label({ text: 'peak', position: { x: 0, y: 0, z: 0 } });
    const handler = vi.fn();
    label.on('click', handler);
    router.registerLabel(label);

    const domEvent = { ...CENTER, shiftKey: false };
    listenerFor(domElement, 'click')(domEvent);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ label, domEvent });
  });

  it('does not fire when the click lands outside the hit radius', () => {
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker: makeOrthoPicker(), domElement });
    // world x=3 -> screen x=80, 30px from the center click below (radius is 20px).
    const label = annotation.label({ text: 'peak', position: { x: 3, y: 0, z: 0 } });
    const handler = vi.fn();
    label.on('click', handler);
    router.registerLabel(label);

    listenerFor(domElement, 'click')({ ...CENTER, shiftKey: false });
    expect(handler).not.toHaveBeenCalled();
  });

  it('fires only the closest label when several are within range', () => {
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker: makeOrthoPicker(), domElement });
    const near = annotation.label({ text: 'near', position: { x: 0, y: 0, z: 0 } }); // screen (50,50), distance 0
    const far = annotation.label({ text: 'far', position: { x: 1, y: 0, z: 0 } }); // screen (60,50), distance 10
    const nearHandler = vi.fn();
    const farHandler = vi.fn();
    near.on('click', nearHandler);
    far.on('click', farHandler);
    router.registerLabel(near).registerLabel(far);

    listenerFor(domElement, 'click')({ ...CENTER, shiftKey: false });
    expect(nearHandler).toHaveBeenCalledTimes(1);
    expect(farHandler).not.toHaveBeenCalled();
  });

  it('unregisterLabel stops future hit-testing', () => {
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker: makeOrthoPicker(), domElement });
    const label = annotation.label({ text: 'peak', position: { x: 0, y: 0, z: 0 } });
    const handler = vi.fn();
    label.on('click', handler);
    router.registerLabel(label);
    router.unregisterLabel(label);

    listenerFor(domElement, 'click')({ ...CENTER, shiftKey: false });
    expect(handler).not.toHaveBeenCalled();
  });

  it('a label click does not disturb chart-datum selection state', () => {
    const picker = makeOrthoPicker();
    const chart = makeChart();
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const label = annotation.label({ text: 'peak', position: { x: 3, y: 3, z: 0 } });
    router.registerLabel(label);
    const datum = chart.data()[0];

    listenerFor(domElement, 'click')({ ...CENTER, shiftKey: false });
    expect(router.stateMachineFor(chart).stateOf(datum)).toBe('selected');
  });
});

describe('PointerRouter chart.dispatch() interaction events (Prompt 156)', () => {
  it('fires chart.on("hover", ...) on hover-enter, not on hover-leave', () => {
    const picker = makePicker();
    const chart = makeChart();
    picker.register(chart);
    const domElement = makeDomElement();
    new PointerRouter({ picker, domElement });
    const pointermove = listenerFor(domElement, 'pointermove');
    const handler = vi.fn();
    chart.on('hover', handler);

    pointermove(CENTER);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ chart, datum: chart.data()[0] }));

    pointermove(MISS);
    expect(handler).toHaveBeenCalledTimes(1); // still just the one hover-enter
  });

  it('fires chart.on("select", ...) on a fresh click-to-select', () => {
    const picker = makePicker();
    const chart = makeChart();
    picker.register(chart);
    const domElement = makeDomElement();
    new PointerRouter({ picker, domElement });
    const handler = vi.fn();
    chart.on('select', handler);

    listenerFor(domElement, 'click')({ ...CENTER, shiftKey: false });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ chart, datum: chart.data()[0] }));
  });

  it('fires chart.on("deselect", ...) when a shift-click toggles a selected datum off', () => {
    const picker = makePicker();
    const chart = makeChart();
    picker.register(chart);
    const domElement = makeDomElement();
    new PointerRouter({ picker, domElement });
    const click = listenerFor(domElement, 'click');
    const selectHandler = vi.fn();
    const deselectHandler = vi.fn();
    chart.on('select', selectHandler).on('deselect', deselectHandler);

    click({ ...CENTER, shiftKey: true });
    expect(selectHandler).toHaveBeenCalledTimes(1);
    click({ ...CENTER, shiftKey: true });
    expect(deselectHandler).toHaveBeenCalledTimes(1);
  });

  it('fires chart.on("deselect", ...) for every datum cleared by a plain click elsewhere', () => {
    const picker = makePicker();
    const chart = makeChart();
    picker.register(chart);
    const domElement = makeDomElement();
    const router = new PointerRouter({ picker, domElement });
    const click = listenerFor(domElement, 'click');
    const deselectHandler = vi.fn();
    chart.on('deselect', deselectHandler);

    click({ ...CENTER, shiftKey: false });
    expect(router.stateMachineFor(chart).stateOf(chart.data()[0])).toBe('selected');

    click({ ...MISS, shiftKey: false }); // different (x, y) than CENTER — no pick-cache collision
    expect(deselectHandler).toHaveBeenCalledTimes(1);
    expect(deselectHandler).toHaveBeenCalledWith({ chart, datum: chart.data()[0], domEvent: { ...MISS, shiftKey: false } });
  });

  it('fires chart.on("dragStart"|"dragEnd", ...) around a drag gesture', () => {
    const picker = makeOrthoPicker();
    const chart = makeChart();
    chart.draggable(true);
    picker.register(chart);
    const domElement = makeDomElement();
    new PointerRouter({ picker, domElement });
    const dragStart = vi.fn();
    const dragEnd = vi.fn();
    chart.on('dragStart', dragStart).on('dragEnd', dragEnd);

    listenerFor(domElement, 'pointerdown')(CENTER);
    expect(dragStart).toHaveBeenCalledTimes(1);
    listenerFor(domElement, 'pointerup')(CENTER);
    expect(dragEnd).toHaveBeenCalledTimes(1);
  });
});
