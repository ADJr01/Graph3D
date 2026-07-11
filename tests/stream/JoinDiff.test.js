import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleMessage } from '../../src/core/worker/tasks.js';
import { diffData } from '../../src/compose/index.js';
import { JoinDiff } from '../../src/stream/JoinDiff.js';

// FakeWorker bridging postMessage to the real task registry — mirrors
// tests/stream/GPGPU.test.js/Aggregator.test.js/decimate.test.js's own pattern.
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
  URL.createObjectURL = vi.fn(() => 'blob:test-joindiff');
});
afterEach(() => {
  vi.unstubAllGlobals();
  URL.createObjectURL = origCreateObjectURL;
});

function rows(ids) {
  return ids.map((id) => ({ id }));
}
const keyFn = (d) => d.id;

describe('JoinDiff constructor', () => {
  it('throws for a non-positive threshold', () => {
    expect(() => new JoinDiff({ threshold: 0 })).toThrow(TypeError);
    expect(() => new JoinDiff({ threshold: -1 })).toThrow(TypeError);
  });
});

describe('JoinDiff.diff — synchronous path (no keyFn, or below threshold)', () => {
  it('rejects with TypeError for non-array oldData/newData', async () => {
    const joinDiff = new JoinDiff();
    await expect(joinDiff.diff('nope', [])).rejects.toThrow(TypeError);
    await expect(joinDiff.diff([], 'nope')).rejects.toThrow(TypeError);
  });

  it('rejects with TypeError when keyFn is provided but not a function', async () => {
    const joinDiff = new JoinDiff();
    await expect(joinDiff.diff([], [], 'nope')).rejects.toThrow(TypeError);
  });

  it('positional diff (no keyFn) matches diffData exactly, regardless of threshold', async () => {
    const joinDiff = new JoinDiff({ threshold: 1 });
    const oldData = rows([1, 2, 3]);
    const newData = rows([4, 5]);
    const result = await joinDiff.diff(oldData, newData);
    expect(result).toEqual(diffData(oldData, newData));
  });

  it('keyed diff below threshold matches diffData exactly, without touching a worker', async () => {
    vi.unstubAllGlobals(); // no Worker global at all — would throw if this path touched WorkerPool
    const joinDiff = new JoinDiff({ threshold: 100 });
    const oldData = rows([1, 2, 3]);
    const newData = rows([2, 3, 4]);
    const result = await joinDiff.diff(oldData, newData, keyFn);
    expect(result).toEqual(diffData(oldData, newData, keyFn));
  });

  it('rejects for a duplicate key below threshold, matching diffData\'s own error condition', async () => {
    const joinDiff = new JoinDiff({ threshold: 100 });
    const oldData = rows([1]);
    const newData = rows([1, 1]);
    await expect(joinDiff.diff(oldData, newData, keyFn)).rejects.toThrow(/duplicate key/);
  });
});

describe('JoinDiff.diff — worker-offloaded path (keyFn, above threshold)', () => {
  it('matches diffData byte-for-byte on a mixed enter/update/exit case', async () => {
    const joinDiff = new JoinDiff({ threshold: 2 });
    const oldData = rows([1, 2, 3, 4]);
    const newData = rows([2, 3, 4, 5, 6]);
    const result = await joinDiff.diff(oldData, newData, keyFn);
    expect(result).toEqual(diffData(oldData, newData, keyFn));
    joinDiff.dispose();
  });

  it('matches diffData when everything enters (empty oldData)', async () => {
    const joinDiff = new JoinDiff({ threshold: 1 });
    const oldData = [];
    const newData = rows([1, 2, 3]);
    const result = await joinDiff.diff(oldData, newData, keyFn);
    expect(result).toEqual(diffData(oldData, newData, keyFn));
    joinDiff.dispose();
  });

  it('matches diffData when everything exits (empty newData)', async () => {
    const joinDiff = new JoinDiff({ threshold: 1 });
    const oldData = rows([1, 2, 3]);
    const newData = [];
    const result = await joinDiff.diff(oldData, newData, keyFn);
    expect(result).toEqual(diffData(oldData, newData, keyFn));
    joinDiff.dispose();
  });

  it('rejects for a duplicate key among newData, matching diffData\'s own error condition', async () => {
    const joinDiff = new JoinDiff({ threshold: 1 });
    const oldData = rows([1, 2, 3]);
    const newData = [{ id: 5 }, { id: 5 }, { id: 6 }];
    await expect(joinDiff.diff(oldData, newData, keyFn)).rejects.toThrow(/duplicate key/);
    joinDiff.dispose();
  });

  it('reattaches the real newData object reference for updates, not a clone or the oldData one', async () => {
    const joinDiff = new JoinDiff({ threshold: 1 });
    const oldDatum2 = { id: 2, tag: 'old' };
    const newDatum2 = { id: 2, tag: 'new' };
    const oldData = [{ id: 1 }, oldDatum2, { id: 3 }];
    const newData = [newDatum2, { id: 4 }, { id: 5 }];
    const { update } = await joinDiff.diff(oldData, newData, keyFn);
    expect(update[0].datum).toBe(newDatum2);
    expect(update[0].datum).not.toBe(oldDatum2);
    joinDiff.dispose();
  });
});

describe('JoinDiff.dispose', () => {
  it('is idempotent', () => {
    const joinDiff = new JoinDiff();
    expect(() => joinDiff.dispose()).not.toThrow();
    expect(() => joinDiff.dispose()).not.toThrow();
  });

  it('rejects diff() after dispose()', async () => {
    const joinDiff = new JoinDiff();
    joinDiff.dispose();
    await expect(joinDiff.diff([], [])).rejects.toThrow(Error);
  });

  it('terminates the worker pool created by the offloaded path', async () => {
    const joinDiff = new JoinDiff({ threshold: 1 });
    await joinDiff.diff(rows([1]), rows([1, 2]), keyFn);
    expect(() => joinDiff.dispose()).not.toThrow();
  });
});
