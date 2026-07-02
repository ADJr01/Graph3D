import { describe, it, expect } from 'vitest';
import { accessor } from '../../../src/compose/generator/accessor.js';

describe('accessor', () => {
  it('wraps a constant into a (datum, index) => value function', () => {
    const a = accessor(5);
    expect(a({ x: 1 }, 0)).toBe(5);
    expect(a({ x: 2 }, 1)).toBe(5);
  });

  it('passes a function through unchanged', () => {
    const fn = (d, i) => d.x + i;
    expect(accessor(fn)).toBe(fn);
  });

  it('supports datum- and index-dependent accessors', () => {
    const a = accessor((d, i) => d.x * 10 + i);
    expect(a({ x: 2 }, 3)).toBe(23);
  });
});
