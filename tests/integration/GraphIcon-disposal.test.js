import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Mirrors tests/integration/Label-disposal.test.js's mocking approach —
// graphIcon's texture load goes through the same THREE.TextureLoader entry
// point, so it needs the same offline stub.
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    TextureLoader: vi.fn(function MockTextureLoader() {
      this.load = vi.fn((url, onLoad) => onLoad({ isTexture: true, dispose: vi.fn() }));
    }),
  };
});

const { graphIcon } = await import('../../src/material/icon/GraphIcon.js');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('GraphIcon disposal', () => {
  it('creates and disposes 1 000 icons without throwing or leaking scene children', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const icons = [];
    for (let i = 0; i < 1_000; i++) {
      icons.push(graphIcon({ scene, position: { x: i, y: 0, z: 0 } }, { src: 'icon.svg', camera }));
    }
    await flush();
    expect(scene.children.length).toBe(1_000);

    for (const icon of icons) icon.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('dispose() before the initial build resolves discards the result instead of adding it to the scene', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const icon = graphIcon({ scene, position: { x: 0, y: 0, z: 0 } }, { src: 'icon.svg', camera });
    icon.dispose();
    await flush();
    expect(scene.children.length).toBe(0);
  });

  it('double-dispose is idempotent', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const icon = graphIcon({ scene, position: { x: 0, y: 0, z: 0 } }, { src: 'icon.svg', camera });
    await flush();
    expect(() => {
      icon.dispose();
      icon.dispose();
    }).not.toThrow();
  });
});
