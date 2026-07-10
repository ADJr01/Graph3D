import { describe, it, expect } from 'vitest';
import { effects } from '../../../src/material/effects/registry.js';

const EXPECTED_NAMES = ['glow', 'fire', 'crackers', 'lightenup', 'pulse', 'ripple', 'neonEdge'];

describe('effects.list', () => {
  it('returns all 7 registered presets with name + option schema', () => {
    const list = effects.list();
    expect(list.map((entry) => entry.name).sort()).toEqual([...EXPECTED_NAMES].sort());
    for (const entry of list) {
      expect(typeof entry.options).toBe('object');
      expect(Object.keys(entry.options).length).toBeGreaterThan(0);
    }
  });
});

describe('effects.has', () => {
  it('true for a registered preset, false otherwise', () => {
    expect(effects.has('glow')).toBe(true);
    expect(effects.has('nonexistent')).toBe(false);
  });
});

describe('effects.get', () => {
  it('returns the preset definition for a registered name', () => {
    const preset = effects.get('fire');
    expect(preset.name).toBe('fire');
    expect(typeof preset.fragmentChunk).toBe('function');
    expect(typeof preset.buildUniforms).toBe('function');
  });

  it('throws with a Levenshtein "did you mean" suggestion for a close typo', () => {
    expect(() => effects.get('galow')).toThrow(/did you mean 'glow'/i);
  });

  it('throws without a suggestion when nothing is close', () => {
    expect(() => effects.get('xyz-totally-unrelated-name-zzz')).toThrow(/Unknown effect/);
    expect(() => effects.get('xyz-totally-unrelated-name-zzz')).not.toThrow(/did you mean/i);
  });

  it('lists every registered name in the error message', () => {
    try {
      effects.get('nope');
      throw new Error('should have thrown');
    } catch (error) {
      for (const name of EXPECTED_NAMES) expect(error.message).toContain(name);
    }
  });
});
