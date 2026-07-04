import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { gradient, noise, voronoi, checkerboard, dots, lines, cellular, paletteTexture } from '../../../src/material/texture/procedural.js';
import { palette } from '../../../src/compose/palette/index.js';

function pixelAt(texture, x, y) {
  const { width } = texture.image;
  const data = texture.image.data;
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

// ── gradient ─────────────────────────────────────────────────────────────────

describe('texture.gradient', () => {
  it('returns a THREE.DataTexture sized size x size (default 256)', () => {
    const tex = gradient();
    expect(tex).toBeInstanceOf(THREE.DataTexture);
    expect(tex.image.width).toBe(256);
    expect(tex.image.height).toBe(256);
  });

  it('respects a custom size', () => {
    expect(gradient({ size: 32 }).image.width).toBe(32);
  });

  it('linear gradient at angle 0 goes from "from" (left) to "to" (right)', () => {
    const tex = gradient({ from: '#000000', to: '#ffffff', angle: 0, size: 16 });
    const left = pixelAt(tex, 0, 8);
    const right = pixelAt(tex, 15, 8);
    expect(left[0]).toBeLessThan(right[0]);
  });

  it('radial gradient is brightest (closest to "to") at the texture center', () => {
    const tex = gradient({ type: 'radial', from: '#ffffff', to: '#000000', size: 16 });
    const center = pixelAt(tex, 8, 8);
    const corner = pixelAt(tex, 0, 0);
    expect(center[0]).toBeGreaterThan(corner[0]);
  });

  it('throws TypeError for an invalid type', () => {
    expect(() => gradient({ type: 'conic' })).toThrow(TypeError);
  });

  it('throws TypeError for a non-plain-object options argument', () => {
    expect(() => gradient(42)).toThrow(TypeError);
  });

  it('throws TypeError for a non-positive-integer size', () => {
    expect(() => gradient({ size: 0 })).toThrow(TypeError);
    expect(() => gradient({ size: 1.5 })).toThrow(TypeError);
  });

  it('throws TypeError for a non-finite angle', () => {
    expect(() => gradient({ angle: NaN })).toThrow(TypeError);
  });
});

// ── noise ────────────────────────────────────────────────────────────────────

describe('texture.noise', () => {
  it('returns a correctly sized THREE.DataTexture', () => {
    expect(noise({ size: 32 }).image.width).toBe(32);
  });

  it('is deterministic for the same seed', () => {
    const a = noise({ seed: 7, size: 16 });
    const b = noise({ seed: 7, size: 16 });
    expect(Array.from(a.image.data)).toEqual(Array.from(b.image.data));
  });

  it('produces different output for a different seed', () => {
    const a = noise({ seed: 1, size: 16 });
    const b = noise({ seed: 2, size: 16 });
    expect(Array.from(a.image.data)).not.toEqual(Array.from(b.image.data));
  });

  it('is not a uniform flat color (has spatial variation)', () => {
    const tex = noise({ size: 16, scale: 4 });
    const data = Array.from(tex.image.data);
    expect(new Set(data).size).toBeGreaterThan(1);
  });

  it('throws TypeError for a non-finite scale or seed', () => {
    expect(() => noise({ scale: NaN })).toThrow(TypeError);
    expect(() => noise({ seed: Infinity })).toThrow(TypeError);
  });
});

// ── voronoi / cellular ───────────────────────────────────────────────────────

describe('texture.voronoi', () => {
  it('returns a correctly sized THREE.DataTexture with spatial variation', () => {
    const tex = voronoi({ size: 32, cellCount: 4 });
    expect(tex.image.width).toBe(32);
    expect(new Set(tex.image.data).size).toBeGreaterThan(1);
  });

  it('throws TypeError for a non-positive-integer cellCount', () => {
    expect(() => voronoi({ cellCount: 0 })).toThrow(TypeError);
    expect(() => voronoi({ cellCount: 2.5 })).toThrow(TypeError);
  });

  it('is deterministic for the same seed', () => {
    const a = voronoi({ seed: 3, size: 16 });
    const b = voronoi({ seed: 3, size: 16 });
    expect(Array.from(a.image.data)).toEqual(Array.from(b.image.data));
  });
});

describe('texture.cellular', () => {
  it('returns a correctly sized THREE.DataTexture with spatial variation', () => {
    const tex = cellular({ size: 32, cellCount: 4 });
    expect(tex.image.width).toBe(32);
    expect(new Set(tex.image.data).size).toBeGreaterThan(1);
  });

  it('throws TypeError for a non-finite edgeWidth', () => {
    expect(() => cellular({ edgeWidth: NaN })).toThrow(TypeError);
  });
});

// ── checkerboard ─────────────────────────────────────────────────────────────

describe('texture.checkerboard', () => {
  it('alternates between color1 and color2 per tile', () => {
    const tex = checkerboard({ tiles: 4, size: 32, color1: '#000000', color2: '#ffffff' });
    const tileSize = 32 / 4;
    const a = pixelAt(tex, 0, 0);
    const b = pixelAt(tex, tileSize, 0);
    expect(a[0]).not.toBe(b[0]);
  });

  it('throws TypeError for a non-positive-integer tiles', () => {
    expect(() => checkerboard({ tiles: -1 })).toThrow(TypeError);
  });
});

// ── dots ─────────────────────────────────────────────────────────────────────

describe('texture.dots', () => {
  it('is the dot color at a tile center and the background color at a tile edge', () => {
    const tex = dots({ tiles: 4, size: 32, radius: 0.3, color1: '#000000', color2: '#ffffff' });
    const tileSize = 32 / 4;
    const center = pixelAt(tex, Math.floor(tileSize / 2), Math.floor(tileSize / 2));
    const edge = pixelAt(tex, 0, 0);
    expect(center[0]).toBeLessThan(edge[0]); // dot (black) darker than background (white)
  });

  it('throws TypeError for a non-finite radius', () => {
    expect(() => dots({ radius: NaN })).toThrow(TypeError);
  });
});

// ── lines ────────────────────────────────────────────────────────────────────

describe('texture.lines', () => {
  it('produces alternating stripe bands along the un-rotated axis', () => {
    const tex = lines({ tiles: 4, thickness: 0.3, angle: 0, size: 32, color1: '#000000', color2: '#ffffff' });
    const row = Array.from({ length: 32 }, (_, x) => pixelAt(tex, x, 0)[0]);
    expect(new Set(row).size).toBeGreaterThan(1);
  });

  it('throws TypeError for a non-finite thickness or angle', () => {
    expect(() => lines({ thickness: NaN })).toThrow(TypeError);
    expect(() => lines({ angle: Infinity })).toThrow(TypeError);
  });
});

// ── paletteTexture ───────────────────────────────────────────────────────────

describe('texture.paletteTexture', () => {
  it('builds a 256x1 THREE.DataTexture from a real compose/palette function', () => {
    const tex = paletteTexture(palette.viridis);
    expect(tex).toBeInstanceOf(THREE.DataTexture);
    expect(tex.image.width).toBe(256);
    expect(tex.image.height).toBe(1);
  });

  it('matches the palette function\'s own color at each precomputed step', () => {
    const fn = (t) => (t < 0.5 ? '#000000' : '#ffffff');
    fn.colors = [fn(0), fn(1)];
    const tex = paletteTexture(fn);
    expect(pixelAt(tex, 0, 0).slice(0, 3)).toEqual([0, 0, 0]);
    expect(pixelAt(tex, 1, 0).slice(0, 3)).toEqual([255, 255, 255]);
  });

  it('throws TypeError when palette is not a function or has no .colors', () => {
    expect(() => paletteTexture('viridis')).toThrow(TypeError);
    expect(() => paletteTexture(() => {})).toThrow(TypeError);
  });
});
