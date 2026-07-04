import { describe, it, expect } from 'vitest';
import { curve, spring, bezier, noise, resolve } from '../../src/anim/GraphAnimCurve.js';

const MONOTONIC_FAMILIES = ['Quad', 'Cubic', 'Quart', 'Quint', 'Sine', 'Expo', 'Circ'];
const ALL_FAMILIES = [...MONOTONIC_FAMILIES, 'Back', 'Elastic', 'Bounce'];
const VARIANTS = ['In', 'Out', 'InOut'];

function sample(fn, steps = 20) {
  const values = [];
  for (let i = 0; i <= steps; i++) values.push(fn(i / steps));
  return values;
}

describe('curve namespace', () => {
  it('has linear plus every in/out/inOut variant of every family', () => {
    expect(curve.linear).toBeTypeOf('function');
    for (const family of ALL_FAMILIES) {
      for (const variant of VARIANTS) {
        expect(curve[`ease${variant}${family}`], `ease${variant}${family}`).toBeTypeOf('function');
      }
    }
  });

  it('linear is the identity', () => {
    expect(curve.linear(0)).toBe(0);
    expect(curve.linear(0.5)).toBe(0.5);
    expect(curve.linear(1)).toBe(1);
  });

  it('every named curve starts at 0 and ends at 1', () => {
    for (const family of ALL_FAMILIES) {
      for (const variant of VARIANTS) {
        const fn = curve[`ease${variant}${family}`];
        expect(fn(0), `ease${variant}${family}(0)`).toBeCloseTo(0, 9);
        expect(fn(1), `ease${variant}${family}(1)`).toBeCloseTo(1, 9);
      }
    }
  });

  it('the power/trig families (Quad..Circ) are monotonic', () => {
    for (const family of MONOTONIC_FAMILIES) {
      for (const variant of VARIANTS) {
        const fn = curve[`ease${variant}${family}`];
        const values = sample(fn);
        for (let i = 1; i < values.length; i++) {
          expect(values[i], `ease${variant}${family} step ${i}`).toBeGreaterThanOrEqual(values[i - 1] - 1e-9);
        }
      }
    }
  });

  it('Back overshoots outside [0, 1] mid-curve', () => {
    expect(curve.easeInBack(0.1)).toBeLessThan(0);
    expect(curve.easeOutBack(0.9)).toBeGreaterThan(1);
  });

  it('Bounce is non-monotonic (has local maxima before settling)', () => {
    const values = sample(curve.easeOutBounce, 100);
    const hasDip = values.some((v, i) => i > 0 && v < values[i - 1]);
    expect(hasDip).toBe(true);
  });
});

describe('spring', () => {
  it('starts at 0', () => {
    expect(spring()(0)).toBe(0);
  });

  it('settles toward 1 for large t (underdamped)', () => {
    expect(spring(170, 26)(5)).toBeCloseTo(1, 2);
  });

  it('settles toward 1 for large t (critically damped, zeta === 1)', () => {
    const stiffness = 100;
    const critical = 2 * Math.sqrt(stiffness);
    expect(spring(stiffness, critical)(5)).toBeCloseTo(1, 2);
  });

  it('settles toward 1 for large t (overdamped)', () => {
    expect(spring(100, 40)(5)).toBeCloseTo(1, 2);
  });

  it('throws for non-positive stiffness or negative damping', () => {
    expect(() => spring(0, 10)).toThrow(TypeError);
    expect(() => spring(10, -1)).toThrow(TypeError);
  });
});

describe('bezier', () => {
  it('matches linear for the linear control points', () => {
    const ease = bezier(0, 0, 1, 1);
    expect(ease(0)).toBeCloseTo(0, 6);
    expect(ease(0.5)).toBeCloseTo(0.5, 3);
    expect(ease(1)).toBeCloseTo(1, 6);
  });

  it('clamps exactly at the endpoints', () => {
    const ease = bezier(0.25, 0.1, 0.25, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it('throws for non-numeric control coordinates', () => {
    expect(() => bezier('a', 0, 1, 1)).toThrow(TypeError);
  });

  it('stays finite and monotonic-ish near a zero-derivative control-point configuration', () => {
    // Crossed control points (x1=1, x2=0) put an exact zero-derivative point at t=0.5.
    const ease = bezier(1, 0, 0, 1);
    expect(ease(0.3)).toBeGreaterThan(0);
    expect(ease(0.7)).toBeLessThan(1);
  });
});

describe('noise', () => {
  it('is deterministic for a given seed', () => {
    const a = noise(7);
    const b = noise(7);
    expect(a(0.37)).toBe(b(0.37));
  });

  it('differs across seeds (for at least one sample point)', () => {
    const a = noise(1);
    const b = noise(2);
    const values = sample((t) => Math.abs(a(t) - b(t)));
    expect(values.some((v) => v > 1e-6)).toBe(true);
  });

  it('stays within [-1, 1]', () => {
    const n = noise(3);
    for (const v of sample(n, 50)) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('throws for a non-finite seed', () => {
    expect(() => noise(NaN)).toThrow(TypeError);
  });
});

describe('resolve', () => {
  it('looks up a named curve', () => {
    expect(resolve('easeInOutCubic')).toBe(curve.easeInOutCubic);
  });

  it('passes through a raw function', () => {
    const fn = (t) => t * 2;
    expect(resolve(fn)).toBe(fn);
  });

  it('throws for an unknown name', () => {
    expect(() => resolve('easeInFake')).toThrow(TypeError);
  });

  it('throws for an unsupported type', () => {
    expect(() => resolve(42)).toThrow(TypeError);
  });
});
