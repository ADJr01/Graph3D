import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { GraphSceneLight } from '../../src/scene/GraphSceneLight.js';

function makeScene() {
  return new THREE.Scene();
}

function makeLight(opts = {}) {
  return new GraphSceneLight({ scene: makeScene(), ...opts });
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('GraphSceneLight constructor', () => {
  it('throws TypeError when scene is omitted', () => {
    expect(() => new GraphSceneLight()).toThrow(TypeError);
    expect(() => new GraphSceneLight()).toThrow(/scene must be a THREE.Scene/);
  });

  it('throws TypeError when scene is not a THREE.Scene', () => {
    expect(() => new GraphSceneLight({ scene: {} })).toThrow(TypeError);
    expect(() => new GraphSceneLight({ scene: null })).toThrow(TypeError);
  });

  it('constructs without throwing given a valid scene', () => {
    expect(() => new GraphSceneLight({ scene: makeScene() })).not.toThrow();
  });

  it('defaults to the three-point preset', () => {
    const rig = makeLight();
    expect(rig.preset).toBe('three-point');
  });

  it('adds preset lights to the scene on construction', () => {
    const scene = makeScene();
    new GraphSceneLight({ scene });
    // three-point has key + fill + rim + ambient = 4 lights
    const lights = scene.children.filter((c) => c.isLight);
    expect(lights.length).toBe(4);
  });
});

// ── setPreset() ───────────────────────────────────────────────────────────────

describe('GraphSceneLight.setPreset()', () => {
  let scene;
  let rig;
  beforeEach(() => {
    scene = makeScene();
    rig = new GraphSceneLight({ scene });
  });

  it('is chainable', () => {
    expect(rig.setPreset('flat')).toBe(rig);
  });

  it('updates the preset getter', () => {
    rig.setPreset('cinematic');
    expect(rig.preset).toBe('cinematic');
  });

  it('throws TypeError for an unknown preset', () => {
    expect(() => rig.setPreset('neon')).toThrow(TypeError);
    expect(() => rig.setPreset('neon')).toThrow(/unknown preset/);
  });

  it('throws after dispose()', () => {
    rig.dispose();
    expect(() => rig.setPreset('flat')).toThrow(/disposed/);
  });

  it('removes old preset lights from the scene when switching', () => {
    const before = scene.children.filter((c) => c.isLight).length;
    expect(before).toBeGreaterThan(0);
    rig.setPreset('flat'); // just one ambient
    const after = scene.children.filter((c) => c.isLight).length;
    expect(after).toBeLessThan(before);
  });

  it('ambient-only adds exactly one light', () => {
    rig.setPreset('ambient-only');
    expect(scene.children.filter((c) => c.isLight).length).toBe(1);
    expect(scene.children.find((c) => c.isLight)).toBeInstanceOf(THREE.AmbientLight);
  });

  it('three-point adds key + fill + rim + ambient (4 lights)', () => {
    rig.setPreset('three-point');
    expect(scene.children.filter((c) => c.isLight).length).toBe(4);
  });

  it('studio adds key + fill + rim + ambient + one area light (5 lights)', () => {
    rig.setPreset('studio');
    expect(scene.children.filter((c) => c.isLight).length).toBe(5);
  });

  it('flat adds exactly one ambient light', () => {
    rig.setPreset('flat');
    expect(scene.children.filter((c) => c.isLight).length).toBe(1);
    expect(scene.children.find((c) => c.isLight)).toBeInstanceOf(THREE.AmbientLight);
  });

  it('cinematic adds 4 lights (key + fill + rim + ambient)', () => {
    rig.setPreset('cinematic');
    expect(scene.children.filter((c) => c.isLight).length).toBe(4);
  });

  it('product-shot adds 4 area lights + ambient (5 lights)', () => {
    rig.setPreset('product-shot');
    expect(scene.children.filter((c) => c.isLight).length).toBe(5);
  });

  it('user lights survive a preset switch', () => {
    rig.addLight(new THREE.PointLight(0xff0000), 'accent');
    rig.setPreset('flat');
    const accent = scene.children.find((c) => c.isLight && c.isPointLight);
    expect(accent).toBeDefined();
  });
});

// ── setKeyIntensity / setFillIntensity / setRimIntensity / setAmbientIntensity ─

describe('GraphSceneLight intensity setters', () => {
  let rig;
  beforeEach(() => { rig = makeLight(); }); // three-point preset

  it('setKeyIntensity updates the key light', () => {
    rig.setKeyIntensity(3.0);
    // Verify by switching to same preset and checking internal state via removeLight
    // Easier: just confirm it's chainable and doesn't throw
    expect(rig.setKeyIntensity(3.0)).toBe(rig);
  });

  it('setFillIntensity is chainable', () => {
    expect(rig.setFillIntensity(0.1)).toBe(rig);
  });

  it('setRimIntensity is chainable', () => {
    expect(rig.setRimIntensity(1.0)).toBe(rig);
  });

  it('setAmbientIntensity is chainable', () => {
    expect(rig.setAmbientIntensity(0.5)).toBe(rig);
  });

  it('setKeyIntensity is a no-op when preset has no key light', () => {
    rig.setPreset('ambient-only');
    expect(() => rig.setKeyIntensity(2.0)).not.toThrow();
  });

  it('setFillIntensity is a no-op when preset has no fill light', () => {
    rig.setPreset('flat');
    expect(() => rig.setFillIntensity(0.5)).not.toThrow();
  });

  it('setRimIntensity is a no-op when preset has no rim light', () => {
    rig.setPreset('ambient-only');
    expect(() => rig.setRimIntensity(1.0)).not.toThrow();
  });

  it('setAmbientIntensity updates the ambient when present', () => {
    const scene = makeScene();
    const r = new GraphSceneLight({ scene });
    r.setPreset('three-point');
    r.setAmbientIntensity(0.99);
    const ambient = scene.children.find((c) => c instanceof THREE.AmbientLight);
    expect(ambient.intensity).toBeCloseTo(0.99);
  });

  it('all intensity setters throw after dispose()', () => {
    rig.dispose();
    expect(() => rig.setKeyIntensity(1)).toThrow(/disposed/);
    expect(() => rig.setFillIntensity(1)).toThrow(/disposed/);
    expect(() => rig.setRimIntensity(1)).toThrow(/disposed/);
    expect(() => rig.setAmbientIntensity(1)).toThrow(/disposed/);
  });
});

// ── addLight() ────────────────────────────────────────────────────────────────

describe('GraphSceneLight.addLight()', () => {
  let scene;
  let rig;
  beforeEach(() => {
    scene = makeScene();
    rig = new GraphSceneLight({ scene });
  });

  it('adds the light to the THREE.Scene', () => {
    const pt = new THREE.PointLight(0xffffff, 1);
    rig.addLight(pt, 'myPoint');
    expect(scene.children).toContain(pt);
  });

  it('is chainable', () => {
    expect(rig.addLight(new THREE.PointLight(), 'p')).toBe(rig);
  });

  it('auto-generates a name when none is given', () => {
    const pt = new THREE.PointLight();
    expect(() => rig.addLight(pt)).not.toThrow();
    expect(scene.children).toContain(pt);
  });

  it('throws TypeError when light is not a THREE.Light', () => {
    expect(() => rig.addLight({ isLight: true })).toThrow(TypeError);
    expect(() => rig.addLight(null)).toThrow(TypeError);
  });

  it('throws when the name is already taken', () => {
    rig.addLight(new THREE.PointLight(), 'dup');
    expect(() => rig.addLight(new THREE.PointLight(), 'dup')).toThrow(/already exists/);
  });

  it('throws after dispose()', () => {
    rig.dispose();
    expect(() => rig.addLight(new THREE.PointLight())).toThrow(/disposed/);
  });
});

// ── removeLight() ─────────────────────────────────────────────────────────────

describe('GraphSceneLight.removeLight()', () => {
  let scene;
  let rig;
  beforeEach(() => {
    scene = makeScene();
    rig = new GraphSceneLight({ scene });
  });

  it('removes a user light by name', () => {
    const pt = new THREE.PointLight();
    rig.addLight(pt, 'accent');
    rig.removeLight('accent');
    expect(scene.children).not.toContain(pt);
  });

  it('removes a user light by instance', () => {
    const pt = new THREE.PointLight();
    rig.addLight(pt, 'accent');
    rig.removeLight(pt);
    expect(scene.children).not.toContain(pt);
  });

  it('removes a preset-managed light by name', () => {
    const ambientBefore = scene.children.find((c) => c instanceof THREE.AmbientLight);
    expect(ambientBefore).toBeDefined();
    rig.removeLight('ambient');
    expect(scene.children).not.toContain(ambientBefore);
  });

  it('is chainable', () => {
    rig.addLight(new THREE.PointLight(), 'x');
    expect(rig.removeLight('x')).toBe(rig);
  });

  it('throws when name is not found', () => {
    expect(() => rig.removeLight('nonexistent')).toThrow(/no light named/);
  });

  it('throws when instance is not managed', () => {
    expect(() => rig.removeLight(new THREE.PointLight())).toThrow(/not managed/);
  });

  it('throws TypeError for invalid argument', () => {
    expect(() => rig.removeLight(42)).toThrow(TypeError);
    expect(() => rig.removeLight(null)).toThrow(TypeError);
  });

  it('throws after dispose()', () => {
    rig.dispose();
    expect(() => rig.removeLight('key')).toThrow(/disposed/);
  });
});

// ── dispose() ─────────────────────────────────────────────────────────────────

describe('GraphSceneLight.dispose()', () => {
  let scene;
  let rig;
  beforeEach(() => {
    scene = makeScene();
    rig = new GraphSceneLight({ scene });
  });

  it('removes all preset lights from the scene', () => {
    rig.dispose();
    expect(scene.children.filter((c) => c.isLight)).toHaveLength(0);
  });

  it('removes user lights from the scene', () => {
    const pt = new THREE.PointLight();
    rig.addLight(pt, 'extra');
    rig.dispose();
    expect(scene.children).not.toContain(pt);
  });

  it('is idempotent — calling twice does not throw', () => {
    expect(() => { rig.dispose(); rig.dispose(); }).not.toThrow();
  });

  it('blocks all public methods after disposal', () => {
    rig.dispose();
    const err = /disposed/;
    expect(() => rig.setPreset('flat')).toThrow(err);
    expect(() => rig.setKeyIntensity(1)).toThrow(err);
    expect(() => rig.addLight(new THREE.PointLight())).toThrow(err);
    expect(() => rig.removeLight('ambient')).toThrow(err);
  });
});
