import { describe, it, expect } from 'vitest';
import { tickFormat } from '../../../src/compose/scale/tickFormat.js';

describe('tickFormat fixed (default)', () => {
  it('derives precision from the tick step', () => {
    const f = tickFormat(0, 1, 10);
    expect(f(0.3)).toBe('0.3');
    expect(f(1)).toBe('1.0');
  });

  it('uses zero decimals when the step is a whole number', () => {
    const f = tickFormat(0, 100, 10);
    expect(f(50)).toBe('50');
  });

  it('honors an explicit precision', () => {
    const f = tickFormat(0, 1, 10, '.3f');
    expect(f(0.5)).toBe('0.500');
  });

  it('trims the sign off a rounded negative zero', () => {
    const f = tickFormat(0, 100, 10);
    expect(f(-0.4)).toBe('0');
  });
});

describe('tickFormat SI-prefix', () => {
  it('formats thousands with a k suffix', () => {
    const f = tickFormat(0, 5000, 10, 's');
    expect(f(1500)).toBe('1.5k');
  });

  it('formats millions with an M suffix', () => {
    const f = tickFormat(0, 5000000, 5, 's');
    expect(f(2000000)).toBe('2M');
  });

  it('honors an explicit precision', () => {
    const f = tickFormat(0, 5000, 5, '.2s');
    expect(f(1500)).toBe('1.50k');
  });
});

describe('tickFormat specifier validation', () => {
  it('throws TypeError for an unsupported specifier', () => {
    expect(() => tickFormat(0, 1, 10, '%')).toThrow(TypeError);
  });
});
