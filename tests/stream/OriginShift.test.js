import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OriginShift } from '../../src/stream/OriginShift.js';

// core/Graph3DLoop's shared singleton drives OriginShift's per-frame check
// via a real requestAnimationFrame — stub it (mirrors tests/stream/LOD.test.js)
// so tests control exactly when a frame fires.
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

/** A minimal duck-typed THREE.Vector3 stand-in. */
function makeVector(x, y, z) {
  return {
    x,
    y,
    z,
    length() {
      return Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2);
    },
    clone() {
      return makeVector(this.x, this.y, this.z);
    },
    sub(v) {
      this.x -= v.x;
      this.y -= v.y;
      this.z -= v.z;
      return this;
    },
  };
}

function makeCamera(x, y, z) {
  return { position: makeVector(x, y, z) };
}

function makeScene(children) {
  return { children };
}

describe('OriginShift constructor validation', () => {
  it('throws for a scene without a children array', () => {
    expect(() => new OriginShift({ scene: {}, camera: makeCamera(0, 0, 0) })).toThrow(TypeError);
    expect(() => new OriginShift({ scene: null, camera: makeCamera(0, 0, 0) })).toThrow(TypeError);
  });

  it('throws for a camera without a Vector3-like position', () => {
    expect(() => new OriginShift({ scene: makeScene([]), camera: {} })).toThrow(TypeError);
    expect(() => new OriginShift({ scene: makeScene([]), camera: { position: { x: 0, y: 0, z: 0 } } })).toThrow(TypeError);
  });

  it('throws for a non-positive threshold', () => {
    expect(() => new OriginShift({ scene: makeScene([]), camera: makeCamera(0, 0, 0), threshold: 0 })).toThrow(TypeError);
    expect(() => new OriginShift({ scene: makeScene([]), camera: makeCamera(0, 0, 0), threshold: -5 })).toThrow(TypeError);
  });
});

describe('OriginShift per-frame behavior', () => {
  it('does nothing while the camera stays within the threshold', () => {
    const camera = makeCamera(10, 0, 0);
    const child = { position: makeVector(5, 0, 0) };
    const scene = makeScene([child]);
    const originShift = new OriginShift({ scene, camera, threshold: 100 });

    tick();

    expect(camera.position).toMatchObject({ x: 10, y: 0, z: 0 });
    expect(child.position).toMatchObject({ x: 5, y: 0, z: 0 });
    expect(originShift.worldOffset).toEqual({ x: 0, y: 0, z: 0 });
    originShift.dispose();
  });

  it('shifts the camera to local origin and moves every scene child by the same delta once the threshold is crossed', () => {
    const camera = makeCamera(1500, 0, 0);
    const child1 = { position: makeVector(1000, 20, 0) };
    const child2 = { position: makeVector(-500, 0, 30) };
    const scene = makeScene([child1, child2]);
    const originShift = new OriginShift({ scene, camera, threshold: 1000 });

    tick();

    expect(camera.position).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(child1.position).toMatchObject({ x: -500, y: 20, z: 0 });
    expect(child2.position).toMatchObject({ x: -2000, y: 0, z: 30 });
    expect(originShift.worldOffset).toEqual({ x: 1500, y: 0, z: 0 });
    originShift.dispose();
  });

  it('accumulates worldOffset across multiple shifts', () => {
    const camera = makeCamera(1500, 0, 0);
    const scene = makeScene([]);
    const originShift = new OriginShift({ scene, camera, threshold: 1000 });

    tick(); // first shift: delta (1500, 0, 0), camera -> origin

    camera.position.x = 1200; // camera moves again, past the threshold a second time
    tick();

    expect(originShift.worldOffset).toEqual({ x: 2700, y: 0, z: 0 });
    originShift.dispose();
  });

  it('dispose() stops the per-frame check and is idempotent', () => {
    const camera = makeCamera(1500, 0, 0);
    const scene = makeScene([]);
    const originShift = new OriginShift({ scene, camera, threshold: 1000 });
    originShift.dispose();
    expect(() => originShift.dispose()).not.toThrow();
    expect(rafCallback).toBeNull();
  });
});
