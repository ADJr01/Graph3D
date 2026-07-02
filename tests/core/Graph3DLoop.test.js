import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Graph3DLoop, loop as singleton } from '../../src/core/Graph3DLoop.js';

// ── RAF mock helpers ──────────────────────────────────────────────────────────

let rafCallback = null;
let rafIdCounter = 1;

function tick(now) {
  expect(rafCallback, 'tick() called but no RAF was scheduled').not.toBeNull();
  const cb = rafCallback;
  rafCallback = null;
  cb(now);
}

// ── Test lifecycle ────────────────────────────────────────────────────────────

let subject;

beforeEach(() => {
  rafCallback = null;
  rafIdCounter = 1;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb) => {
      rafCallback = cb;
      return rafIdCounter++;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn(() => { rafCallback = null; }));
  subject = new Graph3DLoop();
});

afterEach(() => {
  subject.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Singleton export ──────────────────────────────────────────────────────────

describe('singleton export', () => {
  it('exports a loop instance of Graph3DLoop', () => {
    expect(singleton).toBeInstanceOf(Graph3DLoop);
  });
});

// ── Initial state ─────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('isRunning is false', () => {
    expect(subject.isRunning).toBe(false);
  });

  it('does not schedule a RAF on construction', () => {
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });
});

// ── add / remove ──────────────────────────────────────────────────────────────

describe('add', () => {
  it('schedules a RAF on the first add', () => {
    subject.add(vi.fn());
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
  });

  it('sets isRunning true', () => {
    subject.add(vi.fn());
    expect(subject.isRunning).toBe(true);
  });

  it('does not schedule a second RAF when a second callback is added', () => {
    subject.add(vi.fn());
    subject.add(vi.fn());
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
  });

  it('throws TypeError for a non-function argument', () => {
    expect(() => subject.add(42)).toThrow(TypeError);
    expect(() => subject.add(42)).toThrow(/expected a function/);
  });

  it('throws TypeError with the received type in the message', () => {
    expect(() => subject.add('cb')).toThrow(/received string/);
  });
});

describe('remove', () => {
  it('stops the loop when the last callback is removed', () => {
    const cb = vi.fn();
    subject.add(cb);
    subject.remove(cb);
    expect(subject.isRunning).toBe(false);
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('does not stop if other callbacks remain', () => {
    const a = vi.fn();
    const b = vi.fn();
    subject.add(a);
    subject.add(b);
    subject.remove(a);
    expect(subject.isRunning).toBe(true);
  });

  it('is safe to call with an unregistered callback', () => {
    expect(() => subject.remove(vi.fn())).not.toThrow();
  });
});

// ── start / stop ──────────────────────────────────────────────────────────────

describe('start', () => {
  it('starts the loop and schedules a RAF', () => {
    subject.start();
    expect(subject.isRunning).toBe(true);
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
  });

  it('is idempotent — second call does nothing', () => {
    subject.start();
    subject.start();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
  });
});

describe('stop', () => {
  it('cancels the pending RAF and sets isRunning false', () => {
    subject.start();
    subject.stop();
    expect(subject.isRunning).toBe(false);
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('is idempotent — second call does nothing', () => {
    subject.start();
    subject.stop();
    subject.stop();
    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
  });
});

// ── Tick behaviour ────────────────────────────────────────────────────────────

describe('tick', () => {
  it('invokes the callback on each frame', () => {
    const cb = vi.fn();
    subject.add(cb);
    tick(1000);
    tick(1016);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('passes delta=0 on the very first tick', () => {
    const cb = vi.fn();
    subject.add(cb);
    tick(1000);
    expect(cb.mock.calls[0][0]).toBe(0);
  });

  it('passes delta in seconds (not milliseconds)', () => {
    const cb = vi.fn();
    subject.add(cb);
    tick(1000);
    tick(1016); // 16 ms gap
    expect(cb.mock.calls[1][0]).toBeCloseTo(0.016);
  });

  it('passes elapsed as the running sum of deltas', () => {
    const cb = vi.fn();
    subject.add(cb);
    tick(0);
    tick(1000); // 1 s
    tick(1500); // 0.5 s
    expect(cb.mock.calls[1][1]).toBeCloseTo(1.0);
    expect(cb.mock.calls[2][1]).toBeCloseTo(1.5);
  });

  it('invokes all registered callbacks per frame', () => {
    const a = vi.fn();
    const b = vi.fn();
    subject.add(a);
    subject.add(b);
    tick(0);
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('schedules the next RAF after each tick while running', () => {
    subject.add(vi.fn());
    tick(0);
    // first RAF fired during tick; a second must be scheduled for the next frame
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
  });

  it('does not reschedule after stop is called mid-tick', () => {
    subject.add(() => subject.stop()); // stop from inside a callback
    tick(0);
    // Only 1 RAF was ever scheduled (the one from add); none after tick
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it('delta resets to 0 after stop+start', () => {
    const cb = vi.fn();
    subject.add(cb);
    tick(0);
    tick(1000);
    subject.stop();
    subject.start();
    tick(5000); // large gap — must NOT appear as 4 s delta
    expect(cb.mock.calls[2][0]).toBe(0);
  });
});

// ── Visibility change ─────────────────────────────────────────────────────────

describe('visibilitychange', () => {
  it('suspends the RAF when the tab is hidden', () => {
    subject.add(vi.fn());
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(subject.isRunning).toBe(true); // loop is still "wanted", just suspended
  });

  it('resumes the RAF when the tab becomes visible again', () => {
    subject.add(vi.fn());

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    const callsBefore = requestAnimationFrame.mock.calls.length;

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(requestAnimationFrame).toHaveBeenCalledTimes(callsBefore + 1);
  });

  it('does not schedule a RAF on show if the loop was stopped', () => {
    subject.add(vi.fn());
    subject.stop();

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    const callsBefore = requestAnimationFrame.mock.calls.length;

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(requestAnimationFrame).toHaveBeenCalledTimes(callsBefore);
  });

  it('first tick after resume gets delta=0 (no spike from hidden gap)', () => {
    const cb = vi.fn();
    subject.add(cb);
    tick(0);
    tick(1000);

    // hide and show — simulates a long tab sleep
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));

    tick(60000); // 59 s "gap" — must appear as delta=0
    expect(cb.mock.calls[2][0]).toBe(0);
  });
});

// ── dispose ───────────────────────────────────────────────────────────────────

describe('dispose', () => {
  it('stops the loop', () => {
    subject.add(vi.fn());
    subject.dispose();
    expect(subject.isRunning).toBe(false);
  });

  it('clears all callbacks (no invocations after dispose)', () => {
    const cb = vi.fn();
    subject.add(cb);
    subject.dispose();
    // manually fire any leftover RAF to confirm cb is not called
    if (rafCallback) rafCallback(0);
    expect(cb).not.toHaveBeenCalled();
  });

  it('removes the visibilitychange listener (no resume after dispose)', () => {
    subject.add(vi.fn());
    subject.dispose();
    const callsBefore = requestAnimationFrame.mock.calls.length;

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(requestAnimationFrame).toHaveBeenCalledTimes(callsBefore);
  });

  it('is idempotent — second call does not throw', () => {
    subject.add(vi.fn());
    subject.dispose();
    expect(() => subject.dispose()).not.toThrow();
  });
});
