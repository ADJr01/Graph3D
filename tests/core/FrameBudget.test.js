import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FrameBudget } from '../../src/core/FrameBudget.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Attach a listener and return a spy that receives `event.detail`. */
function spyOn(budget) {
  const spy = vi.fn();
  budget.addEventListener('graph3d:slow-frame', (e) => spy(e.detail));
  return spy;
}

/** Record `n` frames all at `ms` milliseconds. */
function recordN(budget, n, ms, ctx = {}) {
  for (let i = 0; i < n; i++) budget.record(ms, ctx);
}

// ── Construction ──────────────────────────────────────────────────────────────

describe('constructor', () => {
  it('uses defaults when called with no args', () => {
    const b = new FrameBudget();
    expect(b.budgetMs).toBe(16);
    expect(b.windowSize).toBe(5);
  });

  it('accepts custom budgetMs and windowSize', () => {
    const b = new FrameBudget({ budgetMs: 33, windowSize: 3 });
    expect(b.budgetMs).toBe(33);
    expect(b.windowSize).toBe(3);
  });

  it('throws TypeError on non-positive budgetMs', () => {
    expect(() => new FrameBudget({ budgetMs: 0 })).toThrow(TypeError);
    expect(() => new FrameBudget({ budgetMs: -1 })).toThrow(TypeError);
    expect(() => new FrameBudget({ budgetMs: 'fast' })).toThrow(TypeError);
  });

  it('throws TypeError on non-positive-integer windowSize', () => {
    expect(() => new FrameBudget({ windowSize: 0 })).toThrow(TypeError);
    expect(() => new FrameBudget({ windowSize: 1.5 })).toThrow(TypeError);
    expect(() => new FrameBudget({ windowSize: -3 })).toThrow(TypeError);
  });
});

// ── record ────────────────────────────────────────────────────────────────────

describe('record', () => {
  it('throws on negative frameMs', () => {
    const b = new FrameBudget();
    expect(() => b.record(-1)).toThrow(TypeError);
  });

  it('throws on non-number frameMs', () => {
    const b = new FrameBudget();
    expect(() => b.record('fast')).toThrow(TypeError);
  });

  it('does not emit before windowSize consecutive slow frames', () => {
    const b = new FrameBudget({ budgetMs: 16, windowSize: 5 });
    const spy = spyOn(b);
    recordN(b, 4, 20); // 4 slow frames, threshold is 5
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits exactly once when windowSize consecutive slow frames occur', () => {
    const b = new FrameBudget({ budgetMs: 16, windowSize: 5 });
    const spy = spyOn(b);
    recordN(b, 5, 20);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('resets counter on a fast frame — non-consecutive slow frames never emit', () => {
    const b = new FrameBudget({ budgetMs: 16, windowSize: 3 });
    const spy = spyOn(b);
    b.record(20); // slow
    b.record(20); // slow
    b.record(10); // fast — resets
    b.record(20); // slow
    b.record(20); // slow
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits again after the counter resets post-emit', () => {
    const b = new FrameBudget({ budgetMs: 16, windowSize: 3 });
    const spy = spyOn(b);
    recordN(b, 3, 20); // first burst → emit + reset
    recordN(b, 3, 20); // second burst → emit again
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('passes context fields through to event detail', () => {
    const b = new FrameBudget({ budgetMs: 16, windowSize: 2 });
    const spy = spyOn(b);
    const ctx = { chartId: 'bar-1', drawCalls: 55, triangleCount: 90000, meshCount: 7 };
    recordN(b, 2, 20, ctx);
    const detail = spy.mock.calls[0][0];
    expect(detail.chartId).toBe('bar-1');
    expect(detail.drawCalls).toBe(55);
    expect(detail.triangleCount).toBe(90000);
    expect(detail.meshCount).toBe(7);
  });

  it('detail defaults context fields to 0/null when omitted', () => {
    const b = new FrameBudget({ budgetMs: 16, windowSize: 2 });
    const spy = spyOn(b);
    recordN(b, 2, 20);
    const detail = spy.mock.calls[0][0];
    expect(detail.chartId).toBeNull();
    expect(detail.drawCalls).toBe(0);
    expect(detail.triangleCount).toBe(0);
    expect(detail.meshCount).toBe(0);
  });

  it('detail.fps is 1000 / avgMs of the window', () => {
    const b = new FrameBudget({ budgetMs: 16, windowSize: 2 });
    const spy = spyOn(b);
    b.record(20); // first slow
    b.record(30); // second slow → emit; avg = 25ms → fps = 40
    const { fps } = spy.mock.calls[0][0];
    expect(fps).toBeCloseTo(40, 5);
  });

  it('throws after dispose', () => {
    const b = new FrameBudget();
    b.dispose();
    expect(() => b.record(10)).toThrow(/disposed/);
  });
});

// ── reset ─────────────────────────────────────────────────────────────────────

describe('reset', () => {
  it('clears consecutive count so a subsequent burst must start from zero', () => {
    const b = new FrameBudget({ budgetMs: 16, windowSize: 3 });
    const spy = spyOn(b);
    b.record(20);
    b.record(20); // 2 consecutive slow
    b.reset();    // wipe
    b.record(20);
    b.record(20); // only 2 consecutive again — no emit
    expect(spy).not.toHaveBeenCalled();
  });

  it('throws after dispose', () => {
    const b = new FrameBudget();
    b.dispose();
    expect(() => b.reset()).toThrow(/disposed/);
  });
});

// ── dispose ───────────────────────────────────────────────────────────────────

describe('dispose', () => {
  it('is idempotent — double-dispose does not throw', () => {
    const b = new FrameBudget();
    b.dispose();
    expect(() => b.dispose()).not.toThrow();
  });
});

// ── windowSize = 1 edge case ──────────────────────────────────────────────────

describe('windowSize = 1', () => {
  it('emits on every single slow frame', () => {
    const b = new FrameBudget({ budgetMs: 16, windowSize: 1 });
    const spy = spyOn(b);
    b.record(20);
    b.record(20);
    b.record(20);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('fps equals 1000 / frameMs when window is 1', () => {
    const b = new FrameBudget({ budgetMs: 16, windowSize: 1 });
    const spy = spyOn(b);
    b.record(25);
    expect(spy.mock.calls[0][0].fps).toBeCloseTo(40, 5);
  });
});
