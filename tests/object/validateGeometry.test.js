import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { validateGeometry } from '../../src/object/validateGeometry.js';
import { GraphObjectFactory, INSTANCING_THRESHOLD } from '../../src/object/GraphObjectFactory.js';

function positionAttribute(values) {
  return new THREE.Float32BufferAttribute(new Float32Array(values), 3);
}

describe('validateGeometry', () => {
  it('throws TypeError for a non-BufferGeometry', () => {
    expect(() => validateGeometry(null)).toThrow(TypeError);
    expect(() => validateGeometry({})).toThrow(TypeError);
  });

  it('reports valid for a real, well-formed geometry (THREE.BoxGeometry)', () => {
    const { valid, issues } = validateGeometry(new THREE.BoxGeometry());
    expect(valid).toBe(true);
    expect(issues).toEqual([]);
  });

  it('reports empty-geometry for zero vertices', () => {
    const geometry = new THREE.BufferGeometry();
    const { valid, issues } = validateGeometry(geometry);
    expect(valid).toBe(false);
    expect(issues[0].type).toBe('empty-geometry');
  });

  it('detects a non-finite (NaN) vertex position', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', positionAttribute([0, 0, 0, 1, 0, 0, NaN, 1, 0]));
    const { valid, issues } = validateGeometry(geometry);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.type === 'non-finite-attribute' && i.attribute === 'position')).toBe(true);
  });

  it('detects an Infinity vertex position', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', positionAttribute([0, 0, 0, 1, 0, 0, Infinity, 1, 0]));
    const { valid, issues } = validateGeometry(geometry);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.type === 'non-finite-attribute')).toBe(true);
  });

  it('detects a degenerate (zero-area) triangle — three collinear points', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', positionAttribute([0, 0, 0, 1, 0, 0, 2, 0, 0]));
    const { valid, issues } = validateGeometry(geometry);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.type === 'degenerate-triangle')).toBe(true);
  });

  it('does not flag a genuine, well-formed triangle as degenerate', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', positionAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    const { valid, issues } = validateGeometry(geometry);
    expect(valid).toBe(true);
    expect(issues).toEqual([]);
  });

  it('respects a custom degenerateEpsilon', () => {
    const geometry = new THREE.BufferGeometry();
    // A real, but extremely thin, triangle (area ~5e-7).
    geometry.setAttribute('position', positionAttribute([0, 0, 0, 1, 0, 0, 0.5, 0.000001, 0]));
    expect(validateGeometry(geometry, { degenerateEpsilon: 1e-10 }).valid).toBe(true);
    expect(validateGeometry(geometry, { degenerateEpsilon: 1e-5 }).valid).toBe(false);
  });

  it('detects an attribute with fewer entries than position', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', positionAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array([0, 0, 1]), 3)); // 1 entry, not 3
    const { valid, issues } = validateGeometry(geometry);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.type === 'attribute-length-mismatch' && i.attribute === 'normal')).toBe(true);
  });

  it('detects an out-of-range index', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', positionAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    geometry.setIndex([0, 1, 5]); // vertex 5 doesn't exist
    const { valid, issues } = validateGeometry(geometry);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.type === 'index-out-of-range' && i.vertexIndex === 5)).toBe(true);
  });

  it('does not crash computing triangle area when an index is out of range', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', positionAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    geometry.setIndex([0, 1, 99]);
    expect(() => validateGeometry(geometry)).not.toThrow();
  });
});

// Real integration consumer (not just synthetic unit cases): every built-in
// factory geometry, at both the meshes and instanced backend, should be
// structurally clean by construction — a genuine regression guard, not
// just exercise for validateGeometry's own sake.
describe('validateGeometry — GraphObjectFactory built-ins are structurally clean', () => {
  const factories = [
    ['createBars', () => GraphObjectFactory.createBars],
    ['createPoints', () => GraphObjectFactory.createPoints],
    ['createLineSegments', () => GraphObjectFactory.createLineSegments],
    ['createSurfaceTiles', () => GraphObjectFactory.createSurfaceTiles],
    ['createNodes', () => GraphObjectFactory.createNodes],
  ];

  for (const [name, getFactory] of factories) {
    it(`${name}: meshes backend (below INSTANCING_THRESHOLD)`, () => {
      const scene = new THREE.Scene();
      const result = getFactory()(3, { scene, name });
      const { valid, issues } = validateGeometry(result[0].three.geometry);
      expect(issues).toEqual([]);
      expect(valid).toBe(true);
    });

    it(`${name}: instanced backend (above INSTANCING_THRESHOLD)`, () => {
      const scene = new THREE.Scene();
      const result = getFactory()(INSTANCING_THRESHOLD + 5, { scene, name });
      const { valid, issues } = validateGeometry(result.three.geometry);
      expect(issues).toEqual([]);
      expect(valid).toBe(true);
    });
  }
});
