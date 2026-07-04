import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { setPaletteForAttribute } from '../../src/material/setPaletteForAttribute.js';
import { GraphObjectMaterial } from '../../src/material/GraphObjectMaterial.js';
import { GraphInstancedObject } from '../../src/object/GraphInstancedObject.js';
import { palette } from '../../src/compose/palette/index.js';

function makeInstanced({ scene = new THREE.Scene(), name = 'a', count = 4 } = {}) {
  return new GraphInstancedObject({ scene, name, geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial(), count });
}

describe('material.setPaletteForAttribute', () => {
  it('throws TypeError when object is not a GraphInstancedObject', () => {
    expect(() => setPaletteForAttribute({}, 'value', palette.viridis)).toThrow(TypeError);
  });

  it('throws TypeError when attrName is not a non-empty string', () => {
    expect(() => setPaletteForAttribute(makeInstanced(), '', palette.viridis)).toThrow(TypeError);
    expect(() => setPaletteForAttribute(makeInstanced(), 42, palette.viridis)).toThrow(TypeError);
  });

  it('returns a GraphObjectMaterial wrapping the object, already carrying a dataDriven shader', () => {
    const object = makeInstanced();
    const wrapper = setPaletteForAttribute(object, 'temperature', palette.viridis);
    expect(wrapper).toBeInstanceOf(GraphObjectMaterial);
    expect(object.material).toBe(wrapper.material);
    expect(wrapper.material).toBeInstanceOf(THREE.ShaderMaterial);
  });

  it('wires the given attrName as the shader\'s valueAttribute', () => {
    const object = makeInstanced();
    const wrapper = setPaletteForAttribute(object, 'temperature', palette.viridis);
    expect(wrapper.material.vertexShader).toContain('attribute float temperature;');
  });

  it('builds the paletteTexture from the given palette', () => {
    const object = makeInstanced();
    const wrapper = setPaletteForAttribute(object, 'value', palette.viridis);
    expect(wrapper.material.uniforms.paletteTexture.value.image.width).toBe(256);
  });

  it('forwards extra options through to dataDriven (e.g. perInstanceOpacity)', () => {
    const object = makeInstanced();
    const wrapper = setPaletteForAttribute(object, 'value', palette.viridis, { perInstanceOpacity: true });
    expect(wrapper.material.defines.USE_INSTANCE_OPACITY).toBe('');
  });

  it("cannot be overridden into using a different attribute name via options.valueAttribute", () => {
    const object = makeInstanced();
    const wrapper = setPaletteForAttribute(object, 'value', palette.viridis, { valueAttribute: 'sneaky' });
    expect(wrapper.material.vertexShader).toContain('attribute float value;');
  });
});
