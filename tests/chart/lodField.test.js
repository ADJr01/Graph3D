import { describe, it, expect } from 'vitest';
import { assertLODLevels, pickLODLevel } from '../../src/chart/lodField.js';

describe('assertLODLevels(levels)', () => {
  it('throws for a non-array or empty array', () => {
    expect(() => assertLODLevels(null)).toThrow(TypeError);
    expect(() => assertLODLevels([])).toThrow(TypeError);
  });

  it('throws when a level has a non-positive maxDistance', () => {
    expect(() => assertLODLevels([{ maxDistance: 0, maxPoints: 10 }])).toThrow(TypeError);
    expect(() => assertLODLevels([{ maxDistance: -5, maxPoints: 10 }])).toThrow(TypeError);
  });

  it('throws when a level has a non-integer or non-positive maxPoints', () => {
    expect(() => assertLODLevels([{ maxDistance: 10, maxPoints: 0 }])).toThrow(TypeError);
    expect(() => assertLODLevels([{ maxDistance: 10, maxPoints: 1.5 }])).toThrow(TypeError);
  });

  it('accepts a valid levels array', () => {
    expect(() => assertLODLevels([{ maxDistance: 10, maxPoints: 100 }])).not.toThrow();
  });
});

describe('pickLODLevel(levels, distance)', () => {
  const levels = [
    { maxDistance: 20, maxPoints: 5000 },
    { maxDistance: 100, maxPoints: 500 },
    { maxDistance: 500, maxPoints: 50 },
  ];

  it('picks the first level distance still fits under', () => {
    expect(pickLODLevel(levels, 5)).toBe(levels[0]);
    expect(pickLODLevel(levels, 20)).toBe(levels[0]);
    expect(pickLODLevel(levels, 50)).toBe(levels[1]);
  });

  it('falls back to the farthest level once distance exceeds every threshold', () => {
    expect(pickLODLevel(levels, 10000)).toBe(levels[2]);
  });
});
