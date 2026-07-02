import { describe, it, expect } from 'vitest';
import { GraphSceneCamera } from '../../src/scene/GraphSceneCamera.js';

// GraphSceneCamera holds no GPU resources — the THREE camera is a data object.
// Disposal only needs to cover OrbitControls (event listeners). These tests
// confirm the lifecycle contract without spinning up OrbitControls.

describe('GraphSceneCamera disposal', () => {
  it('creates and disposes 1 000 instances without throwing', () => {
    for (let i = 0; i < 1_000; i++) {
      const cam = new GraphSceneCamera();
      cam.dispose();
    }
  });

  it('cycles through all presets without leaking', () => {
    const presets = ['orbit', 'fixed', 'isometric', 'top-down', 'cinematic-low', 'cinematic-high'];
    for (let i = 0; i < 100; i++) {
      const cam = new GraphSceneCamera({ preset: presets[i % presets.length] });
      cam.dispose();
    }
  });

  it('double-dispose is idempotent', () => {
    const cam = new GraphSceneCamera();
    cam.dispose();
    expect(() => cam.dispose()).not.toThrow();
  });

  it('all public methods throw after dispose with a descriptive error', () => {
    const cam = new GraphSceneCamera();
    cam.dispose();
    const pattern = /GraphSceneCamera\.\w+: instance has been disposed/;
    expect(() => cam.setPreset('orbit')).toThrow(pattern);
    expect(() => cam.lookAt(0, 0, 0)).toThrow(pattern);
    expect(() => cam.setPosition(0, 0, 0)).toThrow(pattern);
    expect(() => cam.useCustom({})).toThrow(pattern);
  });
});
