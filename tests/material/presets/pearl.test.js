import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { pearl } from '../../../src/material/presets/pearl.js';

describe('material.pearl', () => {
  it('returns a THREE.MeshPhysicalMaterial', () => {
    expect(pearl()).toBeInstanceOf(THREE.MeshPhysicalMaterial);
  });

  it('defaults non-metallic, glossy clearcoat, and soft iridescence', () => {
    const material = pearl();
    expect(material.metalness).toBe(0);
    expect(material.clearcoat).toBe(1);
    expect(material.clearcoatRoughness).toBe(0.15);
    expect(material.iridescence).toBe(0.6);
    expect(material.iridescenceThicknessRange).toEqual([200, 500]);
    expect(material.color.getHexString()).toBe('f7f1e6');
  });

  it('accepts overrides', () => {
    const material = pearl({ color: '#ffffff', clearcoat: 0.5 });
    expect(material.color.getHexString()).toBe('ffffff');
    expect(material.clearcoat).toBe(0.5);
  });

  it('throws TypeError for a non-plain-object options argument', () => {
    expect(() => pearl(42)).toThrow(TypeError);
    expect(() => pearl(null)).toThrow(TypeError);
  });

  it('disposes cleanly across 1 000 create/dispose cycles', () => {
    for (let i = 0; i < 1_000; i++) {
      expect(() => pearl().dispose()).not.toThrow();
    }
  });
});
