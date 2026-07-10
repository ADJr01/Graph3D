import { describe, it, expect } from 'vitest';
import { sort } from '../../../src/compose/transform/sort.js';

describe('transform.sort', () => {
  it('throws when compareFn is not a function', () => {
    expect(() => sort(null)).toThrow(TypeError);
  });

  it('sorts using compareFn without mutating the input', () => {
    const data = [3, 1, 2];
    const result = sort((a, b) => a - b)(data);
    expect(result).toEqual([1, 2, 3]);
    expect(data).toEqual([3, 1, 2]);
  });
});
