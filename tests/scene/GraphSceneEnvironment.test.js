import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { GraphSceneEnvironment } from '../../src/scene/GraphSceneEnvironment.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('three/examples/jsm/loaders/RGBELoader.js', () => ({
  RGBELoader: vi.fn(function MockRGBELoader() {
    this.load = vi.fn((_url, onLoad) => {
      onLoad({ isTexture: true, mapping: null, dispose: vi.fn() });
    });
  }),
}));

vi.mock('three/examples/jsm/loaders/EXRLoader.js', () => ({
  EXRLoader: vi.fn(function MockEXRLoader() {
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
    CubeTextureLoader: vi.fn(function MockCubeTextureLoader() {
      this.load = vi.fn((_urls, onLoad) => {
        onLoad({ isCubeTexture: true, dispose: vi.fn() });
      });
    }),
    TextureLoader: vi.fn(function MockTextureLoader() {
      this.load = vi.fn((_url, onLoad) => {
        onLoad({ isTexture: true, mapping: null, dispose: vi.fn() });
      });
    }),
  };
});

const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js');

function makeRenderer() {
  return { domElement: { tagName: 'CANVAS' }, shadowMap: { enabled: false } };
}

function makeEnv(opts = {}) {
  return new GraphSceneEnvironment({
    renderer: makeRenderer(),
    scene:    new THREE.Scene(),
    ...opts,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

// ── Constructor ───────────────────────────────────────────────────────────────

describe('GraphSceneEnvironment constructor', () => {
  it('throws TypeError when renderer is null', () => {
    expect(() => new GraphSceneEnvironment({ renderer: null, scene: new THREE.Scene() }))
      .toThrow(TypeError);
  });

  it('throws TypeError when renderer has no domElement', () => {
    expect(() => new GraphSceneEnvironment({ renderer: {}, scene: new THREE.Scene() }))
      .toThrow(/renderer must be/);
  });

  it('throws TypeError when scene is not a THREE.Scene', () => {
    expect(() => new GraphSceneEnvironment({ renderer: makeRenderer(), scene: {} }))
      .toThrow(TypeError);
  });

  it('constructs without throwing given valid arguments', () => {
    expect(() => makeEnv()).not.toThrow();
  });
});

// ── setHDR() ──────────────────────────────────────────────────────────────────

describe('GraphSceneEnvironment.setHDR()', () => {
  let scene;
  let env;

  beforeEach(() => {
    scene = new THREE.Scene();
    env   = new GraphSceneEnvironment({ renderer: makeRenderer(), scene });
  });

  afterEach(() => {
    env.dispose();
  });

  it('throws after dispose()', async () => {
    env.dispose();
    await expect(env.setHDR('/test.hdr')).rejects.toThrow(/disposed/);
  });

  it('calls RGBELoader.load with the provided URL', async () => {
    await env.setHDR('/test.hdr');
    expect(RGBELoader).toHaveBeenCalledOnce();
    const loaderInstance = RGBELoader.mock.instances.at(-1);
    expect(loaderInstance.load).toHaveBeenCalledWith('/test.hdr', expect.any(Function), undefined, expect.any(Function));
  });

  it('sets scene.environment to the PMREM texture', async () => {
    await env.setHDR('/test.hdr');
    expect(scene.environment).toBeDefined();
    expect(scene.environment.isPMREM).toBe(true);
  });

  it('sets scene.background to the equirect texture by default (asBackground=true)', async () => {
    await env.setHDR('/test.hdr');
    expect(scene.background).toBeDefined();
    expect(scene.background.isTexture).toBe(true);
    expect(scene.background.isPMREM).toBeUndefined();
  });

  it('does not set scene.background when asBackground=false', async () => {
    await env.setHDR('/test.hdr', { asBackground: false });
    expect(scene.background).toBeNull();
    expect(scene.environment).toBeDefined();
  });

  it('resolves a built-in preset name to a URL', async () => {
    await env.setHDR('studio-1k');
    const loaderInstance = RGBELoader.mock.instances.at(-1);
    expect(loaderInstance.load.mock.calls[0][0]).toContain('studio-1k.hdr');
  });

  it('calls EXRLoader.load for a .exr URL', async () => {
    await env.setHDR('/test.exr');
    expect(EXRLoader).toHaveBeenCalledOnce();
    expect(RGBELoader).not.toHaveBeenCalled();
    const loaderInstance = EXRLoader.mock.instances.at(-1);
    expect(loaderInstance.load).toHaveBeenCalledWith('/test.exr', expect.any(Function), undefined, expect.any(Function));
  });

  it('sets scene.environment to the PMREM texture for a .exr source', async () => {
    await env.setHDR('/test.exr');
    expect(scene.environment).toBeDefined();
    expect(scene.environment.isPMREM).toBe(true);
  });

  it('dispatches by the #name.ext fragment when the URL path has no extension (object URLs)', async () => {
    await env.setHDR('blob:http://localhost/1234-uuid#sunset.exr');
    expect(EXRLoader).toHaveBeenCalledOnce();
    expect(RGBELoader).not.toHaveBeenCalled();
    const loaderInstance = EXRLoader.mock.instances.at(-1);
    // The full URL (fragment included) is what's handed to the loader —
    // browsers strip the fragment themselves when resolving the blob.
    expect(loaderInstance.load.mock.calls[0][0]).toBe('blob:http://localhost/1234-uuid#sunset.exr');
  });

  it('returns this', async () => {
    const result = await env.setHDR('/test.hdr');
    expect(result).toBe(env);
  });

  it('releases the previous HDR when a new one is loaded', async () => {
    await env.setHDR('/first.hdr');
    const first = RGBELoader.mock.instances.at(-1);
    vi.clearAllMocks();
    await env.setHDR('/second.hdr');
    // RGBELoader was called again for the new URL
    expect(RGBELoader).toHaveBeenCalledOnce();
    // first texture's dispose will be called (via releaseHDR after refCount → 0)
    expect(first.load.mock.calls.length).toBe(0); // already cleared
  });

  it('leaves the previous HDR intact when the new load fails', async () => {
    await env.setHDR('/good.hdr');
    const goodTexture = scene.environment;

    RGBELoader.mockImplementationOnce(function () {
      this.load = vi.fn((_url, _onLoad, _onProgress, onError) => onError(new Error('404')));
    });
    await expect(env.setHDR('/bad.hdr')).rejects.toThrow('404');

    // The old texture must still be the live, undisposed scene environment —
    // not disposed out from under the scene by a failed swap.
    expect(scene.environment).toBe(goodTexture);
    expect(goodTexture.dispose).not.toHaveBeenCalled();
  });

  it('a superseded call releases its own ref instead of leaking it', async () => {
    const { PMREMGenerator } = await import('three');

    // ponytail: warm one URL via a fully-awaited call on a throwaway instance first.
    // Racing two *cold* URLs directly trips an unrelated Vitest quirk where two
    // concurrent first-time dynamic import()s of the same specifier
    // (RGBELoader.js) can resolve the second one to the real, un-mocked module.
    // Making one side of the race a cache hit (no new dynamic import) sidesteps it
    // while still exercising the real overtake-and-release path in GraphSceneEnvironment.
    // Not disposed until after the race — disposing it now would drop the ref
    // to 0 and evict the cache entry, making the "cache hit" below cold again.
    const warmEnv = makeEnv();
    await warmEnv.setHDR('/superseded.hdr');

    const first = env.setHDR('/superseded.hdr'); // cache hit — not awaited, overtaken below
    const second = env.setHDR('/winner.hdr'); // cold — the only fresh import in flight
    await Promise.all([first, second]);
    warmEnv.dispose();

    const supersededTexture =
      PMREMGenerator.mock.results[0].value.fromEquirectangular.mock.results[0].value.texture;
    const winnerTexture =
      PMREMGenerator.mock.results[1].value.fromEquirectangular.mock.results[0].value.texture;

    // The winner is applied; the superseded call already released its ref —
    // its texture must be disposed once env itself is disposed (no leaked ref).
    expect(scene.environment).toBe(winnerTexture);
    env.dispose();
    expect(supersededTexture.dispose).toHaveBeenCalled();
    expect(winnerTexture.dispose).toHaveBeenCalled();
  });
});

// ── HDR cache ref-counting ────────────────────────────────────────────────────

describe('GraphSceneEnvironment HDR cache', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads the same URL only once across two instances', async () => {
    const scene1 = new THREE.Scene();
    const scene2 = new THREE.Scene();
    const env1   = new GraphSceneEnvironment({ renderer: makeRenderer(), scene: scene1 });
    const env2   = new GraphSceneEnvironment({ renderer: makeRenderer(), scene: scene2 });
    await env1.setHDR('/shared.hdr');
    vi.clearAllMocks(); // reset call count
    await env2.setHDR('/shared.hdr');
    // Should NOT call RGBELoader again — cache hit
    expect(RGBELoader).not.toHaveBeenCalled();
    env1.dispose();
    env2.dispose();
  });

  it('disposes textures when the last reference is released', async () => {
    const { PMREMGenerator } = await import('three');
    const env1 = makeEnv();
    // Load once — PMREMGenerator called here
    await env1.setHDR('/ref-count-A.hdr');
    const pmremInstance = PMREMGenerator.mock.instances.at(-1);
    const envTexture    = pmremInstance?.fromEquirectangular.mock.results.at(-1)?.value?.texture;

    // Load same URL in second instance — cache hit, no new load
    const env2 = makeEnv();
    await env2.setHDR('/ref-count-A.hdr');

    // Release first ref — texture still alive (refCount === 1)
    env1.dispose();
    if (envTexture) expect(envTexture.dispose).not.toHaveBeenCalled();

    // Release last ref — textures must now be disposed
    env2.dispose();
    if (envTexture) expect(envTexture.dispose).toHaveBeenCalledOnce();
  });
});

// ── setBackground() ───────────────────────────────────────────────────────────

describe('GraphSceneEnvironment.setBackground()', () => {
  let scene;
  let env;

  beforeEach(() => {
    scene = new THREE.Scene();
    env   = makeEnv({ scene });
  });

  it('throws after dispose()', () => {
    env.dispose();
    expect(() => env.setBackground(null)).toThrow(/disposed/);
  });

  it('sets scene.background to null', () => {
    scene.background = new THREE.Color(0xff0000);
    env.setBackground(null);
    expect(scene.background).toBeNull();
  });

  it('accepts a hex number and creates THREE.Color', () => {
    env.setBackground(0xff0000);
    expect(scene.background).toBeInstanceOf(THREE.Color);
    expect(scene.background.getHex()).toBe(0xff0000);
  });

  it('accepts a hex string and creates THREE.Color', () => {
    env.setBackground('#00ff00');
    expect(scene.background).toBeInstanceOf(THREE.Color);
  });

  it('accepts a THREE.Color directly', () => {
    const col = new THREE.Color(0x0000ff);
    env.setBackground(col);
    expect(scene.background).toBe(col);
  });

  it('accepts a THREE.Texture directly', () => {
    const tex = new THREE.Texture();
    env.setBackground(tex);
    expect(scene.background).toBe(tex);
  });

  it('throws TypeError for unsupported types', () => {
    expect(() => env.setBackground({ gradient: true })).toThrow(TypeError);
  });

  it('is chainable', () => {
    expect(env.setBackground(null)).toBe(env);
  });
});

// ── setFog() ──────────────────────────────────────────────────────────────────

describe('GraphSceneEnvironment.setFog()', () => {
  let scene;
  let env;

  beforeEach(() => {
    scene = new THREE.Scene();
    env   = makeEnv({ scene });
  });

  it('throws after dispose()', () => {
    env.dispose();
    expect(() => env.setFog({ type: 'linear' })).toThrow(/disposed/);
  });

  it('sets linear fog with correct near/far', () => {
    env.setFog({ type: 'linear', color: 0xffffff, near: 5, far: 50 });
    expect(scene.fog).toBeInstanceOf(THREE.Fog);
    expect(scene.fog.near).toBe(5);
    expect(scene.fog.far).toBe(50);
  });

  it('sets exponential fog with correct density', () => {
    env.setFog({ type: 'exponential', color: 0x223344, density: 0.05 });
    expect(scene.fog).toBeInstanceOf(THREE.FogExp2);
    expect(scene.fog.density).toBeCloseTo(0.05);
  });

  it('throws TypeError for unknown fog type', () => {
    expect(() => env.setFog({ type: 'volumetric' })).toThrow(TypeError);
    expect(() => env.setFog({ type: 'volumetric' })).toThrow(/unknown fog type/);
  });

  it('throws TypeError when type is missing', () => {
    expect(() => env.setFog({})).toThrow(TypeError);
  });

  it('is chainable', () => {
    expect(env.setFog({ type: 'linear' })).toBe(env);
  });
});

// ── fog presets (Prompt 28) ───────────────────────────────────────────────────

describe('GraphSceneEnvironment fog presets', () => {
  let scene;
  let env;

  beforeEach(() => {
    scene = new THREE.Scene();
    env   = makeEnv({ scene });
  });

  it("setFog('linear') creates THREE.Fog with preset defaults", () => {
    env.setFog('linear');
    expect(scene.fog).toBeInstanceOf(THREE.Fog);
    expect(scene.fog.near).toBeGreaterThan(1);   // better than raw default
    expect(scene.fog.far).toBeGreaterThan(100);
  });

  it("setFog('exponential') creates THREE.FogExp2 with preset defaults", () => {
    env.setFog('exponential');
    expect(scene.fog).toBeInstanceOf(THREE.FogExp2);
    expect(scene.fog.density).toBeDefined();
  });

  it("setFog('volumetric-low') creates exponential fog as fallback", () => {
    env.setFog('volumetric-low');
    expect(scene.fog).toBeInstanceOf(THREE.FogExp2);
  });

  it("setFog('volumetric-cinematic') creates exponential fog as fallback", () => {
    env.setFog('volumetric-cinematic');
    expect(scene.fog).toBeInstanceOf(THREE.FogExp2);
  });

  it('volumetric preset stores name in scene.userData', () => {
    env.setFog('volumetric-low');
    expect(scene.userData.graph3d_fogPreset).toBe('volumetric-low');
  });

  it('volumetric preset emits console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    env.setFog('volumetric-cinematic');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('volumetric-cinematic');
    spy.mockRestore();
  });

  it('non-volumetric preset does not set scene.userData', () => {
    env.setFog('volumetric-low'); // set it first
    env.setFog('linear');          // switch to non-volumetric
    expect(scene.userData.graph3d_fogPreset).toBeUndefined();
  });

  it('fogPreset getter returns the active preset name', () => {
    env.setFog('exponential');
    expect(env.fogPreset).toBe('exponential');
    env.setFog('volumetric-cinematic');
    expect(env.fogPreset).toBe('volumetric-cinematic');
  });

  it('fogPreset getter returns null after object-form setFog', () => {
    env.setFog('linear');
    env.setFog({ type: 'linear', near: 5, far: 50 });
    expect(env.fogPreset).toBeNull();
  });

  it("setFog('unknown-preset') throws TypeError", () => {
    expect(() => env.setFog('neon-rain')).toThrow(TypeError);
    expect(() => env.setFog('neon-rain')).toThrow(/unknown fog preset/);
  });

  it('clear() resets fogPreset to null', () => {
    env.setFog('volumetric-low');
    env.clear();
    expect(env.fogPreset).toBeNull();
  });

  it('clear() removes graph3d_fogPreset from scene.userData', () => {
    env.setFog('volumetric-cinematic');
    env.clear();
    expect(scene.userData.graph3d_fogPreset).toBeUndefined();
  });

  it('is chainable', () => {
    expect(env.setFog('linear')).toBe(env);
  });
});

// ── setSkybox() ───────────────────────────────────────────────────────────────

describe('GraphSceneEnvironment.setSkybox()', () => {
  let scene;
  let env;

  beforeEach(() => {
    scene = new THREE.Scene();
    env   = makeEnv({ scene });
  });

  it('throws after dispose()', async () => {
    env.dispose();
    await expect(env.setSkybox(['a','b','c','d','e','f'])).rejects.toThrow(/disposed/);
  });

  it('throws TypeError for non-array non-string input', async () => {
    await expect(env.setSkybox(42)).rejects.toThrow(TypeError);
  });

  it('throws TypeError for array with length !== 6', async () => {
    await expect(env.setSkybox(['a', 'b'])).rejects.toThrow(TypeError);
    await expect(env.setSkybox(['a', 'b'])).rejects.toThrow(/6/);
  });

  it('loads a CubeTexture from 6 URLs and sets as background', async () => {
    const urls = ['+x.png', '-x.png', '+y.png', '-y.png', '+z.png', '-z.png'];
    await env.setSkybox(urls);
    expect(scene.background).toBeDefined();
    expect(scene.background.isCubeTexture).toBe(true);
  });

  it('is chainable (returns this)', async () => {
    const urls = ['+x.png', '-x.png', '+y.png', '-y.png', '+z.png', '-z.png'];
    const result = await env.setSkybox(urls);
    expect(result).toBe(env);
  });

  it('loads an equirect skybox from a non-hdr URL via TextureLoader', async () => {
    await env.setSkybox('/sky.jpg');
    expect(scene.background).toBeDefined();
    expect(scene.background.isTexture).toBe(true);
  });

  it('loads an equirect skybox from an .hdr URL via RGBELoader', async () => {
    await env.setSkybox('/sky.hdr');
    expect(RGBELoader).toHaveBeenCalledOnce();
    expect(scene.background).toBeDefined();
  });

  it('loads an equirect skybox from an .exr URL via EXRLoader', async () => {
    await env.setSkybox('/sky.exr');
    expect(EXRLoader).toHaveBeenCalledOnce();
    expect(RGBELoader).not.toHaveBeenCalled();
    expect(scene.background).toBeDefined();
  });

  it('does not set scene.environment', async () => {
    await env.setSkybox(['+x.png', '-x.png', '+y.png', '-y.png', '+z.png', '-z.png']);
    expect(scene.environment).toBeNull();
  });
});

// ── clear() ───────────────────────────────────────────────────────────────────

describe('GraphSceneEnvironment.clear()', () => {
  let scene;
  let env;

  beforeEach(() => {
    scene = new THREE.Scene();
    env   = makeEnv({ scene });
  });

  it('throws after dispose()', () => {
    env.dispose();
    expect(() => env.clear()).toThrow(/disposed/);
  });

  it('nulls scene.environment', async () => {
    await env.setHDR('/test.hdr', { asBackground: false });
    env.clear();
    expect(scene.environment).toBeNull();
  });

  it('nulls scene.background', async () => {
    await env.setHDR('/test.hdr');
    env.clear();
    expect(scene.background).toBeNull();
  });

  it('nulls scene.fog', () => {
    env.setFog({ type: 'linear' });
    env.clear();
    expect(scene.fog).toBeNull();
  });

  it('is chainable', () => {
    expect(env.clear()).toBe(env);
  });

  it('subsequent clear() does not throw', () => {
    expect(() => { env.clear(); env.clear(); }).not.toThrow();
  });
});

// ── dispose() ─────────────────────────────────────────────────────────────────

describe('GraphSceneEnvironment.dispose()', () => {
  it('is idempotent', () => {
    const env = makeEnv();
    expect(() => { env.dispose(); env.dispose(); }).not.toThrow();
  });

  it('all public methods throw after dispose', async () => {
    const env = makeEnv();
    env.dispose();
    const pat = /GraphSceneEnvironment\.\w+: instance has been disposed/;
    await expect(env.setHDR('/test.hdr')).rejects.toThrow(pat);
    expect(() => env.setBackground(null)).toThrow(pat);
    expect(() => env.setFog({ type: 'linear' })).toThrow(pat);
    await expect(env.setSkybox('/sky.hdr')).rejects.toThrow(pat);
    expect(() => env.clear()).toThrow(pat);
  });
});
