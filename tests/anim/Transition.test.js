import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Transition } from '../../src/anim/Transition.js';
import { anim } from '../../src/anim/GraphAnim.js';
import { GraphAnimTimeline } from '../../src/anim/GraphAnimTimeline.js';

// ── RAF mock helpers (mirrors tests/core/Graph3DLoop.test.js) ─────────────────
// Transition.to() auto-registers with the shared `anim`/`loop` singletons, so
// RAF must be mocked to keep tests deterministic (no real async tick firing
// mid-test or bleeding into a later test).

let rafCallback = null;
let rafIdCounter = 1;

function tick(now) {
  expect(rafCallback, 'tick() called but no RAF was scheduled').not.toBeNull();
  const cb = rafCallback;
  rafCallback = null;
  cb(now);
}

let registered = [];

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
  registered = [];
});

afterEach(() => {
  for (const tl of registered) anim.remove(tl);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeTarget() {
  return { position: { x: 0, y: 0, z: 0 }, opacity: 1 };
}

describe('constructor', () => {
  it('throws for a non-object target', () => {
    expect(() => new Transition(null)).toThrow(TypeError);
    expect(() => new Transition(5)).toThrow(TypeError);
  });
});

describe('duration / delay / easing / on validation', () => {
  it('duration() throws for a negative number', () => {
    expect(() => new Transition(makeTarget()).duration(-1)).toThrow(TypeError);
  });

  it('delay() accepts a number or a function, throws otherwise', () => {
    const t = new Transition(makeTarget());
    expect(() => t.delay(100)).not.toThrow();
    expect(() => t.delay(() => 50)).not.toThrow();
    expect(() => t.delay('nope')).toThrow(TypeError);
  });

  it('easing() throws for an unresolvable name', () => {
    expect(() => new Transition(makeTarget()).easing('not-a-curve')).toThrow(TypeError);
  });

  it("on() throws for an unrecognized event or a non-function handler; accepts 'interrupt' (Prompt 93)", () => {
    const t = new Transition(makeTarget());
    expect(() => t.on('bogus', () => {})).toThrow(TypeError);
    expect(() => t.on('start', 'nope')).toThrow(TypeError);
    expect(() => t.on('interrupt', () => {})).not.toThrow();
  });

  it('every builder method returns this for chaining', () => {
    const t = new Transition(makeTarget());
    expect(t.duration(1)).toBe(t);
    expect(t.delay(0)).toBe(t);
    expect(t.easing('linear')).toBe(t);
    expect(t.on('start', () => {})).toBe(t);
  });
});

describe('to()', () => {
  it('returns the underlying GraphAnimTimeline, registered with anim and playing', () => {
    const tl = new Transition(makeTarget()).duration(1000).to({ 'position.y': 10 });
    registered.push(tl);
    expect(tl).toBeInstanceOf(GraphAnimTimeline);
    expect(tl.isPlaying).toBe(true);
  });

  it('animates over the configured duration (ms -> seconds)', () => {
    const target = makeTarget();
    const tl = new Transition(target).duration(1000).to({ 'position.y': 10 });
    registered.push(tl);
    tl.update(0.5);
    expect(target.position.y).toBeCloseTo(5);
  });

  it('applies the configured easing', () => {
    const target = makeTarget();
    const tl = new Transition(target).duration(1000).easing('easeInQuad').to({ 'position.y': 10 });
    registered.push(tl);
    tl.update(0.5); // easeInQuad(0.5) === 0.25
    expect(target.position.y).toBeCloseTo(2.5);
  });

  it('a zero delay fires start handlers synchronously', () => {
    const onStart = vi.fn();
    const tl = new Transition(makeTarget()).duration(1000).on('start', onStart).to({ opacity: 0 });
    registered.push(tl);
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('a positive delay fires start handlers once playback reaches it', () => {
    const onStart = vi.fn();
    const target = makeTarget();
    const tl = new Transition(target).duration(1000).delay(500).on('start', onStart).to({ opacity: 0 });
    registered.push(tl);
    expect(onStart).not.toHaveBeenCalled();
    tl.update(0.4); // still within the 0.5s delay
    expect(onStart).not.toHaveBeenCalled();
    tl.update(0.2); // crosses the delay mark
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('fires end handlers on completion', () => {
    const onEnd = vi.fn();
    const tl = new Transition(makeTarget()).duration(1000).on('end', onEnd).to({ opacity: 0 });
    registered.push(tl);
    tl.update(1);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('throws for non-object props', () => {
    expect(() => new Transition(makeTarget()).to(null)).toThrow(TypeError);
  });

  it('throws if a delay function resolves to a negative number', () => {
    const t = new Transition(makeTarget()).delay(() => -1);
    expect(() => t.to({ opacity: 0 })).toThrow(TypeError);
  });

  it('is driven by the shared RAF loop once registered with anim', () => {
    const target = makeTarget();
    const tl = new Transition(target).duration(1000).to({ 'position.y': 10 });
    registered.push(tl);
    tick(0);
    tick(500); // delta = 0.5s
    expect(target.position.y).toBeCloseTo(5);
  });
});

// ── Interrupt semantics (Prompt 93) ─────────────────────────────────────────

describe('interrupt semantics', () => {
  it('a later to() call on the same target+path interrupts the earlier one and continues from its current value', () => {
    const target = makeTarget();
    const onInterrupt = vi.fn();
    const tl1 = new Transition(target).duration(1000).on('interrupt', onInterrupt).to({ 'position.y': 10 });
    registered.push(tl1);
    tl1.update(0.5);
    expect(target.position.y).toBeCloseTo(5);

    const tl2 = new Transition(target).duration(1000).to({ 'position.y': 20 });
    registered.push(tl2);
    expect(onInterrupt).toHaveBeenCalledOnce();

    tl1.update(0.5); // tl1 no longer touches position.y — this is a no-op for it now
    expect(target.position.y).toBeCloseTo(5);

    tl2.update(0.5); // tl2 picks up from the current interpolated value (5), not tl1's original start (0)
    expect(target.position.y).toBeCloseTo(12.5);
  });

  it("does not fire 'end' on a transition that was interrupted", () => {
    const target = makeTarget();
    const onEnd = vi.fn();
    const tl1 = new Transition(target).duration(1000).on('end', onEnd).to({ 'position.y': 10 });
    registered.push(tl1);
    const tl2 = new Transition(target).duration(1000).to({ 'position.y': 20 });
    registered.push(tl2);

    tl1.update(1); // tl1's own clock still completes even though its track was removed
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("does not fire 'start' on a transition interrupted before its delay elapses", () => {
    const target = makeTarget();
    const onStart = vi.fn();
    const tl1 = new Transition(target).duration(1000).delay(500).on('start', onStart).to({ 'position.y': 10 });
    registered.push(tl1);
    const tl2 = new Transition(target).duration(1000).to({ 'position.y': 20 });
    registered.push(tl2);

    tl1.update(1); // would cross the 0.5s delay mark, but this transition was already interrupted
    expect(onStart).not.toHaveBeenCalled();
  });

  it('two transitions on different paths of the same target do not interrupt each other', () => {
    const target = makeTarget();
    const onInterrupt = vi.fn();
    const tl1 = new Transition(target).duration(1000).on('interrupt', onInterrupt).to({ 'position.y': 10 });
    registered.push(tl1);
    const tl2 = new Transition(target).duration(1000).to({ opacity: 0 });
    registered.push(tl2);

    expect(onInterrupt).not.toHaveBeenCalled();
    tl1.update(0.5);
    expect(target.position.y).toBeCloseTo(5); // tl1 still animating normally
  });

  it('transitions on different targets never interrupt each other', () => {
    const targetA = makeTarget();
    const targetB = makeTarget();
    const onInterruptA = vi.fn();
    const tlA = new Transition(targetA).duration(1000).on('interrupt', onInterruptA).to({ 'position.y': 10 });
    registered.push(tlA);
    const tlB = new Transition(targetB).duration(1000).to({ 'position.y': 20 });
    registered.push(tlB);

    expect(onInterruptA).not.toHaveBeenCalled();
  });

  it('a transition that touches multiple paths only fires interrupt once even if more than one path is superseded', () => {
    const target = makeTarget();
    const onInterrupt = vi.fn();
    const tl1 = new Transition(target)
      .duration(1000)
      .on('interrupt', onInterrupt)
      .to({ 'position.y': 10, opacity: 0 });
    registered.push(tl1);
    const tl2 = new Transition(target).duration(1000).to({ 'position.y': 20, opacity: 1 });
    registered.push(tl2);

    expect(onInterrupt).toHaveBeenCalledOnce();
  });
});

// ── runningOn() / cancelAllOn() (Prompt 96) ─────────────────────────────────

describe('runningOn() / cancelAllOn()', () => {
  it('runningOn() counts active dot-paths on a target across separate Transition instances', () => {
    const target = makeTarget();
    expect(Transition.runningOn(target)).toBe(0);

    const tl1 = new Transition(target).duration(1000).to({ 'position.y': 10 });
    registered.push(tl1);
    expect(Transition.runningOn(target)).toBe(1);

    const tl2 = new Transition(target).duration(1000).to({ opacity: 0 });
    registered.push(tl2);
    expect(Transition.runningOn(target)).toBe(2);
  });

  it('runningOn() drops to 0 once every transition on the target completes', () => {
    const target = makeTarget();
    const tl = new Transition(target).duration(1000).to({ 'position.y': 10 });
    registered.push(tl);
    tl.update(1);
    expect(Transition.runningOn(target)).toBe(0);
  });

  it('runningOn() is 0 for a target with no transitions ever created against it', () => {
    expect(Transition.runningOn(makeTarget())).toBe(0);
  });

  it("cancelAllOn() stops every active transition on a target without firing 'end' or 'interrupt'", () => {
    const target = makeTarget();
    const onEnd = vi.fn();
    const onInterrupt = vi.fn();
    const tl1 = new Transition(target).duration(1000).on('end', onEnd).on('interrupt', onInterrupt).to({ 'position.y': 10 });
    const tl2 = new Transition(target).duration(1000).to({ opacity: 0 });

    const stopped = Transition.cancelAllOn(target);
    expect(stopped).toBe(2);
    expect(Transition.runningOn(target)).toBe(0);

    tl1.update(1); // frozen — cancelAllOn already unregistered it from anim, but update() still works standalone
    expect(onEnd).not.toHaveBeenCalled();
    expect(onInterrupt).not.toHaveBeenCalled();
    void tl2;
  });

  it('cancelAllOn() returns 0 and is a no-op for a target with nothing running', () => {
    expect(Transition.cancelAllOn(makeTarget())).toBe(0);
  });

  it('cancelAllOn() only affects the given target, not others', () => {
    const targetA = makeTarget();
    const targetB = makeTarget();
    const tlA = new Transition(targetA).duration(1000).to({ 'position.y': 10 });
    registered.push(tlA);
    new Transition(targetB).duration(1000).to({ 'position.y': 10 });

    Transition.cancelAllOn(targetA);
    expect(Transition.runningOn(targetB)).toBe(1);
    Transition.cancelAllOn(targetB);
  });
});
