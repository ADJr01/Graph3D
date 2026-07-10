import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Lasso } from '../../src/interact/Lasso.js';
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

// world x=-3/0/3 -> screen x=20/50/80 under the orthographic camera above.
function makeChart(rows, worldXs) {
  const chart = new BarChart(makeScene()).x((d) => d.id).y((d) => d.value);
  chart.data(rows, (d) => d.id);
  chart.render();
  chart.selection().attr('position.x', (_d, i) => worldXs[i]).attr('position.y', 0);
  return chart;
}

/** Traces a square from (x-r,y-r) to (x+r,y+r) via pointerdown/move/up on the lasso's listeners. */
function dragSquare(domElement, x, y, r) {
  listenerFor(domElement, 'pointerdown')({ offsetX: x - r, offsetY: y - r });
  const move = listenerFor(domElement, 'pointermove');
  move({ offsetX: x + r, offsetY: y - r });
  move({ offsetX: x + r, offsetY: y + r });
  move({ offsetX: x - r, offsetY: y + r });
  listenerFor(domElement, 'pointerup')({ offsetX: x - r, offsetY: y - r });
}

describe('Lasso constructor', () => {
  it('throws TypeError if camera is not a THREE.Camera', () => {
    expect(() => new Lasso({ camera: {}, domElement: makeDomElement() })).toThrow(TypeError);
  });

  it('throws TypeError if domElement lacks addEventListener/removeEventListener', () => {
    expect(() => new Lasso({ camera: makeCamera(), domElement: {} })).toThrow(TypeError);
  });

  it('registers pointerdown/pointermove/pointerup listeners', () => {
    const domElement = makeDomElement();
    new Lasso({ camera: makeCamera(), domElement });
    expect(domElement.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(domElement.addEventListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(domElement.addEventListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
  });
});

describe('Lasso.on', () => {
  it('throws TypeError for an unrecognized event', () => {
    const lasso = new Lasso({ camera: makeCamera(), domElement: makeDomElement() });
    expect(() => lasso.on('bogus', () => {})).toThrow(TypeError);
  });

  it('returns this for chaining', () => {
    const lasso = new Lasso({ camera: makeCamera(), domElement: makeDomElement() });
    expect(lasso.on('select', () => {})).toBe(lasso);
  });
});

describe('Lasso drag lifecycle', () => {
  it('emits lassoStart on pointerdown, lasso on each pointermove with the accumulated path, lassoEnd on pointerup', () => {
    const domElement = makeDomElement();
    const lasso = new Lasso({ camera: makeCamera(), domElement });
    const onStart = vi.fn();
    const onDrag = vi.fn();
    const onEnd = vi.fn();
    lasso.on('lassoStart', onStart).on('lasso', onDrag).on('lassoEnd', onEnd);

    listenerFor(domElement, 'pointerdown')({ offsetX: 10, offsetY: 10 });
    expect(onStart).toHaveBeenCalledWith({ x: 10, y: 10 });

    listenerFor(domElement, 'pointermove')({ offsetX: 20, offsetY: 10 });
    expect(onDrag).toHaveBeenCalledWith([{ x: 10, y: 10 }, { x: 20, y: 10 }]);

    listenerFor(domElement, 'pointerup')({ offsetX: 20, offsetY: 20 });
    expect(onEnd).toHaveBeenCalledWith([{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }]);
  });

  it('pointermove without a prior pointerdown is a no-op', () => {
    const domElement = makeDomElement();
    const lasso = new Lasso({ camera: makeCamera(), domElement });
    const onDrag = vi.fn();
    lasso.on('lasso', onDrag);
    listenerFor(domElement, 'pointermove')({ offsetX: 20, offsetY: 30 });
    expect(onDrag).not.toHaveBeenCalled();
  });
});

describe('Lasso.select — containment correctness', () => {
  it('fires select with exactly the datums whose projected position falls inside the traced polygon', () => {
    const domElement = makeDomElement();
    const lasso = new Lasso({ camera: makeCamera(), domElement });
    const chart = makeChart([{ id: 0, value: 1 }, { id: 1, value: 1 }, { id: 2, value: 1 }], [-3, 0, 3]);
    lasso.register(chart);
    const onSelect = vi.fn();
    lasso.on('select', onSelect);

    dragSquare(domElement, 50, 50, 15); // encloses only the middle datum (screen x 50)

    expect(onSelect).toHaveBeenCalledTimes(1);
    const [selection, selectedChart] = onSelect.mock.calls[0];
    expect(selectedChart).toBe(chart);
    expect(selection.size()).toBe(1);
    expect(selection.datum(0).id).toBe(1);
  });

  it('fewer than 3 points (a plain click) selects nothing', () => {
    const domElement = makeDomElement();
    const lasso = new Lasso({ camera: makeCamera(), domElement });
    const chart = makeChart([{ id: 0, value: 1 }], [0]);
    lasso.register(chart);
    const onSelect = vi.fn();
    lasso.on('select', onSelect);

    listenerFor(domElement, 'pointerdown')({ offsetX: 50, offsetY: 50 });
    listenerFor(domElement, 'pointerup')({ offsetX: 50, offsetY: 50 });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not fire select for a chart with zero matches', () => {
    const domElement = makeDomElement();
    const lasso = new Lasso({ camera: makeCamera(), domElement });
    const chart = makeChart([{ id: 0, value: 1 }], [-3]);
    lasso.register(chart);
    const onSelect = vi.fn();
    lasso.on('select', onSelect);

    dragSquare(domElement, 50, 50, 15);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('Lasso chart.dispatch() interaction events (Prompt 156)', () => {
  it('fires chart.on("lassoStart", ...) on every registered chart when the drag begins', () => {
    const domElement = makeDomElement();
    const lasso = new Lasso({ camera: makeCamera(), domElement });
    const chart = makeChart([{ id: 0, value: 1 }], [0]);
    lasso.register(chart);
    const handler = vi.fn();
    chart.on('lassoStart', handler);

    listenerFor(domElement, 'pointerdown')({ offsetX: 10, offsetY: 20 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ chart, origin: { x: 10, y: 20 }, domEvent: { offsetX: 10, offsetY: 20 } });
  });

  it('fires chart.on("lassoEnd", ...) only on charts with a match, paired with "select"', () => {
    const domElement = makeDomElement();
    const lasso = new Lasso({ camera: makeCamera(), domElement });
    const matched = makeChart([{ id: 0, value: 1 }], [0]);
    const unmatched = makeChart([{ id: 0, value: 1 }], [-3]);
    lasso.register(matched).register(unmatched);
    const matchedHandler = vi.fn();
    const unmatchedHandler = vi.fn();
    matched.on('lassoEnd', matchedHandler);
    unmatched.on('lassoEnd', unmatchedHandler);

    dragSquare(domElement, 50, 50, 15); // encloses only "matched"'s datum (screen x 50)

    expect(matchedHandler).toHaveBeenCalledTimes(1);
    expect(matchedHandler.mock.calls[0][0]).toMatchObject({ chart: matched });
    expect(unmatchedHandler).not.toHaveBeenCalled();
  });
});

describe('Lasso.dispose', () => {
  it('removes the registered listeners and is idempotent', () => {
    const domElement = makeDomElement();
    const lasso = new Lasso({ camera: makeCamera(), domElement });
    const pointerdown = listenerFor(domElement, 'pointerdown');
    const pointermove = listenerFor(domElement, 'pointermove');
    const pointerup = listenerFor(domElement, 'pointerup');

    lasso.dispose();
    expect(domElement.removeEventListener).toHaveBeenCalledWith('pointerdown', pointerdown);
    expect(domElement.removeEventListener).toHaveBeenCalledWith('pointermove', pointermove);
    expect(domElement.removeEventListener).toHaveBeenCalledWith('pointerup', pointerup);
    expect(() => lasso.dispose()).not.toThrow();
  });

  it('every public method throws after dispose', () => {
    const lasso = new Lasso({ camera: makeCamera(), domElement: makeDomElement() });
    lasso.dispose();
    expect(() => lasso.register(makeChart([{ id: 0, value: 1 }], [0]))).toThrow(/disposed/);
    expect(() => lasso.unregister({})).toThrow(/disposed/);
    expect(() => lasso.on('select', () => {})).toThrow(/disposed/);
  });
});
