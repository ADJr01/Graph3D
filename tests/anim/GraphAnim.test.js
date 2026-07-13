import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GraphAnim, anim as singleton } from '../../src/anim/GraphAnim.js';
import { GraphAnimTimeline } from '../../src/anim/GraphAnimTimeline.js';

// ── RAF mock helpers (mirrors tests/core/Graph3DLoop.test.js) ─────────────────

let rafCallback = null;
let rafIdCounter = 1;

function tick(now) {
  expect(rafCallback, 'tick() called but no RAF was scheduled').not.toBeNull();
  const cb = rafCallback;
  rafCallback = null;
  cb(now);
}

let engine;

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
  engine = new GraphAnim();
});

afterEach(() => {
  engine.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('singleton export', () => {
  it('exports anim as a GraphAnim instance', () => {
    expect(singleton).toBeInstanceOf(GraphAnim);
  });
});

describe('timeline()', () => {
  it('creates a GraphAnimTimeline bound to the target and registers it', () => {
    const target = { x: 0 };
    const tl = engine.timeline(target);
    expect(tl).toBeInstanceOf(GraphAnimTimeline);
    expect(engine.size).toBe(1);
  });

  it('subscribes to requestAnimationFrame on the first registered timeline', () => {
    engine.timeline({ x: 0 });
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
  });
});

describe('add() / remove()', () => {
  it('registers an externally-constructed timeline', () => {
    const tl = new GraphAnimTimeline({ x: 0 });
    expect(engine.add(tl)).toBe(tl);
    expect(engine.size).toBe(1);
  });

  it('throws for a non-timeline argument', () => {
    expect(() => engine.add({})).toThrow(TypeError);
  });

  it('does not double-count the same timeline added twice', () => {
    const tl = new GraphAnimTimeline({ x: 0 });
    engine.add(tl);
    engine.add(tl);
    expect(engine.size).toBe(1);
  });

  it('remove() unregisters a timeline and is a no-op if absent', () => {
    const tl = engine.timeline({ x: 0 });
    engine.remove(tl);
    expect(engine.size).toBe(0);
    expect(() => engine.remove(tl)).not.toThrow();
  });

  it('unsubscribes from the RAF loop once the last timeline is removed', () => {
    const tl = engine.timeline({ x: 0 });
    engine.remove(tl);
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('stays subscribed to the RAF loop while other timelines remain registered', () => {
    const tlA = engine.timeline({ x: 0 });
    engine.timeline({ x: 0 });
    engine.remove(tlA);
    expect(cancelAnimationFrame).not.toHaveBeenCalled();
    expect(engine.size).toBe(1);
  });
});

describe('tick advances every registered timeline', () => {
  it('drives update() on all registered timelines via one shared RAF tick', () => {
    const targetA = { x: 0 };
    const targetB = { x: 0 };
    const tlA = engine.timeline(targetA);
    const tlB = engine.timeline(targetB);
    tlA.to({ x: 10 }, { duration: 1 }).play();
    tlB.to({ x: 20 }, { duration: 1 }).play();

    tick(500); // Graph3DLoop's first tick has no prior timestamp, so delta = 0
    tick(1000); // delta = 0.5s

    expect(targetA.x).toBeCloseTo(5);
    expect(targetB.x).toBeCloseTo(10);
  });
});

describe('pause() / resume()', () => {
  it('pause() stops advancing registered timelines; resume() continues', () => {
    const target = { x: 0 };
    const tl = engine.timeline(target);
    tl.to({ x: 10 }, { duration: 1 }).play();

    tick(0);
    engine.pause();
    expect(engine.isPaused).toBe(true);
    tick(500); // paused: no advance
    expect(target.x).toBe(0);

    engine.resume();
    tick(1000); // delta = 0.5s from the last *ticked* timestamp (500)
    expect(target.x).toBeCloseTo(5);
  });
});

describe('dispose()', () => {
  it('unsubscribes from RAF and clears tracked timelines', () => {
    engine.timeline({ x: 0 });
    engine.dispose();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(engine.size).toBe(0);
  });

  it('is idempotent', () => {
    engine.timeline({ x: 0 });
    engine.dispose();
    expect(() => engine.dispose()).not.toThrow();
  });

  it('timeline()/add() throw after disposal', () => {
    engine.dispose();
    expect(() => engine.timeline({ x: 0 })).toThrow(Error);
    expect(() => engine.add(new GraphAnimTimeline({ x: 0 }))).toThrow(Error);
  });
});

describe('respectReducedMotion (Prompt 95)', () => {
  it('defaults to false', () => {
    expect(engine.respectReducedMotion).toBe(false);
  });

  it('throws for a non-boolean', () => {
    expect(() => {
      engine.respectReducedMotion = 'yes';
    }).toThrow(TypeError);
  });

  it('snaps a timeline to its end value on the very next tick, regardless of the real delta', () => {
    const target = { x: 0 };
    const tl = engine.timeline(target);
    tl.to({ x: 10 }, { duration: 5 }).play(); // a long 5s animation
    engine.respectReducedMotion = true;

    tick(16); // a single, tiny real frame delta
    expect(target.x).toBeCloseTo(10);
    expect(tl.isPlaying).toBe(false);
  });

  it('a timeline registered while reduced motion is already on still snaps immediately', () => {
    const target = { x: 0, y: 0 };
    engine.respectReducedMotion = true;
    const tl = engine.timeline(target);
    tl.to({ x: 10, y: -5 }, { duration: 2 }).play();

    tick(16);
    expect(target.x).toBeCloseTo(10);
    expect(target.y).toBeCloseTo(-5);
  });

  it('does not affect playback once turned back off', () => {
    const target = { x: 0 };
    engine.respectReducedMotion = true;
    const tl = engine.timeline(target);
    tl.to({ x: 10 }, { duration: 1 }).play();
    tick(16);
    expect(target.x).toBeCloseTo(10); // snapped

    engine.respectReducedMotion = false;
    const target2 = { x: 0 };
    const tl2 = engine.timeline(target2);
    tl2.to({ x: 10 }, { duration: 1 }).play();
    tick(516); // delta = 0.5s from the previous tick(16) timestamp
    expect(target2.x).toBeCloseTo(5); // animates normally
  });
});

describe('tween() (Prompt 95)', () => {
  it('calls onUpdate with the interpolated value over time', () => {
    const onUpdate = vi.fn();
    engine.tween(0, 10, { duration: 1 }, onUpdate);
    tick(0);
    tick(500); // delta = 0.5s
    expect(onUpdate).toHaveBeenCalledWith(5);
  });

  it('interpolates non-numeric values via compose/interpolate (colors)', () => {
    const onUpdate = vi.fn();
    engine.tween('#ff0000', '#0000ff', { duration: 1 }, onUpdate);
    tick(0);
    tick(500);
    expect(onUpdate).toHaveBeenCalledWith('#800080');
  });

  it('applies the configured easing', () => {
    const onUpdate = vi.fn();
    engine.tween(0, 10, { duration: 1, easing: 'easeInQuad' }, onUpdate);
    tick(0);
    tick(500); // easeInQuad(0.5) === 0.25
    expect(onUpdate).toHaveBeenCalledWith(2.5);
  });

  it('returns the underlying timeline, registered and playing', () => {
    const tl = engine.tween(0, 1, { duration: 1 }, () => {});
    expect(tl).toBeInstanceOf(GraphAnimTimeline);
    expect(tl.isPlaying).toBe(true);
    expect(engine.size).toBe(1);
  });

  it('throws for a non-function onUpdate', () => {
    expect(() => engine.tween(0, 1, {}, 'nope')).toThrow(TypeError);
  });

  it('throws for an unresolvable from/to pair', () => {
    expect(() => engine.tween(0, '#fff', {}, () => {})).toThrow(TypeError);
  });

  it('respects respectReducedMotion like any other registered timeline', () => {
    const onUpdate = vi.fn();
    engine.respectReducedMotion = true;
    engine.tween(0, 10, { duration: 5 }, onUpdate);
    tick(16);
    expect(onUpdate).toHaveBeenCalledWith(10);
  });
});

// ── timelines (Prompt 178) ───────────────────────────────────────────────────

describe('timelines', () => {
  it('is empty when no timeline is registered', () => {
    expect(engine.timelines).toEqual([]);
  });

  it('lists every registered timeline', () => {
    const a = engine.timeline({ x: 0 });
    const b = engine.timeline({ y: 0 });
    expect(engine.timelines).toEqual([a, b]);
  });

  it('returns a snapshot array, not a live view', () => {
    engine.timeline({ x: 0 });
    const snapshot = engine.timelines;
    engine.timeline({ y: 0 });
    expect(snapshot.length).toBe(1);
  });
});
