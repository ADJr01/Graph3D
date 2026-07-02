import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted before imports. We keep the real constants (plain numbers,
// no WebGL needed) and replace only WebGLRenderer with a controllable mock.
vi.mock('three', async (importActual) => {
  const three = await importActual();
  return {
    ...three,
    WebGLRenderer: vi.fn().mockImplementation(function ({ canvas } = {}) {
      return {
        setPixelRatio: vi.fn(),
        setSize: vi.fn(),
        dispose: vi.fn(),
        domElement: canvas,
        shadowMap: { enabled: false, type: 0 },
        toneMapping: 0,
        toneMappingExposure: 1.0,
        outputColorSpace: '',
      };
    }),
  };
});

import { Graph3DRenderer } from '../../src/core/Graph3DRenderer.js';
import {
  WebGLRenderer,
  SRGBColorSpace,
  ACESFilmicToneMapping,
  AgXToneMapping,
  ReinhardToneMapping,
  PCFSoftShadowMap,
  BasicShadowMap,
} from 'three';

function makeCanvas() {
  return { addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() };
}

describe('Graph3DRenderer', () => {
  beforeEach(() => {
    vi.mocked(WebGLRenderer).mockClear();
  });

  // ── Construction ──────────────────────────────────────────────────────────

  it('throws TypeError when canvas is missing', () => {
    expect(() => new Graph3DRenderer({})).toThrow(TypeError);
    expect(() => new Graph3DRenderer({})).toThrow(/canvas is required/);
  });

  it('throws TypeError when called with no arguments', () => {
    expect(() => new Graph3DRenderer()).toThrow(TypeError);
  });

  it('creates a WebGLRenderer with the supplied canvas', () => {
    const canvas = makeCanvas();
    new Graph3DRenderer({ canvas });
    expect(WebGLRenderer).toHaveBeenCalledWith(expect.objectContaining({ canvas }));
  });

  it('passes antialias, alpha, powerPreference to WebGLRenderer', () => {
    const canvas = makeCanvas();
    new Graph3DRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
    expect(WebGLRenderer).toHaveBeenCalledWith(
      expect.objectContaining({ antialias: false, alpha: true, powerPreference: 'low-power' }),
    );
  });

  it('sets outputColorSpace to SRGBColorSpace', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    expect(r.three.outputColorSpace).toBe(SRGBColorSpace);
  });

  it('defaults toneMapping to ACESFilmic', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    expect(r.three.toneMapping).toBe(ACESFilmicToneMapping);
  });

  it('defaults toneMappingExposure to 1.0', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    expect(r.three.toneMappingExposure).toBe(1.0);
  });

  it('enables shadowMap by default', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    expect(r.three.shadowMap.enabled).toBe(true);
  });

  it('defaults shadowMap type to PCFSoftShadowMap', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    expect(r.three.shadowMap.type).toBe(PCFSoftShadowMap);
  });

  it('accepts a custom toneMapping name', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas, toneMapping: 'AgX' });
    expect(r.three.toneMapping).toBe(AgXToneMapping);
  });

  it('accepts a custom shadowMap type', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas, shadowMap: 'basic' });
    expect(r.three.shadowMap.type).toBe(BasicShadowMap);
  });

  it('throws TypeError for an unknown toneMapping name', () => {
    const canvas = makeCanvas();
    expect(() => new Graph3DRenderer({ canvas, toneMapping: 'Neon' })).toThrow(TypeError);
    expect(() => new Graph3DRenderer({ canvas, toneMapping: 'Neon' })).toThrow(/toneMapping/);
  });

  it('throws TypeError for an unknown shadowMap name', () => {
    const canvas = makeCanvas();
    expect(() => new Graph3DRenderer({ canvas, shadowMap: 'raytraced' })).toThrow(TypeError);
    expect(() => new Graph3DRenderer({ canvas, shadowMap: 'raytraced' })).toThrow(/shadowMap/);
  });

  it('registers a webglcontextlost listener on the canvas', () => {
    const canvas = makeCanvas();
    new Graph3DRenderer({ canvas });
    expect(canvas.addEventListener).toHaveBeenCalledWith(
      'webglcontextlost',
      expect.any(Function),
      false,
    );
  });

  it('registers a webglcontextrestored listener on the canvas', () => {
    const canvas = makeCanvas();
    new Graph3DRenderer({ canvas });
    expect(canvas.addEventListener).toHaveBeenCalledWith(
      'webglcontextrestored',
      expect.any(Function),
      false,
    );
  });

  it('calls setPixelRatio with the provided value', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas, pixelRatio: 2 });
    expect(r.three.setPixelRatio).toHaveBeenCalledWith(2);
  });

  it('exposes the Three.js renderer as .three', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    expect(r.three).toBeDefined();
    expect(typeof r.three.setSize).toBe('function');
  });

  // ── setSize ───────────────────────────────────────────────────────────────

  it('setSize delegates to three.setSize', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    r.setSize(1920, 1080);
    expect(r.three.setSize).toHaveBeenCalledWith(1920, 1080, true);
  });

  it('setSize passes updateStyle=false when specified', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    r.setSize(800, 600, false);
    expect(r.three.setSize).toHaveBeenCalledWith(800, 600, false);
  });

  // ── setPixelRatio ─────────────────────────────────────────────────────────

  it('setPixelRatio delegates to three.setPixelRatio', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    r.setPixelRatio(1.5);
    expect(r.three.setPixelRatio).toHaveBeenCalledWith(1.5);
  });

  // ── setToneMapping ────────────────────────────────────────────────────────

  it('setToneMapping updates three.toneMapping', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    r.setToneMapping('Reinhard');
    expect(r.three.toneMapping).toBe(ReinhardToneMapping);
  });

  it('setToneMapping throws TypeError for unknown name', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    expect(() => r.setToneMapping('Neon')).toThrow(TypeError);
    expect(() => r.setToneMapping('Neon')).toThrow(/toneMapping/);
  });

  // ── dispose ───────────────────────────────────────────────────────────────

  it('dispose calls three.dispose()', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    r.dispose();
    expect(r.three.dispose).toHaveBeenCalledOnce();
  });

  it('dispose removes the webglcontextlost listener', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    r.dispose();
    expect(canvas.removeEventListener).toHaveBeenCalledWith(
      'webglcontextlost',
      expect.any(Function),
      false,
    );
  });

  it('dispose removes the webglcontextrestored listener', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    r.dispose();
    expect(canvas.removeEventListener).toHaveBeenCalledWith(
      'webglcontextrestored',
      expect.any(Function),
      false,
    );
  });

  it('dispose works after context loss (recoverable state is still cleanable)', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const [, contextLostHandler] = canvas.addEventListener.mock.calls[0];
    contextLostHandler();
    errorSpy.mockRestore();

    expect(() => r.dispose()).not.toThrow();
    expect(r.three.dispose).toHaveBeenCalledOnce();
  });

  it('dispose is idempotent — second call does nothing', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    r.dispose();
    r.dispose(); // must not throw
    expect(r.three.dispose).toHaveBeenCalledOnce();
  });

  it('setSize throws after dispose', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    r.dispose();
    expect(() => r.setSize(800, 600)).toThrow(/disposed/);
  });

  it('setPixelRatio throws after dispose', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    r.dispose();
    expect(() => r.setPixelRatio(2)).toThrow(/disposed/);
  });

  it('setToneMapping throws after dispose', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    r.dispose();
    expect(() => r.setToneMapping('AgX')).toThrow(/disposed/);
  });

  // ── WebGL context loss ────────────────────────────────────────────────────

  it('emits console.error and blocks further calls on context loss', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Simulate the browser firing webglcontextlost on the canvas.
    const [, handler] = canvas.addEventListener.mock.calls[0];
    handler();

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatch(/context lost/i);
    expect(() => r.setSize(800, 600)).toThrow(/context is lost/);
    expect(() => r.setPixelRatio(2)).toThrow(/context is lost/);
    expect(() => r.setToneMapping('AgX')).toThrow(/context is lost/);

    errorSpy.mockRestore();
  });

  it('dispatches graph3d:context-lost on the canvas when context is lost', () => {
    const canvas = makeCanvas();
    new Graph3DRenderer({ canvas });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const [, handler] = canvas.addEventListener.mock.calls[0];
    handler();
    errorSpy.mockRestore();

    expect(canvas.dispatchEvent).toHaveBeenCalledOnce();
    expect(canvas.dispatchEvent.mock.calls[0][0].type).toBe('graph3d:context-lost');
  });

  // ── WebGL context restore ─────────────────────────────────────────────────

  it('context restore clears dead state so methods work again', () => {
    const canvas = makeCanvas();
    const r = new Graph3DRenderer({ canvas });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const [, contextLostHandler] = canvas.addEventListener.mock.calls[0];
    const [, contextRestoredHandler] = canvas.addEventListener.mock.calls[1];
    contextLostHandler();
    errorSpy.mockRestore();

    expect(() => r.setSize(800, 600)).toThrow(/context is lost/);
    contextRestoredHandler();
    expect(() => r.setSize(800, 600)).not.toThrow();
  });

  it('dispatches graph3d:context-restored on the canvas when context is restored', () => {
    const canvas = makeCanvas();
    new Graph3DRenderer({ canvas });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const [, contextLostHandler] = canvas.addEventListener.mock.calls[0];
    const [, contextRestoredHandler] = canvas.addEventListener.mock.calls[1];
    contextLostHandler();
    errorSpy.mockRestore();

    canvas.dispatchEvent.mockClear();
    contextRestoredHandler();
    expect(canvas.dispatchEvent).toHaveBeenCalledOnce();
    expect(canvas.dispatchEvent.mock.calls[0][0].type).toBe('graph3d:context-restored');
  });
});
