import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tasks, registerTask, handleMessage } from '../../../src/core/worker/tasks.js';

// ── State isolation ───────────────────────────────────────────────────────────

const BUILT_IN_NAMES = [...tasks.keys()];

// Remove any tasks added by a previous test; keep built-ins intact.
beforeEach(() => {
  for (const name of tasks.keys()) {
    if (!BUILT_IN_NAMES.includes(name)) tasks.delete(name);
  }
});

// ── registerTask ──────────────────────────────────────────────────────────────

describe('registerTask', () => {
  it('throws on empty name', () => {
    expect(() => registerTask('', () => {})).toThrow(TypeError);
  });

  it('throws on non-string name', () => {
    expect(() => registerTask(42, () => {})).toThrow(TypeError);
  });

  it('throws when fn is not a function', () => {
    expect(() => registerTask('myTask', 'bad')).toThrow(TypeError);
  });

  it('registers a task that handleMessage can dispatch', () => {
    registerTask('echo', ({ value }) => value);
    const post = vi.fn();
    handleMessage({ id: 1, task: 'echo', payload: { value: 42 } }, post);
    expect(post).toHaveBeenCalledWith({ id: 1, result: 42 });
  });

  it('overwrites an existing task', () => {
    registerTask('dup', () => 'first');
    registerTask('dup', () => 'second');
    const post = vi.fn();
    handleMessage({ id: 1, task: 'dup', payload: {} }, post);
    expect(post.mock.calls[0][0].result).toBe('second');
  });
});

// ── handleMessage — dispatch ──────────────────────────────────────────────────

describe('handleMessage', () => {
  it('posts error for unknown task', () => {
    const post = vi.fn();
    handleMessage({ id: 9, task: 'nonexistent', payload: {} }, post);
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0][0].error).toMatch(/Unknown task 'nonexistent'/);
  });

  it('posts error when task throws', () => {
    registerTask('boom', () => { throw new Error('kaboom'); });
    const post = vi.fn();
    handleMessage({ id: 2, task: 'boom', payload: {} }, post);
    expect(post.mock.calls[0][0]).toMatchObject({ id: 2, error: 'kaboom' });
  });

  it('resolves a Promise-returning task', async () => {
    registerTask('async-echo', async ({ v }) => v * 2);
    const post = vi.fn();
    handleMessage({ id: 3, task: 'async-echo', payload: { v: 7 } }, post);
    await Promise.resolve(); // let the microtask queue flush
    expect(post.mock.calls[0][0]).toMatchObject({ id: 3, result: 14 });
  });

  it('posts error when async task rejects', async () => {
    registerTask('async-fail', async () => { throw new Error('async boom'); });
    const post = vi.fn();
    handleMessage({ id: 4, task: 'async-fail', payload: {} }, post);
    await Promise.resolve();
    expect(post.mock.calls[0][0]).toMatchObject({ id: 4, error: 'async boom' });
  });

  it('auto-transfers Float32Array buffer', () => {
    registerTask('typed', () => new Float32Array([1, 2, 3]));
    const post = vi.fn();
    handleMessage({ id: 5, task: 'typed', payload: {} }, post);
    const [msg, transfer] = post.mock.calls[0];
    expect(msg.result).toBeInstanceOf(Float32Array);
    expect(transfer).toHaveLength(1);
    expect(transfer[0]).toBeInstanceOf(ArrayBuffer);
  });

  it('auto-transfers raw ArrayBuffer', () => {
    registerTask('raw', () => new ArrayBuffer(8));
    const post = vi.fn();
    handleMessage({ id: 6, task: 'raw', payload: {} }, post);
    const [msg, transfer] = post.mock.calls[0];
    expect(msg.result).toBeInstanceOf(ArrayBuffer);
    expect(transfer[0]).toBe(msg.result);
  });
});

// ── Built-in: sort ────────────────────────────────────────────────────────────

describe("built-in: 'sort'", () => {
  function sort(payload) {
    const post = vi.fn();
    handleMessage({ id: 1, task: 'sort', payload }, post);
    return post.mock.calls[0][0];
  }

  it('sorts numbers ascending', () => {
    expect(sort({ data: [3, 1, 2] }).result).toEqual([1, 2, 3]);
  });

  it('sorts numbers descending', () => {
    expect(sort({ data: [3, 1, 2], dir: 'desc' }).result).toEqual([3, 2, 1]);
  });

  it('sorts objects by key', () => {
    const data = [{ v: 3 }, { v: 1 }, { v: 2 }];
    expect(sort({ data, key: 'v' }).result.map((d) => d.v)).toEqual([1, 2, 3]);
  });

  it('does not mutate the input array', () => {
    const data = [3, 1, 2];
    sort({ data });
    expect(data).toEqual([3, 1, 2]);
  });

  it('posts error when data is not an array', () => {
    expect(sort({ data: 'bad' }).error).toMatch(/array/);
  });
});

// ── Built-in: decimate ────────────────────────────────────────────────────────

describe("built-in: 'decimate'", () => {
  function decimate(payload) {
    const post = vi.fn();
    handleMessage({ id: 1, task: 'decimate', payload }, post);
    return post.mock.calls[0][0];
  }

  it('keeps every Nth element (step=2)', () => {
    expect(decimate({ data: [0, 1, 2, 3, 4], step: 2 }).result).toEqual([0, 2, 4]);
  });

  it('defaults step to 2', () => {
    expect(decimate({ data: [0, 1, 2, 3] }).result).toEqual([0, 2]);
  });

  it('posts error for non-array data', () => {
    expect(decimate({ data: 42 }).error).toMatch(/array/);
  });

  it('posts error for non-positive-integer step', () => {
    expect(decimate({ data: [1, 2], step: 0 }).error).toMatch(/step/);
  });
});

// ── Built-in: aggregate ───────────────────────────────────────────────────────

describe("built-in: 'aggregate'", () => {
  const data = [
    { cat: 'a', v: 1 }, { cat: 'a', v: 3 },
    { cat: 'b', v: 2 }, { cat: 'b', v: 4 },
  ];

  function agg(payload) {
    const post = vi.fn();
    handleMessage({ id: 1, task: 'aggregate', payload }, post);
    return post.mock.calls[0][0].result;
  }

  it('sums by group (default fn)', () => {
    expect(agg({ data, groupKey: 'cat', valueKey: 'v' })).toEqual({ a: 4, b: 6 });
  });

  it('computes mean', () => {
    expect(agg({ data, groupKey: 'cat', valueKey: 'v', fn: 'mean' })).toEqual({ a: 2, b: 3 });
  });

  it('computes min and max', () => {
    expect(agg({ data, groupKey: 'cat', valueKey: 'v', fn: 'min' })).toEqual({ a: 1, b: 2 });
    expect(agg({ data, groupKey: 'cat', valueKey: 'v', fn: 'max' })).toEqual({ a: 3, b: 4 });
  });

  it('counts items per group', () => {
    expect(agg({ data, groupKey: 'cat', valueKey: 'v', fn: 'count' })).toEqual({ a: 2, b: 2 });
  });

  it('aggregates without groupKey into __all__', () => {
    expect(agg({ data: [1, 2, 3] }).__all__).toBe(6);
  });

  it('posts error for unknown fn', () => {
    const post = vi.fn();
    handleMessage({ id: 1, task: 'aggregate', payload: { data, fn: 'mode' } }, post);
    expect(post.mock.calls[0][0].error).toMatch(/unknown fn/);
  });
});

// ── Built-in: layout:grid ─────────────────────────────────────────────────────

describe("built-in: 'layout:grid'", () => {
  function grid(payload) {
    const post = vi.fn();
    handleMessage({ id: 1, task: 'layout:grid', payload }, post);
    return post.mock.calls[0];
  }

  it('returns a Float32Array with 3 components per item', () => {
    const [msg] = grid({ count: 4, cols: 2 });
    expect(msg.result).toBeInstanceOf(Float32Array);
    expect(msg.result).toHaveLength(12); // 4 × 3
  });

  it('positions items in correct grid cells (cols=2)', () => {
    const [msg] = grid({ count: 4, cols: 2, spacing: 1 });
    const pos = msg.result;
    // item 0: (0,0,0), item 1: (1,0,0), item 2: (0,0,1), item 3: (1,0,1)
    expect([pos[0], pos[1], pos[2]]).toEqual([0, 0, 0]);
    expect([pos[3], pos[4], pos[5]]).toEqual([1, 0, 0]);
    expect([pos[6], pos[7], pos[8]]).toEqual([0, 0, 1]);
  });

  it('auto-transfers the buffer', () => {
    const [, transfer] = grid({ count: 2 });
    expect(transfer).toHaveLength(1);
    expect(transfer[0]).toBeInstanceOf(ArrayBuffer);
  });

  it('posts error for non-integer count', () => {
    const [msg] = grid({ count: 1.5 });
    expect(msg.error).toMatch(/count/);
  });
});
