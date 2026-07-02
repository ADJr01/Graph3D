import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { GraphSceneEnvironment } from '../../src/scene/GraphSceneEnvironment.js';

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

function makeEnv() {
  return new GraphSceneEnvironment({
    renderer: { domElement: {}, shadowMap: {} },
    scene:    new THREE.Scene(),
  });
}

describe('GraphSceneEnvironment disposal', () => {
  it('creates and disposes 1 000 instances without throwing', () => {
    for (let i = 0; i < 1_000; i++) {
      makeEnv().dispose();
    }
  });

  it('creates, loads HDR, and disposes 100 times without throwing', async () => {
    for (let i = 0; i < 100; i++) {
      const env = makeEnv();
      await env.setHDR('/loop-test.hdr');
      env.dispose();
    }
  });

  it('double-dispose is idempotent', () => {
    const env = makeEnv();
    env.dispose();
    expect(() => env.dispose()).not.toThrow();
  });

  it('clear() then dispose() does not throw', async () => {
    const env = makeEnv();
    await env.setHDR('/clear-test.hdr');
    env.clear();
    expect(() => env.dispose()).not.toThrow();
  });

  it('all public methods throw after dispose', () => {
    const env = makeEnv();
    env.dispose();
    const pat = /GraphSceneEnvironment\.\w+: instance has been disposed/;
    expect(() => env.setBackground(null)).toThrow(pat);
    expect(() => env.setFog({ type: 'linear' })).toThrow(pat);
    expect(() => env.clear()).toThrow(pat);
  });
});
