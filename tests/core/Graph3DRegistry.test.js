import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Graph3DRegistry, registry as singleton } from '../../src/core/Graph3DRegistry.js';

/** Minimal fake Graph3D instance. */
function makeInst() {
  return { dispose: vi.fn(), pause: vi.fn(), resume: vi.fn() };
}

let reg;
beforeEach(() => { reg = new Graph3DRegistry(); });

describe('register', () => {
  it('throws on non-object', () => {
    expect(() => reg.register(42)).toThrow(TypeError);
    expect(() => reg.register(null)).toThrow(TypeError);
    expect(() => reg.register('x')).toThrow(TypeError);
  });

  it('accepts an object', () => {
    const inst = makeInst();
    reg.register(inst);
    expect(reg.all()).toContain(inst);
  });

  it('is idempotent — double-register does not duplicate', () => {
    const inst = makeInst();
    reg.register(inst);
    reg.register(inst);
    expect(reg.all()).toHaveLength(1);
  });
});

describe('unregister', () => {
  it('removes the instance', () => {
    const inst = makeInst();
    reg.register(inst);
    reg.unregister(inst);
    expect(reg.all()).toHaveLength(0);
  });

  it('is a no-op for unregistered instance', () => {
    expect(() => reg.unregister(makeInst())).not.toThrow();
  });
});

describe('all', () => {
  it('returns a snapshot — mutation does not affect registry', () => {
    const inst = makeInst();
    reg.register(inst);
    reg.all().pop();
    expect(reg.all()).toHaveLength(1);
  });
});

describe('disposeAll', () => {
  it('calls dispose on every instance', () => {
    const a = makeInst(), b = makeInst();
    reg.register(a);
    reg.register(b);
    reg.disposeAll();
    expect(a.dispose).toHaveBeenCalledOnce();
    expect(b.dispose).toHaveBeenCalledOnce();
  });

  it('clears the registry', () => {
    reg.register(makeInst());
    reg.disposeAll();
    expect(reg.all()).toHaveLength(0);
  });

  it('re-throws after attempting all disposals', () => {
    const boom = { dispose: vi.fn(() => { throw new Error('boom'); }) };
    const ok   = makeInst();
    reg.register(boom);
    reg.register(ok);
    expect(() => reg.disposeAll()).toThrow('boom');
    // ok was still attempted
    expect(ok.dispose).toHaveBeenCalledOnce();
    // registry is cleared even after throw
    expect(reg.all()).toHaveLength(0);
  });

  it('skips instances without dispose', () => {
    reg.register({});
    expect(() => reg.disposeAll()).not.toThrow();
  });
});

describe('pauseAll / resumeAll', () => {
  it('calls pause/resume on every instance', () => {
    const a = makeInst(), b = makeInst();
    reg.register(a);
    reg.register(b);
    reg.pauseAll();
    expect(a.pause).toHaveBeenCalledOnce();
    expect(b.pause).toHaveBeenCalledOnce();
    reg.resumeAll();
    expect(a.resume).toHaveBeenCalledOnce();
    expect(b.resume).toHaveBeenCalledOnce();
  });

  it('skips instances without pause/resume', () => {
    reg.register({});
    expect(() => { reg.pauseAll(); reg.resumeAll(); }).not.toThrow();
  });
});

describe('panicDispose', () => {
  it('disposes all and clears registry', () => {
    const a = makeInst(), b = makeInst();
    reg.register(a);
    reg.register(b);
    reg.panicDispose();
    expect(a.dispose).toHaveBeenCalledOnce();
    expect(b.dispose).toHaveBeenCalledOnce();
    expect(reg.all()).toHaveLength(0);
  });

  it('does NOT throw even when dispose throws', () => {
    reg.register({ dispose() { throw new Error('bang'); } });
    expect(() => reg.panicDispose()).not.toThrow();
    expect(reg.all()).toHaveLength(0);
  });
});

describe('singleton', () => {
  it('is a Graph3DRegistry', () => {
    expect(singleton).toBeInstanceOf(Graph3DRegistry);
  });
});
