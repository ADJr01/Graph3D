import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { volumeRaymarch } from '../../../src/material/presets/volumeRaymarch.js';
import { palette } from '../../../src/compose/palette/index.js';

function fn(t) {
  return t < 0.5 ? '#000000' : '#ffffff';
}
fn.colors = ['#000000', '#808080', '#ffffff'];

function makeData(resolution) {
  return new Float32Array(resolution ** 3).fill(0.5);
}

describe('material.volumeRaymarch', () => {
  it('returns a THREE.ShaderMaterial', () => {
    expect(volumeRaymarch({ data: makeData(2), resolution: 2, palette: fn })).toBeInstanceOf(THREE.ShaderMaterial);
  });

  it('throws TypeError when called with no arguments', () => {
    expect(() => volumeRaymarch()).toThrow(TypeError);
  });

  it('throws TypeError when resolution is not a positive integer', () => {
    expect(() => volumeRaymarch({ data: makeData(2), resolution: 0, palette: fn })).toThrow(TypeError);
    expect(() => volumeRaymarch({ data: makeData(2), resolution: 2.5, palette: fn })).toThrow(TypeError);
    expect(() => volumeRaymarch({ data: makeData(2), resolution: 'nope', palette: fn })).toThrow(TypeError);
  });

  it("throws TypeError when data isn't a Float32Array of resolution**3 values", () => {
    expect(() => volumeRaymarch({ data: [1, 2, 3], resolution: 2, palette: fn })).toThrow(TypeError);
    expect(() => volumeRaymarch({ data: new Float32Array(4), resolution: 2, palette: fn })).toThrow(TypeError); // needs 8
  });

  it('throws TypeError when palette is missing, not a function, or has no .colors', () => {
    expect(() => volumeRaymarch({ data: makeData(2), resolution: 2 })).toThrow(TypeError);
    expect(() => volumeRaymarch({ data: makeData(2), resolution: 2, palette: 'viridis' })).toThrow(TypeError);
    expect(() => volumeRaymarch({ data: makeData(2), resolution: 2, palette: () => {} })).toThrow(TypeError);
  });

  it('builds a Data3DTexture sized to resolution^3', () => {
    const material = volumeRaymarch({ data: makeData(4), resolution: 4, palette: fn });
    const texture = material.uniforms.densityTexture.value;
    expect(texture).toBeInstanceOf(THREE.Data3DTexture);
    expect(texture.image.width).toBe(4);
    expect(texture.image.height).toBe(4);
    expect(texture.image.depth).toBe(4);
  });

  it('builds a paletteTexture uniform sized to palette.colors.length x 1', () => {
    const material = volumeRaymarch({ data: makeData(2), resolution: 2, palette: fn });
    const texture = material.uniforms.paletteTexture.value;
    expect(texture).toBeInstanceOf(THREE.DataTexture);
    expect(texture.image.width).toBe(3);
  });

  it('works with a real compose/palette function (palette.viridis, 256 steps)', () => {
    const material = volumeRaymarch({ data: makeData(2), resolution: 2, palette: palette.viridis });
    expect(material.uniforms.paletteTexture.value.image.width).toBe(256);
  });

  it('defaults steps to 64, densityScale/opacity to 1', () => {
    const material = volumeRaymarch({ data: makeData(2), resolution: 2, palette: fn });
    expect(material.uniforms.steps.value).toBe(64);
    expect(material.uniforms.densityScale.value).toBe(1);
    expect(material.uniforms.opacity.value).toBe(1);
  });

  it('accepts overrides for steps/densityScale/opacity', () => {
    const material = volumeRaymarch({ data: makeData(2), resolution: 2, palette: fn, steps: 128, densityScale: 2, opacity: 0.5 });
    expect(material.uniforms.steps.value).toBe(128);
    expect(material.uniforms.densityScale.value).toBe(2);
    expect(material.uniforms.opacity.value).toBe(0.5);
  });

  it('throws TypeError for steps outside [1, 256] or non-integer', () => {
    expect(() => volumeRaymarch({ data: makeData(2), resolution: 2, palette: fn, steps: 0 })).toThrow(TypeError);
    expect(() => volumeRaymarch({ data: makeData(2), resolution: 2, palette: fn, steps: 257 })).toThrow(TypeError);
    expect(() => volumeRaymarch({ data: makeData(2), resolution: 2, palette: fn, steps: 1.5 })).toThrow(TypeError);
  });

  it('throws TypeError for non-finite densityScale/opacity', () => {
    expect(() => volumeRaymarch({ data: makeData(2), resolution: 2, palette: fn, densityScale: NaN })).toThrow(TypeError);
    expect(() => volumeRaymarch({ data: makeData(2), resolution: 2, palette: fn, opacity: Infinity })).toThrow(TypeError);
  });

  it('is transparent, front-face-only, and does not write depth', () => {
    const material = volumeRaymarch({ data: makeData(2), resolution: 2, palette: fn });
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.side).toBe(THREE.FrontSide);
  });

  it('uses GLSL3 (sampler3D requires WebGL2)', () => {
    const material = volumeRaymarch({ data: makeData(2), resolution: 2, palette: fn });
    expect(material.glslVersion).toBe(THREE.GLSL3);
  });

  it('forwards extra THREE.ShaderMaterialParameters through', () => {
    expect(volumeRaymarch({ data: makeData(2), resolution: 2, palette: fn, wireframe: true }).wireframe).toBe(true);
  });

  it('dispose() also disposes the internally-created densityTexture and paletteTexture', () => {
    const material = volumeRaymarch({ data: makeData(2), resolution: 2, palette: fn });
    const densityTexture = material.uniforms.densityTexture.value;
    const paletteTex = material.uniforms.paletteTexture.value;
    let densityDisposed = false;
    let paletteDisposed = false;
    densityTexture.addEventListener('dispose', () => { densityDisposed = true; });
    paletteTex.addEventListener('dispose', () => { paletteDisposed = true; });
    material.dispose();
    expect(densityDisposed).toBe(true);
    expect(paletteDisposed).toBe(true);
  });

  it('disposes cleanly across 1 000 create/dispose cycles', () => {
    const data = makeData(2);
    for (let i = 0; i < 1_000; i++) {
      expect(() => volumeRaymarch({ data, resolution: 2, palette: fn }).dispose()).not.toThrow();
    }
  });
});
