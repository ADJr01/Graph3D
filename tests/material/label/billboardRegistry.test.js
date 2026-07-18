import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { register, unregister } from '../../../src/material/label/billboardRegistry.js';
import { loop } from '../../../src/core/Graph3DLoop.js';

// Mirrors tests/anim/CameraTour.test.js's convention for this exact
// dependency: loop.add/.remove just record calls so tests can assert on
// registration count without waiting on a real RAF.
vi.mock('../../../src/core/Graph3DLoop.js', () => ({
  loop: { add: vi.fn(), remove: vi.fn() },
}));

// billboardRegistry keeps its registered-object map as module-level state
// (that's the whole point — one shared loop callback across every caller),
// so every test must unregister whatever it registered to keep the next
// test starting from a clean (empty, tick-less) registry.
let registeredThisTest = [];

afterEach(() => {
  for (const object3D of registeredThisTest) unregister(object3D);
  registeredThisTest = [];
  vi.clearAllMocks();
});

function makeObject3D() {
  return new THREE.Object3D();
}

function registerTracked(object3D, getCamera) {
  register(object3D, getCamera);
  registeredThisTest.push(object3D);
}

describe('billboardRegistry', () => {
  it('registers one shared loop tick no matter how many objects are registered', () => {
    const camera = new THREE.PerspectiveCamera();
    registerTracked(makeObject3D(), () => camera);
    registerTracked(makeObject3D(), () => camera);
    registerTracked(makeObject3D(), () => camera);
    expect(loop.add).toHaveBeenCalledOnce();
  });

  it('removes the shared tick only once the last object is unregistered', () => {
    const camera = new THREE.PerspectiveCamera();
    const a = makeObject3D();
    const b = makeObject3D();
    registerTracked(a, () => camera);
    registerTracked(b, () => camera);

    unregister(a);
    expect(loop.remove).not.toHaveBeenCalled();

    unregister(b);
    expect(loop.remove).toHaveBeenCalledOnce();
  });

  it('is a no-op to unregister an object that was never registered', () => {
    expect(() => unregister(makeObject3D())).not.toThrow();
    expect(loop.remove).not.toHaveBeenCalled();
  });

  it("the shared tick copies each registered object's quaternion from its own getCamera() result", () => {
    const cameraA = new THREE.PerspectiveCamera();
    cameraA.quaternion.set(0.1, 0, 0, 0.99).normalize();
    const cameraB = new THREE.PerspectiveCamera();
    cameraB.quaternion.set(0, 0.2, 0, 0.98).normalize();

    const objectA = makeObject3D();
    const objectB = makeObject3D();
    registerTracked(objectA, () => cameraA);
    registerTracked(objectB, () => cameraB);

    const tick = loop.add.mock.calls[0][0];
    tick();

    expect(objectA.quaternion.toArray()).toEqual(cameraA.quaternion.toArray());
    expect(objectB.quaternion.toArray()).toEqual(cameraB.quaternion.toArray());
  });

  it('re-registering the same object replaces its getCamera without a second loop.add()', () => {
    const object3D = makeObject3D();
    const cameraA = new THREE.PerspectiveCamera();
    const cameraB = new THREE.PerspectiveCamera();
    cameraB.quaternion.set(0, 0, 0.3, 0.95).normalize();

    registerTracked(object3D, () => cameraA);
    register(object3D, () => cameraB); // re-register same object, not separately tracked
    expect(loop.add).toHaveBeenCalledOnce();

    const tick = loop.add.mock.calls[0][0];
    tick();
    expect(object3D.quaternion.toArray()).toEqual(cameraB.quaternion.toArray());
  });

  it('skips a registered object whose getCamera() currently returns nothing', () => {
    const object3D = makeObject3D();
    const originalQuaternion = object3D.quaternion.toArray();
    registerTracked(object3D, () => null);

    const tick = loop.add.mock.calls[0][0];
    expect(() => tick()).not.toThrow();
    expect(object3D.quaternion.toArray()).toEqual(originalQuaternion);
  });
});
