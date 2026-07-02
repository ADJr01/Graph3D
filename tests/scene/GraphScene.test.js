import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { GraphScene } from '../../src/scene/GraphScene.js';
import { GraphSceneCamera } from '../../src/scene/GraphSceneCamera.js';
import { GraphSceneLight } from '../../src/scene/GraphSceneLight.js';
import { GraphSceneEnvironment } from '../../src/scene/GraphSceneEnvironment.js';
import { GraphSceneShadows } from '../../src/scene/GraphSceneShadows.js';
import { GraphSceneClipping } from '../../src/scene/GraphSceneClipping.js';
import { THEMES, VALID_THEMES } from '../../src/scene/GraphSceneThemes.js';
import { GraphMesh } from '../../src/object/GraphMesh.js';
import { GraphInstancedObject } from '../../src/object/GraphInstancedObject.js';

vi.mock('three/examples/jsm/loaders/RGBELoader.js', () => ({
  RGBELoader: vi.fn(function MockRGBELoader() {
    this.load = vi.fn((_url, onLoad) => {
      onLoad({ isTexture: true, mapping: null, dispose: vi.fn() });
    });
  }),
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    PMREMGenerator: vi.fn(function MockPMREMGenerator(_renderer) {
      this.compileEquirectangularShader = vi.fn();
      this.fromEquirectangular = vi.fn((_tex) => ({
        texture: { isTexture: true, dispose: vi.fn(), isPMREM: true },
      }));
      this.dispose = vi.fn();
    }),
  };
});

const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');

/** Minimal graph3d stub with no renderer — environment/shadows/clipping stay null. */
function makeG3d() {
  return {};
}

function makeRenderer() {
  return {
    domElement: { tagName: 'CANVAS' },
    shadowMap: { enabled: false, type: THREE.PCFShadowMap },
    clippingPlanes: [],
  };
}

/** graph3d stub carrying a renderer — mirrors `graph3d.renderer.three` on a real Graph3D. */
function makeG3dWithRenderer(renderer = makeRenderer()) {
  return { renderer: { three: renderer } };
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('GraphScene constructor', () => {
  it('throws TypeError when graph3d is omitted', () => {
    expect(() => new GraphScene({ name: 'main' })).toThrow(TypeError);
    expect(() => new GraphScene({ name: 'main' })).toThrow(/graph3d is required/);
  });

  it('throws TypeError when graph3d is null', () => {
    expect(() => new GraphScene({ graph3d: null, name: 'main' })).toThrow(TypeError);
  });

  it('throws TypeError when name is omitted', () => {
    expect(() => new GraphScene({ graph3d: makeG3d() })).toThrow(TypeError);
    expect(() => new GraphScene({ graph3d: makeG3d() })).toThrow(/name must be a non-empty string/);
  });

  it('throws TypeError when name is an empty string', () => {
    expect(() => new GraphScene({ graph3d: makeG3d(), name: '' })).toThrow(TypeError);
  });

  it('throws TypeError when name is not a string', () => {
    expect(() => new GraphScene({ graph3d: makeG3d(), name: 42 })).toThrow(TypeError);
  });

  it('constructs without throwing given valid args', () => {
    expect(() => new GraphScene({ graph3d: makeG3d(), name: 'main' })).not.toThrow();
  });
});

// ── Getters ───────────────────────────────────────────────────────────────────

describe('GraphScene getters', () => {
  let scene;
  beforeEach(() => {
    scene = new GraphScene({ graph3d: makeG3d(), name: 'main' });
  });

  it('.name returns the constructor name', () => {
    expect(scene.name).toBe('main');
  });

  it('.three returns a THREE.Scene', () => {
    expect(scene.three).toBeInstanceOf(THREE.Scene);
  });

  it('.three.name matches the scene name', () => {
    expect(scene.three.name).toBe('main');
  });

  it('.camera returns a GraphSceneCamera', () => {
    expect(scene.camera).toBeInstanceOf(GraphSceneCamera);
  });

  it('.camera.three returns a THREE.PerspectiveCamera for the default orbit preset', () => {
    expect(scene.camera.three).toBeInstanceOf(THREE.PerspectiveCamera);
  });
});

// ── Default contents ───────────────────────────────────────────────────────────

describe('GraphScene default light rig', () => {
  let scene;
  beforeEach(() => {
    scene = new GraphScene({ graph3d: makeG3d(), name: 'main' });
  });

  it('installs a GraphSceneLight defaulting to the three-point preset', () => {
    expect(scene.light).toBeInstanceOf(GraphSceneLight);
    expect(scene.light.preset).toBe('three-point');
  });

  it('adds the three-point rig\'s key light named _key', () => {
    expect(scene.findByName('_key')).toBeInstanceOf(THREE.DirectionalLight);
  });

  it('adds the three-point rig\'s ambient light named _ambient', () => {
    expect(scene.findByName('_ambient')).toBeInstanceOf(THREE.AmbientLight);
  });
});

// ── Sub-manager auto-creation (Prompt 32) ─────────────────────────────────────

describe('GraphScene sub-manager auto-creation', () => {
  it('environment/shadows/clipping are null when graph3d has no renderer', () => {
    const scene = new GraphScene({ graph3d: makeG3d(), name: 'main' });
    expect(scene.environment).toBeNull();
    expect(scene.shadows).toBeNull();
    expect(scene.clipping).toBeNull();
  });

  it('environment/shadows/clipping are auto-created when graph3d.renderer.three is available', () => {
    const scene = new GraphScene({ graph3d: makeG3dWithRenderer(), name: 'main' });
    expect(scene.environment).toBeInstanceOf(GraphSceneEnvironment);
    expect(scene.shadows).toBeInstanceOf(GraphSceneShadows);
    expect(scene.clipping).toBeInstanceOf(GraphSceneClipping);
    scene.dispose();
  });

  it('camera and light are always created regardless of renderer availability', () => {
    const scene = new GraphScene({ graph3d: makeG3d(), name: 'main' });
    expect(scene.camera).toBeInstanceOf(GraphSceneCamera);
    expect(scene.light).toBeInstanceOf(GraphSceneLight);
  });
});

// ── add() ─────────────────────────────────────────────────────────────────────

describe('GraphScene.add()', () => {
  let scene;
  beforeEach(() => {
    scene = new GraphScene({ graph3d: makeG3d(), name: 'main' });
  });

  it('adds an object to the THREE.Scene children', () => {
    const obj = new THREE.Object3D();
    scene.add(obj);
    expect(scene.three.children).toContain(obj);
  });

  it('accepts multiple objects at once', () => {
    const a = new THREE.Object3D();
    const b = new THREE.Object3D();
    scene.add(a, b);
    expect(scene.three.children).toContain(a);
    expect(scene.three.children).toContain(b);
  });

  it('is chainable', () => {
    expect(scene.add(new THREE.Object3D())).toBe(scene);
  });

  it('throws after dispose()', () => {
    scene.dispose();
    expect(() => scene.add(new THREE.Object3D())).toThrow(/disposed/);
  });
});

// ── remove() ─────────────────────────────────────────────────────────────────

describe('GraphScene.remove()', () => {
  let scene;
  beforeEach(() => {
    scene = new GraphScene({ graph3d: makeG3d(), name: 'main' });
  });

  it('removes an object from the THREE.Scene', () => {
    const obj = new THREE.Object3D();
    scene.add(obj);
    scene.remove(obj);
    expect(scene.three.children).not.toContain(obj);
  });

  it('is chainable', () => {
    const obj = new THREE.Object3D();
    scene.add(obj);
    expect(scene.remove(obj)).toBe(scene);
  });

  it('throws after dispose()', () => {
    scene.dispose();
    expect(() => scene.remove(new THREE.Object3D())).toThrow(/disposed/);
  });
});

// ── traverse() ────────────────────────────────────────────────────────────────

describe('GraphScene.traverse()', () => {
  let scene;
  beforeEach(() => {
    scene = new GraphScene({ graph3d: makeG3d(), name: 'main' });
  });

  it('visits every object in the scene graph', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    mesh.name = 'targetMesh';
    scene.add(mesh);

    const names = [];
    scene.traverse((obj) => names.push(obj.name));
    expect(names).toContain('targetMesh');
  });

  it('visits nested children', () => {
    const parent = new THREE.Group();
    parent.name = 'parent';
    const child = new THREE.Object3D();
    child.name = 'child';
    parent.add(child);
    scene.add(parent);

    const names = [];
    scene.traverse((obj) => names.push(obj.name));
    expect(names).toContain('parent');
    expect(names).toContain('child');
  });

  it('is chainable', () => {
    expect(scene.traverse(() => {})).toBe(scene);
  });

  it('throws after dispose()', () => {
    scene.dispose();
    expect(() => scene.traverse(() => {})).toThrow(/disposed/);
  });
});

// ── findByName() ──────────────────────────────────────────────────────────────

describe('GraphScene.findByName()', () => {
  let scene;
  beforeEach(() => {
    scene = new GraphScene({ graph3d: makeG3d(), name: 'main' });
  });

  it('returns the object matching the given name', () => {
    const obj = new THREE.Object3D();
    obj.name = 'myObj';
    scene.add(obj);
    expect(scene.findByName('myObj')).toBe(obj);
  });

  it('returns null when no object matches', () => {
    expect(scene.findByName('nonexistent')).toBeNull();
  });

  it('finds objects inside nested groups', () => {
    const group = new THREE.Group();
    const nested = new THREE.Object3D();
    nested.name = 'deepObj';
    group.add(nested);
    scene.add(group);
    expect(scene.findByName('deepObj')).toBe(nested);
  });

  it('throws after dispose()', () => {
    scene.dispose();
    expect(() => scene.findByName('x')).toThrow(/disposed/);
  });
});

// ── selectByName() / selectInstance() ─────────────────────────────────────────

describe('GraphScene.selectByName()', () => {
  let scene;
  beforeEach(() => {
    scene = new GraphScene({ graph3d: makeG3d(), name: 'main' });
  });

  it('returns the GraphMesh registered under the given name', () => {
    const mesh = new GraphMesh({
      scene: scene.three,
      name: 'bar_0',
      geometry: new THREE.BoxGeometry(),
      material: new THREE.MeshBasicMaterial(),
    });
    expect(scene.selectByName('bar_0')).toEqual([mesh]);
  });

  it('returns the GraphInstancedObject registered under the given name', () => {
    const bars = new GraphInstancedObject({
      scene: scene.three,
      name: 'bars',
      geometry: new THREE.BoxGeometry(),
      material: new THREE.MeshBasicMaterial(),
      count: 10,
    });
    expect(scene.selectByName('bars')).toEqual([bars]);
  });

  it('returns an empty array when nothing is registered under the name', () => {
    expect(scene.selectByName('nonexistent')).toEqual([]);
  });

  it('no longer returns an object after it is disposed', () => {
    const mesh = new GraphMesh({
      scene: scene.three,
      name: 'bar_0',
      geometry: new THREE.BoxGeometry(),
      material: new THREE.MeshBasicMaterial(),
    });
    mesh.dispose();
    expect(scene.selectByName('bar_0')).toEqual([]);
  });

  it('throws TypeError for a non-string name', () => {
    expect(() => scene.selectByName(42)).toThrow(TypeError);
  });

  it('throws after dispose()', () => {
    scene.dispose();
    expect(() => scene.selectByName('bar_0')).toThrow(/disposed/);
  });
});

describe('GraphScene.selectInstance()', () => {
  let scene;
  beforeEach(() => {
    scene = new GraphScene({ graph3d: makeG3d(), name: 'main' });
  });

  it('returns a handle to the object and index', () => {
    const bars = new GraphInstancedObject({
      scene: scene.three,
      name: 'bars',
      geometry: new THREE.BoxGeometry(),
      material: new THREE.MeshBasicMaterial(),
      count: 10,
    });
    expect(scene.selectInstance('bars', 3)).toEqual({ object: bars, index: 3 });
  });

  it('throws TypeError for a non-string name', () => {
    expect(() => scene.selectInstance(42, 0)).toThrow(TypeError);
  });

  it('throws TypeError for a non-integer index', () => {
    new GraphInstancedObject({
      scene: scene.three,
      name: 'bars',
      geometry: new THREE.BoxGeometry(),
      material: new THREE.MeshBasicMaterial(),
      count: 10,
    });
    expect(() => scene.selectInstance('bars', 1.5)).toThrow(TypeError);
    expect(() => scene.selectInstance('bars', -1)).toThrow(TypeError);
  });

  it('throws when no instanced object is registered under the name', () => {
    new GraphMesh({
      scene: scene.three,
      name: 'single',
      geometry: new THREE.BoxGeometry(),
      material: new THREE.MeshBasicMaterial(),
    });
    expect(() => scene.selectInstance('single', 0)).toThrow(/expected exactly one instanced object/);
    expect(() => scene.selectInstance('nonexistent', 0)).toThrow(/expected exactly one instanced object/);
  });

  it('throws RangeError when the index exceeds capacity', () => {
    new GraphInstancedObject({
      scene: scene.three,
      name: 'bars',
      geometry: new THREE.BoxGeometry(),
      material: new THREE.MeshBasicMaterial(),
      count: 10,
    });
    expect(() => scene.selectInstance('bars', 10)).toThrow(RangeError);
  });

  it('throws after dispose()', () => {
    scene.dispose();
    expect(() => scene.selectInstance('bars', 0)).toThrow(/disposed/);
  });
});

// ── dispose() ─────────────────────────────────────────────────────────────────

describe('GraphScene.dispose()', () => {
  let scene;
  beforeEach(() => {
    scene = new GraphScene({ graph3d: makeG3d(), name: 'main' });
  });

  it('is idempotent — calling twice does not throw', () => {
    expect(() => {
      scene.dispose();
      scene.dispose();
    }).not.toThrow();
  });

  it('disposes geometry for every mesh in the scene', () => {
    const geo = new THREE.BoxGeometry();
    const spy = vi.spyOn(geo, 'dispose');
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()));
    scene.dispose();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('disposes material for every mesh in the scene', () => {
    const mat = new THREE.MeshBasicMaterial();
    const spy = vi.spyOn(mat, 'dispose');
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), mat));
    scene.dispose();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('disposes textures referenced by a material', () => {
    const tex = new THREE.Texture();
    const spy = vi.spyOn(tex, 'dispose');
    const mat = new THREE.MeshStandardMaterial({ map: tex });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), mat));
    scene.dispose();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('disposes all materials when the mesh uses an array of materials', () => {
    const mat1 = new THREE.MeshBasicMaterial();
    const mat2 = new THREE.MeshBasicMaterial();
    const spy1 = vi.spyOn(mat1, 'dispose');
    const spy2 = vi.spyOn(mat2, 'dispose');
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), [mat1, mat2]));
    scene.dispose();
    expect(spy1).toHaveBeenCalledOnce();
    expect(spy2).toHaveBeenCalledOnce();
  });

  it('clears the scene graph (no children remain after dispose)', () => {
    scene.add(new THREE.Object3D());
    scene.add(new THREE.Object3D());
    scene.dispose();
    expect(scene.three.children).toHaveLength(0);
  });

  it('blocks all methods after disposal with a descriptive error', () => {
    scene.dispose();
    const err = /GraphScene\..+: scene 'main' has been disposed/;
    expect(() => scene.add(new THREE.Object3D())).toThrow(err);
    expect(() => scene.remove(new THREE.Object3D())).toThrow(err);
    expect(() => scene.traverse(() => {})).toThrow(err);
    expect(() => scene.findByName('x')).toThrow(err);
    expect(() => scene.selectByName('x')).toThrow(err);
    expect(() => scene.selectInstance('x', 0)).toThrow(err);
    expect(() => scene.useCamera(new THREE.PerspectiveCamera())).toThrow(err);
    expect(() => scene.useLights([])).toThrow(err);
  });

  it('disposes the auto-created light/environment/shadows/clipping managers', () => {
    const renderer = makeRenderer();
    const s = new GraphScene({ graph3d: makeG3dWithRenderer(renderer), name: 'with-renderer' });
    const lightSpy = vi.spyOn(s.light, 'dispose');
    const envSpy = vi.spyOn(s.environment, 'dispose');
    const shadowsSpy = vi.spyOn(s.shadows, 'dispose');
    const clippingSpy = vi.spyOn(s.clipping, 'dispose');
    s.dispose();
    expect(lightSpy).toHaveBeenCalledOnce();
    expect(envSpy).toHaveBeenCalledOnce();
    expect(shadowsSpy).toHaveBeenCalledOnce();
    expect(clippingSpy).toHaveBeenCalledOnce();
  });
});

// ── viewports / setViewports() ────────────────────────────────────────────────

describe('GraphScene viewports', () => {
  let scene;
  beforeEach(() => {
    scene = new GraphScene({ graph3d: makeG3d(), name: 'main' });
  });

  it('defaults to a single full-canvas viewport', () => {
    expect(scene.viewports).toHaveLength(1);
    expect(scene.viewports[0]).toMatchObject({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('setViewports replaces the viewport list', () => {
    scene.setViewports([
      { x: 0, y: 0, width: 0.5, height: 1 },
      { x: 0.5, y: 0, width: 0.5, height: 1 },
    ]);
    expect(scene.viewports).toHaveLength(2);
  });

  it('setViewports is chainable', () => {
    expect(
      scene.setViewports([{ x: 0, y: 0, width: 1, height: 1 }]),
    ).toBe(scene);
  });

  it('throws TypeError when viewports is not an array', () => {
    expect(() => scene.setViewports('full')).toThrow(TypeError);
    expect(() => scene.setViewports(null)).toThrow(TypeError);
  });

  it('throws TypeError when viewports is an empty array', () => {
    expect(() => scene.setViewports([])).toThrow(TypeError);
  });

  it('throws TypeError when a viewport entry is missing a numeric field', () => {
    expect(() =>
      scene.setViewports([{ x: 0, y: 0, width: 1 }]), // missing height
    ).toThrow(TypeError);
    expect(() =>
      scene.setViewports([{ x: '0', y: 0, width: 1, height: 1 }]), // string x
    ).toThrow(TypeError);
  });

  it('throws after dispose()', () => {
    scene.dispose();
    expect(() =>
      scene.setViewports([{ x: 0, y: 0, width: 1, height: 1 }]),
    ).toThrow(/disposed/);
  });
});

// ── applyTheme() ──────────────────────────────────────────────────────────────

describe('GraphScene.applyTheme()', () => {
  let scene;
  beforeEach(() => {
    scene = new GraphScene({ graph3d: makeG3d(), name: 'main' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('theme and palette getters are null before applyTheme is ever called', () => {
    expect(scene.theme).toBeNull();
    expect(scene.palette).toBeNull();
  });

  it('throws TypeError for an unknown theme name', async () => {
    await expect(scene.applyTheme('neon-void')).rejects.toThrow(TypeError);
    await expect(scene.applyTheme('neon-void')).rejects.toThrow(/unknown theme/);
  });

  it('throws after dispose()', async () => {
    scene.dispose();
    await expect(scene.applyTheme('clinical-white')).rejects.toThrow(/disposed/);
  });

  it('sets scene.theme and scene.palette to match the applied theme', async () => {
    await scene.applyTheme('clinical-white');
    expect(scene.theme).toBe('clinical-white');
    expect(scene.palette).toEqual(THEMES['clinical-white'].palette);
  });

  it('applies the theme camera preset', async () => {
    await scene.applyTheme('cyberpunk');
    expect(scene.camera.preset).toBe(THEMES.cyberpunk.cameraPreset);
  });

  it('removes the constructor default light rig and installs the theme light preset', async () => {
    expect(scene.findByName('_key')).not.toBeNull(); // constructor default: three-point
    await scene.applyTheme('clinical-white'); // lightPreset: 'flat' → single '_ambient' light
    expect(scene.findByName('_key')).toBeNull();
    expect(scene.findByName('_fill')).toBeNull();
    expect(scene.findByName('_ambient')).toBeInstanceOf(THREE.AmbientLight);
  });

  it('resolves without a renderer, skipping environment/shadows', async () => {
    await expect(scene.applyTheme('cinema-night')).resolves.toBe(scene);
    expect(scene.three.environment).toBeNull();
  });

  it('applies HDR background, fog, and shadows when a renderer is supplied', async () => {
    const renderer = makeRenderer();
    await scene.applyTheme('cinema-night', { renderer });
    expect(scene.three.environment).not.toBeNull();
    expect(scene.three.fog).toBeInstanceOf(THREE.FogExp2); // volumetric-cinematic falls back to FogExp2
    expect(renderer.shadowMap.enabled).toBe(true);
  });

  it('applies a solid background colour for themes without hdrAsBackground', async () => {
    const renderer = makeRenderer();
    await scene.applyTheme('clinical-white', { renderer });
    expect(scene.three.background).toBeInstanceOf(THREE.Color);
    expect(scene.three.background.getHex()).toBe(THEMES['clinical-white'].background);
  });

  it('switching themes replaces the light rig — old preset lights are removed', async () => {
    await scene.applyTheme('studio-light'); // lightPreset: 'studio' → key/fill/rim/ambient/area_key
    expect(scene.findByName('_key')).not.toBeNull();

    await scene.applyTheme('clinical-white'); // lightPreset: 'flat' → single '_ambient'
    expect(scene.findByName('_key')).toBeNull();
    expect(scene.findByName('_ambient')).toBeInstanceOf(THREE.AmbientLight);
  });

  it('disposes the previous theme environment when switching themes with a renderer', async () => {
    const { PMREMGenerator } = await import('three');
    const renderer = makeRenderer();
    await scene.applyTheme('studio-light', { renderer });
    const firstTexture = PMREMGenerator.mock.instances
      .at(-1)?.fromEquirectangular.mock.results.at(-1)?.value?.texture;

    await scene.applyTheme('editorial', { renderer }); // different HDR URL → old ref released
    expect(firstTexture?.dispose).toHaveBeenCalled();
    scene.dispose(); // release the 'editorial' HDR ref so later tests don't see a cache hit
  });

  it('disposes theme-owned managers when the scene is disposed', async () => {
    const renderer = makeRenderer();
    await scene.applyTheme('museum', { renderer });
    expect(() => scene.dispose()).not.toThrow();
    expect(scene.three.children).toHaveLength(0);
  });

  it('applies every named theme without throwing, with a renderer supplied', async () => {
    for (const name of VALID_THEMES) {
      const s = new GraphScene({ graph3d: makeG3d(), name: `theme-${name}` });
      await expect(s.applyTheme(name, { renderer: makeRenderer() })).resolves.toBe(s);
      s.dispose();
    }
  });

  it('leaves the previous theme, camera, and lights intact when the HDR load fails', async () => {
    const renderer = makeRenderer();
    await scene.applyTheme('clinical-white', { renderer });
    const previousLight = scene.light;
    const previousEnvironment = scene.environment;
    const previousShadows = scene.shadows;

    RGBELoader.mockImplementationOnce(function () {
      this.load = vi.fn((_url, _onLoad, _onProgress, onError) => onError(new Error('404 not found')));
    });

    await expect(scene.applyTheme('editorial', { renderer })).rejects.toThrow();

    expect(scene.theme).toBe('clinical-white');
    expect(scene.camera.preset).toBe(THEMES['clinical-white'].cameraPreset);
    expect(scene.light).toBe(previousLight);
    expect(scene.environment).toBe(previousEnvironment);
    expect(scene.shadows).toBe(previousShadows);
  });

  it('returns this for chaining', async () => {
    expect(await scene.applyTheme('editorial')).toBe(scene);
  });
});

// ── useCamera() ────────────────────────────────────────────────────────────────

describe('GraphScene.useCamera()', () => {
  let scene;
  beforeEach(() => {
    scene = new GraphScene({ graph3d: makeG3d(), name: 'main' });
  });

  it('replaces the managed camera with the given raw THREE camera', () => {
    const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    scene.useCamera(cam);
    expect(scene.camera.three).toBe(cam);
    expect(scene.camera.preset).toBeNull();
  });

  it('throws TypeError for a non-THREE.Camera value', () => {
    expect(() => scene.useCamera({})).toThrow(TypeError);
  });

  it('is chainable', () => {
    expect(scene.useCamera(new THREE.PerspectiveCamera())).toBe(scene);
  });

  it('throws after dispose()', () => {
    scene.dispose();
    expect(() => scene.useCamera(new THREE.PerspectiveCamera())).toThrow(/disposed/);
  });
});

// ── useLights() ───────────────────────────────────────────────────────────────

describe('GraphScene.useLights()', () => {
  let scene;
  beforeEach(() => {
    scene = new GraphScene({ graph3d: makeG3d(), name: 'main' });
  });

  it('adds the given raw lights to the scene graph', () => {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.useLights([hemi]);
    expect(scene.three.children).toContain(hemi);
  });

  it('disposes and clears the previous managed light rig', () => {
    const lightSpy = vi.spyOn(scene.light, 'dispose');
    scene.useLights([new THREE.HemisphereLight()]);
    expect(lightSpy).toHaveBeenCalledOnce();
    expect(scene.light).toBeNull();
  });

  it('removes the constructor default lights from the scene graph', () => {
    scene.useLights([new THREE.HemisphereLight()]);
    expect(scene.findByName('_key')).toBeNull();
  });

  it('accepts an empty array (fully unlit scene)', () => {
    expect(() => scene.useLights([])).not.toThrow();
    expect(scene.light).toBeNull();
  });

  it('throws TypeError when not given an array', () => {
    expect(() => scene.useLights(new THREE.PointLight())).toThrow(TypeError);
  });

  it('throws TypeError when the array contains a non-THREE.Light value', () => {
    expect(() => scene.useLights([new THREE.Object3D()])).toThrow(TypeError);
  });

  it('is chainable', () => {
    expect(scene.useLights([])).toBe(scene);
  });

  it('throws after dispose()', () => {
    scene.dispose();
    expect(() => scene.useLights([])).toThrow(/disposed/);
  });
});
