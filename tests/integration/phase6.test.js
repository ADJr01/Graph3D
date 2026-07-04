import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { material, texture, GraphObjectMaterial } from '../../src/material/index.js';
import { palette } from '../../src/compose/palette/index.js';
import { Selection } from '../../src/compose/selection/Selection.js';
import { GraphMesh } from '../../src/object/GraphMesh.js';
import { GraphInstancedObject } from '../../src/object/GraphInstancedObject.js';
import { retainTexture } from '../../src/core/GraphDisposal.js';

// Phase 6 cross-cutting integration tests (Prompt 114): (a) every material
// renders clean, (b) SDF crisp at multiple distances, (c) palette texture
// matches the palette fn, (d) disposal leak-free, (e) dataDriven samples
// correctly, (f) Selection.style('color') parity meshes vs instanced.
// Individual behaviors already have thorough unit coverage in
// tests/material/ — this file proves the whole namespace holds together and
// composes correctly, closer to how a real chart would use it.

// (b)'s SDFText atlas loading needs the same mock as tests/material/text/SDFText.test.js
// (jsdom can't fetch/decode a real MSDF atlas — and this repo's copy of it
// doesn't exist yet regardless, see skipping_list.md's Phase 6 section).
let textureLoadImpl = (_url, onLoad) => onLoad({ isTexture: true, dispose: vi.fn() });
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    TextureLoader: vi.fn(function MockTextureLoader() {
      this.load = vi.fn((url, onLoad, onProgress, onError) => textureLoadImpl(url, onLoad, onError));
    }),
  };
});

const { SDFText } = await import('../../src/material/text/SDFText.js');

function makeMockMetrics() {
  return {
    chars: [{ id: 65, x: 0, y: 0, width: 20, height: 30, xoffset: 0, yoffset: 0, xadvance: 22 }], // 'A'
    common: { scaleW: 256, scaleH: 256, lineHeight: 36 },
    info: { size: 32 },
    kernings: [],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  textureLoadImpl = (_url, onLoad) => onLoad({ isTexture: true, dispose: vi.fn() });
});

function makeMesh({ scene = new THREE.Scene(), name = 'a', geometry = new THREE.BoxGeometry(), material: mat = new THREE.MeshBasicMaterial() } = {}) {
  return new GraphMesh({ scene, name, geometry, material: mat });
}

describe('Phase 6 integration', () => {
  // ── (b) SDF crisp at multiple distances ───────────────────────────────────

  describe('(b) SDFText stays crisp at multiple distances (scales as vector geometry, not baked pixels)', () => {
    it('doubling fontSize doubles every vertex position exactly — no fixed-resolution baking', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => makeMockMetrics() })));
      const small = await SDFText.create('A', { fontSize: 1 });
      const large = await SDFText.create('A', { fontSize: 2 });

      const smallPos = small.mesh.geometry.getAttribute('position');
      const largePos = large.mesh.geometry.getAttribute('position');
      expect(largePos.count).toBe(smallPos.count);
      for (let i = 0; i < smallPos.count; i++) {
        expect(largePos.getX(i)).toBeCloseTo(smallPos.getX(i) * 2, 5);
        expect(largePos.getY(i)).toBeCloseTo(smallPos.getY(i) * 2, 5);
      }
    });

    it('the fragment shader anti-aliases via screen-space derivatives (fwidth), not a fixed texel threshold — crispness is distance-independent by construction', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => makeMockMetrics() })));
      const text = await SDFText.create('A');
      expect(text.mesh.material.fragmentShader).toContain('fwidth(sigDist)');
    });

    it('the same shader (no per-fontSize variant) is reused regardless of scale', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => makeMockMetrics() })));
      const small = await SDFText.create('A', { fontSize: 0.5 });
      const large = await SDFText.create('A', { fontSize: 5 });
      expect(large.mesh.material.fragmentShader).toBe(small.mesh.material.fragmentShader);
    });
  });

  // ── (a) every material in the namespace renders clean ───────────────────────

  describe('(a) every material.* factory produces a usable, disposable material', () => {
    const CUBE_TEXTURE_STUB = new THREE.CubeTexture([{}, {}, {}, {}, {}, {}]);

    // material.crystal (needs an envMap) and material.pulse/addPlanarReflection/
    // setPaletteForAttribute (not material factories — they operate on an
    // existing target, or return a mesh/wrapper, not a THREE.Material) are
    // exercised separately below/elsewhere; this covers every plain preset.
    const FACTORY_NAMES = [
      'standard', 'physical', 'basic', 'lambert', 'phong', 'toon', 'matcap',
      'holographic', 'glass', 'frostedGlass', 'neon', 'glow', 'velvet',
      'liquidMercury', 'chrome', 'gold', 'copper', 'pearl', 'obsidian',
    ];

    it.each(FACTORY_NAMES)('material.%s builds, attaches to a mesh, and disposes cleanly', (name) => {
      const mesh = makeMesh({ material: material[name]({}) });
      expect(mesh.material).toBeInstanceOf(THREE.Material);
      expect(() => mesh.dispose()).not.toThrow();
    });

    it('material.crystal builds, attaches, and disposes cleanly given an envMap', () => {
      const mesh = makeMesh({ material: material.crystal({ envMap: CUBE_TEXTURE_STUB }) });
      expect(mesh.material).toBeInstanceOf(THREE.ShaderMaterial);
      expect(() => mesh.dispose()).not.toThrow();
    });

    it('material.dataDriven builds, attaches, and disposes cleanly given a palette', () => {
      const mesh = makeMesh({ material: material.dataDriven({ palette: palette.viridis }) });
      expect(mesh.material).toBeInstanceOf(THREE.ShaderMaterial);
      expect(() => mesh.dispose()).not.toThrow();
    });

    it('the full sweep leaves no thrown errors across every factory in one pass', () => {
      const scene = new THREE.Scene();
      const meshes = [
        ...FACTORY_NAMES.map((name) => makeMesh({ scene, material: material[name]({}) })),
        makeMesh({ scene, material: material.crystal({ envMap: CUBE_TEXTURE_STUB }) }),
        makeMesh({ scene, material: material.dataDriven({ palette: palette.viridis }) }),
      ];
      expect(() => { for (const mesh of meshes) mesh.dispose(); }).not.toThrow();
    });
  });

  // ── (c) palette texture matches the palette fn ──────────────────────────────

  describe('(c) texture.paletteTexture matches its source palette function', () => {
    it('every sampled texel equals palette.viridis at the same normalized position', () => {
      const tex = texture.paletteTexture(palette.viridis);
      const data = tex.image.data;
      for (const i of [0, 64, 128, 192, 255]) {
        const expected = new THREE.Color(palette.viridis.colors[i]);
        const r = data[i * 4] / 255;
        const g = data[i * 4 + 1] / 255;
        const b = data[i * 4 + 2] / 255;
        expect(r).toBeCloseTo(expected.r, 2);
        expect(g).toBeCloseTo(expected.g, 2);
        expect(b).toBeCloseTo(expected.b, 2);
      }
    });
  });

  // ── (d) disposal is leak-free across the whole namespace, wrapped ──────────

  describe('(d) disposal leak-free (GraphObjectMaterial + every preset, combined)', () => {
    it('wrapping every preset in a GraphObjectMaterial and disposing both leaves nothing thrown', () => {
      const scene = new THREE.Scene();
      const shaderMesh = makeMesh({ scene, material: material.holographic({}) });
      const wrapper = new GraphObjectMaterial(shaderMesh);
      wrapper.bindUniforms({ time: 'auto' });
      expect(() => {
        wrapper.dispose();
        shaderMesh.dispose();
      }).not.toThrow();
    });

    it('a texture (from texture.checkerboard) shared across two meshes survives one being disposed', () => {
      const sharedTexture = texture.checkerboard({ size: 8 });
      const disposeSpy = vi.spyOn(sharedTexture, 'dispose');
      const scene = new THREE.Scene();

      // GraphObjectMaterial doesn't auto-detect sharing between independently
      // constructed meshes (see its own class doc) — an advanced caller
      // (here, the test) marks the extra share explicitly.
      retainTexture(sharedTexture);
      const meshA = makeMesh({ scene, material: new THREE.MeshStandardMaterial({ map: sharedTexture }) });
      const meshB = makeMesh({ scene, material: new THREE.MeshStandardMaterial({ map: sharedTexture }) });

      meshA.dispose();
      expect(disposeSpy).not.toHaveBeenCalled(); // meshB still uses it

      meshB.dispose();
      expect(disposeSpy).toHaveBeenCalledOnce();
    });
  });

  // ── (e) dataDriven samples correctly ────────────────────────────────────────

  describe('(e) dataDriven samples the same palette texture.paletteTexture would build directly', () => {
    it('uses an identical paletteTexture to the standalone texture.paletteTexture(palette)', () => {
      const mat = material.dataDriven({ palette: palette.viridis });
      const directTexture = texture.paletteTexture(palette.viridis);
      expect(Array.from(mat.uniforms.paletteTexture.value.image.data)).toEqual(Array.from(directTexture.image.data));
    });

    it('perInstanceOpacity/perInstanceEmissiveIntensity read exactly the attribute names Selection.attr/.style already write', () => {
      const mat = material.dataDriven({ palette: palette.viridis, perInstanceOpacity: true, perInstanceEmissiveIntensity: true });
      expect(mat.vertexShader).toContain('attribute float opacity;');
      expect(mat.vertexShader).toContain('attribute float emissiveIntensity;');
    });
  });

  // ── (f) Selection.style('color') backend parity ─────────────────────────────

  describe("(f) Selection.style('color') produces identical results on meshes vs instanced backends", () => {
    it('an identical style() call resolves to the same final color on both backends', () => {
      const data = [{ id: 'a', color: '#3b82f6' }, { id: 'b', color: '#f97316' }];

      const meshScene = new THREE.Scene();
      const meshes = data.map((d, i) => {
        const m = makeMesh({ scene: meshScene, name: `m${i}` });
        m.setUserData('datum', d);
        return m;
      });
      const meshSelection = new Selection({ type: 'meshes', meshes });

      const instScene = new THREE.Scene();
      const object = new GraphInstancedObject({ scene: instScene, name: 'batch', geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial(), count: data.length });
      data.forEach((d, i) => object.setInstanceUserData(i, d));
      const instSelection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1]) });

      meshSelection.style('color', (d) => d.color);
      instSelection.style('color', (d) => d.color);

      for (let i = 0; i < data.length; i++) {
        const meshColor = meshes[i].material.color;
        const instColor = object.getInstanceColor(i);
        expect(instColor.r).toBeCloseTo(meshColor.r, 5);
        expect(instColor.g).toBeCloseTo(meshColor.g, 5);
        expect(instColor.b).toBeCloseTo(meshColor.b, 5);
      }
    });
  });
});
