import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { FocusFollower } from '../../src/interact/FocusFollower.js';
import { BarChart } from '../../src/chart/BarChart.js';
import { loop } from '../../src/core/Graph3DLoop.js';

// FocusFollower delegates orbit motion to anim/CameraTour, which registers
// directly with the shared `loop` — mocked the same way
// tests/anim/CameraTour.test.js does, so ticks can be driven synchronously.
vi.mock('../../src/core/Graph3DLoop.js', () => ({
  loop: { add: vi.fn(), remove: vi.fn() },
}));

afterEach(() => {
  vi.clearAllMocks();
});

function makeCamera() {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(0, 0, 20);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return camera;
}

function makeChart(rows = [{ id: 0, x: 0, value: 1 }]) {
  const chart = new BarChart(new THREE.Scene()).x((d) => d.x).y((d) => d.value);
  chart.data(rows, (d) => d.id);
  chart.render();
  return chart;
}

function lastTick() {
  return loop.add.mock.calls.at(-1)[0];
}

describe('FocusFollower constructor', () => {
  it('throws for a non-Camera', () => {
    expect(() => new FocusFollower({ camera: {} })).toThrow(TypeError);
  });

  it('throws for non-positive radius/height/durationMs', () => {
    expect(() => new FocusFollower({ camera: makeCamera(), radius: 0 })).toThrow(TypeError);
    expect(() => new FocusFollower({ camera: makeCamera(), height: -1 })).toThrow(TypeError);
    expect(() => new FocusFollower({ camera: makeCamera(), durationMs: 0 })).toThrow(TypeError);
  });

  it('throws for segments below 3 or non-integer', () => {
    expect(() => new FocusFollower({ camera: makeCamera(), segments: 2 })).toThrow(TypeError);
    expect(() => new FocusFollower({ camera: makeCamera(), segments: 3.5 })).toThrow(TypeError);
  });

  it('starts not following', () => {
    const follower = new FocusFollower({ camera: makeCamera() });
    expect(follower.isFollowing).toBe(false);
  });
});

describe('FocusFollower.follow', () => {
  it('throws TypeError if chart lacks selection()/scene', () => {
    const follower = new FocusFollower({ camera: makeCamera() });
    expect(() => follower.follow({}, {})).toThrow(TypeError);
  });

  it('throws if datum is not currently bound to chart', () => {
    const follower = new FocusFollower({ camera: makeCamera() });
    const chart = makeChart();
    expect(() => follower.follow(chart, { id: 999 })).toThrow(/not currently bound/);
  });

  it('starts an orbit (registers a tick with the shared loop) and sets isFollowing', () => {
    const follower = new FocusFollower({ camera: makeCamera() });
    const chart = makeChart();
    follower.follow(chart, chart.data()[0]);
    expect(follower.isFollowing).toBe(true);
    expect(loop.add).toHaveBeenCalledOnce();
  });

  it('moves the camera on tick', () => {
    const camera = makeCamera();
    const follower = new FocusFollower({ camera, radius: 8, height: 3, durationMs: 4000, segments: 4 });
    const chart = makeChart();
    const startPos = camera.position.clone();

    follower.follow(chart, chart.data()[0]);
    lastTick()(0.5); // half a second into the first (1000ms) segment
    expect(camera.position.distanceTo(startPos)).toBeGreaterThan(0);
  });

  it('continuously re-orbits after a full lap instead of stopping', () => {
    const follower = new FocusFollower({ camera: makeCamera(), durationMs: 1000, segments: 4 });
    const chart = makeChart();
    follower.follow(chart, chart.data()[0]);

    const callsBeforeLap = loop.add.mock.calls.length;
    const tick = lastTick();
    // 4 segments of 250ms each; push well past the full 1000ms lap.
    tick(0.3);
    tick(0.3);
    tick(0.3);
    tick(0.3);

    expect(follower.isFollowing).toBe(true);
    // A fresh CameraTour.orbit() registered its own tick for the next lap.
    expect(loop.add.mock.calls.length).toBeGreaterThan(callsBeforeLap);
  });

  it('redirecting follow() to a new target cancels the previous orbit', () => {
    const follower = new FocusFollower({ camera: makeCamera() });
    const chartA = makeChart([{ id: 0, x: 0, value: 1 }]);
    const chartB = makeChart([{ id: 0, x: 5, value: 2 }]);

    follower.follow(chartA, chartA.data()[0]);
    follower.follow(chartB, chartB.data()[0]);
    expect(loop.remove).toHaveBeenCalledOnce();
    expect(follower.isFollowing).toBe(true);
  });

  it('throws after dispose', () => {
    const follower = new FocusFollower({ camera: makeCamera() });
    follower.dispose();
    expect(() => follower.follow(makeChart(), {})).toThrow(/disposed/);
  });
});

describe('FocusFollower.stop', () => {
  it('is a no-op when not following', () => {
    const follower = new FocusFollower({ camera: makeCamera() });
    expect(() => follower.stop()).not.toThrow();
    expect(follower.isFollowing).toBe(false);
  });

  it('stops an in-progress orbit', () => {
    const follower = new FocusFollower({ camera: makeCamera() });
    const chart = makeChart();
    follower.follow(chart, chart.data()[0]);

    follower.stop();
    expect(follower.isFollowing).toBe(false);
    expect(loop.remove).toHaveBeenCalledOnce();
  });

  it('throws after dispose', () => {
    const follower = new FocusFollower({ camera: makeCamera() });
    follower.dispose();
    expect(() => follower.stop()).toThrow(/disposed/);
  });
});

describe('FocusFollower.dispose', () => {
  it('stops any in-progress orbit and is idempotent', () => {
    const follower = new FocusFollower({ camera: makeCamera() });
    const chart = makeChart();
    follower.follow(chart, chart.data()[0]);

    follower.dispose();
    expect(follower.isFollowing).toBe(false);
    expect(loop.remove).toHaveBeenCalledOnce();
    expect(() => follower.dispose()).not.toThrow();
  });
});
