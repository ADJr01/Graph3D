import { describe, it, expect, vi } from 'vitest';
import { annotation } from '../../../src/compose/annotation/index.js';

describe('annotation.label', () => {
  it('returns text/position/style metadata, defaulting position to the origin and style to {}', () => {
    const result = annotation.label({ text: 'hello' });
    expect(result).toEqual({
      type: 'label',
      text: 'hello',
      position: { x: 0, y: 0, z: 0 },
      style: {},
      on: expect.any(Function),
      emit: expect.any(Function),
    });
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

  describe('on/emit', () => {
    it('calls a registered click handler with emit(...)s arguments', () => {
      const result = annotation.label({ text: 'peak' });
      const handler = vi.fn();
      result.on('click', handler);
      result.emit('click', { foo: 'bar' });
      expect(handler).toHaveBeenCalledWith({ foo: 'bar' });
    });

    it('calls handlers in registration order, supports multiple handlers', () => {
      const result = annotation.label({ text: 'peak' });
      const calls = [];
      result.on('click', () => calls.push('first'));
      result.on('click', () => calls.push('second'));
      result.emit('click');
      expect(calls).toEqual(['first', 'second']);
    });

    it('emit is a no-op when no handler is registered for the event', () => {
      const result = annotation.label({ text: 'peak' });
      expect(() => result.emit('click')).not.toThrow();
    });

    it('on() returns the label for chaining', () => {
      const result = annotation.label({ text: 'peak' });
      expect(result.on('click', () => {})).toBe(result);
    });

    it('throws TypeError for an unsupported event', () => {
      const result = annotation.label({ text: 'peak' });
      expect(() => result.on('hover', () => {})).toThrow(TypeError);
    });

    it('throws TypeError when handler is not a function', () => {
      const result = annotation.label({ text: 'peak' });
      expect(() => result.on('click', 'nope')).toThrow(TypeError);
    });
  });
});
