import { describe, it, expect } from 'vitest';
import { normalize } from '../../../src/compose/transform/normalize.js';

describe('transform.normalize', () => {
  it('throws for a non-string/empty field', () => {
    expect(() => normalize('')).toThrow(TypeError);
    expect(() => normalize(null)).toThrow(TypeError);
  });

  it('rescales a field to [0, 1] without mutating the input', () => {
    const data = [{ v: 0 }, { v: 5 }, { v: 10 }];
    const result = normalize('v')(data);
    expect(result.map((d) => d.v)).toEqual([0, 0.5, 1]);
    expect(data[0].v).toBe(0); // input untouched
    expect(result[0]).not.toBe(data[0]); // new objects
  });

  it('sets a constant field to 0 rather than dividing by zero', () => {
    const result = normalize('v')([{ v: 7 }, { v: 7 }]);
    expect(result.map((d) => d.v)).toEqual([0, 0]);
  });

  it('is a no-op on an empty array', () => {
    expect(normalize('v')([])).toEqual([]);
  });
});
