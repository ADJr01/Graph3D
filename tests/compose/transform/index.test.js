import { describe, it, expect } from 'vitest';
import { transform } from '../../../src/compose/transform/index.js';

describe('transform namespace', () => {
  it('exposes transform.smooth/.decimate/.aggregate/.normalize/.sort', () => {
    expect(Object.keys(transform).sort()).toEqual(['aggregate', 'decimate', 'normalize', 'smooth', 'sort']);
    expect(typeof transform.smooth).toBe('function');
    expect(typeof transform.decimate).toBe('function');
    expect(typeof transform.aggregate).toBe('function');
    expect(typeof transform.normalize).toBe('function');
    expect(typeof transform.sort).toBe('function');
  });
});
