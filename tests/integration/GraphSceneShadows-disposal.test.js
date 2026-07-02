import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { GraphSceneShadows } from '../../src/scene/GraphSceneShadows.js';

vi.mock('three/examples/jsm/csm/CSM.js', () => ({
  CSM: vi.fn(function MockCSM(_opts) {
    this.update  = vi.fn();
    this.dispose = vi.fn();
  }),
}));

vi.mock('../../src/core/Graph3DLoop.js', () => ({
  loop: { add: vi.fn(), remove: vi.fn() },
}));

const { CSM }  = await import('three/examples/jsm/csm/CSM.js');
const { loop } = await import('../../src/core/Graph3DLoop.js');

function makeShadows() {
  return new GraphSceneShadows({
    renderer: { shadowMap: { enabled: false, type: THREE.PCFShadowMap } },
    scene:    new THREE.Scene(),
    camera:   new THREE.PerspectiveCamera(),
  });
}

describe('GraphSceneShadows disposal', () => {
  it('creates and disposes 1 000 instances without throwing', () => {
    for (let i = 0; i < 1_000; i++) {
      makeShadows().dispose();
    }
  });

  it('enables and disposes 1 000 times without throwing', async () => {
    const modes = ['pcf', 'pcf-soft', 'vsm', 'contact'];
    for (let i = 0; i < 1_000; i++) {
      const s = makeShadows();
      await s.enable(modes[i % modes.length]);
      s.dispose();
    }
  });

  it('double-dispose is idempotent', () => {
    const s = makeShadows();
    s.dispose();
    expect(() => s.dispose()).not.toThrow();
  });

  it('CSM resources are released on dispose', async () => {
    const s = makeShadows();
    await s.enable('csm');
    const instance = CSM.mock.instances.at(-1);
    s.dispose();
    expect(instance.dispose).toHaveBeenCalledOnce();
    expect(loop.remove).toHaveBeenCalled();
  });

  it('all public methods throw after dispose', async () => {
    const s = makeShadows();
    s.dispose();
    const pat = /GraphSceneShadows\.\w+: instance has been disposed/;
    await expect(s.enable('pcf')).rejects.toThrow(pat);
    expect(() => s.disable()).toThrow(pat);
    expect(() => s.setQuality('low')).toThrow(pat);
  });
});
