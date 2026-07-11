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

  it('computes percentile (median, p=0.5)', () => {
    expect(agg({ data: [1, 2, 3, 4, 5], fn: 'percentile', p: 0.5 }).__all__).toBe(3);
  });

  it('computes percentile matching min at p=0 and max at p=1', () => {
    expect(agg({ data: [5, 1, 3], fn: 'percentile', p: 0 }).__all__).toBe(1);
    expect(agg({ data: [5, 1, 3], fn: 'percentile', p: 1 }).__all__).toBe(5);
  });

  it('linearly interpolates percentile between the two nearest ranks', () => {
    // sorted: [1,2,3,4] — p=0.5 → index 1.5 → interpolate between 2 and 3.
    expect(agg({ data: [4, 1, 3, 2], fn: 'percentile', p: 0.5 }).__all__).toBe(2.5);
  });

  it('computes percentile per group', () => {
    expect(agg({ data, groupKey: 'cat', valueKey: 'v', fn: 'percentile', p: 1 })).toEqual({ a: 3, b: 4 });
  });

  it('posts error for percentile with p out of [0,1]', () => {
    const post = vi.fn();
    handleMessage({ id: 1, task: 'aggregate', payload: { data: [1, 2, 3], fn: 'percentile', p: 1.5 } }, post);
    expect(post.mock.calls[0][0].error).toMatch(/'p' must be a number in \[0, 1\]/);
  });
});

// ── Built-in: douglasPeucker ──────────────────────────────────────────────────

describe("built-in: 'douglasPeucker'", () => {
  function dp(payload) {
    const post = vi.fn();
    handleMessage({ id: 1, task: 'douglasPeucker', payload }, post);
    return post.mock.calls[0][0];
  }

  it('posts error for non-array data', () => {
    expect(dp({ data: 'bad', target: 2 }).error).toMatch(/array/);
  });

  it('posts error for target below 2', () => {
    expect(dp({ data: [1, 2, 3], target: 1 }).error).toMatch(/target/);
  });

  it('is a no-op when data is already at or under target', () => {
    expect(dp({ data: [1, 2, 3], target: 5 }).result).toEqual([1, 2, 3]);
  });

  it('always keeps both endpoints', () => {
    const data = Array.from({ length: 50 }, (_, i) => ({ t: i, v: Math.sin(i / 3) }));
    const result = dp({ data, x: 't', y: 'v', target: 10 }).result;
    expect(result[0]).toBe(data[0]);
    expect(result[result.length - 1]).toBe(data[data.length - 1]);
  });

  it('collapses a straight line to just its two endpoints regardless of target', () => {
    const data = Array.from({ length: 20 }, (_, i) => ({ t: i, v: i * 2 })); // perfectly collinear
    const result = dp({ data, x: 't', y: 'v', target: 10 }).result;
    expect(result).toEqual([data[0], data[19]]);
  });

  it('keeps a genuine corner point that flat-run points on either side would not survive', () => {
    // A sharp V: two flat runs (all on the t-axis) either side of one tall
    // corner. At target=3 (2 endpoints + 1 more), the corner has by far the
    // largest perpendicular distance from the endpoint-to-endpoint chord —
    // it must be the one point kept, not one of the flat/collinear ones.
    const data = [
      { t: 0, v: 0 },
      { t: 1, v: 0 },
      { t: 2, v: 10 }, // the corner
      { t: 3, v: 0 },
      { t: 4, v: 0 },
    ];
    const result = dp({ data, x: 't', y: 'v', target: 3 }).result;
    expect(result).toContainEqual(data[2]);
  });

  it('defaults x to index and y to the datum itself for bare-number arrays', () => {
    const data = Array.from({ length: 30 }, (_, i) => (i === 15 ? 100 : 0)); // one spike
    const result = dp({ data, target: 5 }).result;
    expect(result).toContain(100);
  });

  it('converges close to the requested target count', () => {
    const data = Array.from({ length: 200 }, (_, i) => ({ t: i, v: Math.sin(i / 7) * 10 + i * 0.3 }));
    const result = dp({ data, x: 't', y: 'v', target: 30 }).result;
    expect(result.length).toBeGreaterThanOrEqual(20);
    expect(result.length).toBeLessThanOrEqual(40);
  });

  it('returns a subset of the original datum objects, not reshaped points', () => {
    const data = Array.from({ length: 40 }, (_, i) => ({ t: i, v: i % 7, tag: `row-${i}` }));
    const result = dp({ data, x: 't', y: 'v', target: 10 }).result;
    for (const d of result) expect(data).toContain(d);
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

describe("built-in: 'forceCharge'", () => {
  function charge(payload) {
    const post = vi.fn();
    handleMessage({ id: 1, task: 'forceCharge', payload }, post);
    return post.mock.calls[0];
  }

  it('returns a Float32Array the same length as positions', () => {
    const [msg] = charge({ positions: new Float32Array([0, 0, 0, 1, 0, 0]) });
    expect(msg.result).toBeInstanceOf(Float32Array);
    expect(msg.result).toHaveLength(6);
  });

  it('auto-transfers the buffer', () => {
    const [, transfer] = charge({ positions: new Float32Array([0, 0, 0, 1, 0, 0]) });
    expect(transfer).toHaveLength(1);
    expect(transfer[0]).toBeInstanceOf(ArrayBuffer);
  });

  it('two nodes with negative strength repel — accelerations point away from each other', () => {
    const [msg] = charge({ positions: new Float32Array([0, 0, 0, 1, 0, 0]), strength: -30 });
    const [ax0] = msg.result.slice(0, 3);
    const [ax1] = msg.result.slice(3, 6);
    expect(ax0).toBeLessThan(0); // node 0 pushed toward -x, away from node 1
    expect(ax1).toBeGreaterThan(0); // node 1 pushed toward +x, away from node 0
  });

  it('positive strength attracts — accelerations point toward each other', () => {
    const [msg] = charge({ positions: new Float32Array([0, 0, 0, 1, 0, 0]), strength: 30 });
    const [ax0] = msg.result.slice(0, 3);
    const [ax1] = msg.result.slice(3, 6);
    expect(ax0).toBeGreaterThan(0);
    expect(ax1).toBeLessThan(0);
  });

  it('is symmetric — magnitude of the mutual acceleration matches for both nodes', () => {
    const [msg] = charge({ positions: new Float32Array([0, 0, 0, 1, 0, 0]), strength: -30 });
    expect(Math.abs(msg.result[0])).toBeCloseTo(Math.abs(msg.result[3]));
  });

  it('excludes pairs beyond distanceMax', () => {
    const [msg] = charge({ positions: new Float32Array([0, 0, 0, 1000, 0, 0]), strength: -30, distanceMax: 10 });
    expect(msg.result).toEqual(new Float32Array(6));
  });

  it('a lone node feels no acceleration', () => {
    const [msg] = charge({ positions: new Float32Array([5, 5, 5]) });
    expect(msg.result).toEqual(new Float32Array([0, 0, 0]));
  });

  it('posts error for a non-array/TypedArray positions', () => {
    const [msg] = charge({ positions: 'nope' });
    expect(msg.error).toMatch(/positions/);
  });

  it('posts error when positions length is not a multiple of 3', () => {
    const [msg] = charge({ positions: new Float32Array([0, 0]) });
    expect(msg.error).toMatch(/multiple of 3/);
  });
});

describe("built-in: 'joinDiff'", () => {
  function joinDiff(payload) {
    const post = vi.fn();
    handleMessage({ id: 1, task: 'joinDiff', payload }, post);
    return post.mock.calls[0][0];
  }

  it('matches keys present in both, in ascending newKeys order', () => {
    const msg = joinDiff({ oldKeys: [1, 2, 3], newKeys: [2, 3, 4] });
    expect(msg.result.updateOldIndices).toEqual([1, 2]);
    expect(msg.result.updateNewIndices).toEqual([0, 1]);
  });

  it('keys only in newKeys enter, in ascending newKeys order', () => {
    const msg = joinDiff({ oldKeys: [1], newKeys: [1, 2, 3] });
    expect(msg.result.enterNewIndices).toEqual([1, 2]);
  });

  it('keys only in oldKeys exit, in ascending oldKeys (insertion) order', () => {
    const msg = joinDiff({ oldKeys: [1, 2, 3], newKeys: [2] });
    expect(msg.result.exitOldIndices).toEqual([0, 2]);
  });

  it('empty oldKeys — everything enters', () => {
    const msg = joinDiff({ oldKeys: [], newKeys: ['a', 'b'] });
    expect(msg.result.enterNewIndices).toEqual([0, 1]);
    expect(msg.result.updateOldIndices).toEqual([]);
    expect(msg.result.exitOldIndices).toEqual([]);
  });

  it('empty newKeys — everything exits', () => {
    const msg = joinDiff({ oldKeys: ['a', 'b'], newKeys: [] });
    expect(msg.result.exitOldIndices).toEqual([0, 1]);
    expect(msg.result.enterNewIndices).toEqual([]);
    expect(msg.result.updateOldIndices).toEqual([]);
  });

  it('posts error for a duplicate key within newKeys', () => {
    const msg = joinDiff({ oldKeys: [], newKeys: ['a', 'a'] });
    expect(msg.error).toMatch(/duplicate key/);
  });

  it('posts error for non-array oldKeys/newKeys', () => {
    const msg = joinDiff({ oldKeys: 'nope', newKeys: [] });
    expect(msg.error).toMatch(/oldKeys.*newKeys|array/);
  });
});
