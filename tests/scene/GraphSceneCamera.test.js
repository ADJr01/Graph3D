import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { GraphSceneCamera } from '../../src/scene/GraphSceneCamera.js';
import { loop } from '../../src/core/Graph3DLoop.js';

// Stub the animation loop — ticks are never called automatically in jsdom.
vi.mock('../../src/core/Graph3DLoop.js', () => ({
  loop: { add: vi.fn(), remove: vi.fn(), start: vi.fn(), stop: vi.fn() },
}));

// Regular constructor function — arrow functions can't be called with `new`,
// which is how vitest invokes the implementation for constructor mocks.
vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: vi.fn(function MockOrbitControls(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.target = { set: vi.fn(), copy: vi.fn() };
    this.update = vi.fn();
    this.dispose = vi.fn();
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks(); // reset OrbitControls call history between tests
});

/** Get the OrbitControls instance from the most recent enableOrbitControls() call. */
async function getLastControls() {
  const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
  return OrbitControls.mock.instances.at(-1);
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('GraphSceneCamera constructor', () => {
  it('defaults to orbit preset', () => {
    const cam = new GraphSceneCamera();
    expect(cam.preset).toBe('orbit');
  });

  it('accepts a valid preset override', () => {
    const cam = new GraphSceneCamera({ preset: 'top-down' });
    expect(cam.preset).toBe('top-down');
  });

  it('throws TypeError for an unknown preset', () => {
    expect(() => new GraphSceneCamera({ preset: 'unknown' })).toThrow(TypeError);
    expect(() => new GraphSceneCamera({ preset: 'unknown' })).toThrow(/unknown preset/);
  });
});

// ── .three getter ─────────────────────────────────────────────────────────────

describe('GraphSceneCamera.three', () => {
  it('returns PerspectiveCamera for orbit', () => {
    expect(new GraphSceneCamera({ preset: 'orbit' }).three).toBeInstanceOf(THREE.PerspectiveCamera);
  });

  it('returns PerspectiveCamera for fixed', () => {
    expect(new GraphSceneCamera({ preset: 'fixed' }).three).toBeInstanceOf(THREE.PerspectiveCamera);
  });

  it('returns PerspectiveCamera for cinematic-low', () => {
    expect(new GraphSceneCamera({ preset: 'cinematic-low' }).three).toBeInstanceOf(THREE.PerspectiveCamera);
  });

  it('returns PerspectiveCamera for cinematic-high', () => {
    expect(new GraphSceneCamera({ preset: 'cinematic-high' }).three).toBeInstanceOf(THREE.PerspectiveCamera);
  });

  it('returns OrthographicCamera for isometric', () => {
    expect(new GraphSceneCamera({ preset: 'isometric' }).three).toBeInstanceOf(THREE.OrthographicCamera);
  });

  it('returns OrthographicCamera for top-down', () => {
    expect(new GraphSceneCamera({ preset: 'top-down' }).three).toBeInstanceOf(THREE.OrthographicCamera);
  });
});

// ── setPreset() ───────────────────────────────────────────────────────────────

describe('GraphSceneCamera.setPreset()', () => {
  let cam;
  beforeEach(() => { cam = new GraphSceneCamera(); });

  it('switches to an orthographic camera', () => {
    cam.setPreset('isometric');
    expect(cam.three).toBeInstanceOf(THREE.OrthographicCamera);
  });

  it('switches back to perspective camera', () => {
    cam.setPreset('isometric');
    cam.setPreset('orbit');
    expect(cam.three).toBeInstanceOf(THREE.PerspectiveCamera);
  });

  it('updates preset getter', () => {
    cam.setPreset('top-down');
    expect(cam.preset).toBe('top-down');
  });

  it('is chainable', () => {
    expect(cam.setPreset('fixed')).toBe(cam);
  });

  it('throws TypeError for an unknown preset', () => {
    expect(() => cam.setPreset('nope')).toThrow(TypeError);
    expect(() => cam.setPreset('nope')).toThrow(/unknown preset/);
  });

  it('throws after dispose()', () => {
    cam.dispose();
    expect(() => cam.setPreset('orbit')).toThrow(/disposed/);
  });

  it('replaces the camera object — .three is a new instance after switching', () => {
    const before = cam.three;
    cam.setPreset('fixed');
    expect(cam.three).not.toBe(before);
  });
});

// ── lookAt() ──────────────────────────────────────────────────────────────────

describe('GraphSceneCamera.lookAt()', () => {
  let cam;
  beforeEach(() => { cam = new GraphSceneCamera(); });

  it('is chainable', () => {
    expect(cam.lookAt(0, 0, 0)).toBe(cam);
  });

  it('does not throw with valid coordinates', () => {
    expect(() => cam.lookAt(1, 2, 3)).not.toThrow();
  });

  it('throws after dispose()', () => {
    cam.dispose();
    expect(() => cam.lookAt(0, 0, 0)).toThrow(/disposed/);
  });

  it('updates orbit controls target when controls are active', async () => {
    await cam.enableOrbitControls(document.createElement('canvas'));
    const controls = await getLastControls();
    cam.lookAt(1, 2, 3);
    expect(controls.target.set).toHaveBeenCalledWith(1, 2, 3);
    expect(controls.update).toHaveBeenCalled();
  });
});

// ── target ────────────────────────────────────────────────────────────────────

describe('GraphSceneCamera.target', () => {
  it('defaults to the active preset\'s configured target', () => {
    const cam = new GraphSceneCamera({ preset: 'isometric' });
    expect(cam.target.toArray()).toEqual([0, 0, 0]);
  });

  it('reflects the last lookAt() call', () => {
    const cam = new GraphSceneCamera();
    cam.lookAt(1, 2, 3);
    expect(cam.target.toArray()).toEqual([1, 2, 3]);
  });

  it('resets to the new preset\'s target on setPreset()', () => {
    const cam = new GraphSceneCamera();
    cam.lookAt(9, 9, 9);
    cam.setPreset('top-down');
    expect(cam.target.toArray()).toEqual([0, 0, 0]);
  });

  it('returns a fresh clone each time — mutating it does not affect the camera', () => {
    const cam = new GraphSceneCamera();
    cam.target.set(99, 99, 99);
    expect(cam.target.toArray()).toEqual([0, 0, 0]);
  });
});

// ── setPosition() ─────────────────────────────────────────────────────────────

describe('GraphSceneCamera.setPosition()', () => {
  let cam;
  beforeEach(() => { cam = new GraphSceneCamera(); });

  it('moves the camera position', () => {
    cam.setPosition(5, 10, 15);
    expect(cam.three.position.x).toBeCloseTo(5);
    expect(cam.three.position.y).toBeCloseTo(10);
    expect(cam.three.position.z).toBeCloseTo(15);
  });

  it('is chainable', () => {
    expect(cam.setPosition(0, 0, 0)).toBe(cam);
  });

  it('throws after dispose()', () => {
    cam.dispose();
    expect(() => cam.setPosition(0, 0, 0)).toThrow(/disposed/);
  });
});

// ── useCustom() ───────────────────────────────────────────────────────────────

describe('GraphSceneCamera.useCustom()', () => {
  let cam;
  beforeEach(() => { cam = new GraphSceneCamera(); });

  it('replaces the internal camera with the custom one', () => {
    const custom = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    cam.useCustom(custom);
    expect(cam.three).toBe(custom);
  });

  it('sets preset to null', () => {
    cam.useCustom(new THREE.PerspectiveCamera(45, 1, 0.1, 100));
    expect(cam.preset).toBeNull();
  });

  it('is chainable', () => {
    expect(cam.useCustom(new THREE.PerspectiveCamera(45, 1, 0.1, 100))).toBe(cam);
  });

  it('throws TypeError when given a non-Camera', () => {
    expect(() => cam.useCustom({ fov: 45 })).toThrow(TypeError);
    expect(() => cam.useCustom(null)).toThrow(TypeError);
  });

  it('throws after dispose()', () => {
    cam.dispose();
    expect(() => cam.useCustom(new THREE.PerspectiveCamera())).toThrow(/disposed/);
  });
});

// ── setMaxZoomIn() / setMaxZoomOut() ─────────────────────────────────────────

describe('GraphSceneCamera.setMaxZoomIn() / setMaxZoomOut()', () => {
  let cam;
  beforeEach(() => { cam = new GraphSceneCamera(); });

  it('are chainable', () => {
    expect(cam.setMaxZoomIn(2)).toBe(cam);
    expect(cam.setMaxZoomOut(50)).toBe(cam);
  });

  it('throw TypeError for non-positive or non-finite values', () => {
    for (const bad of [0, -1, NaN, Infinity, '2', null, undefined]) {
      expect(() => cam.setMaxZoomIn(bad)).toThrow(TypeError);
      expect(() => cam.setMaxZoomOut(bad)).toThrow(TypeError);
    }
  });

  it('throw after dispose()', () => {
    cam.dispose();
    expect(() => cam.setMaxZoomIn(2)).toThrow(/disposed/);
    expect(() => cam.setMaxZoomOut(50)).toThrow(/disposed/);
  });

  it('do nothing observable when no OrbitControls are active yet', () => {
    expect(() => cam.setMaxZoomIn(2).setMaxZoomOut(50)).not.toThrow();
  });

  it('set minDistance/maxDistance on OrbitControls for a perspective preset', async () => {
    cam.setMaxZoomIn(2).setMaxZoomOut(50);
    await cam.enableOrbitControls(document.createElement('canvas'));
    const controls = await getLastControls();
    expect(controls.minDistance).toBe(2);
    expect(controls.maxDistance).toBe(50);
  });

  it('set maxZoom/minZoom on OrbitControls for an orthographic preset', async () => {
    cam.setPreset('isometric');
    cam.setMaxZoomIn(4).setMaxZoomOut(0.5);
    await cam.enableOrbitControls(document.createElement('canvas'));
    const controls = await getLastControls();
    expect(controls.maxZoom).toBe(4);
    expect(controls.minZoom).toBe(0.5);
  });

  it('apply immediately when OrbitControls are already active', async () => {
    await cam.enableOrbitControls(document.createElement('canvas'));
    const controls = await getLastControls();
    cam.setMaxZoomIn(3);
    expect(controls.minDistance).toBe(3);
  });

  it('are reapplied after a setPreset() + re-enableOrbitControls() switch to orthographic', async () => {
    cam.setMaxZoomIn(4).setMaxZoomOut(0.5);
    cam.setPreset('top-down');
    await cam.enableOrbitControls(document.createElement('canvas'));
    const controls = await getLastControls();
    expect(controls.maxZoom).toBe(4);
    expect(controls.minZoom).toBe(0.5);
  });
});

// ── setMinPolarAngle() / setMaxPolarAngle() ──────────────────────────────────

describe('GraphSceneCamera.setMinPolarAngle() / setMaxPolarAngle()', () => {
  let cam;
  beforeEach(() => { cam = new GraphSceneCamera(); });

  it('are chainable', () => {
    expect(cam.setMinPolarAngle(0.5)).toBe(cam);
    expect(cam.setMaxPolarAngle(2.5)).toBe(cam);
  });

  it('throw TypeError for values outside [0, Math.PI] or non-finite', () => {
    for (const bad of [-0.1, Math.PI + 0.1, NaN, Infinity, '1', null, undefined]) {
      expect(() => cam.setMinPolarAngle(bad)).toThrow(TypeError);
      expect(() => cam.setMaxPolarAngle(bad)).toThrow(TypeError);
    }
  });

  it('throw after dispose()', () => {
    cam.dispose();
    expect(() => cam.setMinPolarAngle(0.5)).toThrow(/disposed/);
    expect(() => cam.setMaxPolarAngle(2.5)).toThrow(/disposed/);
  });

  it('do nothing observable when no OrbitControls are active yet', () => {
    expect(() => cam.setMinPolarAngle(0.5).setMaxPolarAngle(2.5)).not.toThrow();
  });

  it('set minPolarAngle/maxPolarAngle on OrbitControls', async () => {
    cam.setMinPolarAngle(0.5).setMaxPolarAngle(2.5);
    await cam.enableOrbitControls(document.createElement('canvas'));
    const controls = await getLastControls();
    expect(controls.minPolarAngle).toBe(0.5);
    expect(controls.maxPolarAngle).toBe(2.5);
  });

  it('apply immediately when OrbitControls are already active', async () => {
    await cam.enableOrbitControls(document.createElement('canvas'));
    const controls = await getLastControls();
    cam.setMinPolarAngle(0.3);
    expect(controls.minPolarAngle).toBe(0.3);
  });

  it('are reapplied after a setPreset() + re-enableOrbitControls() switch', async () => {
    cam.setMinPolarAngle(0.5).setMaxPolarAngle(2.5);
    cam.setPreset('top-down');
    await cam.enableOrbitControls(document.createElement('canvas'));
    const controls = await getLastControls();
    expect(controls.minPolarAngle).toBe(0.5);
    expect(controls.maxPolarAngle).toBe(2.5);
  });

  it('throw RangeError when set to cross an already-set opposite bound', () => {
    cam.setMinPolarAngle(1.5);
    expect(() => cam.setMaxPolarAngle(1.0)).toThrow(RangeError);

    cam.setMaxPolarAngle(2.0);
    expect(() => cam.setMinPolarAngle(2.5)).toThrow(RangeError);
  });

  it('allow setting min === max', () => {
    cam.setMinPolarAngle(1.5);
    expect(() => cam.setMaxPolarAngle(1.5)).not.toThrow();
  });

  it('leave the rejected bound unchanged after a RangeError', async () => {
    cam.setMinPolarAngle(1.5).setMaxPolarAngle(2.5);
    expect(() => cam.setMaxPolarAngle(1.0)).toThrow(RangeError);
    await cam.enableOrbitControls(document.createElement('canvas'));
    const controls = await getLastControls();
    expect(controls.maxPolarAngle).toBe(2.5);
  });

  it('call orbitControls.update() to re-clamp a camera already outside new bounds', async () => {
    await cam.enableOrbitControls(document.createElement('canvas'));
    const controls = await getLastControls();
    controls.update.mockClear();
    cam.setMinPolarAngle(0.5);
    expect(controls.update).toHaveBeenCalled();
  });
});

// ── enableOrbitControls() / disableOrbitControls() ───────────────────────────

describe('GraphSceneCamera orbit controls', () => {
  let cam;
  beforeEach(() => { cam = new GraphSceneCamera(); });

  it('enableOrbitControls returns a Promise resolving to the camera instance', async () => {
    const result = await cam.enableOrbitControls(document.createElement('canvas'));
    expect(result).toBe(cam);
  });

  it('instantiates OrbitControls with the current THREE camera and domElement', async () => {
    const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
    const el = document.createElement('canvas');
    await cam.enableOrbitControls(el);
    expect(OrbitControls).toHaveBeenCalledWith(cam.three, el);
  });

  it('throws TypeError when domElement is falsy', async () => {
    await expect(cam.enableOrbitControls(null)).rejects.toThrow(TypeError);
    await expect(cam.enableOrbitControls(undefined)).rejects.toThrow(/domElement is required/);
  });

  it('throws after dispose()', async () => {
    cam.dispose();
    await expect(cam.enableOrbitControls(document.createElement('canvas'))).rejects.toThrow(/disposed/);
  });

  it('disableOrbitControls disposes the controls', async () => {
    await cam.enableOrbitControls(document.createElement('canvas'));
    const controls = await getLastControls();
    cam.disableOrbitControls();
    expect(controls.dispose).toHaveBeenCalled();
  });

  it('disableOrbitControls is a no-op when no controls are active', () => {
    expect(() => cam.disableOrbitControls()).not.toThrow();
  });

  it('disableOrbitControls is chainable', () => {
    expect(cam.disableOrbitControls()).toBe(cam);
  });

  it('setPreset disposes active orbit controls', async () => {
    await cam.enableOrbitControls(document.createElement('canvas'));
    const controls = await getLastControls();
    cam.setPreset('fixed');
    expect(controls.dispose).toHaveBeenCalled();
  });
});

// ── dispose() ─────────────────────────────────────────────────────────────────

describe('GraphSceneCamera.dispose()', () => {
  let cam;
  beforeEach(() => { cam = new GraphSceneCamera(); });

  it('is idempotent — calling twice does not throw', () => {
    expect(() => { cam.dispose(); cam.dispose(); }).not.toThrow();
  });

  it('disposes active orbit controls on dispose()', async () => {
    await cam.enableOrbitControls(document.createElement('canvas'));
    const controls = await getLastControls();
    cam.dispose();
    expect(controls.dispose).toHaveBeenCalled();
  });

  it('blocks all mutating methods after dispose', () => {
    cam.dispose();
    expect(() => cam.setPreset('orbit')).toThrow(/disposed/);
    expect(() => cam.lookAt(0, 0, 0)).toThrow(/disposed/);
    expect(() => cam.setPosition(0, 0, 0)).toThrow(/disposed/);
    expect(() => cam.useCustom(new THREE.PerspectiveCamera())).toThrow(/disposed/);
  });

  it('cancels the active animation controller on dispose', () => {
    const ctrl = cam.dollyZoom(25, 500);
    const cancelSpy = vi.spyOn(ctrl, 'cancel');
    cam.dispose();
    expect(cancelSpy).toHaveBeenCalled();
  });
});

// ── dollyZoom() ───────────────────────────────────────────────────────────────

describe('GraphSceneCamera.dollyZoom()', () => {
  let cam;
  beforeEach(() => { cam = new GraphSceneCamera(); });

  it('returns a controller with a cancel() method', () => {
    const ctrl = cam.dollyZoom(25, 1000);
    expect(typeof ctrl.cancel).toBe('function');
  });

  it('registers a tick with the loop', () => {
    cam.dollyZoom(25, 1000);
    expect(loop.add).toHaveBeenCalledOnce();
  });

  it('tweens the FOV toward targetFOV over the given duration', () => {
    const startFOV = cam.three.fov; // 60
    cam.dollyZoom(25, 1000);
    const tick = loop.add.mock.calls[0][0];
    // At t=0.5 (half a second of a 1-second tween), FOV should be between start and target.
    tick(0.5);
    expect(cam.three.fov).toBeGreaterThan(25);
    expect(cam.three.fov).toBeLessThan(startFOV);
  });

  it('removes the tick from the loop when the tween completes', () => {
    cam.dollyZoom(25, 1000);
    const tick = loop.add.mock.calls[0][0];
    tick(1.0); // advance past duration
    expect(loop.remove).toHaveBeenCalledWith(tick);
  });

  it('cancel() removes the tick from the loop', () => {
    const ctrl = cam.dollyZoom(25, 1000);
    const tick = loop.add.mock.calls[0][0];
    ctrl.cancel();
    expect(loop.remove).toHaveBeenCalledWith(tick);
  });

  it('throws TypeError for orthographic camera', () => {
    cam.setPreset('isometric');
    expect(() => cam.dollyZoom(25, 1000)).toThrow(TypeError);
    expect(() => cam.dollyZoom(25, 1000)).toThrow(/perspective/);
  });

  it('throws TypeError when targetFOV is out of range', () => {
    expect(() => cam.dollyZoom(0, 1000)).toThrow(TypeError);
    expect(() => cam.dollyZoom(180, 1000)).toThrow(TypeError);
    expect(() => cam.dollyZoom(-5, 1000)).toThrow(TypeError);
  });

  it('throws after dispose()', () => {
    cam.dispose();
    expect(() => cam.dollyZoom(25, 1000)).toThrow(/disposed/);
  });

  it('cancels the previous animation before starting a new one', () => {
    const ctrl1 = cam.dollyZoom(25, 1000);
    const cancel1 = vi.spyOn(ctrl1, 'cancel');
    cam.dollyZoom(45, 500);
    expect(cancel1).toHaveBeenCalled();
  });
});

// ── tour() ────────────────────────────────────────────────────────────────────

describe('GraphSceneCamera.tour()', () => {
  let cam;
  const WP = [
    { at: [10, 5, 10], lookAt: [0, 0, 0], duration: 1000 },
    { at: [-5, 2,  8], lookAt: [0, 0, 0], duration: 500  },
  ];
  beforeEach(() => { cam = new GraphSceneCamera(); });

  it('returns a controller with a cancel() method', () => {
    const ctrl = cam.tour(WP);
    expect(typeof ctrl.cancel).toBe('function');
  });

  it('registers a tick with the loop', () => {
    cam.tour(WP);
    expect(loop.add).toHaveBeenCalledOnce();
  });

  it('moves the camera toward the first waypoint during the first tick', () => {
    cam.tour(WP);
    const tick = loop.add.mock.calls[0][0];
    const startPos = cam.three.position.clone();
    tick(0.5); // half a second into 1-second first waypoint
    // Camera should have moved from start toward [10, 5, 10]
    expect(cam.three.position.distanceTo(startPos)).toBeGreaterThan(0);
  });

  it('advances to the second waypoint after the first is complete', () => {
    cam.tour(WP);
    const tick = loop.add.mock.calls[0][0];
    tick(1.1); // past first waypoint duration (1000ms)
    // Loop should still be running (second waypoint remains)
    expect(loop.remove).not.toHaveBeenCalled();
    tick(0.6); // past second waypoint duration (500ms)
    expect(loop.remove).toHaveBeenCalled();
  });

  it('cancel() removes the tick from the loop', () => {
    const ctrl = cam.tour(WP);
    const tick = loop.add.mock.calls[0][0];
    ctrl.cancel();
    expect(loop.remove).toHaveBeenCalledWith(tick);
  });

  it('throws TypeError for an empty waypoints array', () => {
    expect(() => cam.tour([])).toThrow(TypeError);
  });

  it('throws TypeError when a waypoint is missing at or lookAt', () => {
    expect(() => cam.tour([{ at: [0,0,0] }])).toThrow(TypeError);
    expect(() => cam.tour([{ lookAt: [0,0,0] }])).toThrow(TypeError);
  });

  it('throws after dispose()', () => {
    cam.dispose();
    expect(() => cam.tour(WP)).toThrow(/disposed/);
  });

  it('supports per-waypoint fov for perspective cameras', () => {
    cam.tour([{ at: [5, 5, 5], lookAt: [0, 0, 0], fov: 30, duration: 1000 }]);
    const tick = loop.add.mock.calls[0][0];
    tick(1.1); // complete the waypoint
    expect(cam.three.fov).toBeCloseTo(30, 0);
  });
});

// ── follow() ──────────────────────────────────────────────────────────────────

describe('GraphSceneCamera.follow()', () => {
  let cam;
  let target;
  beforeEach(() => {
    cam = new GraphSceneCamera();
    target = {
      getWorldPosition: vi.fn((v) => { v.set(5, 0, 0); return v; }),
    };
  });

  it('returns a controller with a cancel() method', () => {
    const ctrl = cam.follow(target);
    expect(typeof ctrl.cancel).toBe('function');
  });

  it('registers a tick with the loop', () => {
    cam.follow(target);
    expect(loop.add).toHaveBeenCalledOnce();
  });

  it('queries the target world position on each tick', () => {
    cam.follow(target);
    const tick = loop.add.mock.calls[0][0];
    tick(0.016);
    expect(target.getWorldPosition).toHaveBeenCalled();
  });

  it('cancel() removes the tick from the loop', () => {
    const ctrl = cam.follow(target);
    const tick = loop.add.mock.calls[0][0];
    ctrl.cancel();
    expect(loop.remove).toHaveBeenCalledWith(tick);
  });

  it('throws TypeError when target lacks getWorldPosition', () => {
    expect(() => cam.follow({})).toThrow(TypeError);
    expect(() => cam.follow(null)).toThrow(TypeError);
  });

  it('throws after dispose()', () => {
    cam.dispose();
    expect(() => cam.follow(target)).toThrow(/disposed/);
  });
});

// ── focusOn() ─────────────────────────────────────────────────────────────────

describe('GraphSceneCamera.focusOn()', () => {
  let cam;
  let box;
  beforeEach(() => {
    cam = new GraphSceneCamera();
    box = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  });

  it('returns a controller with a cancel() method', () => {
    const ctrl = cam.focusOn(box);
    expect(typeof ctrl.cancel).toBe('function');
  });

  it('registers a tick with the loop', () => {
    cam.focusOn(box);
    expect(loop.add).toHaveBeenCalledOnce();
  });

  it('moves the perspective camera when the tick completes', () => {
    const startPos = cam.three.position.clone();
    cam.focusOn(box, 1.2, 600);
    const tick = loop.add.mock.calls[0][0];
    tick(1.0); // advance past duration
    expect(loop.remove).toHaveBeenCalled();
    expect(cam.three.position.distanceTo(startPos)).toBeGreaterThan(0);
  });

  it('resizes the orthographic frustum when using an ortho camera', () => {
    cam.setPreset('isometric');
    const origRight = cam.three.right;
    const orthoBox = new THREE.Box3(
      new THREE.Vector3(-5, -5, -5),
      new THREE.Vector3(5, 5, 5),
    );
    cam.focusOn(orthoBox, 1.0, 600);
    const tick = loop.add.mock.calls[0][0];
    tick(1.0); // complete
    // Frustum right should have changed from the default ORTHO_HALF_SIZE
    expect(cam.three.right).not.toBeCloseTo(origRight, 0);
  });

  it('cancel() removes the tick from the loop', () => {
    const ctrl = cam.focusOn(box);
    const tick = loop.add.mock.calls[0][0];
    ctrl.cancel();
    expect(loop.remove).toHaveBeenCalledWith(tick);
  });

  it('throws TypeError when boundingBox is not a THREE.Box3', () => {
    expect(() => cam.focusOn({ min: 0, max: 1 })).toThrow(TypeError);
    expect(() => cam.focusOn(null)).toThrow(TypeError);
  });

  it('throws after dispose()', () => {
    cam.dispose();
    expect(() => cam.focusOn(box)).toThrow(/disposed/);
  });
});
