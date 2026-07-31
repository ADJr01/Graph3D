import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { projectToScreen, matchedIndicesForChart } from '../../src/interact/regionSelect.js';
import { BarChart } from '../../src/chart/BarChart.js';

function makeCamera() {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return camera;
}

const CANVAS = { width: 100, height: 100 };

describe('projectToScreen', () => {
  it('maps world origin to canvas center', () => {
    const point = projectToScreen(new THREE.Vector3(0, 0, 0), makeCamera(), CANVAS);
    expect(point.x).toBeCloseTo(50, 5);
    expect(point.y).toBeCloseTo(50, 5);
  });

  it('maps the frustum edges to the canvas edges', () => {
    const camera = makeCamera();
    const left = projectToScreen(new THREE.Vector3(-5, 0, 0), camera, CANVAS);
    const right = projectToScreen(new THREE.Vector3(5, 0, 0), camera, CANVAS);
    const top = projectToScreen(new THREE.Vector3(0, 5, 0), camera, CANVAS);
    const bottom = projectToScreen(new THREE.Vector3(0, -5, 0), camera, CANVAS);
    expect(left.x).toBeCloseTo(0, 5);
    expect(right.x).toBeCloseTo(100, 5);
    expect(top.y).toBeCloseTo(0, 5); // screen y is top-origin, world +y is up
    expect(bottom.y).toBeCloseTo(100, 5);
  });

  it('returns null for a point outside the near/far planes', () => {
    const camera = makeCamera();
    expect(projectToScreen(new THREE.Vector3(0, 0, 1000), camera, CANVAS)).toBeNull();
  });
});

describe('matchedIndicesForChart', () => {
  function makeChart(rows, worldXs) {
    const chart = new BarChart(new THREE.Scene()).x((d) => d.id).y((d) => d.value);
    chart.data(rows, (d) => d.id);
    chart.render();
    chart.selection().attr('position.x', (_d, i) => worldXs[i]).attr('position.y', 0);
    return chart;
  }

  it('returns local indices (not raw instance/backend indices) whose screen position satisfies containsFn', () => {
    const chart = makeChart([{ id: 0, value: 1 }, { id: 1, value: 1 }, { id: 2, value: 1 }], [-3, 0, 3]);
    const matched = matchedIndicesForChart(chart, makeCamera(), CANVAS, (x) => x > 40 && x < 60);
    expect(matched).toEqual(new Set([1]));
  });

  it('returns an empty set when nothing matches', () => {
    const chart = makeChart([{ id: 0, value: 1 }], [-3]);
    const matched = matchedIndicesForChart(chart, makeCamera(), CANVAS, (x) => x > 40 && x < 60);
    expect(matched.size).toBe(0);
  });

  it('works for the instanced backend too, matching by local (not raw) index', () => {
    const rows = Array.from({ length: 60 }, (_unused, i) => ({ id: i, value: 1 }));
    const chart = new BarChart(new THREE.Scene()).x((d) => d.id).y((d) => d.value);
    chart.data(rows, (d) => d.id);
    chart.render();
    chart.selection().attr('position.x', (_d, i) => (i - 30) * 0.5).attr('position.y', 0);

    const matched = matchedIndicesForChart(chart, makeCamera(), CANVAS, (x) => x > 40 && x < 60);
    // world x in (-1, 1) roughly maps to screen x in (40, 60); i in [29, 31] satisfies (i-30)*0.5 in that range.
    expect([...matched].every((i) => i >= 28 && i <= 32)).toBe(true);
    expect(matched.size).toBeGreaterThan(0);
  });

  it('refreshes the camera matrixWorld before projecting — mirrors OrbitControls writing position/quaternion synchronously without a render() in between', () => {
    // Same stale-rotation setup as Picker.test.js's matching case:
    // Object3D.lookAt() bakes the *old* quaternion's rotation into
    // matrixWorld before assigning the new, correct quaternion.
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(10, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    const chart = new BarChart(new THREE.Scene()).x((d) => d.id).y((d) => d.value);
    chart.data([{ id: 0, value: 1 }], (d) => d.id);
    chart.render();
    chart.selection().attr('position.x', 0).attr('position.y', 0).attr('position.z', 0);

    // The datum sits exactly on this camera's look-at target, so it only
    // projects near canvas center once the camera's actual rotation (not
    // just its translation) is accounted for.
    const matched = matchedIndicesForChart(chart, camera, CANVAS, (x, y) => Math.abs(x - 50) < 5 && Math.abs(y - 50) < 5);
    expect(matched).toEqual(new Set([0]));
  });
});
