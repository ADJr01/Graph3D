import { describe, it, expect } from 'vitest';
import { GraphSceneClipping } from '../../src/scene/GraphSceneClipping.js';

// GraphSceneClipping holds no GPU resources — it just mirrors an array of
// THREE.Plane data objects onto renderer.clippingPlanes. These tests confirm
// the lifecycle contract at scale.

function makeRenderer() {
  return { clippingPlanes: [] };
}

describe('GraphSceneClipping disposal', () => {
  it('creates and disposes 1 000 instances without throwing', () => {
    for (let i = 0; i < 1_000; i++) {
      new GraphSceneClipping({ renderer: makeRenderer() }).dispose();
    }
  });

  it('adds planes and disposes 1 000 times, always clearing the renderer', () => {
    for (let i = 0; i < 1_000; i++) {
      const renderer = makeRenderer();
      const clipping = new GraphSceneClipping({ renderer });
      clipping.addClipPlane([0, 1, 0], i);
      clipping.dispose();
      expect(renderer.clippingPlanes).toEqual([]);
    }
  });

  it('double-dispose is idempotent', () => {
    const clipping = new GraphSceneClipping({ renderer: makeRenderer() });
    clipping.dispose();
    expect(() => clipping.dispose()).not.toThrow();
  });

  it('all public methods throw after dispose with a descriptive error', () => {
    const clipping = new GraphSceneClipping({ renderer: makeRenderer() });
    clipping.dispose();
    const pattern = /GraphSceneClipping\.\w+: instance has been disposed/;
    expect(() => clipping.addClipPlane([0, 1, 0], 0)).toThrow(pattern);
    expect(() => clipping.removeClipPlane(null)).toThrow(pattern);
    expect(() => clipping.clearClipPlanes()).toThrow(pattern);
  });
});
