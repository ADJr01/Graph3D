import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { wrapDisposeWithCleanup } from '../../../src/material/presets/lifecycle.js';

describe('wrapDisposeWithCleanup', () => {
  it('runs cleanup before the material\'s original dispose', () => {
    const material = new THREE.MeshBasicMaterial();
    const order = [];
    vi.spyOn(material, 'dispose').mockImplementation(() => order.push('original'));
    wrapDisposeWithCleanup(material, () => order.push('cleanup'));

    material.dispose();
    expect(order).toEqual(['cleanup', 'original']);
  });

  it('returns the same material instance, mutated in place', () => {
    const material = new THREE.MeshBasicMaterial();
    expect(wrapDisposeWithCleanup(material, () => {})).toBe(material);
  });

  it('does not itself make dispose idempotent — callers must guard their own cleanup', () => {
    const material = new THREE.MeshBasicMaterial();
    const cleanup = vi.fn();
    wrapDisposeWithCleanup(material, cleanup);
    material.dispose();
    material.dispose();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});
