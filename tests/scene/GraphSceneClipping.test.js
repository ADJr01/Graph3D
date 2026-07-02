import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GraphSceneClipping } from '../../src/scene/GraphSceneClipping.js';

function makeRenderer() {
  return { clippingPlanes: [] };
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('GraphSceneClipping constructor', () => {
  it('throws TypeError when renderer is missing', () => {
    expect(() => new GraphSceneClipping({})).toThrow(TypeError);
  });

  it('throws TypeError when renderer has no clippingPlanes array', () => {
    expect(() => new GraphSceneClipping({ renderer: {} })).toThrow(TypeError);
  });
});

// ── addClipPlane / removeClipPlane / clearClipPlanes ──────────────────────────

describe('GraphSceneClipping', () => {
  it('adds a plane from a [x, y, z] array and syncs the renderer', () => {
    const renderer  = makeRenderer();
    const clipping  = new GraphSceneClipping({ renderer });
    const plane     = clipping.addClipPlane([0, -1, 0], 2);

    expect(plane).toBeInstanceOf(THREE.Plane);
    expect(plane.constant).toBe(2);
    expect(renderer.clippingPlanes).toEqual([plane]);
    expect(clipping.planes).toEqual([plane]);
  });

  it('adds a plane from a THREE.Vector3 normal', () => {
    const renderer = makeRenderer();
    const clipping = new GraphSceneClipping({ renderer });
    const plane    = clipping.addClipPlane(new THREE.Vector3(1, 0, 0), 0);

    expect(plane.normal.x).toBe(1);
  });

  it('throws TypeError for an invalid normal', () => {
    const clipping = new GraphSceneClipping({ renderer: makeRenderer() });
    expect(() => clipping.addClipPlane([1, 2], 0)).toThrow(TypeError);
    expect(() => clipping.addClipPlane('up', 0)).toThrow(TypeError);
  });

  it('throws TypeError for a non-finite constant', () => {
    const clipping = new GraphSceneClipping({ renderer: makeRenderer() });
    expect(() => clipping.addClipPlane([0, 1, 0], NaN)).toThrow(TypeError);
  });

  it('removeClipPlane removes only the given plane and syncs the renderer', () => {
    const renderer = makeRenderer();
    const clipping = new GraphSceneClipping({ renderer });
    const a = clipping.addClipPlane([0, 1, 0], 0);
    const b = clipping.addClipPlane([1, 0, 0], 1);

    clipping.removeClipPlane(a);

    expect(clipping.planes).toEqual([b]);
    expect(renderer.clippingPlanes).toEqual([b]);
  });

  it('removeClipPlane is a no-op for a plane not in the list', () => {
    const clipping = new GraphSceneClipping({ renderer: makeRenderer() });
    const foreign = new THREE.Plane();
    expect(() => clipping.removeClipPlane(foreign)).not.toThrow();
    expect(clipping.planes).toEqual([]);
  });

  it('clearClipPlanes empties the list and syncs the renderer', () => {
    const renderer = makeRenderer();
    const clipping = new GraphSceneClipping({ renderer });
    clipping.addClipPlane([0, 1, 0], 0);
    clipping.addClipPlane([1, 0, 0], 1);

    clipping.clearClipPlanes();

    expect(clipping.planes).toEqual([]);
    expect(renderer.clippingPlanes).toEqual([]);
  });
});

// ── Disposal ───────────────────────────────────────────────────────────────────

describe('GraphSceneClipping disposal', () => {
  it('dispose clears planes and is idempotent', () => {
    const renderer = makeRenderer();
    const clipping = new GraphSceneClipping({ renderer });
    clipping.addClipPlane([0, 1, 0], 0);

    clipping.dispose();
    expect(renderer.clippingPlanes).toEqual([]);
    expect(() => clipping.dispose()).not.toThrow();
  });

  it('all public methods throw after dispose', () => {
    const clipping = new GraphSceneClipping({ renderer: makeRenderer() });
    clipping.dispose();
    const pat = /GraphSceneClipping\.\w+: instance has been disposed/;
    expect(() => clipping.addClipPlane([0, 1, 0], 0)).toThrow(pat);
    expect(() => clipping.removeClipPlane(new THREE.Plane())).toThrow(pat);
    expect(() => clipping.clearClipPlanes()).toThrow(pat);
  });
});
