import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { liquidMercury } from '../../../src/material/presets/liquidMercury.js';
import { chrome } from '../../../src/material/presets/chrome.js';
import { gold } from '../../../src/material/presets/gold.js';
import { copper } from '../../../src/material/presets/copper.js';

const METALS = [
  ['liquidMercury', liquidMercury, '#d8dbe0', 0.02],
  ['chrome', chrome, '#e9ebec', 0.05],
  ['gold', gold, '#ffc358', 0.2],
  ['copper', copper, '#f3a389', 0.25],
];

describe.each(METALS)('material.%s', (name, factory, expectedColorHex, expectedRoughness) => {
  it('returns a THREE.MeshStandardMaterial with metalness 1', () => {
    const material = factory();
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(material.metalness).toBe(1);
  });

  it('defaults its own tuned color and roughness', () => {
    const material = factory();
    expect(material.color.getHexString()).toBe(expectedColorHex.slice(1));
    expect(material.roughness).toBe(expectedRoughness);
  });

  it('accepts overrides, including forcing metalness back down', () => {
    const material = factory({ color: '#123456', roughness: 0.5, metalness: 0.8 });
    expect(material.color.getHexString()).toBe('123456');
    expect(material.roughness).toBe(0.5);
    expect(material.metalness).toBe(0.8);
  });

  it('throws TypeError for a non-plain-object options argument', () => {
    expect(() => factory(42)).toThrow(TypeError);
    expect(() => factory(null)).toThrow(TypeError);
  });

  it('disposes cleanly across 1 000 create/dispose cycles', () => {
    for (let i = 0; i < 1_000; i++) {
      expect(() => factory().dispose()).not.toThrow();
    }
  });
});
