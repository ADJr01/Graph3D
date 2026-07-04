import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { glow } from '../../../src/material/presets/glow.js';

describe('material.glow', () => {
  it('returns a THREE.ShaderMaterial', () => {
    expect(glow()).toBeInstanceOf(THREE.ShaderMaterial);
  });

  it('defaults color, intensity (bloom-friendly, above 1.0), and power', () => {
    const material = glow();
    expect(material.uniforms.color.value.getHexString()).toBe('66ccff');
    expect(material.uniforms.intensity.value).toBeGreaterThan(1);
    expect(material.uniforms.power.value).toBe(2.5);
  });

  it('defaults to additive blending, transparent, no depth write', () => {
    const material = glow();
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });

  it('accepts overrides', () => {
    const material = glow({ color: '#ff0000', intensity: 3, power: 5 });
    expect(material.uniforms.color.value.getHexString()).toBe('ff0000');
    expect(material.uniforms.intensity.value).toBe(3);
    expect(material.uniforms.power.value).toBe(5);
  });

  it('throws TypeError for a non-plain-object options argument', () => {
    expect(() => glow(42)).toThrow(TypeError);
  });

  it('throws TypeError for a non-finite intensity or power', () => {
    expect(() => glow({ intensity: NaN })).toThrow(TypeError);
    expect(() => glow({ power: Infinity })).toThrow(TypeError);
  });

  it('forwards extra THREE.ShaderMaterialParameters through', () => {
    expect(glow({ wireframe: true }).wireframe).toBe(true);
  });

  it('disposes cleanly across 1 000 create/dispose cycles', () => {
    for (let i = 0; i < 1_000; i++) {
      expect(() => glow().dispose()).not.toThrow();
    }
  });
});
