import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleMessage } from '../../src/core/worker/tasks.js';
import { decimate } from '../../src/stream/decimate.js';

// Mirrors tests/stream/Aggregator.test.js's FakeWorker — bridges postMessage
// to the real task registry so these tests exercise the actual dispatch path.
class FakeWorker {
  constructor() {
    this.onmessage = null;
  }
  postMessage(data) {
    if (data?.type === 'register') return;
    setTimeout(() => handleMessage(data, (response) => this.onmessage?.({ data: response })), 0);
  }
  terminate() {}
}

const origCreateObjectURL = URL.createObjectURL;
beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker);
  URL.createObjectURL = vi.fn(() => 'blob:test-decimate');
});
afterEach(() => {
  vi.unstubAllGlobals();
  URL.createObjectURL = origCreateObjectURL;
});

describe('middleware.decimate(options)', () => {
  it('throws TypeError for a non-integer or too-small target', () => {
    expect(() => decimate({ target: 1.5 })).toThrow(TypeError);
    expect(() => decimate({ target: 1 })).toThrow(TypeError);
    expect(() => decimate({})).toThrow(TypeError);
  });

  it('the returned function throws TypeError for non-array data', () => {
    const simplify = decimate({ target: 5 });
    expect(() => simplify('bad')).toThrow(TypeError);
    simplify.dispose();
  });

  it('resolves a simplified array via the real worker-task dispatch path', async () => {
    const simplify = decimate({ target: 3, x: 't', y: 'v' });
    const data = [
      { t: 0, v: 0 },
      { t: 1, v: 0 },
      { t: 2, v: 10 },
      { t: 3, v: 0 },
      { t: 4, v: 0 },
    ];
    const result = await simplify(data);
    expect(result).toContainEqual(data[0]);
    expect(result).toContainEqual(data[4]);
    expect(result).toContainEqual(data[2]); // the corner
    expect(result.length).toBeLessThan(data.length);
    simplify.dispose();
  });

  it('is a no-op when data is already at or under target', async () => {
    const simplify = decimate({ target: 10 });
    const data = [1, 2, 3];
    await expect(simplify(data)).resolves.toEqual(data);
    simplify.dispose();
  });

  it('dispose() is safe to call more than once', () => {
    const simplify = decimate({ target: 5 });
    expect(() => {
      simplify.dispose();
      simplify.dispose();
    }).not.toThrow();
  });
});
