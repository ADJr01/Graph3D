import { describe, it, expect } from 'vitest';
import { smooth } from '../../../src/compose/transform/smooth.js';

describe('transform.smooth', () => {
  it('throws for a non-positive-integer window', () => {
    expect(() => smooth(0)).toThrow(TypeError);
    expect(() => smooth(1.5)).toThrow(TypeError);
    expect(() => smooth(-1)).toThrow(TypeError);
  });

  it('window=1 is a no-op', () => {
    expect(smooth(1)([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('averages each value with its neighbors, shrinking the window at edges', () => {
    const result = smooth(3)([1, 2, 3, 4, 5]);
    expect(result[0]).toBeCloseTo((1 + 2) / 2); // no left neighbor
    expect(result[1]).toBeCloseTo((1 + 2 + 3) / 3);
    expect(result[2]).toBeCloseTo((2 + 3 + 4) / 3);
    expect(result[4]).toBeCloseTo((4 + 5) / 2); // no right neighbor
  });

  it('preserves array length', () => {
    expect(smooth(5)([1, 2, 3]).length).toBe(3);
  });
});
