import { describe, it, expect } from 'vitest';
import { levenshteinDistance, nearestMatch } from '../../src/core/textDistance.js';

describe('levenshteinDistance', () => {
  it('is 0 for identical strings', () => {
    expect(levenshteinDistance('color', 'color')).toBe(0);
  });

  it('counts a single substitution', () => {
    expect(levenshteinDistance('colour', 'colouu')).toBe(1);
  });

  it('counts insertions/deletions for different lengths', () => {
    expect(levenshteinDistance('color', 'colour')).toBe(1);
    expect(levenshteinDistance('', 'abc')).toBe(3);
  });
});

describe('nearestMatch', () => {
  const candidates = ['position', 'rotation', 'scale', 'color', 'opacity', 'visible'];

  it('finds the closest candidate within the default max distance', () => {
    expect(nearestMatch('colour', candidates)).toBe('color');
    expect(nearestMatch('opacty', candidates)).toBe('opacity');
  });

  it('returns null when nothing is within maxDistance', () => {
    expect(nearestMatch('pulsePhase', candidates)).toBeNull();
  });

  it('respects a caller-supplied maxDistance', () => {
    expect(nearestMatch('colouur', candidates, 1)).toBeNull(); // distance 2 from 'color'
    expect(nearestMatch('colouur', candidates, 2)).toBe('color');
  });
});
