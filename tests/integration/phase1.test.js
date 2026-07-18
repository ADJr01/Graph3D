import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Integration tests for Phase 1 (Core Engine).
 *
 * Only THREE.WebGLRenderer is stubbed — jsdom has no WebGL implementation.
 * Every Graph3D-layer class (Graph3DRenderer, CapabilityProbe, Graph3DRegistry,
 * Graph3DLoop, FrameBudget, WorkerPool) runs as its real implementation.
 */

// Partial mock: replace only WebGLRenderer; all THREE constants pass through.
vi.mock('three', async () => {
  const actual = await vi.importActual('three');
  return {
    ...actual,
    WebGLRenderer: class {
      constructor({ canvas }) {
        this.domElement = canvas;
        this.setPixelRatio = vi.fn();
        this.setSize = vi.fn();
        this.shadowMap = { enabled: false, type: 0 };
        this.outputColorSpace = '';
        this.toneMapping = 0;
        this.toneMappingExposure = 1.0;
        this.dispose = vi.fn();
        this.info = {
          render: { calls: 0, triangles: 0 },
          memory: { geometries: 0, textures: 0 },
        };
      }
    },
  };
});

import { Graph3D } from '../../src/core/Graph3D.js';
import { registry } from '../../src/core/Graph3DRegistry.js';
import { loop } from '../../src/core/Graph3DLoop.js';

function makeCanvas() {
  return document.createElement('canvas');
}

afterEach(() => {
  registry.disposeAll();
  vi.restoreAllMocks();
});

// ── (a) construct/dispose cycle ───────────────────────────────────────────────

describe('Phase 1 / (a) construct-dispose cycle', () => {
  it('1000 construct/dispose cycles leave the registry empty', () => {
    for (let i = 0; i < 1000; i++) {
      const g = new Graph3D({ canvas: makeCanvas() });
      g.dispose();
    }
    expect(registry.all()).toHaveLength(0);
  });

  it('each undisposed instance appears in the registry', () => {
    const a = new Graph3D({ canvas: makeCanvas() });
    const b = new Graph3D({ canvas: makeCanvas() });
    expect(registry.all()).toContain(a);
    expect(registry.all()).toContain(b);
    expect(registry.all()).toHaveLength(2);
  });
});

// ── (b) loop tick delta conversion ───────────────────────────────────────────

describe('Phase 1 / (b) loop tick delta', () => {
  it('deltaSec from the loop is converted to ms before reaching FrameBudget', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const g = new Graph3D({ canvas: makeCanvas() });

    // Capture the real tick registered with the loop.
    const [tick] = addSpy.mock.calls[0];
    const recordSpy = vi.spyOn(g.frameBudget, 'record');

    tick(0.016); // 16 ms expressed as seconds
    tick(0.033); // 33 ms expressed as seconds

    const emptyContext = { chartId: null, drawCalls: 0, triangleCount: 0, meshCount: 0 };
    expect(recordSpy).toHaveBeenNthCalledWith(1, 16, emptyContext);
    expect(recordSpy).toHaveBeenNthCalledWith(2, 33, emptyContext);
  });
});

// ── (c) pause / resume ───────────────────────────────────────────────────────

describe('Phase 1 / (c) pause / resume', () => {
  it('pause removes the tick from the loop; resume re-adds it', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const g = new Graph3D({ canvas: makeCanvas() });

    g.pause();
    // With no subscribers left, the singleton loop stops itself.
    expect(loop.isRunning).toBe(false);

    g.resume();
    // Re-adding the tick restarts the loop.
    expect(loop.isRunning).toBe(true);

    // Ticks still flow to FrameBudget after resuming.
    const [tick] = addSpy.mock.calls[0];
    const recordSpy = vi.spyOn(g.frameBudget, 'record');
    tick(0.016);
    expect(recordSpy).toHaveBeenCalledWith(16, { chartId: null, drawCalls: 0, triangleCount: 0, meshCount: 0 });
  });

  it('pause-resume-pause round-trip leaves the loop stopped', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    g.pause();
    g.resume();
    g.pause();
    expect(loop.isRunning).toBe(false);
  });
});

// ── (d) context-loss event ───────────────────────────────────────────────────

describe('Phase 1 / (d) context-loss', () => {
  it('webglcontextlost on the canvas triggers graph3d:context-lost and marks renderer dead', () => {
    const canvas = makeCanvas();
    const g = new Graph3D({ canvas });

    let fired = false;
    canvas.addEventListener('graph3d:context-lost', () => {
      fired = true;
    });

    // Simulate what gl.getExtension('WEBGL_lose_context').loseContext() triggers.
    canvas.dispatchEvent(new Event('webglcontextlost'));

    expect(fired).toBe(true);
    expect(g.renderer._deadReason).toBe('webglcontextlost');
  });

  it('graph3d:context-restored clears the dead state', () => {
    const canvas = makeCanvas();
    const g = new Graph3D({ canvas });

    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(g.renderer._deadReason).toBe('webglcontextlost');

    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(g.renderer._deadReason).toBeNull();
  });

  it('context-loss listener is removed after dispose() — no graph3d:context-lost fires', () => {
    const canvas = makeCanvas();
    const g = new Graph3D({ canvas });
    g.dispose();

    let fired = false;
    canvas.addEventListener('graph3d:context-lost', () => {
      fired = true;
    });
    canvas.dispatchEvent(new Event('webglcontextlost'));

    expect(fired).toBe(false);
  });
});

// ── (e) frame-budget slow-frame event ────────────────────────────────────────

describe('Phase 1 / (e) frame-budget slow-frame event', () => {
  it('emits graph3d:slow-frame after windowSize consecutive over-budget frames', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const g = new Graph3D({ canvas: makeCanvas() });
    const [tick] = addSpy.mock.calls[0];

    const events = [];
    g.frameBudget.addEventListener('graph3d:slow-frame', (e) => events.push(e.detail));

    // Default budget = 16 ms, windowSize = 5. Five × 50 ms frames should trigger.
    for (let i = 0; i < 5; i++) tick(0.05); // 50 ms in seconds

    expect(events).toHaveLength(1);
    expect(events[0].fps).toBeCloseTo(1000 / 50, 0); // ≈ 20 fps
  });

  it('emits again on the next burst of slow frames after the counter resets', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const g = new Graph3D({ canvas: makeCanvas() });
    const [tick] = addSpy.mock.calls[0];

    const events = [];
    g.frameBudget.addEventListener('graph3d:slow-frame', (e) => events.push(e.detail));

    for (let i = 0; i < 5; i++) tick(0.05); // first burst
    for (let i = 0; i < 5; i++) tick(0.05); // second burst

    expect(events).toHaveLength(2);
  });

  it('does not emit when frames are within budget', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const g = new Graph3D({ canvas: makeCanvas() });
    const [tick] = addSpy.mock.calls[0];

    const events = [];
    g.frameBudget.addEventListener('graph3d:slow-frame', (e) => events.push(e.detail));

    for (let i = 0; i < 10; i++) tick(0.010); // 10 ms — under the 16 ms budget

    expect(events).toHaveLength(0);
  });
});
