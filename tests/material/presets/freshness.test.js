import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { freshness, dataStream } from '../../../src/material/presets/freshness.js';
import { palette } from '../../../src/compose/palette/index.js';
import { loop } from '../../../src/core/Graph3DLoop.js';

// vi.spyOn(loop, ...) accumulates call history across tests unless restored —
// see tests/material/presets/neon.test.js's identical note.
afterEach(() => {
  vi.restoreAllMocks();
});

function fn(t) {
  return t < 0.5 ? '#000000' : '#ffffff';
}
fn.colors = ['#000000', '#808080', '#ffffff'];

describe('material.freshness', () => {
  it('returns a THREE.ShaderMaterial', () => {
    expect(freshness(500)).toBeInstanceOf(THREE.ShaderMaterial);
  });

  it('throws TypeError for a non-finite or non-positive decayMs', () => {
    expect(() => freshness(NaN)).toThrow(TypeError);
    expect(() => freshness(0)).toThrow(TypeError);
    expect(() => freshness(-1)).toThrow(TypeError);
  });

  it('throws TypeError for a non-plain-object options argument', () => {
    expect(() => freshness(500, 42)).toThrow(TypeError);
  });

  it('throws TypeError for a non-finite baseOpacity', () => {
    expect(() => freshness(500, { baseOpacity: NaN })).toThrow(TypeError);
  });

  it('defaults color to white and baseOpacity to 0.15', () => {
    const material = freshness(500);
    expect(material.uniforms.color.value).toEqual(new THREE.Color('#ffffff'));
    expect(material.uniforms.baseOpacity.value).toBe(0.15);
  });

  it('accepts overrides for color and baseOpacity', () => {
    const material = freshness(500, { color: '#39ff14', baseOpacity: 0.4 });
    expect(material.uniforms.color.value).toEqual(new THREE.Color('#39ff14'));
    expect(material.uniforms.baseOpacity.value).toBe(0.4);
  });

  it('sets the decayMs uniform', () => {
    expect(freshness(750).uniforms.decayMs.value).toBe(750);
  });

  it('templates an "age" attribute into the vertex shader', () => {
    const material = freshness(500);
    expect(material.vertexShader).toContain('attribute float age;');
    expect(material.vertexShader).toContain('vAge = age;');
  });

  it('forwards extra THREE.ShaderMaterialParameters through', () => {
    expect(freshness(500, { wireframe: true }).wireframe).toBe(true);
  });

  it('subscribes to the shared render loop to drive uNow', () => {
    const addSpy = vi.spyOn(loop, 'add');
    freshness(500);
    expect(addSpy).toHaveBeenCalledOnce();
  });

  it('the loop tick refreshes uNow to the current performance.now()', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const material = freshness(500);
    const tick = addSpy.mock.calls[0][0];
    tick();
    expect(Math.abs(material.uniforms.uNow.value - performance.now())).toBeLessThan(50);
  });

  it('dispose() unsubscribes the loop callback and is idempotent', () => {
    const removeSpy = vi.spyOn(loop, 'remove');
    const material = freshness(500);
    material.dispose();
    expect(removeSpy).toHaveBeenCalledOnce();
    expect(() => material.dispose()).not.toThrow();
  });

  it('disposes cleanly across 1 000 create/dispose cycles', () => {
    for (let i = 0; i < 1_000; i++) {
      expect(() => freshness(500).dispose()).not.toThrow();
    }
  });
});

describe('material.dataStream', () => {
  it('returns a THREE.ShaderMaterial', () => {
    expect(dataStream({ trailLength: 1000, palette: fn })).toBeInstanceOf(THREE.ShaderMaterial);
  });

  it('throws TypeError when called with no arguments', () => {
    expect(() => dataStream()).toThrow(TypeError);
  });

  it('throws TypeError for a non-finite or non-positive trailLength', () => {
    expect(() => dataStream({ trailLength: NaN, palette: fn })).toThrow(TypeError);
    expect(() => dataStream({ trailLength: 0, palette: fn })).toThrow(TypeError);
    expect(() => dataStream({ trailLength: -1, palette: fn })).toThrow(TypeError);
  });

  it('throws TypeError when palette is missing, not a function, or has no .colors', () => {
    expect(() => dataStream({ trailLength: 1000 })).toThrow(TypeError);
    expect(() => dataStream({ trailLength: 1000, palette: 'viridis' })).toThrow(TypeError);
    expect(() => dataStream({ trailLength: 1000, palette: () => {} })).toThrow(TypeError);
  });

  it('builds a paletteTexture uniform sized to palette.colors.length x 1', () => {
    const material = dataStream({ trailLength: 1000, palette: fn });
    const texture = material.uniforms.paletteTexture.value;
    expect(texture).toBeInstanceOf(THREE.DataTexture);
    expect(texture.image.width).toBe(3);
  });

  it('works with a real compose/palette function', () => {
    const material = dataStream({ trailLength: 1000, palette: palette.plasma });
    expect(material.uniforms.paletteTexture.value.image.width).toBe(256);
  });

  it('sets the trailLength uniform', () => {
    expect(dataStream({ trailLength: 2000, palette: fn }).uniforms.trailLength.value).toBe(2000);
  });

  it('templates an "age" attribute into the vertex shader', () => {
    const material = dataStream({ trailLength: 1000, palette: fn });
    expect(material.vertexShader).toContain('attribute float age;');
    expect(material.vertexShader).toContain('vAge = age;');
  });

  it('discards fragments older than trailLength', () => {
    const material = dataStream({ trailLength: 1000, palette: fn });
    expect(material.fragmentShader).toContain('if (elapsedMs > trailLength) discard;');
  });

  it('forwards extra THREE.ShaderMaterialParameters through', () => {
    expect(dataStream({ trailLength: 1000, palette: fn, wireframe: true }).wireframe).toBe(true);
  });

  it('subscribes to the shared render loop to drive uNow', () => {
    const addSpy = vi.spyOn(loop, 'add');
    dataStream({ trailLength: 1000, palette: fn });
    expect(addSpy).toHaveBeenCalledOnce();
  });

  it("dispose() also disposes the internally-created paletteTexture and unsubscribes the loop", () => {
    const removeSpy = vi.spyOn(loop, 'remove');
    const material = dataStream({ trailLength: 1000, palette: fn });
    const texture = material.uniforms.paletteTexture.value;
    let disposedEventFired = false;
    texture.addEventListener('dispose', () => {
      disposedEventFired = true;
    });
    material.dispose();
    expect(disposedEventFired).toBe(true);
    expect(removeSpy).toHaveBeenCalledOnce();
  });

  it('dispose() is idempotent', () => {
    const material = dataStream({ trailLength: 1000, palette: fn });
    material.dispose();
    expect(() => material.dispose()).not.toThrow();
  });

  it('disposes cleanly across 1 000 create/dispose cycles', () => {
    for (let i = 0; i < 1_000; i++) {
      expect(() => dataStream({ trailLength: 1000, palette: fn }).dispose()).not.toThrow();
    }
  });
});
