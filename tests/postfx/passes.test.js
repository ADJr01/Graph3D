import { describe, it, expect, vi } from 'vitest';
import {
  ClampToEdgeWrapping,
  Data3DTexture,
  DirectionalLight,
  LinearFilter,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  UnsignedByteType,
} from 'three';
import { PostFX } from '../../src/postfx/index.js';

// Real EffectComposer + real passes, no mocking — this suite exercises the
// actual Three.js construction path for every built-in pass (Prompt 117/118)
// under jsdom (no GL calls happen at construction time, only at render()).

function makeFakeRenderer() {
  return {
    domElement: { width: 800, height: 600 },
    getPixelRatio: () => 1,
    getSize: (target) => target.set(800, 600),
  };
}

const ALL_PASSES_IN_ORDER = [
  'outline',
  'ssao',
  'ssr',
  'godRays',
  'bloom',
  'dof',
  'motionBlur',
  'colorGrading',
  'vignette',
  'chromaticAberration',
  'filmGrain',
  'fxaa',
  'smaa',
];

function makeScene() {
  const scene = new Scene();
  scene.add(new DirectionalLight(0xffffff, 1)); // godRays needs a light to auto-detect
  return scene;
}

function makeFX(scene = makeScene(), capabilities) {
  return new PostFX({
    renderer: makeFakeRenderer(),
    scene,
    camera: new PerspectiveCamera(),
    capabilities,
  });
}

describe('built-in postfx passes (Prompt 117)', () => {
  it.each(ALL_PASSES_IN_ORDER)('%s: enable/disable without throwing', (name) => {
    const fx = makeFX();
    expect(() => fx.enable(name)).not.toThrow();
    expect(fx.enabled()).toEqual([name]);
    expect(() => fx.disable(name)).not.toThrow();
    fx.dispose();
  });

  it('automatically orders every built-in pass into its canonical chain position', () => {
    const fx = makeFX();
    // Enable in reverse to prove ordering isn't call-order-dependent.
    for (const name of [...ALL_PASSES_IN_ORDER].reverse()) {
      fx.enable(name);
    }
    expect(fx.enabled()).toEqual(ALL_PASSES_IN_ORDER);
    fx.dispose();
  });

  it('dispose() releases every enabled built-in pass without throwing', () => {
    const fx = makeFX();
    for (const name of ALL_PASSES_IN_ORDER) fx.enable(name);
    expect(() => fx.dispose()).not.toThrow();
  });

  it('colorGrading disposes its own default identity LUT on disable', () => {
    const fx = makeFX();
    fx.enable('colorGrading');
    expect(() => fx.disable('colorGrading')).not.toThrow();
    fx.dispose();
  });

  it('colorGrading does not dispose a caller-supplied LUT texture', () => {
    const size = 2;
    const lut = new Data3DTexture(new Uint8Array(size * size * size * 4), size, size, size);
    lut.format = RGBAFormat;
    lut.type = UnsignedByteType;
    lut.minFilter = LinearFilter;
    lut.magFilter = LinearFilter;
    lut.wrapS = lut.wrapT = lut.wrapR = ClampToEdgeWrapping;
    const disposeSpy = vi.spyOn(lut, 'dispose');

    const fx = makeFX();
    fx.enable('colorGrading', { lut });
    fx.disable('colorGrading');

    expect(disposeSpy).not.toHaveBeenCalled();
    fx.dispose();
  });

  it('re-enabling a pass configures it instead of throwing', () => {
    const fx = makeFX();
    fx.enable('vignette', { darkness: 1.0 });
    expect(() => fx.enable('vignette', { darkness: 0.5 })).not.toThrow();
    fx.dispose();
  });
});

describe('godRays pass (Prompt 118)', () => {
  it('throws when the scene has no light and no light option is given', () => {
    const fx = makeFX(new Scene()); // no light added
    expect(() => fx.enable('godRays')).toThrow(/requires a light source/);
    fx.dispose();
  });

  it('accepts an explicit light option even with no scene light', () => {
    const fx = makeFX(new Scene());
    const light = new DirectionalLight(0xffffff, 1); // not added to the scene
    expect(() => fx.enable('godRays', { light })).not.toThrow();
    fx.dispose();
  });

  it('auto-detects the first light in the scene', () => {
    const fx = makeFX(); // makeScene() already adds a DirectionalLight
    expect(() => fx.enable('godRays')).not.toThrow();
    fx.dispose();
  });

  it('re-enabling with a new light option reconfigures instead of throwing', () => {
    const fx = makeFX();
    fx.enable('godRays', { exposure: 0.2 });
    const newLight = new DirectionalLight(0xffffff, 1);
    expect(() => fx.enable('godRays', { light: newLight, exposure: 0.4 })).not.toThrow();
    fx.dispose();
  });
});

describe('outline pass (Prompt 118)', () => {
  it('enables with selectedObjects and a hex-number edge color', () => {
    const fx = makeFX();
    expect(() => fx.enable('outline', { selectedObjects: [], visibleEdgeColor: 0xffaa00 })).not.toThrow();
    fx.dispose();
  });

  it('reconfigures selectedObjects without throwing', () => {
    const fx = makeFX();
    fx.enable('outline');
    expect(() => fx.configure('outline', { selectedObjects: [] })).not.toThrow();
    fx.dispose();
  });
});

describe("PostFX auto-activates 'godRays' for 'volumetric-cinematic' fog (Prompt 118)", () => {
  it("enables godRays when the scene's fogPreset flag is 'volumetric-cinematic' and a light exists", () => {
    const scene = makeScene();
    scene.userData.graph3d_fogPreset = 'volumetric-cinematic';
    const fx = makeFX(scene);
    expect(fx.enabled()).toContain('godRays');
    fx.dispose();
  });

  it("does not enable godRays for 'volumetric-low'", () => {
    const scene = makeScene();
    scene.userData.graph3d_fogPreset = 'volumetric-low';
    const fx = makeFX(scene);
    expect(fx.enabled()).not.toContain('godRays');
    fx.dispose();
  });

  it('throws at construction when volumetric-cinematic fog is flagged but no light exists', () => {
    const scene = new Scene(); // no light
    scene.userData.graph3d_fogPreset = 'volumetric-cinematic';
    expect(() => makeFX(scene)).toThrow(/requires a light source/);
  });

  it('setSceneCamera() to a volumetric-cinematic scene also auto-activates godRays', () => {
    const fx = makeFX(new Scene()); // starts on a scene with no fog flag, no light
    const nextScene = makeScene();
    nextScene.userData.graph3d_fogPreset = 'volumetric-cinematic';
    fx.setSceneCamera(nextScene, new PerspectiveCamera());
    expect(fx.enabled()).toContain('godRays');
    fx.dispose();
  });
});

describe('ssr pass (Prompt 119)', () => {
  it('enables with no options (no groundReflector, no selects)', () => {
    const fx = makeFX();
    expect(() => fx.enable('ssr')).not.toThrow();
    expect(fx.enabled()).toContain('ssr');
    fx.dispose();
  });

  it('accepts a groundReflector option without throwing', () => {
    const fx = makeFX();
    const fakeReflector = { visible: true, doRender: vi.fn() };
    expect(() => fx.enable('ssr', { groundReflector: fakeReflector })).not.toThrow();
    fx.dispose();
  });

  it('is silently skipped (no throw) when capabilities report no WebGL2', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fx = makeFX(undefined, { webgl2: false, floatTextures: true });
    fx.enable('ssr');
    expect(fx.enabled()).not.toContain('ssr');
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toMatch(/weak GPU/);
    warnSpy.mockRestore();
    fx.dispose();
  });

  it('is silently skipped when capabilities report no float-texture support', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fx = makeFX(undefined, { webgl2: true, floatTextures: false });
    fx.enable('ssr');
    expect(fx.enabled()).not.toContain('ssr');
    warnSpy.mockRestore();
    fx.dispose();
  });

  it('enables normally when capabilities report full support', () => {
    const fx = makeFX(undefined, { webgl2: true, floatTextures: true });
    fx.enable('ssr');
    expect(fx.enabled()).toContain('ssr');
    fx.dispose();
  });

  it('enables normally when no capabilities were provided at all', () => {
    const fx = makeFX(undefined, undefined);
    fx.enable('ssr');
    expect(fx.enabled()).toContain('ssr');
    fx.dispose();
  });
});

describe('PostFX.preset() (Prompt 119)', () => {
  const PRESET_NAMES = ['cinematic', 'clean', 'dramatic', 'dreamy', 'editorial', 'cyberpunk', 'minimal'];

  it.each(PRESET_NAMES)("applies '%s' without throwing", (name) => {
    const fx = makeFX();
    expect(() => fx.preset(name)).not.toThrow();
    expect(fx.enabled().length).toBeGreaterThan(0);
    fx.dispose();
  });

  it('minimal enables exactly fxaa', () => {
    const fx = makeFX();
    fx.preset('minimal');
    expect(fx.enabled()).toEqual(['fxaa']);
    fx.dispose();
  });

  it('switching presets replaces the previous set instead of merging', () => {
    const fx = makeFX();
    fx.preset('cyberpunk');
    expect(fx.enabled()).toContain('bloom');
    fx.preset('minimal');
    expect(fx.enabled()).toEqual(['fxaa']);
    fx.dispose();
  });

  it('preset() disables a pass that was manually enabled but not part of the new preset', () => {
    const fx = makeFX();
    fx.enable('outline');
    fx.preset('minimal');
    expect(fx.enabled()).not.toContain('outline');
    fx.dispose();
  });

  it('throws on an unknown preset name', () => {
    const fx = makeFX();
    expect(() => fx.preset('not-a-real-preset')).toThrow(/unknown preset/);
    fx.dispose();
  });
});
