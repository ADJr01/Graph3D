import { describe, it, expect } from 'vitest';
import { assertOrientation, longAxisBoxSize, pointAlong } from '../../../src/compose/axis/orientationAxes.js';

describe('assertOrientation', () => {
  it('accepts x/y/z', () => {
    expect(() => assertOrientation('m', 'x')).not.toThrow();
    expect(() => assertOrientation('m', 'y')).not.toThrow();
    expect(() => assertOrientation('m', 'z')).not.toThrow();
  });

  it('throws for anything else', () => {
    expect(() => assertOrientation('m', 'w')).toThrow(TypeError);
  });
});

describe('longAxisBoxSize', () => {
  it('puts length on the requested axis and thickness on the other two', () => {
    expect(longAxisBoxSize('x', 10, 0.02)).toEqual([10, 0.02, 0.02]);
    expect(longAxisBoxSize('y', 10, 0.02)).toEqual([0.02, 10, 0.02]);
    expect(longAxisBoxSize('z', 10, 0.02)).toEqual([0.02, 0.02, 10]);
  });

  it('throws for an invalid orientation', () => {
    expect(() => longAxisBoxSize('w', 10, 0.02)).toThrow(TypeError);
  });
});

describe('pointAlong', () => {
  it('places value on the requested axis, zero elsewhere', () => {
    expect(pointAlong('x', 3)).toEqual({ x: 3, y: 0, z: 0 });
    expect(pointAlong('y', 3)).toEqual({ x: 0, y: 3, z: 0 });
    expect(pointAlong('z', 3)).toEqual({ x: 0, y: 0, z: 3 });
  });

  it('throws for an invalid orientation', () => {
    expect(() => pointAlong('w', 3)).toThrow(TypeError);
  });
});
