import { describe, it, expect } from 'vitest';
import { annotation } from '../../../src/compose/annotation/index.js';

describe('annotation.label', () => {
  it('returns text/position/style metadata, defaulting position to the origin and style to {}', () => {
    const result = annotation.label({ text: 'hello' });
    expect(result).toEqual({ type: 'label', text: 'hello', position: { x: 0, y: 0, z: 0 }, style: {} });
  });

  it('carries through a supplied position and style', () => {
    const style = { color: 'gold' };
    const result = annotation.label({ text: '42%', position: { x: 1, y: 2, z: 3 }, style });
    expect(result.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(result.style).toBe(style);
  });

  it('throws when text is not a string', () => {
    expect(() => annotation.label({ text: 42 })).toThrow(TypeError);
  });
});
