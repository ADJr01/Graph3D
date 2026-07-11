import { describe, it, expect, afterEach } from 'vitest';
import { memoryPressure } from '../../src/stream/memoryPressure.js';

const originalMemory = performance.memory;

afterEach(() => {
  if (originalMemory === undefined) delete performance.memory;
  else performance.memory = originalMemory;
});

describe('memoryPressure', () => {
  it('returns null when performance.memory is unavailable', () => {
    delete performance.memory;
    expect(memoryPressure()).toBeNull();
  });

  it('returns null when usedJSHeapSize/jsHeapSizeLimit are missing or non-numeric', () => {
    performance.memory = {};
    expect(memoryPressure()).toBeNull();
    performance.memory = { usedJSHeapSize: 'nope', jsHeapSizeLimit: 100 };
    expect(memoryPressure()).toBeNull();
  });

  it('returns null when jsHeapSizeLimit is 0 (avoids a division by zero)', () => {
    performance.memory = { usedJSHeapSize: 0, jsHeapSizeLimit: 0 };
    expect(memoryPressure()).toBeNull();
  });

  it('returns usedJSHeapSize / jsHeapSizeLimit as a [0,1] ratio', () => {
    performance.memory = { usedJSHeapSize: 50, jsHeapSizeLimit: 200 };
    expect(memoryPressure()).toBe(0.25);
  });

  it('can return a value at the extremes (0 and 1)', () => {
    performance.memory = { usedJSHeapSize: 0, jsHeapSizeLimit: 200 };
    expect(memoryPressure()).toBe(0);
    performance.memory = { usedJSHeapSize: 200, jsHeapSizeLimit: 200 };
    expect(memoryPressure()).toBe(1);
  });
});
