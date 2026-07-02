import { describe, it, expect } from 'vitest';
import { tickIncrement, tickStep, ticks } from '../../../src/compose/scale/ticks.js';

describe('tickIncrement', () => {
  it('picks a step of 1 for [1.1, 10.9] at count 10 (encoded as -1)', () => {
    expect(tickIncrement(1.1, 10.9, 10)).toBe(-1);
  });

  it('picks a step of 10 for [0, 100] at count 10', () => {
    expect(tickIncrement(0, 100, 10)).toBe(10);
  });

  it('picks a sub-1 step, encoded as a negative reciprocal, for a narrow range', () => {
    // Step of 0.1 is encoded as -10 (i.e. 1 / -(-10) = 0.1).
    expect(tickIncrement(0, 1, 10)).toBe(-10);
  });
});

describe('tickStep', () => {
  it('unwraps the negative-reciprocal encoding into a plain step size', () => {
    expect(tickStep(0, 1, 10)).toBeCloseTo(0.1);
    expect(tickStep(0, 100, 10)).toBe(10);
  });

  it('negates the step for a descending range', () => {
    expect(tickStep(100, 0, 10)).toBe(-10);
  });
});

describe('ticks', () => {
  it('matches known D3 output for [0, 1] at count 5', () => {
    expect(ticks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  it('matches known D3 output for [0, 100] at count 10', () => {
    expect(ticks(0, 100, 10)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it('returns a single-element array for a zero-width domain', () => {
    expect(ticks(5, 5, 10)).toEqual([5]);
  });

  it('reverses output for a descending domain', () => {
    expect(ticks(100, 0, 10)).toEqual([100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0]);
  });
});
