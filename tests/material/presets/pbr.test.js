import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { standard, physical, basic, lambert, phong, toon, matcap } from '../../../src/material/presets/pbr.js';

const PRESETS = [
  ['standard', standard, THREE.MeshStandardMaterial],
  ['physical', physical, THREE.MeshPhysicalMaterial],
  ['basic', basic, THREE.MeshBasicMaterial],
  ['lambert', lambert, THREE.MeshLambertMaterial],
  ['phong', phong, THREE.MeshPhongMaterial],
  ['toon', toon, THREE.MeshToonMaterial],
  ['matcap', matcap, THREE.MeshMatcapMaterial],
];

describe.each(PRESETS)('material.%s', (name, factory, ExpectedClass) => {
  it('returns an instance of the expected THREE.Material subclass with no arguments', () => {
    expect(factory()).toBeInstanceOf(ExpectedClass);
  });

  it('forwards constructor options through untouched', () => {
    const material = factory({ color: '#3b82f6', transparent: true, opacity: 0.5 });
    expect(material.color.getHexString()).toBe('3b82f6');
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.5);
  });

  it('throws TypeError for a non-plain-object options argument', () => {
    expect(() => factory(42)).toThrow(TypeError);
    expect(() => factory('red')).toThrow(TypeError);
    expect(() => factory(null)).toThrow(TypeError);
    expect(() => factory([])).toThrow(TypeError);
  });

  it('disposes cleanly across 1 000 create/dispose cycles', () => {
    for (let i = 0; i < 1_000; i++) {
      expect(() => factory().dispose()).not.toThrow();
    }
  });
});

describe('material.toon', () => {
  it('accepts an optional gradientMap', () => {
    const gradientMap = new THREE.DataTexture();
    expect(toon({ gradientMap }).gradientMap).toBe(gradientMap);
  });
});

describe('material.matcap', () => {
  it('accepts an optional matcap texture', () => {
    const matcapTexture = new THREE.DataTexture();
    expect(matcap({ matcap: matcapTexture }).matcap).toBe(matcapTexture);
  });
});

describe('material.physical', () => {
  it('accepts clearcoat-specific options beyond the standard workflow', () => {
    const material = physical({ clearcoat: 1, clearcoatRoughness: 0.2 });
    expect(material.clearcoat).toBe(1);
    expect(material.clearcoatRoughness).toBe(0.2);
  });
});
