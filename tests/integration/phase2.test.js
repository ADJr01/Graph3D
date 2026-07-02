import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { GraphScene } from '../../src/scene/GraphScene.js';
import { GraphSceneEnvironment } from '../../src/scene/GraphSceneEnvironment.js';
import { GraphSceneCamera } from '../../src/scene/GraphSceneCamera.js';
import { GraphSceneClipping } from '../../src/scene/GraphSceneClipping.js';
import { GraphSceneShadows } from '../../src/scene/GraphSceneShadows.js';
import { VALID_THEMES } from '../../src/scene/GraphSceneThemes.js';

/**
 * Integration tests for Phase 2 (Scene Composition), covering the exit
 * criteria from Promps.md Prompt 34:
 * (a) HDR ref-counting across 10 scenes, (b) all 8 themes load without
 * error, (c) a cinematic tour reaches each waypoint within tolerance,
 * (d) clip planes correctly hide geometry, (e) CSM split count matches
 * the configured cascade count.
 */

vi.mock('three/examples/jsm/loaders/RGBELoader.js', () => ({
  RGBELoader: vi.fn(function MockRGBELoader() {
    this.load = vi.fn((_url, onLoad) => {
      onLoad({ isTexture: true, mapping: null, dispose: vi.fn() });
    });
  }),
}));

vi.mock('three/examples/jsm/csm/CSM.js', () => ({
  CSM: vi.fn(function MockCSM(_opts) {
    this.update = vi.fn();
    this.dispose = vi.fn();
  }),
}));

vi.mock('../../src/core/Graph3DLoop.js', () => ({
  loop: { add: vi.fn(), remove: vi.fn() },
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

const { CSM } = await import('three/examples/jsm/csm/CSM.js');
const { loop } = await import('../../src/core/Graph3DLoop.js');

function makeRenderer() {
  return {
    domElement: { tagName: 'CANVAS' },
    shadowMap: { enabled: false, type: THREE.PCFShadowMap },
    clippingPlanes: [],
  };
}

// ── (a) HDR ref-counting across 10 scenes ────────────────────────────────────

describe('Phase 2 / (a) HDR ref-counting across scenes', () => {
  it('shares one texture across 10 scenes and only disposes it after the last release', async () => {
    const renderer = makeRenderer();
    const scenes = [];
    const environments = [];
    for (let i = 0; i < 10; i++) {
      const three = new THREE.Scene();
      scenes.push(three);
      environments.push(new GraphSceneEnvironment({ renderer, scene: three }));
    }

    for (const env of environments) {
      await env.setHDR('studio-1k');
    }

    const sharedTexture = scenes[0].environment;
    expect(sharedTexture).toBeTruthy();
    for (const three of scenes) {
      expect(three.environment).toBe(sharedTexture);
    }

    for (let i = 0; i < 9; i++) environments[i].dispose();
    expect(sharedTexture.dispose).not.toHaveBeenCalled();

    environments[9].dispose();
    expect(sharedTexture.dispose).toHaveBeenCalledOnce();
  });
});

// ── (b) all 8 themes load without error ──────────────────────────────────────

describe('Phase 2 / (b) all themes load without error', () => {
  it.each(VALID_THEMES)("applies theme '%s' without throwing", async (name) => {
    const renderer = makeRenderer();
    const scene = new GraphScene({ graph3d: { renderer: { three: renderer } }, name: 'main' });

    await expect(scene.applyTheme(name)).resolves.toBe(scene);
    expect(scene.theme).toBe(name);

    scene.dispose();
  });
});

// ── (c) cinematic tour reaches each waypoint within tolerance ───────────────

describe('Phase 2 / (c) cinematic tour waypoints', () => {
  it('reaches every waypoint position and lookAt within tolerance', () => {
    const TOLERANCE = 1e-3; // lookAt round-trips through a quaternion, so allow float slop
    const cam = new GraphSceneCamera({ preset: 'cinematic-low' });
    const waypoints = [
      { at: [10, 5, 10], lookAt: [1, 0, 0], duration: 1000 },
      { at: [-8, 3, 6], lookAt: [-1, 2, 0], duration: 500 },
      { at: [0, 20, 0], lookAt: [0, 0, 0], duration: 800 },
    ];

    cam.tour(waypoints);
    const tick = loop.add.mock.calls.at(-1)[0];

    for (const wp of waypoints) {
      tick((wp.duration / 1000) * 1.05); // slightly overshoot to force clamped t=1
      expect(cam.three.position.distanceTo(new THREE.Vector3(...wp.at))).toBeLessThan(TOLERANCE);

      const forward = new THREE.Vector3();
      cam.three.getWorldDirection(forward);
      const expected = new THREE.Vector3(...wp.lookAt).sub(cam.three.position).normalize();
      expect(forward.angleTo(expected)).toBeLessThan(TOLERANCE);
    }

    expect(loop.remove).toHaveBeenCalledWith(tick);
    cam.dispose();
  });
});

// ── (d) clip planes correctly hide geometry ─────────────────────────────────

describe('Phase 2 / (d) clip planes hide geometry', () => {
  it('a single plane keeps the positive side and clips the negative side', () => {
    const renderer = makeRenderer();
    const clipping = new GraphSceneClipping({ renderer });
    const plane = clipping.addClipPlane([0, 1, 0], 0); // keep y > 0

    expect(plane.distanceToPoint(new THREE.Vector3(0, 5, 0))).toBeGreaterThan(0);
    expect(plane.distanceToPoint(new THREE.Vector3(0, -5, 0))).toBeLessThan(0);
    expect(renderer.clippingPlanes).toContain(plane);
  });

  it('two planes forming a slab clip geometry outside the slab on either side', () => {
    const renderer = makeRenderer();
    const clipping = new GraphSceneClipping({ renderer });
    const bottom = clipping.addClipPlane([0, 1, 0], 0); // keep y > 0
    const top = clipping.addClipPlane([0, -1, 0], 5); // keep y < 5

    const insideSlab = new THREE.Vector3(0, 3, 0);
    const belowSlab = new THREE.Vector3(0, -2, 0);
    const aboveSlab = new THREE.Vector3(0, 10, 0);

    expect(bottom.distanceToPoint(insideSlab)).toBeGreaterThan(0);
    expect(top.distanceToPoint(insideSlab)).toBeGreaterThan(0);

    expect(bottom.distanceToPoint(belowSlab)).toBeLessThan(0);
    expect(top.distanceToPoint(aboveSlab)).toBeLessThan(0);

    expect(renderer.clippingPlanes).toEqual([bottom, top]);
  });
});

// ── (e) shadow CSM split count matches expected ─────────────────────────────

describe('Phase 2 / (e) CSM split count', () => {
  it('configures CSM with 4 cascades and the quality-mapped shadow map size', async () => {
    const renderer = makeRenderer();
    const shadows = new GraphSceneShadows({
      renderer,
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
    });

    shadows.setQuality('ultra');
    await shadows.enable('csm');

    expect(CSM).toHaveBeenCalledOnce();
    const [{ cascades, shadowMapSize }] = CSM.mock.calls.at(-1);
    expect(cascades).toBe(4);
    expect(shadowMapSize).toBe(4096);

    shadows.dispose();
  });
});
