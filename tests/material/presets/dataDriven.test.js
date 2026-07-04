import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { dataDriven } from '../../../src/material/presets/dataDriven.js';
import { palette } from '../../../src/compose/palette/index.js';
import { GraphObjectMaterial } from '../../../src/material/GraphObjectMaterial.js';
import { GraphMesh } from '../../../src/object/GraphMesh.js';

function fn(t) {
  return t < 0.5 ? '#000000' : '#ffffff';
}
fn.colors = ['#000000', '#808080', '#ffffff'];

describe('material.dataDriven', () => {
  it('returns a THREE.ShaderMaterial', () => {
    expect(dataDriven({ palette: fn })).toBeInstanceOf(THREE.ShaderMaterial);
  });

  it('throws TypeError when called with no arguments (palette is required)', () => {
    expect(() => dataDriven()).toThrow(TypeError);
  });

  it('throws TypeError when palette is missing, not a function, or has no .colors', () => {
    expect(() => dataDriven({})).toThrow(TypeError);
    expect(() => dataDriven({ palette: 'viridis' })).toThrow(TypeError);
    expect(() => dataDriven({ palette: () => {} })).toThrow(TypeError);
  });

  it('builds a paletteTexture uniform sized to palette.colors.length x 1', () => {
    const material = dataDriven({ palette: fn });
    const texture = material.uniforms.paletteTexture.value;
    expect(texture).toBeInstanceOf(THREE.DataTexture);
    expect(texture.image.width).toBe(3);
    expect(texture.image.height).toBe(1);
  });

  it('works with a real compose/palette function (palette.viridis, 256 steps)', () => {
    const material = dataDriven({ palette: palette.viridis });
    expect(material.uniforms.paletteTexture.value.image.width).toBe(256);
  });

  it('defaults opacity and emissiveIntensity uniforms to 1', () => {
    const material = dataDriven({ palette: fn });
    expect(material.uniforms.opacity.value).toBe(1);
    expect(material.uniforms.emissiveIntensity.value).toBe(1);
  });

  it('accepts overrides for opacity and emissiveIntensity', () => {
    const material = dataDriven({ palette: fn, opacity: 0.4, emissiveIntensity: 2 });
    expect(material.uniforms.opacity.value).toBe(0.4);
    expect(material.uniforms.emissiveIntensity.value).toBe(2);
  });

  it('throws TypeError for non-finite opacity/emissiveIntensity', () => {
    expect(() => dataDriven({ palette: fn, opacity: NaN })).toThrow(TypeError);
    expect(() => dataDriven({ palette: fn, emissiveIntensity: Infinity })).toThrow(TypeError);
  });

  it('defaults valueAttribute to "value" and templates it into the vertex shader', () => {
    const material = dataDriven({ palette: fn });
    expect(material.vertexShader).toContain('attribute float value;');
    expect(material.vertexShader).toContain('vValue = value;');
  });

  it('accepts a custom valueAttribute name', () => {
    const material = dataDriven({ palette: fn, valueAttribute: 'magnitude' });
    expect(material.vertexShader).toContain('attribute float magnitude;');
    expect(material.vertexShader).toContain('vValue = magnitude;');
  });

  it('throws TypeError for an invalid GLSL identifier as valueAttribute', () => {
    expect(() => dataDriven({ palette: fn, valueAttribute: '1bad' })).toThrow(TypeError);
    expect(() => dataDriven({ palette: fn, valueAttribute: 'has space' })).toThrow(TypeError);
    expect(() => dataDriven({ palette: fn, valueAttribute: '' })).toThrow(TypeError);
  });

  it('throws TypeError for non-boolean perInstanceOpacity/perInstanceEmissiveIntensity', () => {
    expect(() => dataDriven({ palette: fn, perInstanceOpacity: 'yes' })).toThrow(TypeError);
    expect(() => dataDriven({ palette: fn, perInstanceEmissiveIntensity: 1 })).toThrow(TypeError);
  });

  it('does not define USE_INSTANCE_OPACITY/USE_INSTANCE_EMISSIVE_INTENSITY by default', () => {
    const material = dataDriven({ palette: fn });
    expect(material.defines.USE_INSTANCE_OPACITY).toBeUndefined();
    expect(material.defines.USE_INSTANCE_EMISSIVE_INTENSITY).toBeUndefined();
  });

  it('defines USE_INSTANCE_OPACITY when perInstanceOpacity is true', () => {
    const material = dataDriven({ palette: fn, perInstanceOpacity: true });
    expect(material.defines.USE_INSTANCE_OPACITY).toBe('');
  });

  it('defines USE_INSTANCE_EMISSIVE_INTENSITY when perInstanceEmissiveIntensity is true', () => {
    const material = dataDriven({ palette: fn, perInstanceEmissiveIntensity: true });
    expect(material.defines.USE_INSTANCE_EMISSIVE_INTENSITY).toBe('');
  });

  it('forwards extra THREE.ShaderMaterialParameters through', () => {
    expect(dataDriven({ palette: fn, wireframe: true }).wireframe).toBe(true);
  });

  it("dispose() also disposes the internally-created paletteTexture", () => {
    const material = dataDriven({ palette: fn });
    const texture = material.uniforms.paletteTexture.value;
    let disposedEventFired = false;
    texture.addEventListener('dispose', () => { disposedEventFired = true; });
    material.dispose();
    expect(disposedEventFired).toBe(true);
  });

  it('disposes cleanly across 1 000 create/dispose cycles', () => {
    for (let i = 0; i < 1_000; i++) {
      expect(() => dataDriven({ palette: fn }).dispose()).not.toThrow();
    }
  });

  it('composes with GraphObjectMaterial.applyShader', () => {
    const mesh = new GraphMesh({ scene: new THREE.Scene(), name: 'a', geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial() });
    const wrapper = new GraphObjectMaterial(mesh);
    expect(() => wrapper.applyShader(dataDriven({ palette: fn }))).not.toThrow();
    wrapper.dispose();
  });
});
