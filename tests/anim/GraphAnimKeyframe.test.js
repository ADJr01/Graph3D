import { describe, it, expect } from 'vitest';
import { GraphAnimKeyframe, getPath, setPath } from '../../src/anim/GraphAnimKeyframe.js';

describe('getPath / setPath', () => {
  it('reads and writes a nested dot-path', () => {
    const target = { position: { x: 0, y: 0, z: 0 } };
    expect(getPath(target, 'position.y')).toBe(0);
    setPath(target, 'position.y', 5);
    expect(target.position.y).toBe(5);
  });

  it('reads and writes a top-level path', () => {
    const target = { opacity: 1 };
    setPath(target, 'opacity', 0.5);
    expect(getPath(target, 'opacity')).toBe(0.5);
  });

  it('getPath throws when an intermediate segment is missing', () => {
    expect(() => getPath({}, 'position.y')).toThrow(TypeError);
  });

  it('setPath throws when an intermediate segment is missing', () => {
    expect(() => setPath({}, 'position.y', 1)).toThrow(TypeError);
  });
});

describe('GraphAnimKeyframe', () => {
  it('throws for a non-string/empty path', () => {
    expect(() => new GraphAnimKeyframe('', [{ offset: 0, value: 0 }])).toThrow(TypeError);
    expect(() => new GraphAnimKeyframe(42, [{ offset: 0, value: 0 }])).toThrow(TypeError);
  });

  it('throws for empty stops', () => {
    expect(() => new GraphAnimKeyframe('x', [])).toThrow(TypeError);
  });

  it('throws for an out-of-range offset', () => {
    expect(() => new GraphAnimKeyframe('x', [{ offset: -0.1, value: 0 }])).toThrow(RangeError);
    expect(() => new GraphAnimKeyframe('x', [{ offset: 1.1, value: 0 }])).toThrow(RangeError);
  });

  it('exposes its path', () => {
    const track = new GraphAnimKeyframe('position.y', [{ offset: 0, value: 0 }]);
    expect(track.path).toBe('position.y');
  });

  it('a single stop holds a constant value at every t', () => {
    const track = new GraphAnimKeyframe('x', [{ offset: 0, value: 5 }]);
    expect(track.valueAt(0)).toBe(5);
    expect(track.valueAt(0.5)).toBe(5);
    expect(track.valueAt(1)).toBe(5);
  });

  it('interpolates between two stops via compose/interpolate (numbers)', () => {
    const track = new GraphAnimKeyframe('position.y', [
      { offset: 0, value: 0 },
      { offset: 1, value: 10 },
    ]);
    expect(track.valueAt(0)).toBe(0);
    expect(track.valueAt(0.5)).toBe(5);
    expect(track.valueAt(1)).toBe(10);
  });

  it('interpolates colors through compose/interpolate', () => {
    const track = new GraphAnimKeyframe('color', [
      { offset: 0, value: '#ff0000' },
      { offset: 1, value: '#0000ff' },
    ]);
    expect(track.valueAt(0.5)).toBe('#800080');
  });

  it('clamps t outside [0, 1] to the boundary stop', () => {
    const track = new GraphAnimKeyframe('x', [
      { offset: 0, value: 0 },
      { offset: 1, value: 10 },
    ]);
    expect(track.valueAt(-1)).toBe(0);
    expect(track.valueAt(2)).toBe(10);
  });

  it('multi-stop tracks pick the right segment', () => {
    const track = new GraphAnimKeyframe('x', [
      { offset: 0, value: 0 },
      { offset: 0.5, value: 10 },
      { offset: 1, value: 0 },
    ]);
    expect(track.valueAt(0.25)).toBe(5);
    expect(track.valueAt(0.5)).toBe(10);
    expect(track.valueAt(0.75)).toBe(5);
  });

  it('a zero-length segment (duplicate offsets) snaps to the later stop instead of dividing by zero', () => {
    const track = new GraphAnimKeyframe('x', [
      { offset: 0, value: 0 },
      { offset: 0, value: 99 },
      { offset: 1, value: 10 },
    ]);
    expect(track.valueAt(0)).toBe(99);
  });

  it('sorts out-of-order stops by offset', () => {
    const track = new GraphAnimKeyframe('x', [
      { offset: 1, value: 10 },
      { offset: 0, value: 0 },
    ]);
    expect(track.valueAt(0.5)).toBe(5);
  });

  it('throws at construction if adjacent stop values are not interpolatable', () => {
    expect(
      () =>
        new GraphAnimKeyframe('x', [
          { offset: 0, value: 0 },
          { offset: 1, value: '#fff' },
        ]),
    ).toThrow(TypeError);
  });

  it('apply writes valueAt(t) onto the target at path', () => {
    const track = new GraphAnimKeyframe('position.y', [
      { offset: 0, value: 0 },
      { offset: 1, value: 10 },
    ]);
    const target = { position: { y: 0 } };
    track.apply(target, 0.5);
    expect(target.position.y).toBe(5);
  });
});
