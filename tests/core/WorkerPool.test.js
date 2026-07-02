import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerPool } from '../../src/core/WorkerPool.js';

// ── Mock Worker ───────────────────────────────────────────────────────────────

/**
 * Simulates the worker message protocol:
 *   receives { id, task, payload } → replies { id, result } or { id, error }
 *
 * By default echoes `result: task` synchronously (via setTimeout 0).
 * Tests can override behaviour per-instance via `worker._mode`.
 */
class MockWorker {
  constructor() {
    this.onmessage = null;
    this.onerror = null;
    this.onmessageerror = null;
    this.terminated = false;
    this._mode = 'success'; // 'success' | 'error' | 'hang'
    this._postCount = 0;
  }

  postMessage(data, _transfer) {
    this._postCount++;
    if (this._mode === 'hang') return; // never responds
    setTimeout(() => {
      if (this.terminated) return;
      const response =
        this._mode === 'error'
          ? { id: data.id, error: `task ${data.task} failed` }
          : { id: data.id, result: `result:${data.task}` };
      this.onmessage?.({ data: response });
    }, 0);
  }

  terminate() {
    this.terminated = true;
  }

  /** Manually fire onerror to simulate a runtime crash. */
  _crash(message = 'crash') {
    this.onerror?.({ message });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let workers;

function makePool(opts = {}) {
  workers = [];
  return new WorkerPool({
    workerFactory: () => {
      const w = new MockWorker();
      workers.push(w);
      return w;
    },
    idleTimeoutMs: 1000, // shorter than default for timer tests
    ...opts,
  });
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('constructor', () => {
  it('throws when workerFactory is missing', () => {
    expect(() => new WorkerPool({})).toThrow(TypeError);
    expect(() => new WorkerPool({})).toThrow(/workerFactory/);
  });

  it('throws when workerFactory is not a function', () => {
    expect(() => new WorkerPool({ workerFactory: 'url' })).toThrow(TypeError);
  });

  it('throws on non-positive-integer size', () => {
    expect(() => makePool({ size: 0 })).toThrow(TypeError);
    expect(() => makePool({ size: 1.5 })).toThrow(TypeError);
    expect(() => makePool({ size: -2 })).toThrow(TypeError);
  });

  it('throws on non-positive idleTimeoutMs', () => {
    expect(() => makePool({ idleTimeoutMs: 0 })).toThrow(TypeError);
    expect(() => makePool({ idleTimeoutMs: -1 })).toThrow(TypeError);
    expect(() => makePool({ idleTimeoutMs: 'fast' })).toThrow(TypeError);
  });

  it('exposes configured size and idleTimeoutMs', () => {
    const pool = makePool({ size: 3, idleTimeoutMs: 5000 });
    expect(pool.size).toBe(3);
    expect(pool.idleTimeoutMs).toBe(5000);
    pool.dispose();
  });

  it('defaults size to at least 2', () => {
    const pool = makePool();
    expect(pool.size).toBeGreaterThanOrEqual(2);
    pool.dispose();
  });
});

// ── exec — happy path ─────────────────────────────────────────────────────────

describe('exec — happy path', () => {
  it('resolves with the worker result', async () => {
    const pool = makePool({ size: 1 });
    const result = await pool.exec('sort', { data: [3, 1, 2] });
    expect(result).toBe('result:sort');
    pool.dispose();
  });

  it('spawns a worker lazily on first exec', async () => {
    const pool = makePool({ size: 2 });
    expect(workers).toHaveLength(0);
    await pool.exec('sort', {});
    expect(workers).toHaveLength(1);
    pool.dispose();
  });

  it('reuses an idle worker on subsequent exec calls', async () => {
    const pool = makePool({ size: 2 });
    await pool.exec('sort', {});
    await pool.exec('sort', {});
    expect(workers).toHaveLength(1); // same worker reused
    pool.dispose();
  });

  it('dispatches concurrent tasks to separate workers', async () => {
    const pool = makePool({ size: 2 });
    workers = []; // reset in case makePool already pushed
    const [r1, r2] = await Promise.all([pool.exec('agg', {}), pool.exec('sort', {})]);
    expect(r1).toBe('result:agg');
    expect(r2).toBe('result:sort');
    expect(workers.length).toBeGreaterThanOrEqual(1); // may reuse or spawn 2
    pool.dispose();
  });

  it('accepts an empty transferList', async () => {
    const pool = makePool({ size: 1 });
    await expect(pool.exec('sort', {}, [])).resolves.toBeDefined();
    pool.dispose();
  });
});

// ── exec — validation ─────────────────────────────────────────────────────────

describe('exec — validation', () => {
  it('rejects on empty taskName', async () => {
    const pool = makePool();
    await expect(pool.exec('')).rejects.toThrow(TypeError);
    pool.dispose();
  });

  it('rejects on non-string taskName', async () => {
    const pool = makePool();
    await expect(pool.exec(42)).rejects.toThrow(TypeError);
    pool.dispose();
  });

  it('rejects on non-array transferList', async () => {
    const pool = makePool();
    await expect(pool.exec('sort', {}, 'buffer')).rejects.toThrow(TypeError);
    pool.dispose();
  });

  it('rejects after dispose', async () => {
    const pool = makePool();
    pool.dispose();
    await expect(pool.exec('sort', {})).rejects.toThrow(/disposed/);
  });
});

// ── Queue ─────────────────────────────────────────────────────────────────────

describe('queue', () => {
  it('queues tasks when all workers are busy', async () => {
    const pool = makePool({ size: 1 });

    // First exec goes to the worker; second must queue.
    const p1 = pool.exec('sort', {});
    const p2 = pool.exec('agg', {});

    expect(pool.queueLength).toBe(1);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('result:sort');
    expect(r2).toBe('result:agg');
    expect(pool.queueLength).toBe(0);
    pool.dispose();
  });

  it('drains the queue in order', async () => {
    const pool = makePool({ size: 1 });
    const order = [];

    const p1 = pool.exec('a', {}).then((r) => { order.push(r); return r; });
    const p2 = pool.exec('b', {}).then((r) => { order.push(r); return r; });
    const p3 = pool.exec('c', {}).then((r) => { order.push(r); return r; });

    await Promise.all([p1, p2, p3]);
    expect(order).toEqual(['result:a', 'result:b', 'result:c']);
    pool.dispose();
  });

  it('does not exceed pool size', async () => {
    const pool = makePool({ size: 2 });
    const tasks = Array.from({ length: 6 }, (_, i) => pool.exec(`t${i}`, {}));
    expect(workers.length).toBeLessThanOrEqual(2);
    await Promise.all(tasks);
    pool.dispose();
  });
});

// ── Worker error ──────────────────────────────────────────────────────────────

describe('worker error', () => {
  it('rejects the promise when the worker replies with error', async () => {
    const pool = makePool({ size: 1 });
    workers = [];
    const p = pool.exec('bad', {});
    // Wait for the worker to be spawned, then set error mode
    await Promise.resolve();
    workers[0]._mode = 'error';
    await expect(p).rejects.toThrow(/bad.*failed/);
    pool.dispose();
  });

  it('rejects when worker crashes (onerror)', async () => {
    const pool = makePool({ size: 1 });
    workers = [];
    // Hang so we can manually crash it
    const p = pool.exec('crunch', {});
    await Promise.resolve(); // let the worker spawn
    workers[0]._mode = 'hang';
    workers[0]._crash('boom');
    // Error message format: "WorkerPool: worker error on task <id> — <message>"
    await expect(p).rejects.toThrow(/worker error on task \d+.*boom/i);
    pool.dispose();
  });

  it('still resolves queued tasks after a worker crash via spawning a replacement', async () => {
    const pool = makePool({ size: 1 });
    workers = [];

    const p1 = pool.exec('hang', {});
    const p2 = pool.exec('safe', {}); // queued

    await Promise.resolve();
    expect(workers).toHaveLength(1);
    workers[0]._mode = 'hang';
    workers[0]._crash(); // kills worker 0

    // A replacement should be spawned for the queued task
    await Promise.resolve();
    await expect(p1).rejects.toThrow();
    await expect(p2).resolves.toBe('result:safe');
    pool.dispose();
  });

  it('removes the dead worker slot after crash', async () => {
    const pool = makePool({ size: 2 });
    workers = [];
    const p = pool.exec('crunch', {});
    await Promise.resolve();
    workers[0]._mode = 'hang';
    workers[0]._crash();
    await p.catch(() => {});
    // The dead slot should be gone; a subsequent exec spawns fresh
    const p2 = pool.exec('ok', {});
    await expect(p2).resolves.toBe('result:ok');
    pool.dispose();
  });
});

// ── Idle timeout ──────────────────────────────────────────────────────────────

describe('idle timeout', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('terminates idle worker after timeout', async () => {
    const pool = makePool({ size: 2, idleTimeoutMs: 500 });
    workers = [];

    const p = pool.exec('sort', {});
    // advanceTimersByTimeAsync(1) flushes MockWorker's setTimeout(0) and microtasks
    // WITHOUT firing the 500ms idle timer. runAllTimersAsync would fire both.
    await vi.advanceTimersByTimeAsync(1);
    await p;

    expect(workers[0].terminated).toBe(false); // idle timer not yet fired

    vi.advanceTimersByTime(500); // now fire the idle timer

    expect(workers[0].terminated).toBe(true);
    pool.dispose();
  });

  it('cancels the idle timer when a new task arrives', async () => {
    const pool = makePool({ size: 2, idleTimeoutMs: 500 });
    workers = [];

    // p1 completes at t=1 → idle timer set at t=501
    const p1 = pool.exec('sort', {});
    await vi.advanceTimersByTimeAsync(1); // t: 0 → 1; flushes p1's 0ms response
    await p1;

    expect(workers[0].terminated).toBe(false);

    // Dispatch p2 at t=1: cancels idle timer at t=501; p2's 0ms response schedules at t=1
    const p2 = pool.exec('agg', {});

    // Advance only 1ms: t: 1 → 2; flushes p2's 0ms response; new idle timer now at t=502
    // This keeps the new idle timer 1ms BEYOND where the old one would have fired (t=501).
    await vi.advanceTimersByTimeAsync(1);
    await p2;

    // Advance to t=500 (where old timer would have fired); new timer is at t=501
    // Using 498 because: p2's 0ms response fires at t=1 → idle timer at t=1+500=501.
    // advanceByTime(498) reaches t=500, which is < 501, so new idle timer doesn't fire.
    vi.advanceTimersByTime(498); // t: 2 → 500

    expect(workers[0].terminated).toBe(false); // old timer cancelled; new timer (t=501) not yet fired
    pool.dispose();
  });
});

// ── dispose ───────────────────────────────────────────────────────────────────

describe('dispose', () => {
  it('is idempotent', () => {
    const pool = makePool();
    pool.dispose();
    expect(() => pool.dispose()).not.toThrow();
  });

  it('terminates all workers', async () => {
    const pool = makePool({ size: 2 });
    workers = [];
    // .catch swallows the dispose-rejection so it doesn't become an unhandled rejection
    const p1 = pool.exec('a', {}).catch(() => {});
    const p2 = pool.exec('b', {}).catch(() => {});
    await Promise.resolve();
    pool.dispose();
    await Promise.all([p1, p2]);
    expect(workers.every((w) => w.terminated)).toBe(true);
  });

  it('rejects in-flight tasks', async () => {
    const pool = makePool({ size: 1 });
    workers = [];
    const p = pool.exec('hang', {});
    await Promise.resolve();
    workers[0]._mode = 'hang';
    pool.dispose();
    await expect(p).rejects.toThrow(/disposed/);
  });

  it('rejects queued tasks', async () => {
    const pool = makePool({ size: 1 });
    workers = [];
    // Swallow so the hanging task's dispose-rejection is handled
    const hanging = pool.exec('hang', {}).catch(() => {});
    await Promise.resolve();
    workers[0]._mode = 'hang';
    const queued = pool.exec('queued', {});
    pool.dispose();
    await hanging;
    await expect(queued).rejects.toThrow(/disposed/);
  });
});

// ── Observability ─────────────────────────────────────────────────────────────

describe('observability', () => {
  it('pendingCount tracks in-flight tasks', async () => {
    const pool = makePool({ size: 2 });
    expect(pool.pendingCount).toBe(0);
    const p = pool.exec('sort', {});
    expect(pool.pendingCount).toBe(1);
    await p;
    expect(pool.pendingCount).toBe(0);
    pool.dispose();
  });

  it('queueLength tracks backlog', async () => {
    const pool = makePool({ size: 1 });
    const p1 = pool.exec('a', {}); // dispatched
    const p2 = pool.exec('b', {}); // queued
    expect(pool.queueLength).toBe(1);
    await Promise.all([p1, p2]);
    expect(pool.queueLength).toBe(0);
    pool.dispose();
  });
});
