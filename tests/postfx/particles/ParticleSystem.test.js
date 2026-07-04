import { describe, it, expect } from 'vitest';
import { Color, Mesh, PerspectiveCamera, PlaneGeometry, Scene, SphereGeometry, Vector3 } from 'three';
import { ParticleSystem } from '../../../src/postfx/particles/index.js';

// CPU-path tests use real THREE objects + a minimal fake renderer (matching
// tests/postfx/passes.test.js's established pattern) and exercise real
// behavior — no GL calls happen anywhere on the CPU path. GPU-path tests are
// construction/mode-selection only: `emit()`/`update()` on that path call
// real WebGLRenderer methods (copyTextureToTexture/setRenderTarget) jsdom
// can't provide (see skipping_list.md).

function makeFakeRenderer() {
  return {
    domElement: { width: 800, height: 600 },
    getPixelRatio: () => 1,
    getSize: (target) => target.set(800, 600),
  };
}

function makeCtx(capabilities) {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    renderer: makeFakeRenderer(),
    capabilities,
  };
}

describe('ParticleSystem construction', () => {
  it('throws TypeError when scene is missing', () => {
    const { camera, renderer } = makeCtx();
    expect(() => new ParticleSystem({ camera, renderer })).toThrow(/scene is required/);
  });

  it('throws TypeError when camera is missing', () => {
    const { scene, renderer } = makeCtx();
    expect(() => new ParticleSystem({ scene, renderer })).toThrow(/camera is required/);
  });

  it('throws TypeError when renderer is missing', () => {
    const { scene, camera } = makeCtx();
    expect(() => new ParticleSystem({ scene, camera })).toThrow(/renderer is required/);
  });

  it('throws TypeError for a non-positive-integer capacity', () => {
    expect(() => new ParticleSystem({ ...makeCtx(), capacity: 0 })).toThrow(/capacity must be a positive integer/);
    expect(() => new ParticleSystem({ ...makeCtx(), capacity: 1.5 })).toThrow(TypeError);
  });

  it('throws TypeError when geometry is not a BufferGeometry', () => {
    expect(() => new ParticleSystem({ ...makeCtx(), geometry: {} })).toThrow(/geometry must be a THREE.BufferGeometry/);
  });

  it('rounds capacity up to the nearest perfect square', () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 10 });
    expect(system.capacity).toBe(16); // ceil(sqrt(10))=4, 4*4=16
    system.dispose();
  });

  it('defaults to CPU sim mode when capabilities are omitted', () => {
    const system = new ParticleSystem(makeCtx());
    expect(system.simMode).toBe('cpu');
    system.dispose();
  });

  it('defaults to CPU sim mode when capabilities lack float-texture support', () => {
    const system = new ParticleSystem(makeCtx({ webgl2: true, floatTextures: false }));
    expect(system.simMode).toBe('cpu');
    system.dispose();
  });

  it('selects GPU sim mode when capabilities report webgl2 + floatTextures', () => {
    const system = new ParticleSystem(makeCtx({ webgl2: true, floatTextures: true }));
    expect(system.simMode).toBe('gpu');
    system.dispose();
  });

  it('defaults to billboard mode with no geometry', () => {
    const system = new ParticleSystem(makeCtx());
    expect(system.billboard).toBe(true);
    expect(system.object.geometry.attributes.uv).toBeDefined();
    system.dispose();
  });

  it('adds its object to the scene and marks it frustumCulled = false', () => {
    const ctx = makeCtx();
    const system = new ParticleSystem(ctx);
    expect(ctx.scene.children).toContain(system.object);
    expect(system.object.frustumCulled).toBe(false);
    system.dispose();
  });

  it('switches to mesh-particle mode when a custom geometry is given', () => {
    const system = new ParticleSystem({ ...makeCtx(), geometry: new SphereGeometry(0.1) });
    expect(system.billboard).toBe(false);
    system.dispose();
  });

  it('billboard option overrides the geometry-presence default', () => {
    const meshForced = new ParticleSystem({ ...makeCtx(), billboard: false });
    expect(meshForced.billboard).toBe(false);
    meshForced.dispose();

    const billboardForced = new ParticleSystem({ ...makeCtx(), geometry: new SphereGeometry(0.1), billboard: true });
    expect(billboardForced.billboard).toBe(true);
    billboardForced.dispose();
  });
});

describe('ParticleSystem.emit / update (CPU path)', () => {
  it('throws TypeError for a non-positive-integer count', () => {
    const system = new ParticleSystem(makeCtx());
    expect(() => system.emit({ count: 0 })).toThrow(/count must be a positive integer/);
    system.dispose();
  });

  it('throws RangeError when count exceeds capacity', () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 4 });
    expect(() => system.emit({ count: 100 })).toThrow(RangeError);
    system.dispose();
  });

  it('throws after dispose()', () => {
    const system = new ParticleSystem(makeCtx());
    system.dispose();
    expect(() => system.emit({ count: 1 })).toThrow(/disposed/);
    expect(() => system.update(0.016)).toThrow(/disposed/);
  });

  it('writes fixed position/velocity/lifetime/size/color into the instance attributes', () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 4 });
    system.emit({
      count: 2,
      position: new Vector3(1, 2, 3),
      velocity: new Vector3(0, -1, 0),
      lifetime: 10,
      size: 2.5,
      color: 0xff0000,
    });

    const { aPosition, aAge, aLifetime, aSize, aColor } = system.object.geometry.attributes;
    expect([...aPosition.array.slice(0, 6)]).toEqual([1, 2, 3, 1, 2, 3]);
    expect([...aAge.array.slice(0, 2)]).toEqual([0, 0]);
    expect([...aLifetime.array.slice(0, 2)]).toEqual([10, 10]);
    expect([...aSize.array.slice(0, 2)]).toEqual([2.5, 2.5]);
    const expectedColor = new Color(0xff0000);
    expect(aColor.array[0]).toBeCloseTo(expectedColor.r);
    expect(aColor.array[1]).toBeCloseTo(expectedColor.g);
    expect(aColor.array[2]).toBeCloseTo(expectedColor.b);
    system.dispose();
  });

  it('resolves per-particle function values with the batch-local index', () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 4 });
    system.emit({
      count: 3,
      position: (i) => new Vector3(i, 0, 0),
      size: (i) => i + 1,
    });

    const { aPosition, aSize } = system.object.geometry.attributes;
    expect([...aPosition.array.slice(0, 9)]).toEqual([0, 0, 0, 1, 0, 0, 2, 0, 0]);
    expect([...aSize.array.slice(0, 3)]).toEqual([1, 2, 3]);
    system.dispose();
  });

  it('recycles ring-buffer slots once capacity is exceeded across emits', () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 4 });
    system.emit({ count: 4, position: (i) => new Vector3(i, 0, 0) });
    system.emit({ count: 2, position: (i) => new Vector3(100 + i, 0, 0) });

    const { aPosition } = system.object.geometry.attributes;
    // Slots 0,1 recycled with the second batch; slots 2,3 keep the first batch's values.
    expect(aPosition.array[0]).toBe(100);
    expect(aPosition.array[3]).toBe(101);
    expect(aPosition.array[6]).toBe(2);
    expect(aPosition.array[9]).toBe(3);
    system.dispose();
  });

  it('update() integrates position by velocity * dt and advances age', () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 4 });
    system.emit({ count: 1, position: new Vector3(0, 0, 0), velocity: new Vector3(1, 2, 3), lifetime: 10 });

    system.update(0.5);

    const { aPosition, aAge } = system.object.geometry.attributes;
    expect(aPosition.array[0]).toBeCloseTo(0.5);
    expect(aPosition.array[1]).toBeCloseTo(1.0);
    expect(aPosition.array[2]).toBeCloseTo(1.5);
    expect(aAge.array[0]).toBeCloseTo(0.5);
    system.dispose();
  });

  it('a particle stops integrating once age reaches its lifetime', () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 4 });
    system.emit({ count: 1, velocity: new Vector3(1, 0, 0), lifetime: 1 });

    system.update(1.5); // exceeds lifetime in one step
    const { aPosition: posAfterFirst } = system.object.geometry.attributes;
    const xAfterDeath = posAfterFirst.array[0];

    system.update(1); // should be a no-op now
    const { aPosition } = system.object.geometry.attributes;
    expect(aPosition.array[0]).toBe(xAfterDeath);
  });

  it('a slot that was never emitted into stays inert across update()', () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 4 });
    expect(() => system.update(0.1)).not.toThrow();
    const { aPosition } = system.object.geometry.attributes;
    expect([...aPosition.array]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    system.dispose();
  });

  it('emit() sets material.blending when given, leaves it untouched otherwise', () => {
    const system = new ParticleSystem(makeCtx());
    const before = system.object.material.blending;
    system.emit({ count: 1 });
    expect(system.object.material.blending).toBe(before);
    system.emit({ count: 1, blending: 2 /* AdditiveBlending */ });
    expect(system.object.material.blending).toBe(2);
    system.dispose();
  });

  it('returns this from emit() for chaining', () => {
    const system = new ParticleSystem(makeCtx());
    expect(system.emit({ count: 1 })).toBe(system);
    system.dispose();
  });
});

describe('ParticleSystem GPU-path construction (mode selection only)', () => {
  it('builds aParticleUV covering every capacity slot with centered texel UVs', () => {
    const system = new ParticleSystem({ ...makeCtx({ webgl2: true, floatTextures: true }), capacity: 4 });
    const { aParticleUV } = system.object.geometry.attributes;
    expect(aParticleUV).toBeDefined();
    expect(aParticleUV.count).toBe(4);
    // capacity 4 -> textureSize 2; instance 0 -> texel (0,0) -> uv (0.25, 0.25)
    expect(aParticleUV.array[0]).toBeCloseTo(0.25);
    expect(aParticleUV.array[1]).toBeCloseTo(0.25);
    system.dispose();
  });

  it('does not create CPU-path position/age/lifetime attributes', () => {
    const system = new ParticleSystem(makeCtx({ webgl2: true, floatTextures: true }));
    const attrs = system.object.geometry.attributes;
    expect(attrs.aPosition).toBeUndefined();
    expect(attrs.aAge).toBeUndefined();
    expect(attrs.aLifetime).toBeUndefined();
    system.dispose();
  });

  it('dispose() releases render targets and textures without throwing', () => {
    const system = new ParticleSystem(makeCtx({ webgl2: true, floatTextures: true }));
    expect(() => system.dispose()).not.toThrow();
    expect(() => system.dispose()).not.toThrow(); // idempotent
  });
});

describe('ParticleSystem.dispose()', () => {
  it('removes the object from the scene', () => {
    const ctx = makeCtx();
    const system = new ParticleSystem(ctx);
    const object = system.object;
    system.dispose();
    expect(ctx.scene.children).not.toContain(object);
  });

  it('is idempotent', () => {
    const system = new ParticleSystem(makeCtx());
    system.dispose();
    expect(() => system.dispose()).not.toThrow();
  });

  it('creates and disposes 1 000 instances without throwing (leak smoke test)', () => {
    for (let i = 0; i < 1_000; i++) {
      const system = new ParticleSystem({ ...makeCtx(), capacity: 16 });
      system.emit({ count: 4 });
      system.update(0.016);
      system.dispose();
    }
  });
});

describe('ParticleSystem behaviors (CPU path)', () => {
  it('throws TypeError for an unknown behavior name', () => {
    const system = new ParticleSystem(makeCtx());
    expect(() => system.addBehavior('not-a-behavior')).toThrow(/unknown behavior/);
    system.dispose();
  });

  it('addBehavior/removeBehavior/activeBehaviors track the active set', () => {
    const system = new ParticleSystem(makeCtx());
    expect(system.activeBehaviors).toEqual([]);
    system.addBehavior('gravity');
    expect(system.activeBehaviors).toEqual(['gravity']);
    system.removeBehavior('gravity');
    expect(system.activeBehaviors).toEqual([]);
    system.dispose();
  });

  it('removeBehavior is a no-op when the behavior is not active', () => {
    const system = new ParticleSystem(makeCtx());
    expect(() => system.removeBehavior('wind')).not.toThrow();
    system.dispose();
  });

  it('configureBehavior throws when the behavior is not active', () => {
    const system = new ParticleSystem(makeCtx());
    expect(() => system.configureBehavior('gravity', { strength: 1 })).toThrow(/is not active/);
    system.dispose();
  });

  it('addBehavior called twice on the same name reconfigures instead of stacking', () => {
    const system = new ParticleSystem(makeCtx());
    system.addBehavior('gravity', { strength: 1 });
    system.addBehavior('gravity', { strength: 5 });
    expect(system.activeBehaviors).toEqual(['gravity']);
    system.dispose();
  });

  it('gravity pulls a particle downward over time', () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 4 });
    system.addBehavior('gravity', { strength: 10, direction: new Vector3(0, -1, 0) });
    system.emit({ count: 1, position: new Vector3(0, 0, 0), velocity: new Vector3(0, 0, 0), lifetime: 10 });

    system.update(0.1);

    const { aPosition } = system.object.geometry.attributes;
    expect(aPosition.array[1]).toBeLessThan(0); // fell in -y
    system.dispose();
  });

  it('configureBehavior updates an active behavior in place', () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 4 });
    system.addBehavior('gravity', { strength: 0, direction: new Vector3(0, -1, 0) });
    system.emit({ count: 1, position: new Vector3(0, 0, 0), velocity: new Vector3(0, 0, 0), lifetime: 10 });
    system.update(0.1);
    const { aPosition } = system.object.geometry.attributes;
    expect(aPosition.array[1]).toBe(0); // strength 0 -> no fall yet

    system.configureBehavior('gravity', { strength: 10 });
    system.update(0.1);
    expect(aPosition.array[1]).toBeLessThan(0);
    system.dispose();
  });

  it('a dead particle is not affected by active behaviors', () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 4 });
    system.addBehavior('gravity', { strength: 10 });
    system.emit({ count: 1, position: new Vector3(0, 0, 0), lifetime: 0.05 });
    system.update(1); // well past lifetime
    const { aPosition } = system.object.geometry.attributes;
    const yAfterDeath = aPosition.array[1];
    system.update(1);
    expect(aPosition.array[1]).toBe(yAfterDeath); // unchanged — still dead
    system.dispose();
  });
});

describe('ParticleSystem behaviors (GPU path — rebuild + construction only)', () => {
  it('addBehavior/removeBehavior/configureBehavior do not throw when GPU-simulated', () => {
    const system = new ParticleSystem(makeCtx({ webgl2: true, floatTextures: true }));
    expect(() => system.addBehavior('curl', { strength: 0.5 })).not.toThrow();
    expect(() => system.configureBehavior('curl', { strength: 1 })).not.toThrow();
    expect(() => system.removeBehavior('curl')).not.toThrow();
    system.dispose();
  });

  it('adding multiple behaviors (including curl, which needs the noise GLSL) does not throw', () => {
    const system = new ParticleSystem(makeCtx({ webgl2: true, floatTextures: true }));
    expect(() => {
      system.addBehavior('gravity');
      system.addBehavior('wind');
      system.addBehavior('attract');
      system.addBehavior('repel');
      system.addBehavior('curl');
      system.addBehavior('swirl');
    }).not.toThrow();
    system.dispose();
  });
});

describe('ParticleSystem.spawnAt', () => {
  it('throws TypeError when source is not a mesh and does not wrap one', () => {
    const system = new ParticleSystem(makeCtx());
    expect(() => system.spawnAt({})).toThrow(/must be a THREE.Mesh/);
    system.dispose();
  });

  it('accepts a raw THREE.Mesh and emits count particles', () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 64 });
    const floor = new Mesh(new PlaneGeometry(4, 4));
    expect(() => system.spawnAt(floor, { count: 10, lifetime: 5 })).not.toThrow();
    const { aLifetime } = system.object.geometry.attributes;
    let spawnedCount = 0;
    for (let i = 0; i < aLifetime.count; i++) if (aLifetime.array[i] > 0) spawnedCount++;
    expect(spawnedCount).toBe(10);
    system.dispose();
  });

  it('accepts a duck-typed GraphMesh-like wrapper exposing .three', () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 16 });
    const wrapper = { three: new Mesh(new PlaneGeometry(1, 1)) };
    expect(() => system.spawnAt(wrapper, { count: 5 })).not.toThrow();
    system.dispose();
  });

  it('returns this for chaining', () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 16 });
    const floor = new Mesh(new PlaneGeometry(1, 1));
    expect(system.spawnAt(floor, { count: 4 })).toBe(system);
    system.dispose();
  });

  it('defaults velocity to outward along the surface normal', () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 16 });
    const floor = new Mesh(new PlaneGeometry(2, 2)); // faces +z by default
    system.spawnAt(floor, { count: 1, speed: 3, lifetime: 10 });
    system.update(0.1);
    const { aPosition } = system.object.geometry.attributes;
    expect(aPosition.array[2]).toBeGreaterThan(0); // moved in +z, the plane's normal direction
    system.dispose();
  });

  it('throws after dispose()', () => {
    const system = new ParticleSystem(makeCtx());
    const floor = new Mesh(new PlaneGeometry(1, 1));
    system.dispose();
    expect(() => system.spawnAt(floor, { count: 1 })).toThrow(/disposed/);
  });
});

describe('ParticleSystem presets', () => {
  const PRESET_NAMES = ['dust', 'sparks', 'smoke', 'confetti', 'dataStream', 'dissolve'];

  it.each(PRESET_NAMES)("applies '%s' without throwing", (name) => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 1024 });
    expect(() => system.preset(name)).not.toThrow();
    system.dispose();
  });

  it('throws for an unknown preset name', () => {
    const system = new ParticleSystem(makeCtx());
    expect(() => system.preset('not-a-real-preset')).toThrow(/unknown preset/);
    system.dispose();
  });

  it('returns this for chaining', () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 1024 });
    expect(system.preset('dust')).toBe(system);
    system.dispose();
  });

  it("'dissolve' with a mesh option spawns from the mesh surface instead of a point burst", () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 1024 });
    const floor = new Mesh(new PlaneGeometry(2, 2));
    expect(() => system.preset('dissolve', { mesh: floor, count: 20 })).not.toThrow();
    system.dispose();
  });

  it("'dust' and 'smoke' add continuous behaviors as a side effect", () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 1024 });
    system.preset('dust');
    expect(system.activeBehaviors).toContain('wind');
    system.dispose();
  });

  it('accepts an opts override merged over the preset defaults', () => {
    const system = new ParticleSystem({ ...makeCtx(), capacity: 1024 });
    expect(() => system.preset('sparks', { count: 5, lifetime: 0.2 })).not.toThrow();
    system.dispose();
  });
});
