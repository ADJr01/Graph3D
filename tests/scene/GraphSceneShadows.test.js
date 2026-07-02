import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { GraphSceneShadows } from '../../src/scene/GraphSceneShadows.js';

vi.mock('three/examples/jsm/csm/CSM.js', () => ({
  CSM: vi.fn(function MockCSM(_opts) {
    this.update  = vi.fn();
    this.dispose = vi.fn();
  }),
}));

vi.mock('../../src/core/Graph3DLoop.js', () => ({
  loop: { add: vi.fn(), remove: vi.fn(), start: vi.fn(), stop: vi.fn() },
}));

// Import mocked modules at top level — vi.mock is hoisted, so these resolve to the mocks.
const { CSM }  = await import('three/examples/jsm/csm/CSM.js');
const { loop } = await import('../../src/core/Graph3DLoop.js');

function makeRenderer() {
  return { shadowMap: { enabled: false, type: THREE.PCFShadowMap } };
}

function makeShadows(overrides = {}) {
  return new GraphSceneShadows({
    renderer: makeRenderer(),
    scene:    new THREE.Scene(),
    camera:   new THREE.PerspectiveCamera(),
    ...overrides,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

// ── Constructor ───────────────────────────────────────────────────────────────

describe('GraphSceneShadows constructor', () => {
  it('throws TypeError when renderer is null', () => {
    expect(() => new GraphSceneShadows({ renderer: null, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() }))
      .toThrow(TypeError);
  });

  it('throws TypeError when renderer has no shadowMap', () => {
    expect(() => new GraphSceneShadows({ renderer: {}, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() }))
      .toThrow(/renderer must be/);
  });

  it('throws TypeError when scene is not a THREE.Scene', () => {
    expect(() => new GraphSceneShadows({ renderer: makeRenderer(), scene: {}, camera: new THREE.PerspectiveCamera() }))
      .toThrow(TypeError);
  });

  it('throws TypeError when camera is not a THREE.Camera', () => {
    expect(() => new GraphSceneShadows({ renderer: makeRenderer(), scene: new THREE.Scene(), camera: {} }))
      .toThrow(TypeError);
  });

  it('constructs without throwing given valid arguments', () => {
    expect(() => makeShadows()).not.toThrow();
  });

  it('defaults mode to null', () => {
    expect(makeShadows().mode).toBeNull();
  });

  it('defaults quality to medium', () => {
    expect(makeShadows().quality).toBe('medium');
  });
});

// ── enable() — standard modes ─────────────────────────────────────────────────

describe('GraphSceneShadows.enable() — standard modes', () => {
  let renderer;
  let shadows;

  beforeEach(() => {
    renderer = makeRenderer();
    shadows  = new GraphSceneShadows({ renderer, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() });
  });

  it('throws after dispose()', async () => {
    shadows.dispose();
    await expect(shadows.enable('pcf')).rejects.toThrow(/disposed/);
  });

  it('throws TypeError for unknown mode', async () => {
    await expect(shadows.enable('fancy')).rejects.toThrow(TypeError);
    await expect(shadows.enable('fancy')).rejects.toThrow(/unknown mode/);
  });

  it('enables renderer.shadowMap for pcf', async () => {
    await shadows.enable('pcf');
    expect(renderer.shadowMap.enabled).toBe(true);
  });

  it('sets PCFShadowMap type for pcf', async () => {
    await shadows.enable('pcf');
    expect(renderer.shadowMap.type).toBe(THREE.PCFShadowMap);
  });

  it('sets PCFSoftShadowMap type for pcf-soft', async () => {
    await shadows.enable('pcf-soft');
    expect(renderer.shadowMap.type).toBe(THREE.PCFSoftShadowMap);
  });

  it('sets VSMShadowMap type for vsm', async () => {
    await shadows.enable('vsm');
    expect(renderer.shadowMap.type).toBe(THREE.VSMShadowMap);
  });

  it('sets VSMShadowMap type for contact', async () => {
    await shadows.enable('contact');
    expect(renderer.shadowMap.type).toBe(THREE.VSMShadowMap);
  });

  it('updates the mode getter', async () => {
    await shadows.enable('pcf-soft');
    expect(shadows.mode).toBe('pcf-soft');
  });

  it('resolves to this', async () => {
    const result = await shadows.enable('pcf');
    expect(result).toBe(shadows);
  });

  it('applies current quality to lights in the scene on enable', async () => {
    const scene = new THREE.Scene();
    const light = new THREE.DirectionalLight();
    light.castShadow = true;
    scene.add(light);
    shadows = new GraphSceneShadows({ renderer, scene, camera: new THREE.PerspectiveCamera() });
    shadows.setQuality('high');
    await shadows.enable('pcf-soft');
    expect(light.shadow.mapSize.x).toBe(2048);
  });
});

// ── enable() — CSM mode ───────────────────────────────────────────────────────

describe('GraphSceneShadows.enable() — csm mode', () => {
  let shadows;

  beforeEach(() => {
    shadows = makeShadows();
  });

  it('creates a CSM instance', async () => {
    await shadows.enable('csm');
    expect(CSM).toHaveBeenCalledOnce();
  });

  it('passes the camera to CSM', async () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
    shadows = new GraphSceneShadows({ renderer: makeRenderer(), scene: new THREE.Scene(), camera });
    await shadows.enable('csm');
    expect(CSM.mock.calls[0][0].camera).toBe(camera);
  });

  it('passes the scene as parent to CSM', async () => {
    const scene   = new THREE.Scene();
    shadows = new GraphSceneShadows({ renderer: makeRenderer(), scene, camera: new THREE.PerspectiveCamera() });
    await shadows.enable('csm');
    expect(CSM.mock.calls[0][0].parent).toBe(scene);
  });

  it('registers a tick with the loop', async () => {
    await shadows.enable('csm');
    expect(loop.add).toHaveBeenCalledOnce();
    expect(typeof loop.add.mock.calls[0][0]).toBe('function');
  });

  it('the registered tick calls csm.update()', async () => {
    await shadows.enable('csm');
    const tick = loop.add.mock.calls[0][0];
    const csmInstance = CSM.mock.instances.at(-1);
    tick();
    expect(csmInstance.update).toHaveBeenCalledOnce();
  });

  it('sets mode to csm', async () => {
    await shadows.enable('csm');
    expect(shadows.mode).toBe('csm');
  });

  it('enables renderer.shadowMap', async () => {
    const renderer = makeRenderer();
    shadows = new GraphSceneShadows({ renderer, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() });
    await shadows.enable('csm');
    expect(renderer.shadowMap.enabled).toBe(true);
  });

  it('tears down old CSM before starting a new one', async () => {
    await shadows.enable('csm');
    const first = CSM.mock.instances.at(-1);
    await shadows.enable('csm');
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(loop.remove).toHaveBeenCalled();
  });
});

// ── disable() ─────────────────────────────────────────────────────────────────

describe('GraphSceneShadows.disable()', () => {
  let renderer;
  let shadows;

  beforeEach(async () => {
    renderer = makeRenderer();
    shadows  = new GraphSceneShadows({ renderer, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() });
    await shadows.enable('pcf-soft');
  });

  it('throws after dispose()', () => {
    shadows.dispose();
    expect(() => shadows.disable()).toThrow(/disposed/);
  });

  it('disables renderer.shadowMap', () => {
    shadows.disable();
    expect(renderer.shadowMap.enabled).toBe(false);
  });

  it('sets mode to null', () => {
    shadows.disable();
    expect(shadows.mode).toBeNull();
  });

  it('is chainable', () => {
    expect(shadows.disable()).toBe(shadows);
  });

  it('removes CSM tick from the loop when mode was csm', async () => {
    await shadows.enable('csm');
    const csmInstance = CSM.mock.instances.at(-1);
    shadows.disable();
    expect(loop.remove).toHaveBeenCalled();
    expect(csmInstance.dispose).toHaveBeenCalled();
  });
});

// ── setQuality() ──────────────────────────────────────────────────────────────

describe('GraphSceneShadows.setQuality()', () => {
  it('throws after dispose()', () => {
    const s = makeShadows();
    s.dispose();
    expect(() => s.setQuality('high')).toThrow(/disposed/);
  });

  it('throws TypeError for unknown quality level', () => {
    expect(() => makeShadows().setQuality('epic')).toThrow(TypeError);
    expect(() => makeShadows().setQuality('epic')).toThrow(/unknown quality level/);
  });

  it('is chainable', () => {
    const s = makeShadows();
    expect(s.setQuality('low')).toBe(s);
  });

  it('updates the quality getter', () => {
    const s = makeShadows();
    s.setQuality('ultra');
    expect(s.quality).toBe('ultra');
  });

  it('applies shadow map size to lights in the scene', () => {
    const scene = new THREE.Scene();
    const light = new THREE.DirectionalLight();
    light.castShadow = true;
    scene.add(light);
    const s = new GraphSceneShadows({ renderer: makeRenderer(), scene, camera: new THREE.PerspectiveCamera() });
    s.setQuality('ultra');
    expect(light.shadow.mapSize.x).toBe(4096);
    expect(light.shadow.mapSize.y).toBe(4096);
  });

  it('disposes and nulls an existing shadow.map to force regeneration', () => {
    const scene = new THREE.Scene();
    const light = new THREE.DirectionalLight();
    light.castShadow = true;
    // Simulate a shadow map already existing
    const fakeMap = { dispose: vi.fn(), isWebGLRenderTarget: true };
    light.shadow.map = fakeMap;
    scene.add(light);
    const s = new GraphSceneShadows({ renderer: makeRenderer(), scene, camera: new THREE.PerspectiveCamera() });
    s.setQuality('high');
    expect(fakeMap.dispose).toHaveBeenCalledOnce();
    expect(light.shadow.map).toBeNull();
  });

  it('low maps to 512', () => {
    const scene = new THREE.Scene();
    const light = new THREE.DirectionalLight();
    light.castShadow = true;
    scene.add(light);
    const s = new GraphSceneShadows({ renderer: makeRenderer(), scene, camera: new THREE.PerspectiveCamera() });
    s.setQuality('low');
    expect(light.shadow.mapSize.x).toBe(512);
  });

  it('medium maps to 1024', () => {
    const scene = new THREE.Scene();
    const light = new THREE.DirectionalLight();
    light.castShadow = true;
    scene.add(light);
    const s = new GraphSceneShadows({ renderer: makeRenderer(), scene, camera: new THREE.PerspectiveCamera() });
    s.setQuality('medium');
    expect(light.shadow.mapSize.x).toBe(1024);
  });
});

// ── dispose() ─────────────────────────────────────────────────────────────────

describe('GraphSceneShadows.dispose()', () => {
  it('is idempotent — calling twice does not throw', () => {
    const s = makeShadows();
    expect(() => { s.dispose(); s.dispose(); }).not.toThrow();
  });

  it('all public methods throw after dispose', async () => {
    const s = makeShadows();
    s.dispose();
    const pat = /GraphSceneShadows\.\w+: instance has been disposed/;
    await expect(s.enable('pcf')).rejects.toThrow(pat);
    expect(() => s.disable()).toThrow(pat);
    expect(() => s.setQuality('low')).toThrow(pat);
  });

  it('tears down active CSM and removes loop tick', async () => {
    const s = makeShadows();
    await s.enable('csm');
    const csmInstance = CSM.mock.instances.at(-1);
    s.dispose();
    expect(loop.remove).toHaveBeenCalled();
    expect(csmInstance.dispose).toHaveBeenCalled();
  });
});
