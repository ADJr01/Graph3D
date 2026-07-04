import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { velvet } from '../../../src/material/presets/velvet.js';

describe('material.velvet', () => {
  it('returns a THREE.MeshPhysicalMaterial', () => {
    expect(velvet()).toBeInstanceOf(THREE.MeshPhysicalMaterial);
  });

  it('defaults the sheen workflow on, with high roughness and zero metalness', () => {
    const material = velvet();
    expect(material.sheen).toBe(1);
    expect(material.sheenRoughness).toBe(0.6);
    expect(material.sheenColor.getHexString()).toBe('b06a8f');
    expect(material.roughness).toBe(0.85);
    expect(material.metalness).toBe(0);
  });

  it('accepts overrides', () => {
    const material = velvet({ color: '#123456', sheenColor: '#ffffff', roughness: 0.5 });
    expect(material.color.getHexString()).toBe('123456');
    expect(material.sheenColor.getHexString()).toBe('ffffff');
    expect(material.roughness).toBe(0.5);
  });

  it('throws TypeError for a non-plain-object options argument', () => {
    expect(() => velvet(42)).toThrow(TypeError);
    expect(() => velvet(null)).toThrow(TypeError);
  });

  it('disposes cleanly across 1 000 create/dispose cycles', () => {
    for (let i = 0; i < 1_000; i++) {
      expect(() => velvet().dispose()).not.toThrow();
    }
  });
});
