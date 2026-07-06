import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { material, GraphObjectMaterial } from '../../src/material/index.js';

const EXPECTED_PRESET_NAMES = [
  'standard', 'physical', 'basic', 'lambert', 'phong', 'toon', 'matcap',
  'holographic', 'crystal', 'glass', 'frostedGlass', 'neon', 'pulse',
  'glow', 'velvet', 'liquidMercury', 'chrome', 'gold', 'copper', 'pearl',
  'obsidian', 'dataDriven', 'volumeRaymarch', 'addPlanarReflection', 'setPaletteForAttribute',
];

describe('material namespace', () => {
  it('exposes exactly every Prompt 101-106/111/139 preset factory as a function', () => {
    expect(Object.keys(material).sort()).toEqual([...EXPECTED_PRESET_NAMES].sort());
    for (const name of EXPECTED_PRESET_NAMES) {
      expect(typeof material[name]).toBe('function');
    }
  });

  it('is wired correctly — material.standard() through the namespace works identically to the direct import', () => {
    expect(material.standard({ color: '#ff0000' })).toBeInstanceOf(THREE.MeshStandardMaterial);
  });

  it('still exports GraphObjectMaterial alongside the namespace (a class, not a preset)', () => {
    expect(GraphObjectMaterial).toBeTypeOf('function');
    expect(material.GraphObjectMaterial).toBeUndefined();
  });
});
