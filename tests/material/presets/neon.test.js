import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { neon, pulse } from '../../../src/material/presets/neon.js';
import { loop } from '../../../src/core/Graph3DLoop.js';

// vi.spyOn(loop, ...) accumulates call history across tests unless restored —
// see tests/object/GraphInstancedObject.test.js's identical note.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('material.neon', () => {
  it('returns a THREE.MeshStandardMaterial', () => {
    expect(neon()).toBeInstanceOf(THREE.MeshStandardMaterial);
  });

  it('defaults emissiveIntensity above 1.0 (bloom-friendly)', () => {
    expect(neon().emissiveIntensity).toBeGreaterThan(1);
  });

  it('defaults a dark base color and a bright emissive color', () => {
    const material = neon();
    expect(material.color.getHexString()).toBe('000000');
    expect(material.emissive.getHexString()).toBe('ff2fd6');
  });

  it('accepts overrides', () => {
    const material = neon({ emissive: '#39ff14', emissiveIntensity: 4 });
    expect(material.emissive.getHexString()).toBe('39ff14');
    expect(material.emissiveIntensity).toBe(4);
  });

  it('throws TypeError for a non-plain-object options argument', () => {
    expect(() => neon(42)).toThrow(TypeError);
  });

  it('throws TypeError for a non-finite emissiveIntensity', () => {
    expect(() => neon({ emissiveIntensity: NaN })).toThrow(TypeError);
  });

  it('does not pulse (no loop subscription) by default', () => {
    const addSpy = vi.spyOn(loop, 'add');
    neon();
    expect(addSpy).not.toHaveBeenCalled();
  });

  describe('pulse: true', () => {
    it('subscribes to the shared loop', () => {
      const addSpy = vi.spyOn(loop, 'add');
      neon({ pulse: true });
      expect(addSpy).toHaveBeenCalledOnce();
    });

    it('oscillates emissiveIntensity between 0.4x and 1x the base value', () => {
      const addSpy = vi.spyOn(loop, 'add');
      const material = neon({ emissiveIntensity: 2, pulse: true });
      const tick = addSpy.mock.calls[0][0];

      tick(0, 0); // t=0 -> cos(0)=1 -> at min
      expect(material.emissiveIntensity).toBeCloseTo(0.8);

      tick(0, 1 / (2 * 1.5)); // half period -> cos = -1 -> at max (default speed 1.5)
      expect(material.emissiveIntensity).toBeCloseTo(2, 5);
    });

    it("dispose() also unsubscribes the pulse loop callback", () => {
      const removeSpy = vi.spyOn(loop, 'remove');
      const material = neon({ pulse: true });
      material.dispose();
      expect(removeSpy).toHaveBeenCalledOnce();
    });

    it('dispose() is idempotent', () => {
      const material = neon({ pulse: true });
      material.dispose();
      expect(() => material.dispose()).not.toThrow();
    });
  });

  describe('pulse: { min, max, speed }', () => {
    it('overrides the default oscillation bounds', () => {
      const addSpy = vi.spyOn(loop, 'add');
      const material = neon({ emissiveIntensity: 2, pulse: { min: 1, max: 3 } });
      const tick = addSpy.mock.calls[0][0];
      tick(0, 0);
      expect(material.emissiveIntensity).toBeCloseTo(1);
    });
  });
});

describe('material.pulse', () => {
  it('throws TypeError if the material has no such property', () => {
    expect(() => pulse(new THREE.MeshBasicMaterial(), { property: 'nonsense' })).toThrow(TypeError);
  });

  it('throws TypeError when min >= max', () => {
    expect(() => pulse(new THREE.MeshStandardMaterial(), { min: 1, max: 1 })).toThrow(TypeError);
    expect(() => pulse(new THREE.MeshStandardMaterial(), { min: 2, max: 1 })).toThrow(TypeError);
  });

  it('throws TypeError for non-finite min/max/speed', () => {
    const material = new THREE.MeshStandardMaterial();
    expect(() => pulse(material, { min: NaN })).toThrow(TypeError);
    expect(() => pulse(material, { speed: Infinity })).toThrow(TypeError);
  });

  it('works on an arbitrary numeric property, e.g. opacity', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const material = new THREE.MeshBasicMaterial({ transparent: true });
    const controller = pulse(material, { property: 'opacity', min: 0.2, max: 1 });
    const tick = addSpy.mock.calls[0][0];
    tick(0, 0);
    expect(material.opacity).toBeCloseTo(0.2);
    controller.dispose();
  });

  it('disposes cleanly across 1 000 create/dispose cycles', () => {
    for (let i = 0; i < 1_000; i++) {
      const controller = pulse(new THREE.MeshStandardMaterial());
      expect(() => controller.dispose()).not.toThrow();
    }
  });
});
