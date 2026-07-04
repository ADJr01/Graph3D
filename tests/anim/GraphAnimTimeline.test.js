import { describe, it, expect, vi } from 'vitest';
import { GraphAnimTimeline } from '../../src/anim/GraphAnimTimeline.js';

function makeTarget() {
  return { position: { x: 0, y: 0, z: 0 }, opacity: 1 };
}

describe('constructor', () => {
  it('throws for a non-object target', () => {
    expect(() => new GraphAnimTimeline(null)).toThrow(TypeError);
    expect(() => new GraphAnimTimeline(5)).toThrow(TypeError);
  });

  it('starts with zero duration and time', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    expect(tl.duration).toBe(0);
    expect(tl.time).toBe(0);
    expect(tl.isPlaying).toBe(false);
  });

  it('a timeline with no tracks finishes immediately on the first update()', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    tl.play();
    tl.update(0.1);
    expect(tl.isPlaying).toBe(false);
  });
});

describe('to / from', () => {
  it('to() reads the current value as the start and animates toward the given value', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    tl.to({ 'position.y': 10 }, { duration: 1 }).play();
    tl.update(0.5);
    expect(target.position.y).toBeCloseTo(5);
  });

  it('from() reads the current value as the end and animates from the given value', () => {
    const target = makeTarget();
    target.position.y = 10;
    const tl = new GraphAnimTimeline(target);
    tl.from({ 'position.y': 0 }, { duration: 1 }).play();
    tl.update(0.5);
    expect(target.position.y).toBeCloseTo(5);
    tl.update(0.5);
    expect(target.position.y).toBeCloseTo(10);
  });

  it('multiple props in one to() run in parallel', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    tl.to({ 'position.y': 10, opacity: 0 }, { duration: 1 }).play();
    tl.update(0.5);
    expect(target.position.y).toBeCloseTo(5);
    expect(target.opacity).toBeCloseTo(0.5);
  });

  it('two separate to() calls without then() run in parallel (same duration)', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    tl.to({ 'position.y': 10 }, { duration: 1 });
    tl.to({ opacity: 0 }, { duration: 1 });
    expect(tl.duration).toBe(1);
  });

  it('throws for non-object props', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    expect(() => tl.to(null)).toThrow(TypeError);
    expect(() => tl.to({})).toThrow(TypeError);
  });

  it('throws for a negative duration or delay', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    expect(() => tl.to({ opacity: 0 }, { duration: -1 })).toThrow(TypeError);
    expect(() => tl.to({ opacity: 0 }, { delay: -1 })).toThrow(TypeError);
  });

  it('throws for an unresolvable easing', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    expect(() => tl.to({ opacity: 0 }, { easing: 'not-a-curve' })).toThrow(TypeError);
  });

  it('a zero-duration track holds "from" until its start, then snaps to "to"', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    tl.to({ opacity: 0.2 }, { duration: 0, delay: 0.5 }).play();
    tl.update(0.25); // before the track's start: still at "from"
    expect(target.opacity).toBe(1);
    tl.update(0.25); // reaches the track's start: snaps to "to"
    expect(target.opacity).toBe(0.2);
  });
});

describe('then() sequencing', () => {
  it('sequences a group after the previous group finishes', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    tl.to({ 'position.y': 10 }, { duration: 1 })
      .then()
      .to({ opacity: 0 }, { duration: 1 });
    expect(tl.duration).toBe(2);
    tl.play();
    tl.update(1); // finishes the first group only
    expect(target.position.y).toBeCloseTo(10);
    expect(target.opacity).toBe(1);
    tl.update(1); // finishes the second group
    expect(target.opacity).toBeCloseTo(0);
  });
});

describe('wait()', () => {
  it('inserts a gap before the next group starts', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    tl.to({ 'position.y': 10 }, { duration: 1 }).wait(1).to({ opacity: 0 }, { duration: 1 });
    expect(tl.duration).toBe(3);
    tl.play();
    tl.update(1.5); // mid-gap
    expect(target.opacity).toBe(1);
  });

  it('throws for a negative wait duration', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    expect(() => tl.wait(-1)).toThrow(TypeError);
  });
});

describe('play / pause / stop / reverse / seek', () => {
  it('update() is a no-op while not playing', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    tl.to({ 'position.y': 10 }, { duration: 1 });
    tl.update(0.5);
    expect(target.position.y).toBe(0);
  });

  it('pause() freezes the position', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    tl.to({ 'position.y': 10 }, { duration: 1 }).play();
    tl.update(0.5);
    tl.pause();
    tl.update(0.5);
    expect(target.position.y).toBeCloseTo(5);
  });

  it('stop() resets to t=0 and snaps the target back', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    tl.to({ 'position.y': 10 }, { duration: 1 }).play();
    tl.update(0.5);
    tl.stop();
    expect(target.position.y).toBe(0);
    expect(tl.isPlaying).toBe(false);
    expect(tl.time).toBe(0);
  });

  it('reverse() flips playback direction', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    tl.to({ 'position.y': 10 }, { duration: 1 }).play();
    tl.update(1); // reaches the end and completes (loopCount defaults to 1)
    tl.play().reverse();
    tl.update(0.5);
    expect(target.position.y).toBeCloseTo(5);
  });

  it('seek() jumps to an absolute time without changing play state', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    tl.to({ 'position.y': 10 }, { duration: 1 });
    tl.seek(0.25);
    expect(target.position.y).toBeCloseTo(2.5);
    expect(tl.isPlaying).toBe(false);
  });

  it('seek() clamps to [0, duration]', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    tl.to({ 'position.y': 10 }, { duration: 1 });
    tl.seek(5);
    expect(tl.time).toBe(1);
    tl.seek(-5);
    expect(tl.time).toBe(0);
  });

  it('throws for a non-finite seek time', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    expect(() => tl.seek(NaN)).toThrow(TypeError);
  });
});

describe('loop() playing backward', () => {
  it('restart wraps a reversed pass back to the end and keeps animating', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    tl.to({ 'position.y': 10 }, { duration: 1 }).loop(3, 'restart').play().reverse();
    tl.update(0.5); // underflows by 0.5s, wraps back to 0.5s before the end
    expect(target.position.y).toBeCloseTo(5);
    expect(tl.isPlaying).toBe(true);
  });

  it('pingpong flips a reversed pass back to forward', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    tl.to({ 'position.y': 10 }, { duration: 1 }).loop(3, 'pingpong').play().reverse();
    tl.update(0.5); // underflows by 0.5s, flips to forward 0.5s in
    expect(target.position.y).toBeCloseTo(5);
    expect(tl.isPlaying).toBe(true);
  });

  it('finishes and fires onComplete when a reversed pass underflows past 0 on the last loop', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    const onComplete = vi.fn();
    tl.to({ 'position.y': 10 }, { duration: 1 }).onComplete(onComplete).play();
    tl.update(1); // completes the single forward pass (1st onComplete)
    tl.play().reverse();
    tl.update(1); // underflows exactly to 0 with no loops left (2nd onComplete)
    expect(target.position.y).toBe(0);
    expect(tl.isPlaying).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(2);
  });
});

describe('loop()', () => {
  it('restart wraps back to t=0 and keeps animating', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    tl.to({ 'position.y': 10 }, { duration: 1 }).loop(2, 'restart').play();
    tl.update(1.25); // past the first pass, 0.25s into the second
    expect(target.position.y).toBeCloseTo(2.5);
    expect(tl.isPlaying).toBe(true);
  });

  it('pingpong reverses direction at the boundary', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    tl.to({ 'position.y': 10 }, { duration: 1 }).loop(2, 'pingpong').play();
    tl.update(1.25); // overshoots by 0.25s into the reversed second pass
    expect(target.position.y).toBeCloseTo(7.5);
  });

  it('stops after the configured pass count and fires onComplete once', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    const onComplete = vi.fn();
    tl.to({ 'position.y': 10 }, { duration: 1 }).loop(2, 'restart').onComplete(onComplete).play();
    tl.update(1);
    tl.update(1);
    expect(tl.isPlaying).toBe(false);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('throws for a non-positive count or an invalid mode', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    expect(() => tl.loop(0)).toThrow(TypeError);
    expect(() => tl.loop(2, 'bogus')).toThrow(TypeError);
  });
});

describe('onUpdate / onComplete', () => {
  it('onUpdate fires on every update() tick while playing', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    const onUpdate = vi.fn();
    tl.to({ opacity: 0 }, { duration: 1 }).onUpdate(onUpdate).play();
    tl.update(0.1);
    tl.update(0.1);
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it('onComplete fires exactly once when a single (non-looping) pass finishes', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    const onComplete = vi.fn();
    tl.to({ opacity: 0 }, { duration: 1 }).onComplete(onComplete).play();
    tl.update(1);
    tl.update(1); // already stopped; must not fire again
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('throws for a non-function handler', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    expect(() => tl.onUpdate('nope')).toThrow(TypeError);
    expect(() => tl.onComplete('nope')).toThrow(TypeError);
  });
});

describe('interruptPath() (Prompt 93)', () => {
  it('removes only the tracks matching path, leaving other paths animating', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    tl.to({ 'position.y': 10, opacity: 0 }, { duration: 1 }).play();
    expect(tl.interruptPath('position.y')).toBe(true);
    tl.update(0.5);
    expect(target.position.y).toBe(0); // no longer animated
    expect(target.opacity).toBeCloseTo(0.5); // still animated
  });

  it('returns false when no track matches path', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    tl.to({ opacity: 0 }, { duration: 1 });
    expect(tl.interruptPath('position.y')).toBe(false);
  });

  it("the timeline's own clock (and onComplete) is unaffected by interrupting a path", () => {
    const tl = new GraphAnimTimeline(makeTarget());
    const onComplete = vi.fn();
    tl.to({ opacity: 0 }, { duration: 1 }).onComplete(onComplete).play();
    tl.interruptPath('opacity');
    tl.update(1);
    expect(onComplete).toHaveBeenCalledOnce();
  });
});

describe('onGroupComplete() — keyframe groups (Prompt 96)', () => {
  it('fires once a single-group timeline finishes its group', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    const onGroup = vi.fn();
    tl.to({ opacity: 0 }, { duration: 1 }).onGroupComplete(onGroup).play();
    tl.update(0.5);
    expect(onGroup).not.toHaveBeenCalled();
    tl.update(0.5);
    expect(onGroup).toHaveBeenCalledOnce();
  });

  it('fires each sequential group independently, at its own boundary', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    const onGroup1 = vi.fn();
    const onGroup2 = vi.fn();
    tl.to({ 'position.y': 5 }, { duration: 1 })
      .onGroupComplete(onGroup1)
      .then()
      .to({ opacity: 0 }, { duration: 1 })
      .onGroupComplete(onGroup2)
      .play();

    tl.update(1); // group 1's boundary
    expect(onGroup1).toHaveBeenCalledOnce();
    expect(onGroup2).not.toHaveBeenCalled();

    tl.update(1); // group 2's boundary
    expect(onGroup1).toHaveBeenCalledOnce(); // still just once
    expect(onGroup2).toHaveBeenCalledOnce();
  });

  it('one group event covers every parallel track added to it, firing once all of them are done', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    const onGroup = vi.fn();
    tl.to({ 'position.y': 5 }, { duration: 1 })
      .to({ opacity: 0 }, { duration: 2 }) // same group, longer duration
      .onGroupComplete(onGroup)
      .play();

    tl.update(1); // position.y's own duration elapsed, but the group covers opacity's longer one too
    expect(onGroup).not.toHaveBeenCalled();
    tl.update(1); // now at the group's real end (2s)
    expect(onGroup).toHaveBeenCalledOnce();
  });

  it('throws for a non-function handler', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    expect(() => tl.onGroupComplete('nope')).toThrow(TypeError);
  });

  it('fires again on each pass of a restart loop', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    const onGroup = vi.fn();
    tl.to({ opacity: 0 }, { duration: 1 }).onGroupComplete(onGroup).loop(2, 'restart').play();
    tl.update(1); // first pass boundary
    expect(onGroup).toHaveBeenCalledOnce();
    tl.update(1); // second pass boundary
    expect(onGroup).toHaveBeenCalledTimes(2);
  });

  it('does not re-fire on a pingpong reverse pass, but does on the next forward pass', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    const onGroup = vi.fn();
    tl.to({ opacity: 0 }, { duration: 1 }).onGroupComplete(onGroup).loop(3, 'pingpong').play();
    tl.update(1); // forward pass reaches the end -> fires, flips to reverse
    expect(onGroup).toHaveBeenCalledOnce();
    tl.update(1); // reverse pass back to the start -> flips to forward again, does not fire on the reverse leg itself
    expect(onGroup).toHaveBeenCalledOnce();
    tl.update(1); // fresh forward pass reaches the end again -> fires again
    expect(onGroup).toHaveBeenCalledTimes(2);
  });

  it('fires again after stop() + play() restarts the timeline', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    const onGroup = vi.fn();
    tl.to({ opacity: 0 }, { duration: 1 }).onGroupComplete(onGroup).play();
    tl.update(1);
    expect(onGroup).toHaveBeenCalledOnce();

    tl.stop().play();
    tl.update(1);
    expect(onGroup).toHaveBeenCalledTimes(2);
  });
});

describe('update()', () => {
  it('throws for a non-finite deltaSeconds', () => {
    const tl = new GraphAnimTimeline(makeTarget());
    tl.play();
    expect(() => tl.update(NaN)).toThrow(TypeError);
  });
});

describe('dispose()', () => {
  it('clears tracks and callbacks', () => {
    const target = makeTarget();
    const tl = new GraphAnimTimeline(target);
    const onUpdate = vi.fn();
    tl.to({ 'position.y': 10 }, { duration: 1 }).onUpdate(onUpdate).play();
    tl.dispose();
    tl.update(0.5); // no tracks left; update() would still fire onUpdate if any survived
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
