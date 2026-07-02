import { describe, it, expect } from 'vitest';
import { color } from '../../../src/compose/color/index.js';

describe('color.categorical', () => {
  it('assigns colors to distinct values by first-seen order', () => {
    const s = color.categorical(['red', 'green', 'blue']);
    expect(s('apples')).toBe('red');
    expect(s('pears')).toBe('green');
    expect(s('apples')).toBe('red');
  });

  it('cycles once the palette is exhausted', () => {
    const s = color.categorical(['red', 'green']);
    expect(s('a')).toBe('red');
    expect(s('b')).toBe('green');
    expect(s('c')).toBe('red');
  });

  it('throws TypeError for an empty or non-array palette', () => {
    expect(() => color.categorical([])).toThrow(TypeError);
    expect(() => color.categorical('red')).toThrow(TypeError);
  });
});
