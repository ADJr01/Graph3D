import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleMessage } from '../../src/core/worker/tasks.js';
import { Aggregator } from '../../src/stream/Aggregator.js';

// A fake Worker that bridges postMessage to the REAL task registry
// (src/core/worker/tasks.js), so these tests exercise the exact same
// dispatch/reducer code a real worker bootstrap runs — only the Worker
// thread itself is faked (jsdom has no real one), mirroring
// tests/core/worker/workerBlob.test.js's own FakeWorker pattern.
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

// URL.createObjectURL isn't implemented in jsdom (mirrors workerBlob.test.js).
const origCreateObjectURL = URL.createObjectURL;
beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker);
  URL.createObjectURL = vi.fn(() => 'blob:test-aggregator');
});
afterEach(() => {
  vi.unstubAllGlobals();
  URL.createObjectURL = origCreateObjectURL;
});

describe('Aggregator', () => {
  describe('run(data, options)', () => {
    it('throws TypeError for non-array data', () => {
      const aggregator = new Aggregator();
      expect(() => aggregator.run('bad')).toThrow(TypeError);
      aggregator.dispose();
    });

    it('resolves grouped sums via the real worker-task dispatch path', async () => {
      const aggregator = new Aggregator();
      const data = [{ cat: 'a', v: 1 }, { cat: 'a', v: 3 }, { cat: 'b', v: 2 }];
      const result = await aggregator.run(data, { groupKey: 'cat', valueKey: 'v' });
      expect(result).toEqual({ a: 4, b: 2 });
      aggregator.dispose();
    });

    it('resolves a percentile reduction', async () => {
      const aggregator = new Aggregator();
      const result = await aggregator.run([1, 2, 3, 4, 5], { fn: 'percentile', p: 0.5 });
      expect(result.__all__).toBe(3);
      aggregator.dispose();
    });

    it('rejects when the underlying task reports an error (unknown fn)', async () => {
      const aggregator = new Aggregator();
      await expect(aggregator.run([1, 2], { fn: 'mode' })).rejects.toThrow(/unknown fn/);
      aggregator.dispose();
    });
  });

  describe('dispose()', () => {
    it('is idempotent', () => {
      const aggregator = new Aggregator();
      expect(() => {
        aggregator.dispose();
        aggregator.dispose();
      }).not.toThrow();
    });

    it('makes run() throw afterward', () => {
      const aggregator = new Aggregator();
      aggregator.dispose();
      expect(() => aggregator.run([1, 2])).toThrow('Aggregator.run: this aggregator has been disposed.');
    });
  });
});
