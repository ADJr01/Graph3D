import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { crystal } from '../../../src/material/presets/crystal.js';
import { GraphObjectMaterial } from '../../../src/material/GraphObjectMaterial.js';
import { GraphMesh } from '../../../src/object/GraphMesh.js';

function makeCubeTexture() {
  const image = { width: 1, height: 1 };
  return new THREE.CubeTexture([image, image, image, image, image, image]);
}

describe('material.crystal', () => {
  it('returns a THREE.ShaderMaterial', () => {
    expect(crystal({ envMap: makeCubeTexture() })).toBeInstanceOf(THREE.ShaderMaterial);
  });

  it('throws TypeError when called with no arguments (envMap is required)', () => {
    expect(() => crystal()).toThrow(TypeError);
  });

  it('throws TypeError when envMap is missing or not a THREE.CubeTexture', () => {
    expect(() => crystal({})).toThrow(TypeError);
    expect(() => crystal({ envMap: new THREE.Texture() })).toThrow(TypeError);
  });

  it('defaults ior, dispersion, causticIntensity, color, and time', () => {
    const material = crystal({ envMap: makeCubeTexture() });
    expect(material.uniforms.refractionRatio.value).toBeCloseTo(1 / 2.4);
    expect(material.uniforms.dispersion.value).toBe(0.02);
    expect(material.uniforms.causticIntensity.value).toBe(0.5);
    expect(material.uniforms.color.value).toBeInstanceOf(THREE.Color);
    expect(material.uniforms.color.value.getHexString()).toBe('ffffff');
    expect(material.uniforms.time.value).toBe(0);
  });

  it('derives refractionRatio from an overridden ior', () => {
    const material = crystal({ envMap: makeCubeTexture(), ior: 1.5 });
    expect(material.uniforms.refractionRatio.value).toBeCloseTo(1 / 1.5);
  });

  it('accepts overrides for dispersion, causticIntensity, color', () => {
    const material = crystal({ envMap: makeCubeTexture(), dispersion: 0.1, causticIntensity: 1, color: '#ff0000' });
    expect(material.uniforms.dispersion.value).toBe(0.1);
    expect(material.uniforms.causticIntensity.value).toBe(1);
    expect(material.uniforms.color.value.getHexString()).toBe('ff0000');
  });

  it('stores the given envMap on the uniform unchanged', () => {
    const envMap = makeCubeTexture();
    expect(crystal({ envMap }).uniforms.envMap.value).toBe(envMap);
  });

  it('throws TypeError for a non-finite ior, dispersion, or causticIntensity', () => {
    const envMap = makeCubeTexture();
    expect(() => crystal({ envMap, ior: 'high' })).toThrow(TypeError);
    expect(() => crystal({ envMap, ior: 0 })).toThrow(TypeError);
    expect(() => crystal({ envMap, ior: -1 })).toThrow(TypeError);
    expect(() => crystal({ envMap, dispersion: NaN })).toThrow(TypeError);
    expect(() => crystal({ envMap, causticIntensity: Infinity })).toThrow(TypeError);
  });

  it('forwards extra THREE.ShaderMaterialParameters through', () => {
    const material = crystal({ envMap: makeCubeTexture(), wireframe: true });
    expect(material.wireframe).toBe(true);
  });

  it('disposes cleanly across 1 000 create/dispose cycles', () => {
    const envMap = makeCubeTexture();
    for (let i = 0; i < 1_000; i++) {
      expect(() => crystal({ envMap }).dispose()).not.toThrow();
    }
  });

  it('composes with GraphObjectMaterial.applyShader + bindUniforms({ time: "auto" })', () => {
    const mesh = new GraphMesh({ scene: new THREE.Scene(), name: 'a', geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial() });
    const wrapper = new GraphObjectMaterial(mesh);
    wrapper.applyShader(crystal({ envMap: makeCubeTexture() }));
    expect(() => wrapper.bindUniforms({ time: 'auto' })).not.toThrow();
    wrapper.dispose();
  });
});
