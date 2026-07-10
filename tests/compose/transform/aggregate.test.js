import { describe, it, expect } from 'vitest';
import { aggregate } from '../../../src/compose/transform/aggregate.js';

describe('transform.aggregate', () => {
  it('throws when keyFn or reducer is not a function', () => {
    expect(() => aggregate(null, () => {})).toThrow(TypeError);
    expect(() => aggregate(() => {}, null)).toThrow(TypeError);
  });

  it('groups by key and reduces each group, preserving first-occurrence order', () => {
    const data = [
      { category: 'a', value: 1 },
      { category: 'b', value: 2 },
      { category: 'a', value: 3 },
    ];
    const result = aggregate(
      (d) => d.category,
      (group, key) => ({ category: key, total: group.reduce((sum, d) => sum + d.value, 0) }),
    )(data);
    expect(result).toEqual([
      { category: 'a', total: 4 },
      { category: 'b', total: 2 },
    ]);
  });
});
