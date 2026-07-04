import { describe, it, expect } from 'vitest';
import { advanceRingCursor, splitRingRangeIntoRectangles } from '../../../src/postfx/particles/ringBuffer.js';

describe('advanceRingCursor', () => {
  it('reserves a range starting at the cursor', () => {
    expect(advanceRingCursor(0, 10, 100)).toEqual({ start: 0, next: 10 });
  });

  it('wraps the next cursor around capacity', () => {
    expect(advanceRingCursor(95, 10, 100)).toEqual({ start: 95, next: 5 });
  });

  it('normalizes a cursor already past capacity', () => {
    expect(advanceRingCursor(105, 5, 100)).toEqual({ start: 5, next: 10 });
  });

  it('throws when count exceeds capacity', () => {
    expect(() => advanceRingCursor(0, 101, 100)).toThrow(RangeError);
  });
});

describe('splitRingRangeIntoRectangles', () => {
  it('returns a single rectangle when the range fits in one row', () => {
    const rects = splitRingRangeIntoRectangles(2, 3, 100, 10);
    expect(rects).toEqual([{ x: 2, y: 0, width: 3, height: 1, offset: 0 }]);
  });

  it('splits a range that crosses one row boundary', () => {
    const rects = splitRingRangeIntoRectangles(8, 5, 100, 10);
    expect(rects).toEqual([
      { x: 8, y: 0, width: 2, height: 1, offset: 0 },
      { x: 0, y: 1, width: 3, height: 1, offset: 2 },
    ]);
  });

  it('splits a range that spans multiple full rows', () => {
    const rects = splitRingRangeIntoRectangles(8, 25, 100, 10);
    expect(rects).toEqual([
      { x: 8, y: 0, width: 2, height: 1, offset: 0 },
      { x: 0, y: 1, width: 10, height: 1, offset: 2 },
      { x: 0, y: 2, width: 10, height: 1, offset: 12 },
      { x: 0, y: 3, width: 3, height: 1, offset: 22 },
    ]);
  });

  it('wraps around the end of the ring back to row 0', () => {
    const rects = splitRingRangeIntoRectangles(98, 5, 100, 10);
    expect(rects).toEqual([
      { x: 8, y: 9, width: 2, height: 1, offset: 0 },
      { x: 0, y: 0, width: 3, height: 1, offset: 2 },
    ]);
  });

  it('handles a range starting exactly on a row boundary', () => {
    const rects = splitRingRangeIntoRectangles(10, 10, 100, 10);
    expect(rects).toEqual([{ x: 0, y: 1, width: 10, height: 1, offset: 0 }]);
  });

  it('normalizes a negative or over-capacity start index', () => {
    expect(splitRingRangeIntoRectangles(-2, 1, 100, 10)).toEqual([
      { x: 8, y: 9, width: 1, height: 1, offset: 0 },
    ]);
    expect(splitRingRangeIntoRectangles(102, 1, 100, 10)).toEqual([
      { x: 2, y: 0, width: 1, height: 1, offset: 0 },
    ]);
  });

  it('throws when count exceeds capacity', () => {
    expect(() => splitRingRangeIntoRectangles(0, 101, 100, 10)).toThrow(RangeError);
  });
});
