import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GraphLine } from '../../src/object/GraphLine.js';

function makeLine({ scene = new THREE.Scene(), name = 'line-a', ...rest } = {}) {
  return new GraphLine({ scene, name, ...rest });
}

describe('GraphLine constructor', () => {
  it('adds a Line2 to the scene', () => {
    const scene = new THREE.Scene();
    makeLine({ scene });
    expect(scene.children.length).toBe(1);
    expect(scene.children[0].isLine2).toBe(true);
  });

  it('throws TypeError when linewidth is not a positive number', () => {
    expect(() => makeLine({ linewidth: 0 })).toThrow(TypeError);
    expect(() => makeLine({ linewidth: -1 })).toThrow(TypeError);
    expect(() => makeLine({ linewidth: 'thick' })).toThrow(TypeError);
  });

  it('applies the given color', () => {
    const line = makeLine({ color: '#3b82f6' });
    expect(new THREE.Color(line.material.color.r, line.material.color.g, line.material.color.b).getHexString()).toBe(
      new THREE.Color('#3b82f6').getHexString(),
    );
  });
});

describe('GraphLine.setPositions', () => {
  it('throws for a non-Float32Array, or fewer than 2 points, or a non-multiple-of-3 length', () => {
    const line = makeLine();
    expect(() => line.setPositions([0, 0, 0, 1, 1, 0])).toThrow(TypeError);
    expect(() => line.setPositions(new Float32Array([0, 0, 0]))).toThrow(TypeError);
    expect(() => line.setPositions(new Float32Array([0, 0, 0, 1, 1]))).toThrow(TypeError);
  });

  it('builds a 1-segment geometry for 2 points', () => {
    const line = makeLine();
    line.setPositions(new Float32Array([0, 0, 0, 1, 2, 3]));
    const { instanceStart, instanceEnd } = line.three.geometry.attributes;
    expect(instanceStart.count).toBe(1);
    expect([instanceStart.getX(0), instanceStart.getY(0), instanceStart.getZ(0)]).toEqual([0, 0, 0]);
    expect([instanceEnd.getX(0), instanceEnd.getY(0), instanceEnd.getZ(0)]).toEqual([1, 2, 3]);
  });

  it('mutates the same attribute object in place for a same-count second call', () => {
    const line = makeLine();
    line.setPositions(new Float32Array([0, 0, 0, 1, 1, 0, 2, 2, 0]));
    const before = line.three.geometry.attributes.instanceStart;

    line.setPositions(new Float32Array([0, 5, 0, 1, 6, 0, 2, 7, 0]));

    expect(line.three.geometry.attributes.instanceStart).toBe(before);
    const { instanceStart, instanceEnd } = line.three.geometry.attributes;
    expect(instanceStart.getY(0)).toBe(5);
    expect(instanceStart.getY(1)).toBe(6);
    expect(instanceEnd.getY(instanceEnd.count - 1)).toBe(7);
  });

  it('rebuilds a new attribute object when point count changes', () => {
    const line = makeLine();
    line.setPositions(new Float32Array([0, 0, 0, 1, 1, 0]));
    const before = line.three.geometry.attributes.instanceStart;

    line.setPositions(new Float32Array([0, 0, 0, 1, 1, 0, 2, 2, 0]));

    expect(line.three.geometry.attributes.instanceStart).not.toBe(before);
    expect(line.three.geometry.attributes.instanceStart.count).toBe(2);
  });
});

describe('GraphLine.setResolution', () => {
  it('updates the material resolution uniform', () => {
    const line = makeLine();
    line.setResolution(640, 480);
    expect(line.material.resolution.x).toBe(640);
    expect(line.material.resolution.y).toBe(480);
  });
});

describe('GraphLine.dispose', () => {
  it('removes the line from the scene and is idempotent', () => {
    const scene = new THREE.Scene();
    const line = makeLine({ scene });
    expect(scene.children.length).toBe(1);

    line.dispose();
    expect(scene.children.length).toBe(0);
    expect(() => line.dispose()).not.toThrow();
  });

  it('throws when calling public methods after dispose()', () => {
    const line = makeLine();
    line.dispose();
    expect(() => line.setPositions(new Float32Array([0, 0, 0, 1, 1, 0]))).toThrow(/disposed/);
    expect(() => line.setResolution(1, 1)).toThrow(/disposed/);
    expect(() => line.material).toThrow(/disposed/);
  });
});
