import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { CameraTour } from '../../src/anim/CameraTour.js';
import { loop } from '../../src/core/Graph3DLoop.js';

// CameraTour registers directly with the shared `loop` (not via `anim`), so —
// mirroring tests/scene/GraphSceneCamera.test.js's existing convention for
// exactly this dependency — the whole module is mocked: `loop.add`/`.remove`
// just record calls, and tests invoke the captured tick function directly
// with a synthetic `deltaSeconds` instead of waiting on a real RAF.
vi.mock('../../src/core/Graph3DLoop.js', () => ({
  loop: { add: vi.fn(), remove: vi.fn() },
}));

afterEach(() => {
  vi.clearAllMocks();
});

function makeCamera({ position = [0, 0, 20], fov = 50 } = {}) {
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 1000);
  camera.position.set(...position);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return camera;
}

function lastTick() {
  return loop.add.mock.calls.at(-1)[0];
}

const WP = [
  { at: [10, 5, 10], lookAt: [0, 0, 0], duration: 1000 },
  { at: [-5, 2, 8], lookAt: [0, 0, 0], duration: 500 },
];

describe('constructor', () => {
  it('throws for a non-Camera', () => {
    expect(() => new CameraTour({}, WP)).toThrow(TypeError);
  });

  it('throws for an empty waypoints array', () => {
    expect(() => new CameraTour(makeCamera(), [])).toThrow(TypeError);
  });

  it('throws when a waypoint is missing at or lookAt', () => {
    expect(() => new CameraTour(makeCamera(), [{ at: [0, 0, 0] }])).toThrow(TypeError);
    expect(() => new CameraTour(makeCamera(), [{ lookAt: [0, 0, 0] }])).toThrow(TypeError);
  });

  it('auto-plays, registering exactly one tick with the shared loop', () => {
    new CameraTour(makeCamera(), WP);
    expect(loop.add).toHaveBeenCalledOnce();
  });
});

describe('playback', () => {
  it('moves the camera toward the first waypoint on tick', () => {
    const camera = makeCamera();
    const startPos = camera.position.clone();
    new CameraTour(camera, WP);
    lastTick()(0.5); // half a second into the 1-second first waypoint
    expect(camera.position.distanceTo(startPos)).toBeGreaterThan(0);
  });

  it('advances to the next waypoint once the current one completes', () => {
    const camera = makeCamera();
    new CameraTour(camera, WP);
    const tick = lastTick();
    tick(1.1); // past the first waypoint's 1000ms duration
    expect(loop.remove).not.toHaveBeenCalled(); // second waypoint remains
    tick(0.6); // past the second waypoint's 500ms duration
    expect(loop.remove).toHaveBeenCalled();
  });

  it('interpolates fov for a perspective camera', () => {
    const camera = makeCamera({ fov: 50 });
    new CameraTour(camera, [{ at: [5, 5, 5], lookAt: [0, 0, 0], fov: 30, duration: 1000 }]);
    lastTick()(1.1); // complete the only waypoint
    expect(camera.fov).toBeCloseTo(30, 0);
  });

  it('applies per-waypoint easing', () => {
    const camera = makeCamera({ position: [0, 0, 0] });
    new CameraTour(camera, [{ at: [10, 0, 0], lookAt: [0, 0, 0], duration: 1000, easing: 'easeInQuad' }]);
    lastTick()(0.5); // easeInQuad(0.5) === 0.25
    expect(camera.position.x).toBeCloseTo(2.5);
  });

  it('fires onComplete once every waypoint is reached', () => {
    const onComplete = vi.fn();
    const tour = new CameraTour(makeCamera(), WP);
    tour.onComplete(onComplete);
    const tick = lastTick();
    tick(1.1);
    expect(onComplete).not.toHaveBeenCalled();
    tick(0.6);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('onComplete throws for a non-function handler', () => {
    const tour = new CameraTour(makeCamera(), WP);
    expect(() => tour.onComplete('nope')).toThrow(TypeError);
  });
});

describe('pause() / resume()', () => {
  it('pause() freezes the camera and unregisters from the loop; resume() continues', () => {
    const camera = makeCamera();
    const tour = new CameraTour(camera, WP);
    const tick = lastTick();
    tick(0.5);
    const frozenPos = camera.position.clone();

    tour.pause();
    expect(tour.isPlaying).toBe(false);
    expect(loop.remove).toHaveBeenCalledWith(tick);

    tour.resume();
    expect(tour.isPlaying).toBe(true);
    expect(camera.position.equals(frozenPos)).toBe(true); // unchanged by pause/resume alone
    expect(loop.add).toHaveBeenCalledTimes(2); // once on construction, once on resume()
  });

  it('play()/pause() are no-ops when already in that state', () => {
    const tour = new CameraTour(makeCamera(), WP);
    tour.play(); // already playing
    expect(loop.add).toHaveBeenCalledOnce();
    tour.pause();
    tour.pause(); // already paused
    expect(loop.remove).toHaveBeenCalledOnce();
  });
});

describe('skipToNext()', () => {
  it('snaps to the end of the current waypoint and advances', () => {
    const camera = makeCamera();
    const tour = new CameraTour(camera, WP);
    tour.skipToNext();
    expect(camera.position.toArray()).toEqual([10, 5, 10]);
    expect(tour.currentWaypointIndex).toBe(1);
  });

  it('completes the tour when skipping past the last waypoint', () => {
    const onComplete = vi.fn();
    const tour = new CameraTour(makeCamera(), WP).onComplete(onComplete);
    tour.skipToNext();
    tour.skipToNext();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(loop.remove).toHaveBeenCalled();
  });

  it('is a no-op once the tour has already completed', () => {
    const tour = new CameraTour(makeCamera(), WP);
    tour.skipToNext();
    tour.skipToNext();
    expect(() => tour.skipToNext()).not.toThrow();
  });
});

describe('cancel()', () => {
  it('unregisters from the loop and is idempotent', () => {
    const tour = new CameraTour(makeCamera(), WP);
    const tick = lastTick();
    tour.cancel();
    expect(loop.remove).toHaveBeenCalledWith(tick);
    expect(() => tour.cancel()).not.toThrow();
  });

  it('play()/resume()/skipToNext() become no-ops after cancel()', () => {
    const camera = makeCamera();
    const tour = new CameraTour(camera, WP);
    tour.cancel();
    loop.add.mockClear();

    tour.play();
    tour.resume();
    tour.skipToNext();
    expect(loop.add).not.toHaveBeenCalled();
    expect(tour.isPlaying).toBe(false);
  });
});

describe('presets', () => {
  it('orbit() builds `segments` waypoints around center at the given radius/height', () => {
    const camera = makeCamera();
    const tour = CameraTour.orbit(camera, { center: [0, 0, 0], radius: 10, height: 2, segments: 4 });
    expect(tour).toBeInstanceOf(CameraTour);
    tour.skipToNext();
    expect(camera.position.y).toBeCloseTo(2);
    expect(camera.position.distanceTo(new THREE.Vector3(0, 2, 0))).toBeCloseTo(10);
  });

  it('orbit() throws for fewer than 3 segments', () => {
    expect(() => CameraTour.orbit(makeCamera(), { segments: 2 })).toThrow(TypeError);
  });

  it('flyTo() builds a single-waypoint tour to the given position/lookAt/fov', () => {
    const camera = makeCamera({ fov: 50 });
    const tour = CameraTour.flyTo(camera, { at: [5, 5, 5], lookAt: [0, 0, 0], fov: 30, duration: 1000 });
    tour.skipToNext();
    expect(camera.position.toArray()).toEqual([5, 5, 5]);
    expect(camera.fov).toBeCloseTo(30);
  });

  it('cinematicReveal() builds a two-waypoint sweep-in tour', () => {
    const camera = makeCamera();
    const tour = CameraTour.cinematicReveal(camera, { target: [0, 0, 0] });
    expect(tour.currentWaypointIndex).toBe(0);
    tour.skipToNext();
    expect(tour.currentWaypointIndex).toBe(1);
    tour.skipToNext();
    expect(tour.currentWaypointIndex).toBe(2); // completed
  });
});
