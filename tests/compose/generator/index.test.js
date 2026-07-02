import { describe, it, expect } from 'vitest';
import { generator, accessor, accessorField, buildBuffers } from '../../../src/compose/generator/index.js';

describe('generator namespace', () => {
  it('exposes generator.bar/.line/.point/.surface/.arc', () => {
    expect(Object.keys(generator).sort()).toEqual(['arc', 'bar', 'line', 'point', 'surface']);
    expect(typeof generator.bar).toBe('function');
    expect(typeof generator.line).toBe('function');
    expect(typeof generator.point).toBe('function');
    expect(typeof generator.surface).toBe('function');
    expect(typeof generator.arc).toBe('function');
  });

  it('re-exports the shared generator engine', () => {
    expect(typeof accessor).toBe('function');
    expect(typeof accessorField).toBe('function');
    expect(typeof buildBuffers).toBe('function');
  });
});
