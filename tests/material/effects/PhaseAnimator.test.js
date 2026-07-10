import { describe, it, expect, afterEach, vi } from 'vitest';
import { PhaseAnimator } from '../../../src/material/effects/PhaseAnimator.js';
import { loop } from '../../../src/core/Graph3DLoop.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function advanceFrame(addSpy, deltaSeconds) {
  addSpy.mock.calls.at(-1)[0](deltaSeconds);
}

describe('PhaseAnimator.animate', () => {
  it('registers exactly one loop.add tick regardless of how many keys are animating', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const animator = new PhaseAnimator();
    animator.animate('a', 0, 1, () => {}, { durationMs: 100 });
    animator.animate('b', 0, 1, () => {}, { durationMs: 100 });
    expect(addSpy).toHaveBeenCalledTimes(1);
  });

  it('interpolates linearly by default and calls onFrame with intermediate then final values', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const animator = new PhaseAnimator();
    const frames = [];
    animator.animate('a', 0, 1, (phase) => frames.push(phase), { durationMs: 100 });

    advanceFrame(addSpy, 0.05); // 50ms of 100ms
    expect(frames.at(-1)).toBeCloseTo(0.5, 5);

    advanceFrame(addSpy, 0.05); // now at 100ms — done
    expect(frames.at(-1)).toBe(1);
  });

  it('a second animate() call for the same key replaces the in-flight one', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const animator = new PhaseAnimator();
    const framesA = [];
    animator.animate('x', 0, 1, (phase) => framesA.push(phase), { durationMs: 100 });
    advanceFrame(addSpy, 0.05);

    const framesB = [];
    animator.animate('x', framesA.at(-1), 0, (phase) => framesB.push(phase), { durationMs: 100 });
    advanceFrame(addSpy, 0.05);
    expect(framesB.length).toBe(1);
    expect(framesB.at(-1)).toBeLessThan(0.5);
  });

  it('calls onDone exactly once when an animation completes', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const animator = new PhaseAnimator();
    const onDone = vi.fn();
    animator.animate('a', 0, 1, () => {}, { durationMs: 50, onDone });
    advanceFrame(addSpy, 0.05);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes from loop once every in-flight animation completes', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const removeSpy = vi.spyOn(loop, 'remove');
    const animator = new PhaseAnimator();
    animator.animate('a', 0, 1, () => {}, { durationMs: 50 });
    advanceFrame(addSpy, 0.05);
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});

describe('PhaseAnimator.cancel', () => {
  it('stops a key without a final onFrame call', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const animator = new PhaseAnimator();
    const onFrame = vi.fn();
    animator.animate('a', 0, 1, onFrame, { durationMs: 100 });
    animator.cancel('a');
    advanceFrame(addSpy, 0.1);
    expect(onFrame).not.toHaveBeenCalled();
  });
});

describe('PhaseAnimator.dispose', () => {
  it('clears every in-flight entry and unsubscribes from loop', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const removeSpy = vi.spyOn(loop, 'remove');
    const animator = new PhaseAnimator();
    animator.animate('a', 0, 1, () => {}, { durationMs: 100 });
    animator.dispose();
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(addSpy).toHaveBeenCalledTimes(1); // never re-added by a stray frame
  });
});
