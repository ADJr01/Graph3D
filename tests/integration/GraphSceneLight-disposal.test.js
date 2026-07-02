import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GraphSceneLight } from '../../src/scene/GraphSceneLight.js';

describe('GraphSceneLight disposal', () => {
  it('creates and disposes 1 000 instances without throwing', () => {
    for (let i = 0; i < 1_000; i++) {
      const rig = new GraphSceneLight({ scene: new THREE.Scene() });
      rig.dispose();
    }
  });

  it('cycles through all presets without leaking scene children', () => {
    const presets = ['ambient-only', 'three-point', 'studio', 'flat', 'cinematic', 'product-shot'];
    for (let i = 0; i < 100; i++) {
      const scene = new THREE.Scene();
      const rig = new GraphSceneLight({ scene });
      rig.setPreset(presets[i % presets.length]);
      rig.dispose();
      expect(scene.children.filter((c) => c.isLight)).toHaveLength(0);
    }
  });

  it('double-dispose is idempotent', () => {
    const rig = new GraphSceneLight({ scene: new THREE.Scene() });
    rig.dispose();
    expect(() => rig.dispose()).not.toThrow();
  });

  it('user lights are removed from the scene on dispose', () => {
    const scene = new THREE.Scene();
    const rig = new GraphSceneLight({ scene });
    rig.addLight(new THREE.PointLight(), 'a');
    rig.addLight(new THREE.SpotLight(), 'b');
    rig.dispose();
    expect(scene.children.filter((c) => c.isLight)).toHaveLength(0);
  });

  it('all public methods throw after dispose', () => {
    const rig = new GraphSceneLight({ scene: new THREE.Scene() });
    rig.dispose();
    const pat = /GraphSceneLight\.\w+: instance has been disposed/;
    expect(() => rig.setPreset('flat')).toThrow(pat);
    expect(() => rig.setKeyIntensity(1)).toThrow(pat);
    expect(() => rig.setFillIntensity(1)).toThrow(pat);
    expect(() => rig.setRimIntensity(1)).toThrow(pat);
    expect(() => rig.setAmbientIntensity(1)).toThrow(pat);
    expect(() => rig.addLight(new THREE.PointLight())).toThrow(pat);
    expect(() => rig.removeLight('ambient')).toThrow(pat);
  });
});
