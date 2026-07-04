import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { holographic } from '../../../src/material/presets/holographic.js';
import { GraphObjectMaterial } from '../../../src/material/GraphObjectMaterial.js';
import { GraphMesh } from '../../../src/object/GraphMesh.js';

describe('material.holographic', () => {
  it('returns a THREE.ShaderMaterial', () => {
    expect(holographic()).toBeInstanceOf(THREE.ShaderMaterial);
  });

  it('defaults intensity, scanlineFrequency, color1, color2, and time', () => {
    const material = holographic();
    expect(material.uniforms.intensity.value).toBe(1.2);
    expect(material.uniforms.scanlineFrequency.value).toBe(12);
    expect(material.uniforms.color1.value).toBeInstanceOf(THREE.Color);
    expect(material.uniforms.color1.value.getHexString()).toBe('00eaff');
    expect(material.uniforms.color2.value.getHexString()).toBe('ff00e5');
    expect(material.uniforms.time.value).toBe(0);
  });

  it('accepts overrides for intensity, scanlineFrequency, color1, color2', () => {
    const material = holographic({ intensity: 2, scanlineFrequency: 30, color1: '#ff0000', color2: '#00ff00' });
    expect(material.uniforms.intensity.value).toBe(2);
    expect(material.uniforms.scanlineFrequency.value).toBe(30);
    expect(material.uniforms.color1.value.getHexString()).toBe('ff0000');
    expect(material.uniforms.color2.value.getHexString()).toBe('00ff00');
  });

  it('defaults to transparent, double-sided, depthWrite disabled', () => {
    const material = holographic();
    expect(material.transparent).toBe(true);
    expect(material.side).toBe(THREE.DoubleSide);
    expect(material.depthWrite).toBe(false);
  });

  it('forwards extra THREE.ShaderMaterialParameters through', () => {
    const material = holographic({ wireframe: true });
    expect(material.wireframe).toBe(true);
  });

  it('throws TypeError for a non-plain-object options argument', () => {
    expect(() => holographic(42)).toThrow(TypeError);
    expect(() => holographic(null)).toThrow(TypeError);
    expect(() => holographic([])).toThrow(TypeError);
  });

  it('throws TypeError for a non-finite intensity', () => {
    expect(() => holographic({ intensity: 'bright' })).toThrow(TypeError);
    expect(() => holographic({ intensity: NaN })).toThrow(TypeError);
  });

  it('throws TypeError for a non-finite scanlineFrequency', () => {
    expect(() => holographic({ scanlineFrequency: Infinity })).toThrow(TypeError);
  });

  it('disposes cleanly across 1 000 create/dispose cycles', () => {
    for (let i = 0; i < 1_000; i++) {
      expect(() => holographic().dispose()).not.toThrow();
    }
  });

  it('composes with GraphObjectMaterial.applyShader + bindUniforms({ time: "auto" })', () => {
    const mesh = new GraphMesh({ scene: new THREE.Scene(), name: 'a', geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial() });
    const wrapper = new GraphObjectMaterial(mesh);
    wrapper.applyShader(holographic());
    expect(() => wrapper.bindUniforms({ time: 'auto', resolution: 'auto' })).not.toThrow();
    expect(wrapper.material.uniforms.time.value).toBe(0);
    wrapper.dispose();
  });
});
