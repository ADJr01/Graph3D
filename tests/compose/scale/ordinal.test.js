import { describe, it, expect } from 'vitest';
import { scale } from '../../../src/compose/scale/index.js';

describe('scale.ordinal', () => {
  it('maps explicit domain values to range values by position', () => {
    const s = scale.ordinal().domain(['a', 'b', 'c']).range(['red', 'green', 'blue']);
    expect(s('a')).toBe('red');
    expect(s('b')).toBe('green');
    expect(s('c')).toBe('blue');
  });

  it('implicitly extends the domain for unfamiliar values', () => {
    const s = scale.ordinal().range(['red', 'green', 'blue']);
    expect(s('a')).toBe('red');
    expect(s('b')).toBe('green');
    expect(s.domain()).toEqual(['a', 'b']);
  });

  it('cycles the range once the domain outgrows it', () => {
    const s = scale.ordinal().domain(['a', 'b', 'c']).range(['red', 'green']);
    expect(s('a')).toBe('red');
    expect(s('b')).toBe('green');
    expect(s('c')).toBe('red');
  });

  it('setting the domain again clears implicitly-learned entries', () => {
    const s = scale.ordinal().range(['red', 'green']);
    s('a');
    s.domain(['x', 'y']);
    expect(s.domain()).toEqual(['x', 'y']);
    expect(s('x')).toBe('red');
  });

  it('copy is independent', () => {
    const s = scale.ordinal().domain(['a']).range(['red']);
    const c = s.copy();
    c.domain(['a', 'b']);
    expect(s.domain()).toEqual(['a']);
  });
});
