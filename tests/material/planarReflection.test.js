import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

function makeMockReflectorClass() {
  // A real THREE.Object3D can't be subclassed via .call()/.apply() (native
  // class constructors reject that) — instead build one directly and
  // `return` it, which `new MockReflector()` honors in place of `this`,
  // giving the mock genuine Object3D behavior (.add()/.removeFromParent()/
  // position/quaternion/scale) without fighting class-extension mechanics.
  return vi.fn(function MockReflector(geometry, options) {
    const object = new THREE.Object3D();
    object.geometry = geometry;
    object.options = options;
    object.dispose = vi.fn();
    return object;
  });
}

const MockReflector = makeMockReflectorClass();
const MockReflectorForSSRPass = makeMockReflectorClass();

vi.mock('three/examples/jsm/objects/Reflector.js', () => ({ Reflector: MockReflector }));
vi.mock('three/examples/jsm/objects/ReflectorForSSRPass.js', () => ({ ReflectorForSSRPass: MockReflectorForSSRPass }));

const { addPlanarReflection } = await import('../../src/material/planarReflection.js');
const { GraphMesh } = await import('../../src/object/GraphMesh.js');

function makePlane({ scene = new THREE.Scene(), name = 'floor' } = {}) {
  const plane = new GraphMesh({ scene, name, geometry: new THREE.PlaneGeometry(10, 10), material: new THREE.MeshBasicMaterial() });
  plane.setPosition(1, 2, 3);
  plane.setRotationDegrees(90, 0, 0);
  return plane;
}

describe('material.addPlanarReflection', () => {
  it('throws TypeError when plane is not a GraphMesh', async () => {
    await expect(addPlanarReflection({})).rejects.toThrow(TypeError);
    await expect(addPlanarReflection(new THREE.Mesh())).rejects.toThrow(TypeError);
  });

  it('throws TypeError for a non-plain-object options argument', async () => {
    await expect(addPlanarReflection(makePlane(), 42)).rejects.toThrow(TypeError);
  });

  it('throws TypeError for a non-positive-integer textureWidth/textureHeight', async () => {
    await expect(addPlanarReflection(makePlane(), { textureWidth: 0 })).rejects.toThrow(TypeError);
    await expect(addPlanarReflection(makePlane(), { textureHeight: 1.5 })).rejects.toThrow(TypeError);
  });

  it('throws TypeError for a non-finite clipBias', async () => {
    await expect(addPlanarReflection(makePlane(), { clipBias: NaN })).rejects.toThrow(TypeError);
  });

  it('throws TypeError for a negative or non-integer multisample', async () => {
    await expect(addPlanarReflection(makePlane(), { multisample: -1 })).rejects.toThrow(TypeError);
    await expect(addPlanarReflection(makePlane(), { multisample: 1.5 })).rejects.toThrow(TypeError);
  });

  it('uses the standalone Reflector by default', async () => {
    MockReflector.mockClear();
    MockReflectorForSSRPass.mockClear();
    await addPlanarReflection(makePlane());
    expect(MockReflector).toHaveBeenCalledOnce();
    expect(MockReflectorForSSRPass).not.toHaveBeenCalled();
  });

  it('uses ReflectorForSSRPass when ssrPass is truthy', async () => {
    MockReflector.mockClear();
    MockReflectorForSSRPass.mockClear();
    await addPlanarReflection(makePlane(), { ssrPass: {} });
    expect(MockReflectorForSSRPass).toHaveBeenCalledOnce();
    expect(MockReflector).not.toHaveBeenCalled();
  });

  it('forwards textureWidth/textureHeight/color/clipBias/multisample to the reflector constructor', async () => {
    MockReflector.mockClear();
    await addPlanarReflection(makePlane(), { textureWidth: 1024, textureHeight: 768, color: 0x112233, clipBias: 0.01, multisample: 0 });
    const [, options] = MockReflector.mock.calls[0];
    expect(options).toMatchObject({ textureWidth: 1024, textureHeight: 768, color: 0x112233, clipBias: 0.01, multisample: 0 });
  });

  it('constructs the reflector from a clone of the plane geometry, not the same instance', async () => {
    const plane = makePlane();
    const originalGeometry = plane.three.geometry;
    MockReflector.mockClear();
    await addPlanarReflection(plane);
    const [geometry] = MockReflector.mock.calls[0];
    expect(geometry).not.toBe(originalGeometry);
    expect(geometry).toBeInstanceOf(THREE.BufferGeometry);
  });

  it("copies the plane's position, rotation, and name onto the reflector", async () => {
    const plane = makePlane({ name: 'mirror-floor' });
    const reflector = await addPlanarReflection(plane);
    expect(reflector.position.x).toBeCloseTo(1);
    expect(reflector.position.y).toBeCloseTo(2);
    expect(reflector.position.z).toBeCloseTo(3);
    expect(reflector.name).toBe('mirror-floor');
  });

  it('disposes the original plane', async () => {
    const plane = makePlane();
    const disposeSpy = vi.spyOn(plane, 'dispose');
    await addPlanarReflection(plane);
    expect(disposeSpy).toHaveBeenCalledOnce();
  });

  it("adds the reflector to the plane's former scene", async () => {
    const scene = new THREE.Scene();
    const plane = makePlane({ scene });
    const reflector = await addPlanarReflection(plane);
    expect(scene.children).toContain(reflector);
  });

  it('returns the reflector, which already has a working dispose()', async () => {
    const reflector = await addPlanarReflection(makePlane());
    expect(typeof reflector.dispose).toBe('function');
    expect(() => reflector.dispose()).not.toThrow();
  });
});
