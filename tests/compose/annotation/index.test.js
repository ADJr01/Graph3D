import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { annotation } from '../../../src/compose/annotation/index.js';
import { scale } from '../../../src/compose/scale/index.js';

describe('annotation.callout', () => {
  it('builds a leader line mesh and a stubbed label anchored at "to"', () => {
    const scene = new THREE.Scene();
    const c = annotation.callout({
      scene,
      name: 'peak',
      from: { x: 0, y: 0, z: 0 },
      to: { x: 0, y: 5, z: 0 },
      text: 'Peak: 5',
    });

    expect(c.type).toBe('callout');
    expect(c.line.getPosition()).toEqual(new THREE.Vector3(0, 2.5, 0));
    expect(c.label).toEqual({
      type: 'label',
      text: 'Peak: 5',
      position: { x: 0, y: 5, z: 0 },
      style: {},
      on: expect.any(Function),
      emit: expect.any(Function),
    });
    expect(scene.children).toContain(c.line.three);
  });

  it('dispose() removes the leader-line mesh from the scene', () => {
    const scene = new THREE.Scene();
    const c = annotation.callout({ scene, name: 'peak', from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 1, z: 1 }, text: 'x' });
    c.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('handles a zero-length callout (from === to) without throwing', () => {
    const scene = new THREE.Scene();
    expect(() =>
      annotation.callout({ scene, name: 'c', from: { x: 1, y: 1, z: 1 }, to: { x: 1, y: 1, z: 1 }, text: 'x' }),
    ).not.toThrow();
  });

  it('throws for a malformed scene, name, from, to, or text', () => {
    const scene = new THREE.Scene();
    const valid = { scene, name: 'a', from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 1, z: 1 }, text: 'x' };
    expect(() => annotation.callout({ ...valid, scene: {} })).toThrow(TypeError);
    expect(() => annotation.callout({ ...valid, name: '' })).toThrow(TypeError);
    expect(() => annotation.callout({ ...valid, from: null })).toThrow(TypeError);
    expect(() => annotation.callout({ ...valid, to: { x: 1, y: 1 } })).toThrow(TypeError);
    expect(() => annotation.callout({ ...valid, text: 42 })).toThrow(TypeError);
  });
});

describe('annotation.referenceLine', () => {
  it('marks scale(value) along the default y orientation, spanning extent on x', () => {
    const scene = new THREE.Scene();
    const y = scale.linear().domain([0, 100]).range([0, 10]);
    const mesh = annotation.referenceLine(y, 50, { scene, name: 'target' });

    expect(mesh.getPosition().y).toBeCloseTo(5);
    expect(mesh.three.geometry.parameters.width).toBeGreaterThan(0); // spans along x
  });

  it('honors a custom orientation and extent', () => {
    const scene = new THREE.Scene();
    const y = scale.linear().domain([0, 10]).range([0, 10]);
    const mesh = annotation.referenceLine(y, 5, { scene, name: 't', orientation: 'x', extent: 4 });
    expect(mesh.getPosition().x).toBeCloseTo(5);
    expect(mesh.three.geometry.parameters.depth).toBeCloseTo(4); // spans along z when orientation is x
  });

  it('throws for a non-function scale, malformed scene/name, bad orientation/extent, or a non-finite scale(value)', () => {
    const scene = new THREE.Scene();
    const y = scale.linear().domain([0, 10]).range([0, 10]);
    expect(() => annotation.referenceLine('not a scale', 5, { scene, name: 'a' })).toThrow(TypeError);
    expect(() => annotation.referenceLine(y, 5, { scene: {}, name: 'a' })).toThrow(TypeError);
    expect(() => annotation.referenceLine(y, 5, { scene, name: '' })).toThrow(TypeError);
    expect(() => annotation.referenceLine(y, 5, { scene, name: 'a', orientation: 'w' })).toThrow(TypeError);
    expect(() => annotation.referenceLine(y, 5, { scene, name: 'a', extent: -1 })).toThrow(TypeError);
    expect(() => annotation.referenceLine(() => NaN, 5, { scene, name: 'a' })).toThrow(TypeError);
  });
});

describe('annotation.referencePlane', () => {
  it('builds a flat panel perpendicular to the given axis, positioned at value', () => {
    const scene = new THREE.Scene();
    const mesh = annotation.referencePlane('y', 3, { scene, name: 'ground' });
    expect(mesh.getPosition().y).toBeCloseTo(3);
    expect(mesh.three.geometry.parameters.height).toBeLessThan(1); // thin on the perpendicular axis
  });

  it('honors a custom size', () => {
    const scene = new THREE.Scene();
    const mesh = annotation.referencePlane('x', 0, { scene, name: 'wall', size: 20 });
    expect(mesh.three.geometry.parameters.height).toBeCloseTo(20);
    expect(mesh.three.geometry.parameters.depth).toBeCloseTo(20);
  });

  it('is perpendicular to z too', () => {
    const scene = new THREE.Scene();
    const mesh = annotation.referencePlane('z', 0, { scene, name: 'back' });
    expect(mesh.three.geometry.parameters.depth).toBeLessThan(1);
    expect(mesh.three.geometry.parameters.width).toBeGreaterThan(1);
  });

  it('throws for a non-finite value, malformed scene/name, or non-positive size', () => {
    const scene = new THREE.Scene();
    expect(() => annotation.referencePlane('y', NaN, { scene, name: 'a' })).toThrow(TypeError);
    expect(() => annotation.referencePlane('y', 0, { scene: {}, name: 'a' })).toThrow(TypeError);
    expect(() => annotation.referencePlane('y', 0, { scene, name: '' })).toThrow(TypeError);
    expect(() => annotation.referencePlane('y', 0, { scene, name: 'a', size: 0 })).toThrow(TypeError);
    expect(() => annotation.referencePlane('w', 0, { scene, name: 'a' })).toThrow(TypeError);
  });
});

describe('annotation.region', () => {
  it('builds a box spanning min..max, positioned at its center', () => {
    const scene = new THREE.Scene();
    const mesh = annotation.region({ min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 2, z: 6 } }, { scene, name: 'highlight' });
    expect(mesh.getPosition()).toEqual(new THREE.Vector3(2, 1, 3));
    expect(mesh.three.geometry.parameters.width).toBeCloseTo(4);
    expect(mesh.three.geometry.parameters.height).toBeCloseTo(2);
    expect(mesh.three.geometry.parameters.depth).toBeCloseTo(6);
  });

  it('throws for malformed box points, a degenerate box, or a malformed scene/name', () => {
    const scene = new THREE.Scene();
    expect(() => annotation.region(null, { scene, name: 'a' })).toThrow(TypeError);
    expect(() => annotation.region({ min: {}, max: { x: 1, y: 1, z: 1 } }, { scene, name: 'a' })).toThrow(TypeError);
    expect(() =>
      annotation.region({ min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 1, z: 1 } }, { scene, name: 'a' }),
    ).toThrow(/must exceed/);
    expect(() =>
      annotation.region({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, { scene: {}, name: 'a' }),
    ).toThrow(TypeError);
    expect(() =>
      annotation.region({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, { scene, name: '' }),
    ).toThrow(TypeError);
  });
});
