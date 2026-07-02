import { describe, it, expect } from 'vitest';
import { accessorField } from '../../../src/compose/generator/accessor.js';

describe('accessorField', () => {
  it('getter (no args) returns the current resolved accessor', () => {
    const target = {};
    const field = accessorField(target, 5);
    expect(field()({}, 0)).toBe(5);
  });

  it('setter with a constant updates the resolved accessor and returns target', () => {
    const target = {};
    const field = accessorField(target, 5);
    expect(field(9)).toBe(target);
    expect(field()({}, 0)).toBe(9);
  });

  it('setter with a function updates the resolved accessor', () => {
    const target = {};
    const field = accessorField(target, 0);
    field((d, i) => d.x + i);
    expect(field()({ x: 10 }, 2)).toBe(12);
  });

  it('setter accepts a callable scale directly', () => {
    const target = {};
    const field = accessorField(target, 0);
    const scaleLike = (value) => value * 2;
    field(scaleLike);
    expect(field()(21, 0)).toBe(42);
  });
});
