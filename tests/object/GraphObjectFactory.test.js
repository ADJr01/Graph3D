import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GraphObjectFactory, INSTANCING_THRESHOLD } from '../../src/object/GraphObjectFactory.js';
import { GraphMesh } from '../../src/object/GraphMesh.js';
import { GraphInstancedObject } from '../../src/object/GraphInstancedObject.js';

const CREATORS = [
  'createBars',
  'createPoints',
  'createLineSegments',
  'createSurfaceTiles',
  'createNodes',
];

describe('GraphObjectFactory instancing boundary', () => {
  it('exports the documented default threshold', () => {
    expect(INSTANCING_THRESHOLD).toBe(50);
  });

  for (const method of CREATORS) {
    it(`${method}: returns a GraphMesh[] at count <= threshold`, () => {
      const scene = new THREE.Scene();
      const result = GraphObjectFactory[method](INSTANCING_THRESHOLD, { scene, name: 'x' });
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(INSTANCING_THRESHOLD);
      for (const obj of result) expect(obj).toBeInstanceOf(GraphMesh);
    });

    it(`${method}: returns one GraphInstancedObject above threshold`, () => {
      const scene = new THREE.Scene();
      const result = GraphObjectFactory[method](INSTANCING_THRESHOLD + 1, { scene, name: 'x' });
      expect(result).toBeInstanceOf(GraphInstancedObject);
      expect(result.three.count).toBe(INSTANCING_THRESHOLD + 1);
    });
  }

  it('the boundary is configurable per call via options.instancingThreshold', () => {
    const scene = new THREE.Scene();
    const small = GraphObjectFactory.createBars(10, { scene, name: 'x', instancingThreshold: 5 });
    expect(small).toBeInstanceOf(GraphInstancedObject);

    const large = GraphObjectFactory.createBars(10, { scene, name: 'y', instancingThreshold: 20 });
    expect(Array.isArray(large)).toBe(true);
  });

  it('throws TypeError for a non-positive-integer count', () => {
    const scene = new THREE.Scene();
    expect(() => GraphObjectFactory.createBars(0, { scene, name: 'x' })).toThrow(TypeError);
    expect(() => GraphObjectFactory.createBars(1.5, { scene, name: 'x' })).toThrow(TypeError);
  });

  it('throws TypeError for a non-positive-integer instancingThreshold', () => {
    const scene = new THREE.Scene();
    expect(() =>
      GraphObjectFactory.createBars(10, { scene, name: 'x', instancingThreshold: 0 }),
    ).toThrow(TypeError);
  });
});

describe('GraphObjectFactory individual-mesh path', () => {
  it('names each mesh with an index suffix and adds it to the scene', () => {
    const scene = new THREE.Scene();
    const bars = GraphObjectFactory.createBars(3, { scene, name: 'bar' });
    expect(bars.map((b) => b.name)).toEqual(['bar_0', 'bar_1', 'bar_2']);
    for (const bar of bars) expect(scene.children).toContain(bar.three);
  });

  it('gives each mesh its own independent geometry and material', () => {
    const scene = new THREE.Scene();
    const bars = GraphObjectFactory.createBars(3, { scene, name: 'bar' });
    expect(bars[0].three.geometry).not.toBe(bars[1].three.geometry);
    expect(bars[0].three.material).not.toBe(bars[1].three.material);

    // Disposing one must not affect the others (independent ownership).
    bars[0].dispose();
    expect(() => bars[1].setVertex(0, 0, 0, 0)).not.toThrow();
    bars[1].dispose();
    bars[2].dispose();
  });

  it('respects a custom geometry/material override, still cloned per mesh', () => {
    const scene = new THREE.Scene();
    const geometry = new THREE.SphereGeometry(5, 4, 4);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const nodes = GraphObjectFactory.createNodes(2, { scene, name: 'n', geometry, material });

    expect(nodes[0].three.geometry).not.toBe(geometry);
    expect(nodes[0].three.geometry.parameters.radius).toBe(5);
    expect(nodes[0].three.material.color.getHex()).toBe(0xff0000);
  });
});

describe('GraphObjectFactory instanced path', () => {
  it('uses the caller-supplied geometry/material directly (no clone)', () => {
    const scene = new THREE.Scene();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    const obj = GraphObjectFactory.createBars(100, { scene, name: 'bars', geometry, material });

    expect(obj.three.geometry).toBe(geometry);
    expect(obj.three.material).toBe(material);
  });
});
