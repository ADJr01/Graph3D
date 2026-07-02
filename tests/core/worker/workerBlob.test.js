import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// virtual:worker-blob is resolved to a stub by workerBlobStub() in vitest.config.js.
// No vi.mock needed here.

// Stub createObjectURL — not implemented in jsdom.
const origCreateObjectURL = URL.createObjectURL;
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:test-worker');
});
afterEach(() => {
  URL.createObjectURL = origCreateObjectURL;
});

// Stub Worker — not available in jsdom.
class FakeWorker {
  constructor(url) {
    this.url = url;
    this.messages = [];
  }
  postMessage(data) { this.messages.push(data); }
  terminate() {}
}
vi.stubGlobal('Worker', FakeWorker);

// Dynamic import AFTER stubs are in place so getBlobUrl() sees them on first call.
const { registerWorkerTask, createWorkerFactory } =
  await import('../../../src/core/worker/workerBlob.js');

// ── registerWorkerTask ────────────────────────────────────────────────────────

describe('registerWorkerTask', () => {
  it('throws on empty name', () => {
    expect(() => registerWorkerTask('', () => {})).toThrow(TypeError);
  });

  it('throws on non-string name', () => {
    expect(() => registerWorkerTask(99, () => {})).toThrow(TypeError);
  });

  it('throws when fn is not a function', () => {
    expect(() => registerWorkerTask('bad', 'fn')).toThrow(TypeError);
  });

  it('accepts a valid name and function without throwing', () => {
    expect(() => registerWorkerTask('validTask', (p) => p)).not.toThrow();
  });
});

// ── createWorkerFactory ───────────────────────────────────────────────────────

describe('createWorkerFactory', () => {
  it('returns a function', () => {
    expect(typeof createWorkerFactory()).toBe('function');
  });

  it('the factory creates a Worker instance', () => {
    const worker = createWorkerFactory()();
    expect(worker).toBeInstanceOf(FakeWorker);
  });

  it('creates the worker from the blob URL', () => {
    // The blob URL is module-level cached after first creation, so we
    // check that the Worker receives a string URL rather than counting
    // createObjectURL calls (which only happen once across all tests).
    const worker = createWorkerFactory()();
    expect(typeof worker.url).toBe('string');
    expect(worker.url.startsWith('blob:')).toBe(true);
  });

  it('sends pending registrations as { type: register } messages', () => {
    registerWorkerTask('pipelineTask', (p) => p.data.reverse());
    const worker = createWorkerFactory()();
    const regs = worker.messages.filter((m) => m.type === 'register');
    expect(regs.some((m) => m.name === 'pipelineTask')).toBe(true);
  });

  it('serialises the function body as a string', () => {
    registerWorkerTask('doubler', (p) => p * 2);
    const worker = createWorkerFactory()();
    const reg = worker.messages.find((m) => m.name === 'doubler');
    expect(typeof reg?.fn).toBe('string');
    expect(reg.fn).toContain('* 2');
  });
});
