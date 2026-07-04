import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { glass, frostedGlass } from '../../../src/material/presets/glass.js';

describe('material.glass', () => {
  it('returns a THREE.MeshPhysicalMaterial', () => {
    expect(glass()).toBeInstanceOf(THREE.MeshPhysicalMaterial);
  });

  it('defaults to full transmission, thin-film iridescence, and low roughness', () => {
    const material = glass();
    expect(material.transmission).toBe(1);
    expect(material.roughness).toBe(0.05);
    expect(material.ior).toBe(1.5);
    expect(material.iridescence).toBe(1);
    expect(material.iridescenceIOR).toBe(1.3);
    expect(material.iridescenceThicknessRange).toEqual([100, 400]);
    expect(material.transparent).toBe(true);
  });

  it('accepts overrides', () => {
    const material = glass({ color: '#dbeafe', ior: 1.52, roughness: 0.2 });
    expect(material.color.getHexString()).toBe('dbeafe');
    expect(material.ior).toBe(1.52);
    expect(material.roughness).toBe(0.2);
  });

  it('throws TypeError for a non-plain-object options argument', () => {
    expect(() => glass(42)).toThrow(TypeError);
    expect(() => glass(null)).toThrow(TypeError);
  });

  it('disposes cleanly across 1 000 create/dispose cycles', () => {
    for (let i = 0; i < 1_000; i++) {
      expect(() => glass().dispose()).not.toThrow();
    }
  });
});

describe('material.frostedGlass', () => {
  it('returns a THREE.MeshPhysicalMaterial', () => {
    expect(frostedGlass()).toBeInstanceOf(THREE.MeshPhysicalMaterial);
  });

  it('defaults to higher roughness and reduced transmission than glass()', () => {
    const clear = glass();
    const frosted = frostedGlass();
    expect(frosted.roughness).toBeGreaterThan(clear.roughness);
    expect(frosted.transmission).toBeLessThan(clear.transmission);
  });

  it('still carries the shared thin-film iridescence defaults', () => {
    const material = frostedGlass();
    expect(material.iridescence).toBe(1);
    expect(material.iridescenceThicknessRange).toEqual([100, 400]);
  });

  it('accepts overrides', () => {
    const material = frostedGlass({ roughness: 0.8 });
    expect(material.roughness).toBe(0.8);
  });

  it('throws TypeError for a non-plain-object options argument', () => {
    expect(() => frostedGlass(42)).toThrow(TypeError);
  });

  it('disposes cleanly across 1 000 create/dispose cycles', () => {
    for (let i = 0; i < 1_000; i++) {
      expect(() => frostedGlass().dispose()).not.toThrow();
    }
  });
});
