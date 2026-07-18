import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Mirrors tests/compose/axis/Axis-text.test.js's mocking approach — Label's
// entire mesh goes through the same SDFText.create() atlas load, so it needs
// the same fetch/TextureLoader stubs to run offline.
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    TextureLoader: vi.fn(function MockTextureLoader() {
      this.load = vi.fn((url, onLoad) => onLoad({ isTexture: true, dispose: vi.fn() }));
    }),
  };
});

const { label } = await import('../../src/material/label/index.js');

function mockMetrics() {
  return {
    pages: ['roboto-msdf.png'],
    chars: [{ id: 48, x: 0, y: 0, width: 10, height: 20, xoffset: 0, yoffset: 0, xadvance: 12 }], // '0'
    common: { scaleW: 128, scaleH: 128, lineHeight: 24 },
    info: { size: 20 },
    kernings: [],
  };
}

vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => mockMetrics() })));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Label disposal', () => {
  it('creates and disposes 1 000 labels without throwing or leaking scene children', async () => {
    const scene = new THREE.Scene();
    const labels = [];
    for (let i = 0; i < 1_000; i++) {
      labels.push(label().text('0').render(scene, `l${i}`));
    }
    await flush();
    expect(scene.children.length).toBe(1_000);

    for (const l of labels) l.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('dispose() before the initial build resolves discards the result instead of adding it to the scene', async () => {
    const scene = new THREE.Scene();
    const l = label().text('0').render(scene, 'a');
    l.dispose();
    await flush();
    expect(scene.children.length).toBe(0);
  });

  it('double-dispose is idempotent', async () => {
    const scene = new THREE.Scene();
    const l = label().text('0').render(scene, 'a');
    await flush();
    expect(() => {
      l.dispose();
      l.dispose();
    }).not.toThrow();
  });
});
