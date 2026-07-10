import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Brush } from '../../src/interact/Brush.js';
import { BarChart } from '../../src/chart/BarChart.js';

function makeScene() {
  return new THREE.Scene();
}

function makeCamera() {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return camera;
}

const CANVAS = { width: 100, height: 100 };

function makeDomElement() {
  return { ...CANVAS, addEventListener: vi.fn(), removeEventListener: vi.fn() };
}

function listenerFor(domElement, type) {
  const call = domElement.addEventListener.mock.calls.find(([eventType]) => eventType === type);
  return call[1];
}

// Places each row's bar at a known world x (world x=0 -> screen x=50 under
// the orthographic camera above; world x=-3/0/3 -> screen x=20/50/80) so
// brush/lasso containment tests don't depend on BarChart's own internal
// scale math.
function makeChart(rows, worldXs) {
  const chart = new BarChart(makeScene()).x((d) => d.id).y((d) => d.value);
  chart.data(rows, (d) => d.id);
  chart.render();
  chart.selection().attr('position.x', (_d, i) => worldXs[i]).attr('position.y', 0);
  return chart;
}

describe('Brush constructor', () => {
  it('throws TypeError if camera is not a THREE.Camera', () => {
    expect(() => new Brush({ camera: {}, domElement: makeDomElement() })).toThrow(TypeError);
  });

  it('throws TypeError if domElement lacks addEventListener/removeEventListener', () => {
    expect(() => new Brush({ camera: makeCamera(), domElement: {} })).toThrow(TypeError);
  });

  it('registers pointerdown/pointermove/pointerup listeners', () => {
    const domElement = makeDomElement();
    new Brush({ camera: makeCamera(), domElement });
    expect(domElement.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(domElement.addEventListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(domElement.addEventListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
  });
});

describe('Brush.register / unregister', () => {
  it('throws TypeError if chart has no selection() method', () => {
    const brush = new Brush({ camera: makeCamera(), domElement: makeDomElement() });
    expect(() => brush.register({})).toThrow(TypeError);
  });

  it('return this for chaining', () => {
    const brush = new Brush({ camera: makeCamera(), domElement: makeDomElement() });
    const chart = makeChart([{ id: 0, value: 1 }], [0]);
    expect(brush.register(chart)).toBe(brush);
    expect(brush.unregister(chart)).toBe(brush);
  });
});

describe('Brush.on', () => {
  it('throws TypeError for an unrecognized event', () => {
    const brush = new Brush({ camera: makeCamera(), domElement: makeDomElement() });
    expect(() => brush.on('bogus', () => {})).toThrow(TypeError);
  });

  it('throws TypeError if handler is not a function', () => {
    const brush = new Brush({ camera: makeCamera(), domElement: makeDomElement() });
    expect(() => brush.on('select', 'nope')).toThrow(TypeError);
  });

  it('returns this for chaining', () => {
    const brush = new Brush({ camera: makeCamera(), domElement: makeDomElement() });
    expect(brush.on('select', () => {})).toBe(brush);
  });
});

describe('Brush drag lifecycle', () => {
  it('emits brushStart on pointerdown with the drag origin', () => {
    const domElement = makeDomElement();
    const brush = new Brush({ camera: makeCamera(), domElement });
    const onStart = vi.fn();
    brush.on('brushStart', onStart);

    listenerFor(domElement, 'pointerdown')({ offsetX: 10, offsetY: 20 });
    expect(onStart).toHaveBeenCalledWith({ x: 10, y: 20 });
  });

  it('emits brush on pointermove while dragging, with a normalized rect', () => {
    const domElement = makeDomElement();
    const brush = new Brush({ camera: makeCamera(), domElement });
    const onBrush = vi.fn();
    brush.on('brush', onBrush);

    listenerFor(domElement, 'pointerdown')({ offsetX: 60, offsetY: 60 });
    listenerFor(domElement, 'pointermove')({ offsetX: 20, offsetY: 30 });
    expect(onBrush).toHaveBeenCalledWith({ x: 20, y: 30, width: 40, height: 30 });
  });

  it('pointermove without a prior pointerdown is a no-op', () => {
    const domElement = makeDomElement();
    const brush = new Brush({ camera: makeCamera(), domElement });
    const onBrush = vi.fn();
    brush.on('brush', onBrush);

    listenerFor(domElement, 'pointermove')({ offsetX: 20, offsetY: 30 });
    expect(onBrush).not.toHaveBeenCalled();
  });

  it('emits brushEnd with the final rect on pointerup', () => {
    const domElement = makeDomElement();
    const brush = new Brush({ camera: makeCamera(), domElement });
    const onEnd = vi.fn();
    brush.on('brushEnd', onEnd);

    listenerFor(domElement, 'pointerdown')({ offsetX: 0, offsetY: 0 });
    listenerFor(domElement, 'pointerup')({ offsetX: 40, offsetY: 40 });
    expect(onEnd).toHaveBeenCalledWith({ x: 0, y: 0, width: 40, height: 40 });
  });
});

describe('Brush.select — containment correctness', () => {
  it('meshes backend: fires select with exactly the datums whose projected position falls inside the rect', () => {
    const domElement = makeDomElement();
    const brush = new Brush({ camera: makeCamera(), domElement });
    // world x -3/0/3 -> screen x 20/50/80 (see makeChart's own comment).
    const chart = makeChart([{ id: 0, value: 1 }, { id: 1, value: 1 }, { id: 2, value: 1 }], [-3, 0, 3]);
    brush.register(chart);
    const onSelect = vi.fn();
    brush.on('select', onSelect);

    // Rect spans screen x [35, 65] -> only the middle datum (screen x 50).
    listenerFor(domElement, 'pointerdown')({ offsetX: 35, offsetY: 0 });
    listenerFor(domElement, 'pointerup')({ offsetX: 65, offsetY: 100 });

    expect(onSelect).toHaveBeenCalledTimes(1);
    const [selection, selectedChart] = onSelect.mock.calls[0];
    expect(selectedChart).toBe(chart);
    expect(selection.size()).toBe(1);
    expect(selection.datum(0).id).toBe(1);
  });

  it('does not fire select for a chart with zero matches', () => {
    const domElement = makeDomElement();
    const brush = new Brush({ camera: makeCamera(), domElement });
    const chart = makeChart([{ id: 0, value: 1 }], [-3]);
    brush.register(chart);
    const onSelect = vi.fn();
    brush.on('select', onSelect);

    listenerFor(domElement, 'pointerdown')({ offsetX: 35, offsetY: 0 });
    listenerFor(domElement, 'pointerup')({ offsetX: 65, offsetY: 100 });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('fires select once per registered chart that has a match', () => {
    const domElement = makeDomElement();
    const brush = new Brush({ camera: makeCamera(), domElement });
    const chartA = makeChart([{ id: 0, value: 1 }], [0]);
    const chartB = makeChart([{ id: 0, value: 1 }], [0]);
    const chartC = makeChart([{ id: 0, value: 1 }], [-3]); // outside the rect below
    brush.register(chartA).register(chartB).register(chartC);
    const onSelect = vi.fn();
    brush.on('select', onSelect);

    listenerFor(domElement, 'pointerdown')({ offsetX: 35, offsetY: 0 });
    listenerFor(domElement, 'pointerup')({ offsetX: 65, offsetY: 100 });

    expect(onSelect).toHaveBeenCalledTimes(2);
    const chartsNotified = onSelect.mock.calls.map(([, c]) => c);
    expect(chartsNotified).toEqual(expect.arrayContaining([chartA, chartB]));
    expect(chartsNotified).not.toContain(chartC);
  });

  it('instanced backend: only the instance whose projected position falls inside the rect matches', () => {
    const domElement = makeDomElement();
    const brush = new Brush({ camera: makeCamera(), domElement });
    const rows = Array.from({ length: 60 }, (_unused, i) => ({ id: i, value: 1 }));
    const chart = new BarChart(makeScene()).x((d) => d.id).y((d) => d.value);
    chart.data(rows, (d) => d.id);
    chart.render();
    // Spread instances out along x so only index 3 lands inside the rect.
    chart.selection().attr('position.x', (_d, i) => (i - 30) * 0.5).attr('position.y', 0);
    const targetX = (3 - 30) * 0.5; // instance 3's world x
    const targetScreenX = ((targetX + 5) / 10) * 100;

    brush.register(chart);
    const onSelect = vi.fn();
    brush.on('select', onSelect);

    listenerFor(domElement, 'pointerdown')({ offsetX: targetScreenX - 2, offsetY: 0 });
    listenerFor(domElement, 'pointerup')({ offsetX: targetScreenX + 2, offsetY: 100 });

    expect(onSelect).toHaveBeenCalledTimes(1);
    const [selection] = onSelect.mock.calls[0];
    expect(selection.size()).toBe(1);
    expect(selection.datum(0).id).toBe(3);
  });
});

describe('Brush chart.dispatch() interaction events (Prompt 156)', () => {
  it('fires chart.on("brushStart", ...) on every registered chart when the drag begins', () => {
    const domElement = makeDomElement();
    const brush = new Brush({ camera: makeCamera(), domElement });
    const chartA = makeChart([{ id: 0, value: 1 }], [0]);
    const chartB = makeChart([{ id: 0, value: 1 }], [-3]);
    brush.register(chartA).register(chartB);
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    chartA.on('brushStart', handlerA);
    chartB.on('brushStart', handlerB);

    listenerFor(domElement, 'pointerdown')({ offsetX: 10, offsetY: 20 });
    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
    expect(handlerA).toHaveBeenCalledWith({ chart: chartA, origin: { x: 10, y: 20 }, domEvent: { offsetX: 10, offsetY: 20 } });
  });

  it('fires chart.on("brushEnd", ...) only on charts with a match, paired with "select"', () => {
    const domElement = makeDomElement();
    const brush = new Brush({ camera: makeCamera(), domElement });
    const matched = makeChart([{ id: 0, value: 1 }], [0]);
    const unmatched = makeChart([{ id: 0, value: 1 }], [-3]);
    brush.register(matched).register(unmatched);
    const matchedHandler = vi.fn();
    const unmatchedHandler = vi.fn();
    matched.on('brushEnd', matchedHandler);
    unmatched.on('brushEnd', unmatchedHandler);

    listenerFor(domElement, 'pointerdown')({ offsetX: 35, offsetY: 0 });
    listenerFor(domElement, 'pointerup')({ offsetX: 65, offsetY: 100 });

    expect(matchedHandler).toHaveBeenCalledTimes(1);
    expect(matchedHandler.mock.calls[0][0]).toMatchObject({ chart: matched });
    expect(unmatchedHandler).not.toHaveBeenCalled();
  });
});

describe('Brush.dispose', () => {
  it('removes the registered listeners and is idempotent', () => {
    const domElement = makeDomElement();
    const brush = new Brush({ camera: makeCamera(), domElement });
    const pointerdown = listenerFor(domElement, 'pointerdown');
    const pointermove = listenerFor(domElement, 'pointermove');
    const pointerup = listenerFor(domElement, 'pointerup');

    brush.dispose();
    expect(domElement.removeEventListener).toHaveBeenCalledWith('pointerdown', pointerdown);
    expect(domElement.removeEventListener).toHaveBeenCalledWith('pointermove', pointermove);
    expect(domElement.removeEventListener).toHaveBeenCalledWith('pointerup', pointerup);
    expect(() => brush.dispose()).not.toThrow();
  });

  it('every public method throws after dispose', () => {
    const brush = new Brush({ camera: makeCamera(), domElement: makeDomElement() });
    brush.dispose();
    expect(() => brush.register(makeChart([{ id: 0, value: 1 }], [0]))).toThrow(/disposed/);
    expect(() => brush.unregister({})).toThrow(/disposed/);
    expect(() => brush.on('select', () => {})).toThrow(/disposed/);
  });
});
