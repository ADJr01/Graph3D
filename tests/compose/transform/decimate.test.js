import { describe, it, expect } from 'vitest';
import { decimate } from '../../../src/compose/transform/decimate.js';

describe('transform.decimate', () => {
  it('throws for a non-positive-integer target', () => {
    expect(() => decimate(0)).toThrow(TypeError);
    expect(() => decimate(1.5)).toThrow(TypeError);
  });

  it('is a no-op when data is already at or under target', () => {
    const data = [1, 2, 3];
    expect(decimate(5)(data)).toBe(data);
    expect(decimate(3)(data)).toBe(data);
  });

  it('reduces to exactly target elements via uniform stride sampling', () => {
    const data = Array.from({ length: 1000 }, (_, i) => i);
    const result = decimate(100)(data);
    expect(result).toHaveLength(100);
    expect(result[0]).toBe(0);
  });
});
