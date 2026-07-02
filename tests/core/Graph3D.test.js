import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────
// Arrow functions can't be constructors — use class syntax in vi.mock factories.

vi.mock('../../src/core/Graph3DRenderer.js', () => ({
  Graph3DRenderer: class {
    setSize = vi.fn();
    dispose = vi.fn();
    constructor({ canvas } = {}) {
      const el = canvas ?? document.createElement('canvas');
      this.three = {
        render: vi.fn(),
        setViewport: vi.fn(),
        setScissor: vi.fn(),
        setScissorTest: vi.fn(),
        domElement: el,
        shadowMap: { enabled: false, type: 0 },
        clippingPlanes: [],
      };
    }
  },
}));

vi.mock('../../src/core/CapabilityProbe.js', () => ({
  CapabilityProbe: class {
    capabilities = Object.freeze({
      webgl2: true,
      instancedArrays: true,
      maxTextureSize: 16384,
    });
  },
}));

// Imports must follow vi.mock declarations.
import { Graph3D } from '../../src/core/Graph3D.js';
import { registry } from '../../src/core/Graph3DRegistry.js';
import { loop } from '../../src/core/Graph3DLoop.js';
import { FrameBudget } from '../../src/core/FrameBudget.js';
import { WorkerPool } from '../../src/core/WorkerPool.js';
import { GraphScene } from '../../src/scene/GraphScene.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCanvas() {
  return document.createElement('canvas');
}

/** Build a canvas already attached to a parent div. */
function makeCanvasWithParent() {
  const parent = document.createElement('div');
  const canvas = document.createElement('canvas');
  parent.appendChild(canvas);
  return { canvas, parent };
}

afterEach(() => {
  // Dispose any stray instances so the singleton registry stays clean between tests.
  registry.disposeAll();
  vi.unstubAllGlobals();
  // Restore all vi.spyOn wrappers so spy chains don't accumulate across tests.
  vi.restoreAllMocks();
});

// ── Constructor ───────────────────────────────────────────────────────────────

describe('Graph3D constructor', () => {
  it('throws TypeError when canvas is omitted', () => {
    expect(() => new Graph3D({})).toThrow(TypeError);
    expect(() => new Graph3D({})).toThrow(/canvas is required/);
  });

  it('throws TypeError when canvas is null', () => {
    expect(() => new Graph3D({ canvas: null })).toThrow(TypeError);
  });

  it('constructs without throwing given a canvas', () => {
    expect(() => new Graph3D({ canvas: makeCanvas() })).not.toThrow();
  });

  it('registers the instance with the global registry on construction', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    expect(registry.all()).toContain(g);
  });

  it('subscribes exactly one tick to the loop on construction', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const g = new Graph3D({ canvas: makeCanvas() }); // eslint-disable-line no-unused-vars
    expect(addSpy).toHaveBeenCalledOnce();
    expect(typeof addSpy.mock.calls[0][0]).toBe('function');
    addSpy.mockRestore();
  });

  it('stores hdr, theme, autoResize, and respectReducedMotion as public properties', () => {
    const g = new Graph3D({
      canvas: makeCanvas(),
      hdr: '/studio.hdr',
      theme: 'studio-dark',
      autoResize: false,
      respectReducedMotion: false,
    });
    expect(g.hdr).toBe('/studio.hdr');
    expect(g.theme).toBe('studio-dark');
    expect(g.autoResize).toBe(false);
    expect(g.respectReducedMotion).toBe(false);
  });
});

// ── Getters ───────────────────────────────────────────────────────────────────

describe('Graph3D getters', () => {
  let g;

  beforeEach(() => {
    g = new Graph3D({ canvas: makeCanvas() });
  });

  it('.renderer returns the Graph3DRenderer instance', () => {
    expect(g.renderer).toBeDefined();
    expect(typeof g.renderer.dispose).toBe('function');
  });

  it('.capabilities returns the frozen capabilities object', () => {
    expect(g.capabilities).toMatchObject({ webgl2: true, instancedArrays: true });
    expect(Object.isFrozen(g.capabilities)).toBe(true);
  });

  it('.frameBudget returns a FrameBudget instance', () => {
    expect(g.frameBudget).toBeInstanceOf(FrameBudget);
  });

  it('.scenes returns an empty Map before any scene is created', () => {
    expect(g.scenes).toBeInstanceOf(Map);
    expect(g.scenes.size).toBe(0);
  });

  it('.activeScene is null before any scene is created', () => {
    expect(g.activeScene).toBeNull();
  });
});

// ── Lazy WorkerPool ───────────────────────────────────────────────────────────

describe('Graph3D.workers (lazy pool)', () => {
  it('creates a WorkerPool on first access of .workers', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    expect(g.workers).toBeInstanceOf(WorkerPool);
  });

  it('returns the same WorkerPool instance on repeated access', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    expect(g.workers).toBe(g.workers);
  });

  it('throws after dispose()', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    g.dispose();
    expect(() => g.workers).toThrow(/disposed/);
  });
});

// ── Tick ─────────────────────────────────────────────────────────────────────

describe('Graph3D loop tick', () => {
  it('records frame timing in FrameBudget on each tick', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const g = new Graph3D({ canvas: makeCanvas() });
    const tick = addSpy.mock.calls[0][0];

    const recordSpy = vi.spyOn(g.frameBudget, 'record');
    tick(0.016); // 16 ms expressed as seconds
    expect(recordSpy).toHaveBeenCalledWith(16);

    tick(0.033); // 33 ms
    expect(recordSpy).toHaveBeenCalledWith(33);

    addSpy.mockRestore();
  });
});

// ── setSize ───────────────────────────────────────────────────────────────────

describe('Graph3D.setSize()', () => {
  it('delegates to renderer.setSize', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    const setSizeSpy = vi.spyOn(g.renderer, 'setSize');
    g.setSize(800, 600);
    expect(setSizeSpy).toHaveBeenCalledWith(800, 600);
  });

  it('throws after dispose()', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    g.dispose();
    expect(() => g.setSize(800, 600)).toThrow(/disposed/);
  });
});

// ── Auto-resize ───────────────────────────────────────────────────────────────

describe('auto-resize (ResizeObserver)', () => {
  /** @type {Array<{cb: function, el: *, disconnected: boolean}>} */
  let fakeObservers;

  beforeEach(() => {
    fakeObservers = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb) {
          this._cb = cb;
          this._disconnected = false;
          fakeObservers.push(this);
        }
        observe() {}
        disconnect() { this._disconnected = true; }
        trigger(rect) { this._cb([{ contentRect: rect }]); }
      },
    );
  });

  it('creates a ResizeObserver when autoResize is true and canvas has a parent', () => {
    const { canvas } = makeCanvasWithParent();
    const g = new Graph3D({ canvas, autoResize: true });
    expect(fakeObservers).toHaveLength(1);
  });

  it('does not create a ResizeObserver when autoResize is false', () => {
    const { canvas } = makeCanvasWithParent();
    const g = new Graph3D({ canvas, autoResize: false });
    expect(fakeObservers).toHaveLength(0);
  });

  it('does not create a ResizeObserver when canvas has no parent', () => {
    const canvas = makeCanvas(); // orphaned, no parent
    const g = new Graph3D({ canvas, autoResize: true });
    expect(fakeObservers).toHaveLength(0);
  });

  it('calls setSize when the parent resizes', () => {
    const { canvas } = makeCanvasWithParent();
    const g = new Graph3D({ canvas, autoResize: true });
    const setSizeSpy = vi.spyOn(g, 'setSize');

    fakeObservers[0].trigger({ width: 1024, height: 768 });
    expect(setSizeSpy).toHaveBeenCalledWith(1024, 768);
  });

  it('rounds fractional dimensions before passing to setSize', () => {
    const { canvas } = makeCanvasWithParent();
    const g = new Graph3D({ canvas, autoResize: true });
    const setSizeSpy = vi.spyOn(g, 'setSize');

    fakeObservers[0].trigger({ width: 799.5, height: 599.7 });
    expect(setSizeSpy).toHaveBeenCalledWith(800, 600);
  });

  it('disconnects the ResizeObserver on dispose()', () => {
    const { canvas } = makeCanvasWithParent();
    const g = new Graph3D({ canvas, autoResize: true });
    const observer = fakeObservers[0];
    g.dispose();
    expect(observer._disconnected).toBe(true);
  });
});

// ── pause / resume ────────────────────────────────────────────────────────────

describe('Graph3D pause / resume', () => {
  it('pause removes the tick from the loop', () => {
    const removeSpy = vi.spyOn(loop, 'remove');
    const g = new Graph3D({ canvas: makeCanvas() });
    g.pause();
    expect(removeSpy).toHaveBeenCalledOnce();
    removeSpy.mockRestore();
  });

  it('resume re-adds the tick to the loop', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    g.pause();
    const addSpy = vi.spyOn(loop, 'add');
    g.resume();
    expect(addSpy).toHaveBeenCalledOnce();
    addSpy.mockRestore();
  });

  it('pause is idempotent — calling twice removes the tick only once', () => {
    const removeSpy = vi.spyOn(loop, 'remove');
    const g = new Graph3D({ canvas: makeCanvas() });
    g.pause();
    g.pause();
    expect(removeSpy).toHaveBeenCalledOnce();
    removeSpy.mockRestore();
  });

  it('resume is a no-op when not paused', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    const addSpy = vi.spyOn(loop, 'add');
    g.resume();
    expect(addSpy).not.toHaveBeenCalled();
    addSpy.mockRestore();
  });

  it('pause is a no-op after dispose()', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    g.dispose();
    const removeSpy = vi.spyOn(loop, 'remove');
    g.pause();
    expect(removeSpy).not.toHaveBeenCalled();
    removeSpy.mockRestore();
  });

  it('resume is a no-op after dispose()', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    g.pause();
    g.dispose();
    const addSpy = vi.spyOn(loop, 'add');
    g.resume();
    expect(addSpy).not.toHaveBeenCalled();
    addSpy.mockRestore();
  });

  it('pause then resume then pause works round-trip', () => {
    const removeSpy = vi.spyOn(loop, 'remove');
    const addSpy = vi.spyOn(loop, 'add');
    const g = new Graph3D({ canvas: makeCanvas() });

    g.pause();
    g.resume();
    g.pause();

    expect(removeSpy).toHaveBeenCalledTimes(2); // initial loop.add counted; remove called twice
    expect(addSpy).toHaveBeenCalledTimes(2); // once in constructor, once in resume

    removeSpy.mockRestore();
    addSpy.mockRestore();
  });
});

// ── chart() ───────────────────────────────────────────────────────────────────

describe('Graph3D.chart()', () => {
  it('throws TypeError on empty string typeName', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    expect(() => g.chart('')).toThrow(TypeError);
    expect(() => g.chart('')).toThrow(/typeName must be a non-empty string/);
  });

  it('throws TypeError on non-string typeName', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    expect(() => g.chart(null)).toThrow(TypeError);
    expect(() => g.chart(42)).toThrow(TypeError);
  });

  it('throws Error for a valid-but-unregistered chart type', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    expect(() => g.chart('bar')).toThrow(/unknown chart type 'bar'/);
    expect(() => g.chart('scatter')).toThrow(/unknown chart type 'scatter'/);
  });

  it('error message includes "none registered yet" when the registry is empty', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    expect(() => g.chart('bar')).toThrow(/none registered yet/);
  });

  it('throws after dispose()', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    g.dispose();
    expect(() => g.chart('bar')).toThrow(/disposed/);
  });
});

// ── Static statics ────────────────────────────────────────────────────────────

describe('Graph3D statics', () => {
  it('version is a semver string', () => {
    expect(typeof Graph3D.version).toBe('string');
    expect(Graph3D.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('disposeAll delegates to registry.disposeAll', () => {
    const spy = vi.spyOn(registry, 'disposeAll');
    Graph3D.disposeAll();
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

// ── dispose() ─────────────────────────────────────────────────────────────────

describe('Graph3D.dispose()', () => {
  it('is idempotent — calling twice does not throw', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    expect(() => {
      g.dispose();
      g.dispose();
    }).not.toThrow();
  });

  it('unregisters from the global registry', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    g.dispose();
    expect(registry.all()).not.toContain(g);
  });

  it('removes the loop tick', () => {
    const removeSpy = vi.spyOn(loop, 'remove');
    const g = new Graph3D({ canvas: makeCanvas() });
    g.dispose();
    expect(removeSpy).toHaveBeenCalledOnce();
    removeSpy.mockRestore();
  });

  it('disposes the FrameBudget', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    const disposeSpy = vi.spyOn(g.frameBudget, 'dispose');
    g.dispose();
    expect(disposeSpy).toHaveBeenCalledOnce();
  });

  it('disposes the renderer', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    const rendererDispose = vi.spyOn(g.renderer, 'dispose');
    g.dispose();
    expect(rendererDispose).toHaveBeenCalledOnce();
  });

  it('disposes the WorkerPool when it was previously accessed', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    const pool = g.workers;
    const poolDispose = vi.spyOn(pool, 'dispose');
    g.dispose();
    expect(poolDispose).toHaveBeenCalledOnce();
  });

  it('does not throw when .workers was never accessed before dispose()', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    expect(() => g.dispose()).not.toThrow();
  });

  it('disposes all created scenes on dispose()', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    const scene = g.createScene('main');
    const spy = vi.spyOn(scene, 'dispose');
    g.dispose();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('activeScene is null after dispose()', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    g.createScene('main');
    g.setActiveScene('main');
    g.dispose();
    expect(g.activeScene).toBeNull();
  });
});

// ── createScene() ─────────────────────────────────────────────────────────────

describe('Graph3D.createScene()', () => {
  it('returns a GraphScene instance', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    expect(g.createScene('main')).toBeInstanceOf(GraphScene);
  });

  it('adds the scene to .scenes', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    const scene = g.createScene('main');
    expect(g.scenes.get('main')).toBe(scene);
  });

  it('throws TypeError when name is empty', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    expect(() => g.createScene('')).toThrow(TypeError);
  });

  it('throws when a scene with the same name already exists', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    g.createScene('main');
    expect(() => g.createScene('main')).toThrow(/already exists/);
  });

  it('allows multiple scenes with different names', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    g.createScene('a');
    g.createScene('b');
    expect(g.scenes.size).toBe(2);
  });

  it('throws after dispose()', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    g.dispose();
    expect(() => g.createScene('main')).toThrow(/disposed/);
  });
});

// ── setActiveScene() ──────────────────────────────────────────────────────────

describe('Graph3D.setActiveScene()', () => {
  it('accepts a scene name string', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    g.createScene('main');
    g.setActiveScene('main');
    expect(g.activeScene).toBeInstanceOf(GraphScene);
  });

  it('accepts a GraphScene instance', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    const scene = g.createScene('main');
    g.setActiveScene(scene);
    expect(g.activeScene).toBe(scene);
  });

  it('throws for an unknown scene name', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    expect(() => g.setActiveScene('nonexistent')).toThrow(/not found/);
  });

  it('error message lists available scenes', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    g.createScene('scene-a');
    expect(() => g.setActiveScene('nope')).toThrow(/scene-a/);
  });

  it('throws when the GraphScene is not owned by this instance', () => {
    const g1 = new Graph3D({ canvas: makeCanvas() });
    const g2 = new Graph3D({ canvas: makeCanvas() });
    const scene = g1.createScene('main');
    expect(() => g2.setActiveScene(scene)).toThrow(/not owned/);
  });

  it('throws TypeError for an invalid argument type', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    expect(() => g.setActiveScene(42)).toThrow(TypeError);
  });

  it('throws after dispose()', () => {
    const g = new Graph3D({ canvas: makeCanvas() });
    g.createScene('main');
    g.dispose();
    expect(() => g.setActiveScene('main')).toThrow(/disposed/);
  });
});

// ── Tick rendering ────────────────────────────────────────────────────────────

describe('Graph3D tick rendering', () => {
  it('skips render when no active scene is set', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const g = new Graph3D({ canvas: makeCanvas() });
    const tick = addSpy.mock.calls[0][0];
    tick(0.016);
    expect(g.renderer.three.render).not.toHaveBeenCalled();
  });

  it('calls renderer.three.render with scene.three and camera when active scene exists', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const g = new Graph3D({ canvas: makeCanvas() });
    const tick = addSpy.mock.calls[0][0];
    const scene = g.createScene('main');
    g.setActiveScene('main');
    tick(0.016);
    expect(g.renderer.three.render).toHaveBeenCalledWith(scene.three, scene.camera.three);
  });

  it('calls render once for the default single viewport', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const g = new Graph3D({ canvas: makeCanvas() });
    const tick = addSpy.mock.calls[0][0];
    g.createScene('main');
    g.setActiveScene('main');
    tick(0.016);
    expect(g.renderer.three.render).toHaveBeenCalledTimes(1);
  });

  it('calls render once per viewport when multiViewport is configured', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const g = new Graph3D({ canvas: makeCanvas() });
    const tick = addSpy.mock.calls[0][0];
    const scene = g.createScene('main');
    scene.setViewports([
      { x: 0, y: 0, width: 0.5, height: 1 },
      { x: 0.5, y: 0, width: 0.5, height: 1 },
    ]);
    g.setActiveScene('main');
    tick(0.016);
    expect(g.renderer.three.render).toHaveBeenCalledTimes(2);
  });

  it('resets scissor test after rendering', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const g = new Graph3D({ canvas: makeCanvas() });
    const tick = addSpy.mock.calls[0][0];
    g.createScene('main');
    g.setActiveScene('main');
    tick(0.016);
    expect(g.renderer.three.setScissorTest).toHaveBeenLastCalledWith(false);
  });
});
