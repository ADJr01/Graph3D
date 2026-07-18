import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('three/addons/postprocessing/EffectComposer.js', () => ({
  EffectComposer: vi.fn().mockImplementation(function (renderer) {
    this.renderer = renderer;
    this.passes = [];
    this.addPass = vi.fn((pass) => {
      this.passes.push(pass);
    });
    this.removePass = vi.fn((pass) => {
      const i = this.passes.indexOf(pass);
      if (i !== -1) this.passes.splice(i, 1);
    });
    this.setSize = vi.fn();
    this.render = vi.fn();
    this.dispose = vi.fn();
  }),
}));

vi.mock('three/addons/postprocessing/RenderPass.js', () => ({
  RenderPass: vi.fn().mockImplementation(function (scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.dispose = vi.fn();
  }),
}));

import { PostFX } from '../../src/postfx/PostFX.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';

function makeRenderer() {
  return { id: 'renderer', domElement: { width: 1024, height: 768 } };
}
function makeScene() {
  return { id: 'scene' };
}
function makeCamera() {
  return { id: 'camera' };
}

function makeCtx() {
  return { renderer: makeRenderer(), scene: makeScene(), camera: makeCamera() };
}

/** A fake pass whose `.dispose`/props are spy-observable. */
function fakePass() {
  return { dispose: vi.fn(), value: undefined };
}

describe('PostFX', () => {
  beforeEach(() => {
    vi.mocked(EffectComposer).mockClear();
    vi.mocked(RenderPass).mockClear();
  });

  // ── Construction ────────────────────────────────────────────────────────

  it('throws TypeError when renderer is missing', () => {
    const { scene, camera } = makeCtx();
    expect(() => new PostFX({ scene, camera })).toThrow(TypeError);
    expect(() => new PostFX({ scene, camera })).toThrow(/renderer is required/);
  });

  it('throws TypeError when scene is missing', () => {
    const { renderer, camera } = makeCtx();
    expect(() => new PostFX({ renderer, camera })).toThrow(/scene is required/);
  });

  it('throws TypeError when camera is missing', () => {
    const { renderer, scene } = makeCtx();
    expect(() => new PostFX({ renderer, scene })).toThrow(/camera is required/);
  });

  it('constructs an EffectComposer bound to the renderer', () => {
    const { renderer, scene, camera } = makeCtx();
    new PostFX({ renderer, scene, camera }); // eslint-disable-line no-new
    expect(EffectComposer).toHaveBeenCalledWith(renderer);
  });

  it('constructs a RenderPass bound to scene/camera and adds it first', () => {
    const { renderer, scene, camera } = makeCtx();
    const fx = new PostFX({ renderer, scene, camera });
    expect(RenderPass).toHaveBeenCalledWith(scene, camera);
    expect(fx.enabled()).toEqual([]); // RenderPass itself isn't a named/enabled pass
  });

  it('throws a clear, actionable error (not a bare TypeError) when EffectComposer is unavailable — the UMD-without-globals case', () => {
    vi.mocked(EffectComposer).mockImplementationOnce(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'EffectComposer')");
    });
    const { renderer, scene, camera } = makeCtx();
    expect(() => new PostFX({ renderer, scene, camera })).toThrow(/PostFX isn't available in this build/);
  });

  // ── registerPass ────────────────────────────────────────────────────────

  describe('PostFX.registerPass', () => {
    it('throws TypeError for a non-string name', () => {
      expect(() => PostFX.registerPass(42, { order: 1, create: () => {} })).toThrow(TypeError);
    });

    it('throws TypeError when create is missing', () => {
      expect(() => PostFX.registerPass('x', { order: 1 })).toThrow(/create must be a function/);
    });

    it('throws TypeError when order is not a finite number', () => {
      expect(() => PostFX.registerPass('x', { order: NaN, create: () => {} })).toThrow(
        /order must be a finite number/,
      );
      expect(() => PostFX.registerPass('x', { create: () => {} })).toThrow(
        /order must be a finite number/,
      );
    });
  });

  // ── enable / enabled ────────────────────────────────────────────────────

  describe('enable() / enabled()', () => {
    it('throws for an unregistered pass name', () => {
      const fx = new PostFX(makeCtx());
      expect(() => fx.enable('nope-' + Math.random())).toThrow(/unknown pass/);
    });

    it('throws TypeError for a non-string name', () => {
      const fx = new PostFX(makeCtx());
      expect(() => fx.enable(42)).toThrow(TypeError);
    });

    it('throws a clear, actionable error (not a bare TypeError) when a pass\'s create() fails on a missing UMD global', () => {
      const name = 'enable-umd-gap-' + Math.random();
      PostFX.registerPass(name, {
        order: 1,
        create: () => {
          throw new TypeError("Cannot read properties of undefined (reading 'UnrealBloomPass')");
        },
      });
      const fx = new PostFX(makeCtx());
      expect(() => fx.enable(name)).toThrow(new RegExp(`PostFX '${name}' pass isn't available in this build`));
    });

    it('creates the pass via the registered factory and adds it to the composer', () => {
      const name = 'enable-basic-' + Math.random();
      const pass = fakePass();
      const create = vi.fn(() => pass);
      PostFX.registerPass(name, { order: 1, create });
      const { renderer, scene, camera } = makeCtx();
      const fx = new PostFX({ renderer, scene, camera });

      fx.enable(name, { strength: 2 });

      expect(create).toHaveBeenCalledWith(
        { scene, camera, renderer, size: { width: 1024, height: 768 } },
        { strength: 2 },
      );
      expect(fx.enabled()).toEqual([name]);
    });

    it('returns this for chaining', () => {
      const name = 'enable-chain-' + Math.random();
      PostFX.registerPass(name, { order: 1, create: () => fakePass() });
      const fx = new PostFX(makeCtx());
      expect(fx.enable(name)).toBe(fx);
    });

    it('re-enabling an already-enabled pass configures it instead of recreating', () => {
      const name = 'enable-idempotent-' + Math.random();
      const create = vi.fn(() => fakePass());
      PostFX.registerPass(name, { order: 1, create });
      const fx = new PostFX(makeCtx());

      fx.enable(name, { a: 1 });
      fx.enable(name, { b: 2 });

      expect(create).toHaveBeenCalledOnce();
      expect(fx.enabled()).toEqual([name]);
    });

    it('automatically orders enabled passes by registered `order`, regardless of enable() call order', () => {
      const nameLow = 'order-low-' + Math.random();
      const nameHigh = 'order-high-' + Math.random();
      const passLow = fakePass();
      const passHigh = fakePass();
      PostFX.registerPass(nameLow, { order: 1, create: () => passLow });
      PostFX.registerPass(nameHigh, { order: 100, create: () => passHigh });

      const fx = new PostFX(makeCtx());
      // Enable the higher-order pass first.
      fx.enable(nameHigh);
      fx.enable(nameLow);

      expect(fx.enabled()).toEqual([nameLow, nameHigh]);
    });

    it('throws after dispose()', () => {
      const fx = new PostFX(makeCtx());
      fx.dispose();
      expect(() => fx.enable('anything')).toThrow(/disposed/);
    });
  });

  // ── canEnable gating (Prompt 119) ──────────────────────────────────────

  describe('canEnable gating', () => {
    it('skips creating the pass and returns this when canEnable returns false', () => {
      const name = 'can-enable-false-' + Math.random();
      const create = vi.fn(() => fakePass());
      const canEnable = vi.fn(() => false);
      PostFX.registerPass(name, { order: 1, create, canEnable });
      const fx = new PostFX(makeCtx());

      const result = fx.enable(name);

      expect(create).not.toHaveBeenCalled();
      expect(fx.enabled()).toEqual([]);
      expect(result).toBe(fx);
    });

    it('creates the pass when canEnable returns true', () => {
      const name = 'can-enable-true-' + Math.random();
      const create = vi.fn(() => fakePass());
      PostFX.registerPass(name, { order: 1, create, canEnable: () => true });
      const fx = new PostFX(makeCtx());

      fx.enable(name);

      expect(create).toHaveBeenCalledOnce();
      expect(fx.enabled()).toEqual([name]);
    });

    it('passes capabilities through ctx to canEnable', () => {
      const name = 'can-enable-ctx-' + Math.random();
      const capabilities = { webgl2: true };
      const canEnable = vi.fn(() => true);
      PostFX.registerPass(name, { order: 1, create: () => fakePass(), canEnable });
      const { renderer, scene, camera } = makeCtx();
      const fx = new PostFX({ renderer, scene, camera, capabilities });

      fx.enable(name);

      expect(canEnable).toHaveBeenCalledWith(expect.objectContaining({ capabilities }), {});
    });
  });

  // ── disable ─────────────────────────────────────────────────────────────

  describe('disable()', () => {
    it('is a no-op when the pass is not enabled', () => {
      const fx = new PostFX(makeCtx());
      expect(() => fx.disable('never-enabled')).not.toThrow();
      expect(fx.enabled()).toEqual([]);
    });

    it('removes and disposes the pass', () => {
      const name = 'disable-basic-' + Math.random();
      const pass = fakePass();
      PostFX.registerPass(name, { order: 1, create: () => pass });
      const fx = new PostFX(makeCtx());
      fx.enable(name);

      fx.disable(name);

      expect(pass.dispose).toHaveBeenCalledOnce();
      expect(fx.enabled()).toEqual([]);
    });

    it('returns this for chaining', () => {
      const fx = new PostFX(makeCtx());
      expect(fx.disable('anything')).toBe(fx);
    });

    it('throws after dispose()', () => {
      const fx = new PostFX(makeCtx());
      fx.dispose();
      expect(() => fx.disable('anything')).toThrow(/disposed/);
    });
  });

  // ── configure ───────────────────────────────────────────────────────────

  describe('configure()', () => {
    it('throws when the pass is not enabled', () => {
      const fx = new PostFX(makeCtx());
      expect(() => fx.configure('nope', { a: 1 })).toThrow(/is not enabled/);
    });

    it('merges opts and applies Object.assign by default', () => {
      const name = 'configure-default-' + Math.random();
      const pass = fakePass();
      PostFX.registerPass(name, { order: 1, create: () => pass });
      const fx = new PostFX(makeCtx());
      fx.enable(name, { value: 1 });

      fx.configure(name, { value: 2 });

      expect(pass.value).toBe(2);
    });

    it('calls the definition-provided configure hook when present', () => {
      const name = 'configure-hook-' + Math.random();
      const pass = fakePass();
      const configureHook = vi.fn();
      PostFX.registerPass(name, { order: 1, create: () => pass, configure: configureHook });
      const fx = new PostFX(makeCtx());
      fx.enable(name, { a: 1 });

      fx.configure(name, { b: 2 });

      expect(configureHook).toHaveBeenCalledWith(pass, { a: 1, b: 2 });
    });

    it('throws after dispose()', () => {
      const fx = new PostFX(makeCtx());
      fx.dispose();
      expect(() => fx.configure('anything', {})).toThrow(/disposed/);
    });
  });

  // ── registerPreset / preset() (Prompt 119) ──────────────────────────────

  describe('PostFX.registerPreset', () => {
    it('throws TypeError for a non-string name', () => {
      expect(() => PostFX.registerPreset(42, {})).toThrow(TypeError);
    });

    it('throws TypeError when passOpts is not a plain object', () => {
      expect(() => PostFX.registerPreset('x', null)).toThrow(/passOpts must be a plain object/);
    });
  });

  describe('preset()', () => {
    it('throws for an unregistered preset name', () => {
      const fx = new PostFX(makeCtx());
      expect(() => fx.preset('nope-' + Math.random())).toThrow(/unknown preset/);
    });

    it('enables every pass listed in the preset with its given opts', () => {
      const passA = 'preset-a-' + Math.random();
      const passB = 'preset-b-' + Math.random();
      const createA = vi.fn(() => fakePass());
      const createB = vi.fn(() => fakePass());
      PostFX.registerPass(passA, { order: 1, create: createA });
      PostFX.registerPass(passB, { order: 2, create: createB });
      const presetName = 'preset-' + Math.random();
      PostFX.registerPreset(presetName, { [passA]: { x: 1 }, [passB]: { y: 2 } });

      const fx = new PostFX(makeCtx());
      fx.preset(presetName);

      expect(fx.enabled().sort()).toEqual([passA, passB].sort());
      expect(createA).toHaveBeenCalledWith(expect.anything(), { x: 1 });
      expect(createB).toHaveBeenCalledWith(expect.anything(), { y: 2 });
    });

    it('disables passes active before the preset that are not part of it', () => {
      const oldPass = 'preset-old-' + Math.random();
      const newPass = 'preset-new-' + Math.random();
      const oldPassInstance = fakePass();
      PostFX.registerPass(oldPass, { order: 1, create: () => oldPassInstance });
      PostFX.registerPass(newPass, { order: 2, create: () => fakePass() });
      const presetName = 'preset-replace-' + Math.random();
      PostFX.registerPreset(presetName, { [newPass]: {} });

      const fx = new PostFX(makeCtx());
      fx.enable(oldPass);
      fx.preset(presetName);

      expect(oldPassInstance.dispose).toHaveBeenCalledOnce();
      expect(fx.enabled()).toEqual([newPass]);
    });

    it('returns this for chaining', () => {
      const presetName = 'preset-chain-' + Math.random();
      PostFX.registerPreset(presetName, {});
      const fx = new PostFX(makeCtx());
      expect(fx.preset(presetName)).toBe(fx);
    });

    it('throws after dispose()', () => {
      const presetName = 'preset-disposed-' + Math.random();
      PostFX.registerPreset(presetName, {});
      const fx = new PostFX(makeCtx());
      fx.dispose();
      expect(() => fx.preset(presetName)).toThrow(/disposed/);
    });
  });

  // ── pipeline() (Prompt 123) ─────────────────────────────────────────────

  describe('pipeline()', () => {
    it('overrides the automatic order-based sort', () => {
      const nameLow = 'pipeline-low-' + Math.random();
      const nameHigh = 'pipeline-high-' + Math.random();
      PostFX.registerPass(nameLow, { order: 1, create: () => fakePass() });
      PostFX.registerPass(nameHigh, { order: 100, create: () => fakePass() });
      const fx = new PostFX(makeCtx());
      fx.enable(nameLow);
      fx.enable(nameHigh);
      expect(fx.enabled()).toEqual([nameLow, nameHigh]); // default order

      fx.pipeline([nameHigh, nameLow]);

      expect(fx.enabled()).toEqual([nameHigh, nameLow]);
    });

    it('reorders the composer chain to match, RenderPass staying first', () => {
      const nameLow = 'pipeline-composer-low-' + Math.random();
      const nameHigh = 'pipeline-composer-high-' + Math.random();
      const passLow = fakePass();
      const passHigh = fakePass();
      PostFX.registerPass(nameLow, { order: 1, create: () => passLow });
      PostFX.registerPass(nameHigh, { order: 100, create: () => passHigh });
      const fx = new PostFX(makeCtx());
      fx.enable(nameLow);
      fx.enable(nameHigh);

      fx.pipeline([nameHigh, nameLow]);

      const composerInstance = vi.mocked(EffectComposer).mock.instances[0];
      const renderPassInstance = vi.mocked(RenderPass).mock.instances[0];
      expect(composerInstance.passes).toEqual([renderPassInstance, passHigh, passLow]);
    });

    it('passing null clears the override and reverts to automatic order-based sorting', () => {
      const nameLow = 'pipeline-clear-low-' + Math.random();
      const nameHigh = 'pipeline-clear-high-' + Math.random();
      PostFX.registerPass(nameLow, { order: 1, create: () => fakePass() });
      PostFX.registerPass(nameHigh, { order: 100, create: () => fakePass() });
      const fx = new PostFX(makeCtx());
      fx.enable(nameLow);
      fx.enable(nameHigh);
      fx.pipeline([nameHigh, nameLow]);

      fx.pipeline(null);

      expect(fx.enabled()).toEqual([nameLow, nameHigh]);
    });

    it('a pass enabled after pipeline() is set is appended, not dropped', () => {
      const nameA = 'pipeline-append-a-' + Math.random();
      const nameB = 'pipeline-append-b-' + Math.random();
      PostFX.registerPass(nameA, { order: 1, create: () => fakePass() });
      PostFX.registerPass(nameB, { order: 2, create: () => fakePass() });
      const fx = new PostFX(makeCtx());
      fx.enable(nameA);
      fx.pipeline([nameA]);

      fx.enable(nameB);

      expect(fx.enabled()).toEqual([nameA, nameB]);
    });

    it('a pass disabled after pipeline() is set is skipped, not left dangling', () => {
      const nameA = 'pipeline-skip-a-' + Math.random();
      const nameB = 'pipeline-skip-b-' + Math.random();
      PostFX.registerPass(nameA, { order: 1, create: () => fakePass() });
      PostFX.registerPass(nameB, { order: 2, create: () => fakePass() });
      const fx = new PostFX(makeCtx());
      fx.enable(nameA);
      fx.enable(nameB);
      fx.pipeline([nameB, nameA]);

      fx.disable(nameA);

      expect(fx.enabled()).toEqual([nameB]);
    });

    it('throws TypeError when order is neither an array nor null', () => {
      const fx = new PostFX(makeCtx());
      expect(() => fx.pipeline('nope')).toThrow(TypeError);
    });

    it('throws when order names a pass that is not currently enabled', () => {
      const name = 'pipeline-unknown-' + Math.random();
      PostFX.registerPass(name, { order: 1, create: () => fakePass() });
      const fx = new PostFX(makeCtx());
      fx.enable(name);
      expect(() => fx.pipeline([name, 'never-registered'])).toThrow(/not a currently-enabled pass/);
    });

    it('throws when order contains a duplicate name', () => {
      const name = 'pipeline-dup-' + Math.random();
      PostFX.registerPass(name, { order: 1, create: () => fakePass() });
      const fx = new PostFX(makeCtx());
      fx.enable(name);
      expect(() => fx.pipeline([name, name])).toThrow(/duplicate pass name/);
    });

    it('throws when order omits a currently-enabled pass', () => {
      const nameA = 'pipeline-missing-a-' + Math.random();
      const nameB = 'pipeline-missing-b-' + Math.random();
      PostFX.registerPass(nameA, { order: 1, create: () => fakePass() });
      PostFX.registerPass(nameB, { order: 2, create: () => fakePass() });
      const fx = new PostFX(makeCtx());
      fx.enable(nameA);
      fx.enable(nameB);
      expect(() => fx.pipeline([nameA])).toThrow(/missing currently-enabled/);
    });

    it('returns this for chaining', () => {
      const fx = new PostFX(makeCtx());
      expect(fx.pipeline(null)).toBe(fx);
    });

    it('throws after dispose()', () => {
      const fx = new PostFX(makeCtx());
      fx.dispose();
      expect(() => fx.pipeline(null)).toThrow(/disposed/);
    });

    it('preset() clears a prior pipeline() override', () => {
      const nameA = 'pipeline-preset-a-' + Math.random();
      const nameB = 'pipeline-preset-b-' + Math.random();
      PostFX.registerPass(nameA, { order: 1, create: () => fakePass() });
      PostFX.registerPass(nameB, { order: 2, create: () => fakePass() });
      const presetName = 'pipeline-preset-' + Math.random();
      PostFX.registerPreset(presetName, { [nameA]: {}, [nameB]: {} });
      const fx = new PostFX(makeCtx());
      fx.enable(nameA);
      fx.enable(nameB);
      fx.pipeline([nameB, nameA]);

      fx.preset(presetName);

      expect(fx.enabled()).toEqual([nameA, nameB]); // back to registered order
    });
  });

  // ── setSceneCamera / setSize / render ───────────────────────────────────

  it('setSceneCamera updates the base RenderPass scene/camera', () => {
    const fx = new PostFX(makeCtx());
    const newScene = makeScene();
    const newCamera = makeCamera();
    fx.setSceneCamera(newScene, newCamera);

    const name = 'reads-scene-camera-' + Math.random();
    const create = vi.fn(() => fakePass());
    PostFX.registerPass(name, { order: 1, create });
    fx.enable(name);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ scene: newScene, camera: newCamera }),
      {},
    );
  });

  it('setSize delegates to the composer', () => {
    const fx = new PostFX(makeCtx());
    fx.setSize(800, 600);
    const composerInstance = vi.mocked(EffectComposer).mock.instances[0];
    expect(composerInstance.setSize).toHaveBeenCalledWith(800, 600);
  });

  it('render delegates to the composer', () => {
    const fx = new PostFX(makeCtx());
    fx.render(0.016);
    const composerInstance = vi.mocked(EffectComposer).mock.instances[0];
    expect(composerInstance.render).toHaveBeenCalledWith(0.016);
  });

  it('setSize throws after dispose()', () => {
    const fx = new PostFX(makeCtx());
    fx.dispose();
    expect(() => fx.setSize(1, 1)).toThrow(/disposed/);
  });

  it('render throws after dispose()', () => {
    const fx = new PostFX(makeCtx());
    fx.dispose();
    expect(() => fx.render()).toThrow(/disposed/);
  });

  it('setSceneCamera throws after dispose()', () => {
    const fx = new PostFX(makeCtx());
    fx.dispose();
    expect(() => fx.setSceneCamera(makeScene(), makeCamera())).toThrow(/disposed/);
  });

  it('enabled() throws after dispose()', () => {
    const fx = new PostFX(makeCtx());
    fx.dispose();
    expect(() => fx.enabled()).toThrow(/disposed/);
  });

  // ── dispose ─────────────────────────────────────────────────────────────

  describe('dispose()', () => {
    it('disposes every active pass and the composer', () => {
      const name = 'dispose-active-' + Math.random();
      const pass = fakePass();
      PostFX.registerPass(name, { order: 1, create: () => pass });
      const fx = new PostFX(makeCtx());
      fx.enable(name);

      fx.dispose();

      expect(pass.dispose).toHaveBeenCalledOnce();
      const composerInstance = vi.mocked(EffectComposer).mock.instances[0];
      expect(composerInstance.dispose).toHaveBeenCalledOnce();
    });

    it('is idempotent — second call does nothing further', () => {
      const fx = new PostFX(makeCtx());
      fx.dispose();
      expect(() => fx.dispose()).not.toThrow();
      const composerInstance = vi.mocked(EffectComposer).mock.instances[0];
      expect(composerInstance.dispose).toHaveBeenCalledOnce();
    });

    it('creates and disposes 1 000 instances without throwing (leak smoke test)', () => {
      const name = 'dispose-loop-' + Math.random();
      PostFX.registerPass(name, { order: 1, create: () => fakePass() });
      for (let i = 0; i < 1_000; i++) {
        const fx = new PostFX(makeCtx());
        fx.enable(name);
        fx.dispose();
      }
    });
  });
});
