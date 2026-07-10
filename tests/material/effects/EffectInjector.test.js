import { describe, it, expect, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import * as EffectInjector from '../../../src/material/effects/EffectInjector.js';
import { phaseUniformName } from '../../../src/material/effects/harness.js';
import { loop } from '../../../src/core/Graph3DLoop.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeMaterial() {
  return new THREE.MeshStandardMaterial();
}

describe('EffectInjector.applySlot', () => {
  it('throws for an unregistered preset name', () => {
    expect(() => EffectInjector.applySlot(makeMaterial(), 'hover', 'nope')).toThrow();
  });

  it('sets onBeforeCompile, customProgramCacheKey, and bumps material.version (needsUpdate is write-only in THREE)', () => {
    const material = makeMaterial();
    const versionBefore = material.version;
    EffectInjector.applySlot(material, 'hover', 'glow');
    expect(typeof material.onBeforeCompile).toBe('function');
    expect(typeof material.customProgramCacheKey).toBe('function');
    expect(material.version).toBeGreaterThan(versionBefore);
  });

  it('returns a live uniforms map including the phase uniform for the slot, defaulting to 0', () => {
    const material = makeMaterial();
    const uniforms = EffectInjector.applySlot(material, 'hover', 'glow');
    expect(uniforms[phaseUniformName('hover')].value).toBe(0);
  });

  it('is idempotent: re-applying the same preset+options does not force another recompile', () => {
    const material = makeMaterial();
    EffectInjector.applySlot(material, 'hover', 'glow', { intensity: 2 });
    const versionAfterFirst = material.version;
    EffectInjector.applySlot(material, 'hover', 'glow', { intensity: 2 });
    expect(material.version).toBe(versionAfterFirst);
  });

  it('re-baking with different options does force a recompile', () => {
    const material = makeMaterial();
    EffectInjector.applySlot(material, 'hover', 'glow', { intensity: 2 });
    const versionAfterFirst = material.version;
    EffectInjector.applySlot(material, 'hover', 'glow', { intensity: 3 });
    expect(material.version).toBeGreaterThan(versionAfterFirst);
  });

  it('composes two slots on the same material without uniform-name collisions', () => {
    const material = makeMaterial();
    EffectInjector.applySlot(material, 'hover', 'glow', { color: '#111111' });
    const uniforms = EffectInjector.applySlot(material, 'select', 'pulse', { color: '#222222' });
    expect(uniforms.uColor_hover.value.getHexString()).toBe('111111');
    expect(uniforms.uColor_select.value.getHexString()).toBe('222222');
  });

  it('the composed onBeforeCompile injects both slots\' GLSL into a shader stub', () => {
    const material = makeMaterial();
    EffectInjector.applySlot(material, 'hover', 'glow');
    EffectInjector.applySlot(material, 'select', 'pulse');
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main() {\n#include <dithering_fragment>\n}',
    };
    material.onBeforeCompile(shader);
    expect(shader.vertexShader).toContain('effectPhase_hover');
    expect(shader.vertexShader).toContain('effectPhase_select');
    expect(shader.fragmentShader).toContain('vEffectPhase_hover');
    expect(shader.fragmentShader).toContain('vEffectPhase_select');
    expect(shader.uniforms[phaseUniformName('hover')]).toBeDefined();
  });

  it('binds the shared time uniform to the render loop once per material regardless of slot count', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const material = makeMaterial();
    EffectInjector.applySlot(material, 'hover', 'glow');
    EffectInjector.applySlot(material, 'select', 'pulse');
    expect(addSpy).toHaveBeenCalledTimes(1);
  });
});

describe('EffectInjector.removeSlot', () => {
  it('is a no-op if the slot was never applied', () => {
    const material = makeMaterial();
    expect(() => EffectInjector.removeSlot(material, 'hover')).not.toThrow();
  });

  it('rebuilds without the removed slot, keeping any other active slot', () => {
    const material = makeMaterial();
    EffectInjector.applySlot(material, 'hover', 'glow');
    EffectInjector.applySlot(material, 'select', 'pulse');
    EffectInjector.removeSlot(material, 'hover');
    const uniforms = EffectInjector.getUniforms(material);
    expect(uniforms[phaseUniformName('hover')]).toBeUndefined();
    expect(uniforms[phaseUniformName('select')]).toBeDefined();
  });

  it('removing the last slot restores an inert onBeforeCompile and unbinds the time loop tick', () => {
    const removeSpy = vi.spyOn(loop, 'remove');
    const material = makeMaterial();
    EffectInjector.applySlot(material, 'hover', 'glow');
    EffectInjector.removeSlot(material, 'hover');
    expect(EffectInjector.getUniforms(material)).toBeUndefined();
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
