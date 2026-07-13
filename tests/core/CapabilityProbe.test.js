import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CapabilityProbe } from '../../src/core/CapabilityProbe.js';

// Constants mirroring the real extension object returned by WEBGL_debug_renderer_info.
const UNMASKED_VENDOR_WEBGL = 0x9245;
const UNMASKED_RENDERER_WEBGL = 0x9246;

function makeGl2(overrides = {}) {
  const defaults = {
    MAX_TEXTURE_SIZE: 0x0d33,
    MAX_VERTEX_ATTRIBS: 0x8869,
    MAX_ELEMENT_INDEX: 0x8d6b,
    VENDOR: 0x1f00,
    RENDERER: 0x1f01,
  };

  const params = {
    [defaults.MAX_TEXTURE_SIZE]: 16384,
    [defaults.MAX_VERTEX_ATTRIBS]: 16,
    [defaults.MAX_ELEMENT_INDEX]: 4294967295,
    [defaults.VENDOR]: 'Google Inc.',
    [defaults.RENDERER]: 'ANGLE (NVIDIA)',
    [UNMASKED_VENDOR_WEBGL]: 'NVIDIA Corporation',
    [UNMASKED_RENDERER_WEBGL]: 'NVIDIA GeForce RTX 3080',
    ...overrides.params,
  };

  const extensions = {
    EXT_disjoint_timer_query_webgl2: { name: 'timer' },
    EXT_color_buffer_float: { name: 'float' },
    WEBGL_debug_renderer_info: { UNMASKED_VENDOR_WEBGL, UNMASKED_RENDERER_WEBGL },
    ...overrides.extensions,
  };

  return {
    ...defaults,
    getParameter: vi.fn((key) => params[key] ?? null),
    getExtension: vi.fn((name) => extensions[name] ?? null),
  };
}

function makeGl1(overrides = {}) {
  const defaults = {
    MAX_TEXTURE_SIZE: 0x0d33,
    MAX_VERTEX_ATTRIBS: 0x8869,
    VENDOR: 0x1f00,
    RENDERER: 0x1f01,
  };

  const params = {
    [defaults.MAX_TEXTURE_SIZE]: 8192,
    [defaults.MAX_VERTEX_ATTRIBS]: 16,
    [defaults.VENDOR]: 'WebKit',
    [defaults.RENDERER]: 'WebKit WebGL',
    ...overrides.params,
  };

  const extensions = {
    OES_texture_float: { name: 'float' },
    'ANGLE_instanced_arrays': { name: 'instanced' },
    WEBGL_debug_renderer_info: { UNMASKED_VENDOR_WEBGL, UNMASKED_RENDERER_WEBGL },
    ...overrides.extensions,
  };

  return {
    ...defaults,
    getParameter: vi.fn((key) => params[key] ?? null),
    getExtension: vi.fn((name) => extensions[name] ?? null),
  };
}

function makeCanvas(gl2 = null, gl1 = null) {
  return {
    getContext: vi.fn((type) => {
      if (type === 'webgl2') return gl2;
      if (type === 'webgl' || type === 'experimental-webgl') return gl1;
      return null;
    }),
  };
}

describe('CapabilityProbe', () => {
  describe('WebGL2 environment', () => {
    it('detects webgl2 support', () => {
      const probe = new CapabilityProbe(makeCanvas(makeGl2()));
      expect(probe.capabilities.webgl2).toBe(true);
    });

    it('detects timer query extension', () => {
      const probe = new CapabilityProbe(makeCanvas(makeGl2()));
      expect(probe.capabilities.timerQuery).toBe(true);
    });

    it('detects float texture support via EXT_color_buffer_float', () => {
      const probe = new CapabilityProbe(makeCanvas(makeGl2()));
      expect(probe.capabilities.floatTextures).toBe(true);
    });

    it('reports instancedArrays true (WebGL2 built-in)', () => {
      const probe = new CapabilityProbe(makeCanvas(makeGl2()));
      expect(probe.capabilities.instancedArrays).toBe(true);
    });

    it('reads maxTextureSize', () => {
      const probe = new CapabilityProbe(makeCanvas(makeGl2()));
      expect(probe.capabilities.maxTextureSize).toBe(16384);
    });

    it('reads maxVertexAttribs', () => {
      const probe = new CapabilityProbe(makeCanvas(makeGl2()));
      expect(probe.capabilities.maxVertexAttribs).toBe(16);
    });

    it('reads maxInstanceCount from MAX_ELEMENT_INDEX', () => {
      const probe = new CapabilityProbe(makeCanvas(makeGl2()));
      expect(probe.capabilities.maxInstanceCount).toBe(4294967295);
    });

    it('reads unmasked vendor via WEBGL_debug_renderer_info', () => {
      const probe = new CapabilityProbe(makeCanvas(makeGl2()));
      expect(probe.capabilities.vendor).toBe('NVIDIA Corporation');
      expect(probe.capabilities.renderer).toBe('NVIDIA GeForce RTX 3080');
    });

    it('falls back to standard VENDOR/RENDERER when debug info is unavailable', () => {
      const gl2 = makeGl2({ extensions: { WEBGL_debug_renderer_info: null } });
      const probe = new CapabilityProbe(makeCanvas(gl2));
      expect(probe.capabilities.vendor).toBe('Google Inc.');
      expect(probe.capabilities.renderer).toBe('ANGLE (NVIDIA)');
    });

    it('reports timerQuery false when extension is absent', () => {
      const gl2 = makeGl2({ extensions: { EXT_disjoint_timer_query_webgl2: null } });
      const probe = new CapabilityProbe(makeCanvas(gl2));
      expect(probe.capabilities.timerQuery).toBe(false);
    });

    it('reports floatTextures false when extension is absent', () => {
      const gl2 = makeGl2({ extensions: { EXT_color_buffer_float: null } });
      const probe = new CapabilityProbe(makeCanvas(gl2));
      expect(probe.capabilities.floatTextures).toBe(false);
    });
  });

  describe('WebGL1 fallback', () => {
    beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('emits a console.warn when falling back to WebGL1', () => {
      new CapabilityProbe(makeCanvas(null, makeGl1()));
      expect(console.warn).toHaveBeenCalledOnce();
      expect(console.warn.mock.calls[0][0]).toMatch(/WebGL2 unavailable/);
    });

    it('reports webgl2 false', () => {
      const probe = new CapabilityProbe(makeCanvas(null, makeGl1()));
      expect(probe.capabilities.webgl2).toBe(false);
    });

    it('reports timerQuery false (WebGL1 cannot support it)', () => {
      const probe = new CapabilityProbe(makeCanvas(null, makeGl1()));
      expect(probe.capabilities.timerQuery).toBe(false);
    });

    it('detects float textures via OES_texture_float', () => {
      const probe = new CapabilityProbe(makeCanvas(null, makeGl1()));
      expect(probe.capabilities.floatTextures).toBe(true);
    });

    it('detects instancedArrays via ANGLE_instanced_arrays', () => {
      const probe = new CapabilityProbe(makeCanvas(null, makeGl1()));
      expect(probe.capabilities.instancedArrays).toBe(true);
    });

    it('sets maxInstanceCount to 2^32-1 when ANGLE_instanced_arrays is present', () => {
      const probe = new CapabilityProbe(makeCanvas(null, makeGl1()));
      expect(probe.capabilities.maxInstanceCount).toBe(2 ** 32 - 1);
    });

    it('sets maxInstanceCount to 0 when ANGLE_instanced_arrays is absent', () => {
      const gl1 = makeGl1({ extensions: { 'ANGLE_instanced_arrays': null } });
      const probe = new CapabilityProbe(makeCanvas(null, gl1));
      expect(probe.capabilities.instancedArrays).toBe(false);
      expect(probe.capabilities.maxInstanceCount).toBe(0);
    });

    it('reports floatTextures false when OES_texture_float is absent', () => {
      const gl1 = makeGl1({ extensions: { OES_texture_float: null } });
      const probe = new CapabilityProbe(makeCanvas(null, gl1));
      expect(probe.capabilities.floatTextures).toBe(false);
    });
  });

  describe('no WebGL environment', () => {
    beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('emits a console.warn when no context is available', () => {
      new CapabilityProbe(makeCanvas(null, null));
      expect(console.warn).toHaveBeenCalledOnce();
      expect(console.warn.mock.calls[0][0]).toMatch(/No WebGL context/);
    });

    it('returns all-disabled capabilities', () => {
      const probe = new CapabilityProbe(makeCanvas(null, null));
      const c = probe.capabilities;
      expect(c.webgl2).toBe(false);
      expect(c.timerQuery).toBe(false);
      expect(c.floatTextures).toBe(false);
      expect(c.instancedArrays).toBe(false);
      expect(c.maxTextureSize).toBe(0);
      expect(c.maxVertexAttribs).toBe(0);
      expect(c.maxInstanceCount).toBe(0);
      expect(c.vendor).toBe('unavailable');
      expect(c.renderer).toBe('unavailable');
    });
  });

  describe('capabilities object', () => {
    it('is frozen — properties cannot be modified', () => {
      const probe = new CapabilityProbe(makeCanvas(makeGl2()));
      expect(() => {
        probe.capabilities.webgl2 = false;
      }).toThrow(TypeError);
    });

    it('is frozen — properties cannot be added', () => {
      const probe = new CapabilityProbe(makeCanvas(makeGl2()));
      expect(() => {
        probe.capabilities.extra = true;
      }).toThrow(TypeError);
    });
  });

  describe('SSR-safe mode (Prompt 177)', () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it('does not throw when document is unavailable', () => {
      vi.stubGlobal('document', undefined);
      expect(() => new CapabilityProbe()).not.toThrow();
    });

    it('returns all-disabled capabilities without touching canvas', () => {
      vi.stubGlobal('document', undefined);
      const probe = new CapabilityProbe();
      expect(probe.capabilities.webgl2).toBe(false);
      expect(probe.capabilities.vendor).toBe('unavailable');
    });

    it('does not warn — SSR is an expected state, not a degraded fallback', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubGlobal('document', undefined);
      new CapabilityProbe();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('no-canvas constructor path', () => {
    it('creates its own canvas via document.createElement', () => {
      const gl2 = makeGl2();
      const mockCanvas = makeCanvas(gl2);
      const spy = vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas);
      const probe = new CapabilityProbe();
      expect(spy).toHaveBeenCalledWith('canvas');
      expect(probe.capabilities.webgl2).toBe(true);
      spy.mockRestore();
    });
  });
});
