import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Picker } from '../../src/interact/Picker.js';
import { ScatterChart } from '../../src/chart/ScatterChart.js';
import { loop } from '../../src/core/Graph3DLoop.js';
import { INSTANCING_THRESHOLD } from '../../src/object/GraphObjectFactory.js';

// vi.spyOn(loop, ...) is idempotent — spying on an already-spied method keeps
// accumulating call history across tests unless restored (same convention as
// tests/object/GraphInstancedObject.test.js).
afterEach(() => {
  vi.restoreAllMocks();
});

function makeScene() {
  return new THREE.Scene();
}

// Positioned on-axis, looking straight down -z through world (0, 0, 0) — a
// ray cast through the canvas center (NDC (0, 0)) passes exactly through
// every datum this file positions at x=0, y=0.
function makeCamera() {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return camera;
}

const CANVAS = { width: 100, height: 100 };
const CENTER_X = 50;
const CENTER_Y = 50;

describe('Picker constructor', () => {
  it('throws TypeError if camera is not a THREE.Camera', () => {
    expect(() => new Picker({ camera: {}, domElement: CANVAS })).toThrow(TypeError);
  });

  it('throws TypeError if domElement is falsy', () => {
    expect(() => new Picker({ camera: makeCamera(), domElement: null })).toThrow(TypeError);
  });
});

describe('Picker.register / unregister', () => {
  it('throws TypeError if chart has no selection() method', () => {
    const picker = new Picker({ camera: makeCamera(), domElement: CANVAS });
    expect(() => picker.register({})).toThrow(TypeError);
  });

  it('register/unregister return this for chaining, and unregister is a no-op if never registered', () => {
    const picker = new Picker({ camera: makeCamera(), domElement: CANVAS });
    const chart = new ScatterChart(makeScene());
    expect(picker.register(chart)).toBe(picker);
    expect(picker.unregister(chart)).toBe(picker);
    expect(() => picker.unregister(chart)).not.toThrow();
  });
});

describe('Picker.pickAt', () => {
  it('throws TypeError for non-finite x/y', () => {
    const picker = new Picker({ camera: makeCamera(), domElement: CANVAS });
    expect(() => picker.pickAt(NaN, 0)).toThrow(TypeError);
    expect(() => picker.pickAt(0, '5')).toThrow(TypeError);
  });

  it('returns null when nothing is registered', () => {
    const picker = new Picker({ camera: makeCamera(), domElement: CANVAS });
    expect(picker.pickAt(CENTER_X, CENTER_Y)).toBeNull();
  });

  it('returns null on a miss', () => {
    const picker = new Picker({ camera: makeCamera(), domElement: CANVAS });
    const chart = new ScatterChart(makeScene()).x((d) => d.x).y((d) => d.y).z((d) => d.z);
    chart.data([{ x: 1000, y: 1000, z: 0 }]);
    chart.render();
    picker.register(chart);
    expect(picker.pickAt(CENTER_X, CENTER_Y)).toBeNull();
  });

  it('meshes backend: hits a chart with few datums and reports instanceIndex null', () => {
    const picker = new Picker({ camera: makeCamera(), domElement: CANVAS });
    const chart = new ScatterChart(makeScene()).x((d) => d.x).y((d) => d.y).z((d) => d.z);
    chart.data([{ x: 0, y: 0, z: 0 }]);
    chart.render();
    picker.register(chart);

    const hit = picker.pickAt(CENTER_X, CENTER_Y);
    expect(hit.chart).toBe(chart);
    expect(hit.datum).toEqual({ x: 0, y: 0, z: 0 });
    expect(hit.instanceIndex).toBeNull();
    expect(hit.mesh).toBeInstanceOf(THREE.Mesh);
    expect(hit.worldPoint).toBeInstanceOf(THREE.Vector3);
  });

  it('skips a chart with pickingEnabled(false) entirely (Prompt 156)', () => {
    const picker = new Picker({ camera: makeCamera(), domElement: CANVAS });
    const chart = new ScatterChart(makeScene()).x((d) => d.x).y((d) => d.y).z((d) => d.z);
    chart.data([{ x: 0, y: 0, z: 0 }]);
    chart.render();
    chart.pickingEnabled(false);
    picker.register(chart);

    expect(picker.pickAt(CENTER_X, CENTER_Y)).toBeNull();
  });

  it('a pickingEnabled(false) chart never wins over a farther pickingEnabled chart', () => {
    const picker = new Picker({ camera: makeCamera(), domElement: CANVAS });
    const near = new ScatterChart(makeScene()).x((d) => d.x).y((d) => d.y).z((d) => d.z);
    near.data([{ x: 0, y: 0, z: 0 }]);
    near.render();
    near.pickingEnabled(false);
    const far = new ScatterChart(makeScene()).x((d) => d.x).y((d) => d.y).z((d) => d.z);
    far.data([{ x: 0, y: 0, z: -5 }]);
    far.render();

    picker.register(near).register(far);
    const hit = picker.pickAt(CENTER_X, CENTER_Y);
    expect(hit.chart).toBe(far);
  });

  it('instanced backend: hits a chart past INSTANCING_THRESHOLD and reports a numeric instanceIndex', () => {
    const picker = new Picker({ camera: makeCamera(), domElement: CANVAS });
    const rows = Array.from({ length: INSTANCING_THRESHOLD + 5 }, (_, i) => ({ x: i === 0 ? 0 : 1000 + i, y: 0, z: 0 }));
    const chart = new ScatterChart(makeScene()).x((d) => d.x).y((d) => d.y).z((d) => d.z);
    chart.data(rows);
    chart.render();
    picker.register(chart);

    expect(chart.selection().backend.type).toBe('instanced');
    const hit = picker.pickAt(CENTER_X, CENTER_Y);
    expect(hit.chart).toBe(chart);
    expect(hit.instanceIndex).toBe(0);
    expect(hit.datum).toEqual(rows[0]);
    expect(hit.mesh).toBeInstanceOf(THREE.InstancedMesh);
  });

  it('returns the closest hit across multiple registered charts', () => {
    const picker = new Picker({ camera: makeCamera(), domElement: CANVAS });
    const near = new ScatterChart(makeScene()).x((d) => d.x).y((d) => d.y).z((d) => d.z);
    near.data([{ x: 0, y: 0, z: 0 }]);
    near.render();
    const far = new ScatterChart(makeScene()).x((d) => d.x).y((d) => d.y).z((d) => d.z);
    far.data([{ x: 0, y: 0, z: -5 }]);
    far.render();

    picker.register(far).register(near);
    const hit = picker.pickAt(CENTER_X, CENTER_Y);
    expect(hit.chart).toBe(near);
  });

  it('caches the result for repeated calls at the same (x, y) within one frame, and recomputes after the next frame', () => {
    const picker = new Picker({ camera: makeCamera(), domElement: CANVAS });
    const chart = new ScatterChart(makeScene()).x((d) => d.x).y((d) => d.y).z((d) => d.z);
    chart.data([{ x: 0, y: 0, z: 0 }]);
    chart.render();
    picker.register(chart);

    const selectionSpy = vi.spyOn(chart, 'selection');
    const addSpy = vi.spyOn(loop, 'add');

    picker.pickAt(CENTER_X, CENTER_Y);
    picker.pickAt(CENTER_X, CENTER_Y);
    expect(selectionSpy).toHaveBeenCalledTimes(1);

    const invalidate = addSpy.mock.calls[0][0];
    invalidate(); // simulate the next loop frame

    picker.pickAt(CENTER_X, CENTER_Y);
    expect(selectionSpy).toHaveBeenCalledTimes(2);
  });

  it('does not cache across different (x, y) within the same frame', () => {
    const picker = new Picker({ camera: makeCamera(), domElement: CANVAS });
    const chart = new ScatterChart(makeScene()).x((d) => d.x).y((d) => d.y).z((d) => d.z);
    chart.data([{ x: 0, y: 0, z: 0 }]);
    chart.render();
    picker.register(chart);

    const selectionSpy = vi.spyOn(chart, 'selection');
    picker.pickAt(CENTER_X, CENTER_Y);
    picker.pickAt(CENTER_X, CENTER_Y + 1);
    expect(selectionSpy).toHaveBeenCalledTimes(2);
  });
});

describe('Picker.dispose', () => {
  it('clears registered charts and is idempotent', () => {
    const picker = new Picker({ camera: makeCamera(), domElement: CANVAS });
    const chart = new ScatterChart(makeScene()).x((d) => d.x).y((d) => d.y).z((d) => d.z);
    chart.data([{ x: 0, y: 0, z: 0 }]);
    chart.render();
    picker.register(chart);

    picker.dispose();
    expect(() => picker.dispose()).not.toThrow();
  });

  it('all public methods throw after dispose', () => {
    const picker = new Picker({ camera: makeCamera(), domElement: CANVAS });
    picker.dispose();
    const pattern = /Picker\.\w+: this picker has been disposed/;
    expect(() => picker.register(new ScatterChart(makeScene()))).toThrow(pattern);
    expect(() => picker.unregister(new ScatterChart(makeScene()))).toThrow(pattern);
    expect(() => picker.pickAt(0, 0)).toThrow(pattern);
  });
});
