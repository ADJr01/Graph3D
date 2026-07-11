import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LOD } from '../../src/stream/LOD.js';

// core/Graph3DLoop's shared singleton drives LOD's per-frame check via a
// real requestAnimationFrame — stub it (mirrors tests/chart/GraphChart.test.js's
// destroy()/stream() describe blocks) so tests control exactly when a frame fires.
let rafCallback = null;
function tick(now = 0) {
  expect(rafCallback, 'tick() called but no RAF was scheduled').not.toBeNull();
  const cb = rafCallback;
  rafCallback = null;
  cb(now);
}

beforeEach(() => {
  rafCallback = null;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb) => {
      rafCallback = cb;
      return 1;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn(() => { rafCallback = null; }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** @param {number} initialDistance */
function makeCamera(initialDistance) {
  let distance = initialDistance;
  return {
    position: { distanceTo: () => distance },
    setDistance: (d) => {
      distance = d;
    },
  };
}

/** @param {Array} initialData */
function makeChart(initialData) {
  let data = initialData;
  return {
    scene: { position: {} },
    data: vi.fn((arr, keyFn) => {
      if (arr === undefined) return data;
      data = arr;
      return { arr, keyFn };
    }),
    update: vi.fn(),
  };
}

const NEAR = [{ maxDistance: 10, maxPoints: 10 }];
const NEAR_FAR = [
  { maxDistance: 10, maxPoints: 10 },
  { maxDistance: 100, maxPoints: 3 },
];
const tenPoints = Array.from({ length: 10 }, (_, i) => ({ id: i }));

describe('LOD constructor validation', () => {
  it('throws for a chart missing data()/update()/scene', () => {
    expect(() => new LOD({ chart: {}, camera: makeCamera(5), levels: NEAR })).toThrow(TypeError);
    expect(() => new LOD({ chart: { data: () => [], update: () => {} }, camera: makeCamera(5), levels: NEAR })).toThrow(TypeError);
  });

  it('throws for a camera missing position.distanceTo', () => {
    expect(() => new LOD({ chart: makeChart(tenPoints), camera: {}, levels: NEAR })).toThrow(TypeError);
  });

  it('throws for an invalid levels array', () => {
    expect(() => new LOD({ chart: makeChart(tenPoints), camera: makeCamera(5), levels: [] })).toThrow(TypeError);
    expect(() => new LOD({ chart: makeChart(tenPoints), camera: makeCamera(5), levels: [{ maxDistance: -1, maxPoints: 1 }] })).toThrow(TypeError);
  });

  it('throws for a non-function keyFn', () => {
    expect(() => new LOD({ chart: makeChart(tenPoints), camera: makeCamera(5), levels: NEAR, keyFn: 'nope' })).toThrow(TypeError);
  });
});

describe('LOD re-LOD behavior', () => {
  it('applies the initial level immediately at construction (no-op when data is already under maxPoints)', () => {
    const chart = makeChart(tenPoints);
    const lod = new LOD({ chart, camera: makeCamera(5), levels: NEAR });
    expect(lod.currentMaxPoints).toBe(10);
    expect(chart.update).toHaveBeenCalledTimes(1);
    expect(chart.data()).toHaveLength(10);
    lod.dispose();
  });

  it('re-decimates and calls update() when a camera-distance change crosses into a farther level', () => {
    const camera = makeCamera(5);
    const chart = makeChart(tenPoints);
    const lod = new LOD({ chart, camera, levels: NEAR_FAR });
    expect(chart.update).toHaveBeenCalledTimes(1);

    camera.setDistance(50);
    tick();

    expect(lod.currentMaxPoints).toBe(3);
    expect(chart.data()).toHaveLength(3);
    expect(chart.update).toHaveBeenCalledTimes(2);
    lod.dispose();
  });

  it('is a no-op when the camera moves but stays within the same level bucket', () => {
    const camera = makeCamera(5);
    const chart = makeChart(tenPoints);
    const lod = new LOD({ chart, camera, levels: NEAR_FAR });
    expect(chart.update).toHaveBeenCalledTimes(1);

    camera.setDistance(6); // still <= 10, same level
    tick();

    expect(chart.update).toHaveBeenCalledTimes(1);
    lod.dispose();
  });

  it('falls back to the farthest level once distance exceeds every threshold', () => {
    const camera = makeCamera(9999);
    const chart = makeChart(tenPoints);
    const lod = new LOD({ chart, camera, levels: NEAR_FAR });
    expect(lod.currentMaxPoints).toBe(3);
    lod.dispose();
  });

  it('passes the configured keyFn through to chart.data() on re-decimation', () => {
    const camera = makeCamera(5);
    const chart = makeChart(tenPoints);
    const keyFn = (d) => d.id;
    const lod = new LOD({ chart, camera, levels: NEAR_FAR, keyFn });

    camera.setDistance(50);
    tick();

    const lastCall = chart.data.mock.calls.at(-1);
    expect(lastCall[1]).toBe(keyFn);
    lod.dispose();
  });

  it('dispose() stops the per-frame check and is idempotent', () => {
    const camera = makeCamera(5);
    const chart = makeChart(tenPoints);
    const lod = new LOD({ chart, camera, levels: NEAR_FAR });
    lod.dispose();
    expect(() => lod.dispose()).not.toThrow();

    camera.setDistance(50);
    // No RAF was re-scheduled after dispose() — asserting there is nothing
    // left to tick() confirms the callback was unregistered.
    expect(rafCallback).toBeNull();
  });
});
