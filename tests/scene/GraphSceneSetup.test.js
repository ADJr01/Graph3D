import { describe, it, expect } from 'vitest';
import { GraphScene } from '../../src/scene/GraphScene.js';
import { GraphSceneSetup } from '../../src/scene/GraphSceneSetup.js';
import { GraphSceneLight } from '../../src/scene/GraphSceneLight.js';
import { GraphSceneEnvironment } from '../../src/scene/GraphSceneEnvironment.js';
import { GraphSceneShadows } from '../../src/scene/GraphSceneShadows.js';

function makeScene() {
  return new GraphScene({ graph3d: {}, name: 'main' });
}

function makeRenderer() {
  return { domElement: {}, shadowMap: { enabled: false, type: 0 }, clippingPlanes: [] };
}

// ── Validation ──────────────────────────────────────────────────────────────

describe('GraphSceneSetup.ensureDefaults validation', () => {
  it('throws TypeError when scene is not a GraphScene', async () => {
    await expect(GraphSceneSetup.ensureDefaults({})).rejects.toThrow(TypeError);
  });
});

// ── Camera ──────────────────────────────────────────────────────────────────

describe('GraphSceneSetup.ensureDefaults camera', () => {
  it('returns the scene\'s existing camera', async () => {
    const scene = makeScene();
    const { camera } = await GraphSceneSetup.ensureDefaults(scene);
    expect(camera).toBe(scene.camera);
  });
});

// ── Lights ──────────────────────────────────────────────────────────────────

describe('GraphSceneSetup.ensureDefaults lights', () => {
  it('does not add a light rig when the scene already has a light', async () => {
    const scene = makeScene(); // GraphScene ships default ambient + directional lights
    const { light } = await GraphSceneSetup.ensureDefaults(scene);
    expect(light).toBeNull();
  });

  it('adds a default three-point rig when the scene has no lights', async () => {
    const scene = makeScene();
    scene.three.clear();
    const { light } = await GraphSceneSetup.ensureDefaults(scene);
    expect(light).toBeInstanceOf(GraphSceneLight);
    expect(light.preset).toBe('three-point');
  });

  it('applies a custom lightPreset option', async () => {
    const scene = makeScene();
    scene.three.clear();
    const { light } = await GraphSceneSetup.ensureDefaults(scene, { lightPreset: 'studio' });
    expect(light.preset).toBe('studio');
  });
});

// ── Environment ───────────────────────────────────────────────────────────────

describe('GraphSceneSetup.ensureDefaults environment', () => {
  it('is null without a renderer', async () => {
    const { environment } = await GraphSceneSetup.ensureDefaults(makeScene());
    expect(environment).toBeNull();
  });

  it('is constructed when a renderer is supplied', async () => {
    const { environment } = await GraphSceneSetup.ensureDefaults(makeScene(), {
      renderer: makeRenderer(),
    });
    expect(environment).toBeInstanceOf(GraphSceneEnvironment);
  });
});

// ── Shadows ───────────────────────────────────────────────────────────────────

describe('GraphSceneSetup.ensureDefaults shadows', () => {
  it('is null without a renderer', async () => {
    const { shadows } = await GraphSceneSetup.ensureDefaults(makeScene());
    expect(shadows).toBeNull();
  });

  it('enables the default pcf-soft mode when a renderer is supplied', async () => {
    const renderer = makeRenderer();
    const { shadows } = await GraphSceneSetup.ensureDefaults(makeScene(), { renderer });
    expect(shadows).toBeInstanceOf(GraphSceneShadows);
    expect(shadows.mode).toBe('pcf-soft');
    expect(renderer.shadowMap.enabled).toBe(true);
  });

  it('honors a custom shadowMode option', async () => {
    const renderer = makeRenderer();
    const { shadows } = await GraphSceneSetup.ensureDefaults(makeScene(), {
      renderer,
      shadowMode: 'vsm',
    });
    expect(shadows.mode).toBe('vsm');
  });

  it('skips creating shadows a second time once the renderer already has them enabled', async () => {
    const scene    = makeScene();
    const renderer = makeRenderer();
    await GraphSceneSetup.ensureDefaults(scene, { renderer });
    const { shadows } = await GraphSceneSetup.ensureDefaults(scene, { renderer });
    expect(shadows).toBeNull();
  });
});
