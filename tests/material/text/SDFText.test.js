import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

// SDFText's atlas cache (`loadAtlas`'s memoized `atlasLoadPromise`) is
// module-level and shared across every test in this file — SDFText.create()
// resets it back to null on failure (an intentional "allow a retry once the
// asset exists" behavior), but a SUCCESSFUL load stays cached for the rest of
// the suite. So: every failure-path test must run before any success-path
// test warms the cache. Once warm, it never goes back to null within this
// file — later tests rely on that to assert "the atlas is only fetched once."

let textureLoadImpl = (_url, onLoad) => onLoad(makeFakeTexture());

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    TextureLoader: vi.fn(function MockTextureLoader() {
      this.load = vi.fn((url, onLoad, onProgress, onError) => textureLoadImpl(url, onLoad, onError));
    }),
  };
});

const { TextureLoader } = await import('three');
const { SDFText } = await import('../../../src/material/text/SDFText.js');

function makeFakeTexture() {
  return { isTexture: true, dispose: vi.fn() };
}

function makeMockMetrics(overrides = {}) {
  return {
    pages: ['roboto-msdf.png'],
    chars: [
      { id: 72, x: 0, y: 0, width: 20, height: 30, xoffset: 0, yoffset: 0, xadvance: 22 }, // H
      { id: 101, x: 20, y: 0, width: 16, height: 22, xoffset: 0, yoffset: 8, xadvance: 18 }, // e
      { id: 108, x: 36, y: 0, width: 8, height: 30, xoffset: 0, yoffset: 0, xadvance: 10 }, // l
      { id: 111, x: 44, y: 0, width: 18, height: 22, xoffset: 0, yoffset: 8, xadvance: 20 }, // o
    ],
    common: { scaleW: 256, scaleH: 256, lineHeight: 36 },
    info: { size: 32 },
    kernings: [{ first: 72, second: 101, amount: -1 }],
    ...overrides,
  };
}

function mockFetchOnce(metrics) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => metrics })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  textureLoadImpl = (_url, onLoad) => onLoad(makeFakeTexture());
});

// ── Failure paths (must run first — see the file-level note above) ─────────

describe('SDFText.create — atlas loading failures', () => {
  it('rejects with a clear error when the metrics fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(SDFText.create('Hi')).rejects.toThrow(/failed to load the bundled Roboto MSDF atlas metrics/);
  });

  it('rejects with a clear error when the atlas image fails to load', async () => {
    mockFetchOnce(makeMockMetrics());
    textureLoadImpl = (_url, _onLoad, onError) => onError(new Error('404'));
    await expect(SDFText.create('Hi')).rejects.toThrow(/failed to load the bundled Roboto MSDF atlas image/);
  });

  it('allows a retry after a failure (does not permanently poison the cache)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(SDFText.create('Hi')).rejects.toThrow();

    mockFetchOnce(makeMockMetrics());
    await expect(SDFText.create('Hi')).resolves.toBeInstanceOf(SDFText);
  });
});

// ── Validation (no atlas load needed — thrown before loadAtlas() runs) ────

describe('SDFText.create — input validation', () => {
  it('throws TypeError when text is not a string', async () => {
    await expect(SDFText.create(42)).rejects.toThrow(TypeError);
  });

  it('throws TypeError when options is not a plain object', async () => {
    await expect(SDFText.create('Hi', null)).rejects.toThrow(TypeError);
  });

  it('throws TypeError for a non-positive fontSize', async () => {
    await expect(SDFText.create('Hi', { fontSize: 0 })).rejects.toThrow(TypeError);
    await expect(SDFText.create('Hi', { fontSize: -1 })).rejects.toThrow(TypeError);
  });

  it('throws TypeError for a non-finite letterSpacing', async () => {
    await expect(SDFText.create('Hi', { letterSpacing: NaN })).rejects.toThrow(TypeError);
  });

  it('throws TypeError for an invalid align value', async () => {
    await expect(SDFText.create('Hi', { align: 'justify' })).rejects.toThrow(TypeError);
  });

  it('throws TypeError for a non-finite outline.width', async () => {
    await expect(SDFText.create('Hi', { outline: { width: 'thick' } })).rejects.toThrow(TypeError);
  });

  it('throws TypeError for a non-finite glow.width or glow.intensity', async () => {
    await expect(SDFText.create('Hi', { glow: { width: 'wide' } })).rejects.toThrow(TypeError);
    await expect(SDFText.create('Hi', { glow: { intensity: 'bright' } })).rejects.toThrow(TypeError);
  });
});

// ── Successful creation (warms the shared cache from here on) ─────────────

describe('SDFText.create', () => {
  it('resolves an SDFText instance wrapping a THREE.Mesh', async () => {
    mockFetchOnce(makeMockMetrics());
    const text = await SDFText.create('Hello');
    expect(text).toBeInstanceOf(SDFText);
    expect(text.mesh).toBeInstanceOf(THREE.Mesh);
    expect(text.three).toBe(text.mesh);
  });

  it('builds 4 vertices and 6 indices per rendered glyph', async () => {
    const text = await SDFText.create('Hoe'); // 3 known glyphs
    const position = text.mesh.geometry.getAttribute('position');
    expect(position.count).toBe(3 * 4);
    expect(text.mesh.geometry.getIndex().count).toBe(3 * 6);
  });

  it('skips unknown glyphs with a console.warn instead of throwing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const text = await SDFText.create('H☃'); // H + snowman (not in the mock atlas)
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(text.mesh.geometry.getAttribute('position').count).toBe(1 * 4); // only 'H' rendered
    warnSpy.mockRestore();
  });

  it('reports width/height derived from glyph advances and line height', async () => {
    const text = await SDFText.create('l', { fontSize: 32 }); // 1:1 with the mock atlas base size
    expect(text.height).toBeCloseTo(36); // metrics.common.lineHeight
    expect(text.width).toBeGreaterThan(0);
  });

  it('centerOffset is half the block size, negated on x', async () => {
    const text = await SDFText.create('loo', { fontSize: 32 });
    expect(text.centerOffset).toEqual({ x: -text.width / 2, y: text.height / 2 });
  });

  it('letterSpacing increases the total block width', async () => {
    const tight = await SDFText.create('lo');
    const spaced = await SDFText.create('lo', { letterSpacing: 5 });
    expect(spaced.width).toBeGreaterThan(tight.width);
  });

  it('align left/center/right shifts a narrower line relative to the block width, without changing it', async () => {
    // A single-line string has no wider sibling line to align against — block
    // width equals that one line's width regardless of `align`. Use two lines
    // of different widths so alignment has something to shift relative to.
    const left = await SDFText.create('l\nloo', { align: 'left' });
    const center = await SDFText.create('l\nloo', { align: 'center' });
    const right = await SDFText.create('l\nloo', { align: 'right' });

    expect(center.width).toBeCloseTo(left.width);
    expect(right.width).toBeCloseTo(left.width);

    // First vertex belongs to line 0 ('l'), the narrower line.
    const firstX = (text) => text.mesh.geometry.getAttribute('position').getX(0);
    expect(firstX(left)).toBeCloseTo(0);
    expect(firstX(center)).toBeGreaterThan(firstX(left));
    expect(firstX(right)).toBeGreaterThan(firstX(center));
  });

  it('wires color/outline/glow into the material uniforms', async () => {
    const text = await SDFText.create('H', {
      color: '#ff0000',
      outline: { color: '#00ff00', width: 0.3 },
      glow: { color: '#0000ff', width: 0.5, intensity: 2 },
    });
    const u = text.mesh.material.uniforms;
    expect(u.color.value.getHexString()).toBe('ff0000');
    expect(u.outlineColor.value.getHexString()).toBe('00ff00');
    expect(u.outlineWidth.value).toBe(0.3);
    expect(u.glowColor.value.getHexString()).toBe('0000ff');
    expect(u.glowWidth.value).toBe(0.5);
    expect(u.glowIntensity.value).toBe(2);
  });

  it('defaults outline/glow to disabled (width 0)', async () => {
    const text = await SDFText.create('H');
    expect(text.mesh.material.uniforms.outlineWidth.value).toBe(0);
    expect(text.mesh.material.uniforms.glowWidth.value).toBe(0);
  });

  it('fetches the atlas only once across multiple create() calls', async () => {
    // By this point in the file, earlier tests in this describe block have
    // already warmed the shared cache — none of these three calls should
    // construct a new TextureLoader.
    const beforeCalls = TextureLoader.mock.instances.length;
    await SDFText.create('H');
    await SDFText.create('e');
    await SDFText.create('l');
    expect(TextureLoader.mock.instances.length).toBe(beforeCalls);
  });

  it('dispose() disposes its own geometry/material but not the shared atlas texture', async () => {
    const text = await SDFText.create('H');
    const textureDisposeSpy = text.mesh.material.uniforms.atlas.value.dispose;
    const geometryDisposeSpy = vi.spyOn(text.mesh.geometry, 'dispose');
    const materialDisposeSpy = vi.spyOn(text.mesh.material, 'dispose');

    text.dispose();

    expect(geometryDisposeSpy).toHaveBeenCalledOnce();
    expect(materialDisposeSpy).toHaveBeenCalledOnce();
    expect(textureDisposeSpy).not.toHaveBeenCalled();
  });

  it('dispose() is idempotent', async () => {
    const text = await SDFText.create('H');
    text.dispose();
    expect(() => text.dispose()).not.toThrow();
  });

  it('all public getters throw after dispose', async () => {
    const text = await SDFText.create('H');
    text.dispose();
    const pattern = /SDFText\.\w+: instance has been disposed/;
    expect(() => text.mesh).toThrow(pattern);
    expect(() => text.width).toThrow(pattern);
    expect(() => text.height).toThrow(pattern);
    expect(() => text.centerOffset).toThrow(pattern);
  });
});
