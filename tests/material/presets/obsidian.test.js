import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { obsidian } from '../../../src/material/presets/obsidian.js';

describe('material.obsidian', () => {
  it('returns a THREE.MeshPhysicalMaterial', () => {
    expect(obsidian()).toBeInstanceOf(THREE.MeshPhysicalMaterial);
  });

  it('defaults non-metallic, near-black, glossy clearcoat', () => {
    const material = obsidian();
    expect(material.metalness).toBe(0);
    expect(material.color.getHexString()).toBe('0a0a0c');
    expect(material.clearcoat).toBe(1);
    expect(material.clearcoatRoughness).toBe(0.05);
    expect(material.roughness).toBe(0.12);
    expect(material.ior).toBe(1.5);
  });

  it('has no transmission — opaque despite being glass', () => {
    expect(obsidian().transmission).toBe(0);
  });

  it('accepts overrides', () => {
    const material = obsidian({ clearcoatRoughness: 0.2, color: '#111111' });
    expect(material.clearcoatRoughness).toBe(0.2);
    expect(material.color.getHexString()).toBe('111111');
  });

  it('throws TypeError for a non-plain-object options argument', () => {
    expect(() => obsidian(42)).toThrow(TypeError);
    expect(() => obsidian(null)).toThrow(TypeError);
  });

  it('disposes cleanly across 1 000 create/dispose cycles', () => {
    for (let i = 0; i < 1_000; i++) {
      expect(() => obsidian().dispose()).not.toThrow();
    }
  });
});
