import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataStream } from '../../src/stream/DataStream.js';

async function drain(stream, limit = 100) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
    if (chunks.length >= limit) break;
  }
  return chunks;
}

describe('DataStream', () => {
  describe('constructor', () => {
    it('throws TypeError for a non-async-iterable source', () => {
      expect(() => new DataStream(null)).toThrow(TypeError);
      expect(() => new DataStream({})).toThrow(TypeError);
      expect(() => new DataStream([1, 2, 3])).toThrow(TypeError); // sync-iterable, not async
    });
  });

  describe('from(asyncIterable)', () => {
    it('normalizes bare-array chunks into {added, updated, removed}', async () => {
      async function* gen() {
        yield [1, 2];
        yield [3];
      }
      const chunks = await drain(DataStream.from(gen()));
      expect(chunks).toEqual([
        { added: [1, 2], updated: [], removed: [] },
        { added: [3], updated: [], removed: [] },
      ]);
    });

    it('passes through and fills a partial {added,updated,removed} object', async () => {
      async function* gen() {
        yield { updated: [{ id: 1 }] };
        yield { added: [1], removed: [2] };
      }
      const chunks = await drain(DataStream.from(gen()));
      expect(chunks).toEqual([
        { added: [], updated: [{ id: 1 }], removed: [] },
        { added: [1], updated: [], removed: [2] },
      ]);
    });

    it('throws TypeError when a yielded value is neither an array nor a chunk object', async () => {
      async function* gen() {
        yield 'not a chunk';
      }
      await expect(drain(DataStream.from(gen()))).rejects.toThrow(TypeError);
    });
  });

  describe('fromArray(arr, chunkSize, ms)', () => {
    it('throws TypeError for invalid arguments', () => {
      expect(() => DataStream.fromArray('nope', 1, 0)).toThrow(TypeError);
      expect(() => DataStream.fromArray([], 0, 0)).toThrow(TypeError);
      expect(() => DataStream.fromArray([], 1, -1)).toThrow(TypeError);
    });

    it('emits slices of the given size, first slice immediately', async () => {
      const stream = DataStream.fromArray([1, 2, 3, 4, 5], 2, 1000);
      const iterator = stream[Symbol.asyncIterator]();
      const first = await iterator.next();
      expect(first.value).toEqual({ added: [1, 2], updated: [], removed: [] });
    });

    it('emits every slice across the full array, respecting the delay', async () => {
      vi.useFakeTimers();
      try {
        const stream = DataStream.fromArray([1, 2, 3, 4, 5], 2, 100);
        const iterator = stream[Symbol.asyncIterator]();

        const results = [];
        const collect = async () => {
          for (let i = 0; i < 3; i++) {
            const { value } = await iterator.next();
            results.push(value);
          }
        };
        const donePromise = collect();
        await vi.advanceTimersByTimeAsync(1);
        await vi.advanceTimersByTimeAsync(100);
        await vi.advanceTimersByTimeAsync(100);
        await donePromise;

        expect(results).toEqual([
          { added: [1, 2], updated: [], removed: [] },
          { added: [3, 4], updated: [], removed: [] },
          { added: [5], updated: [], removed: [] },
        ]);
      } finally {
        vi.useRealTimers();
      }
    });

    it('dispose() stops emission before the array is exhausted', async () => {
      vi.useFakeTimers();
      try {
        const stream = DataStream.fromArray([1, 2, 3, 4], 1, 50);
        const iterator = stream[Symbol.asyncIterator]();
        await iterator.next(); // first slice, immediate

        stream.dispose();

        const nextPromise = iterator.next();
        await vi.advanceTimersByTimeAsync(50);
        const result = await nextPromise;
        expect(result.done).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('fromInterval(producer, ms)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('throws TypeError for invalid arguments', () => {
      expect(() => DataStream.fromInterval('nope', 100)).toThrow(TypeError);
      expect(() => DataStream.fromInterval(() => [], 0)).toThrow(TypeError);
    });

    it('calls producer every ms and normalizes its return value', async () => {
      let call = 0;
      const producer = () => [`tick-${++call}`];
      const stream = DataStream.fromInterval(producer, 100);
      const iterator = stream[Symbol.asyncIterator]();

      const nextPromise = iterator.next();
      await vi.advanceTimersByTimeAsync(100);
      const result = await nextPromise;

      expect(result.value).toEqual({ added: ['tick-1'], updated: [], removed: [] });
      stream.dispose();
    });

    it('dispose() stops further polling', async () => {
      const producer = vi.fn(() => []);
      const stream = DataStream.fromInterval(producer, 100);
      const iterator = stream[Symbol.asyncIterator]();

      const first = iterator.next();
      await vi.advanceTimersByTimeAsync(100);
      await first;
      expect(producer).toHaveBeenCalledTimes(1);

      stream.dispose();
      const afterDispose = iterator.next();
      await vi.advanceTimersByTimeAsync(1000);
      const result = await afterDispose;
      expect(result.done).toBe(true);
      expect(producer).toHaveBeenCalledTimes(1);
    });
  });

  describe('fromWebSocket(url, transform)', () => {
    class FakeWebSocket {
      constructor(url) {
        this.url = url;
        this.listeners = {};
        FakeWebSocket.instances.push(this);
      }
      addEventListener(type, handler) {
        (this.listeners[type] ??= []).push(handler);
      }
      close() {
        this.emit('close', {});
      }
      emit(type, event) {
        for (const handler of this.listeners[type] ?? []) handler(event);
      }
    }
    FakeWebSocket.instances = [];

    beforeEach(() => {
      FakeWebSocket.instances = [];
      vi.stubGlobal('WebSocket', FakeWebSocket);
    });
    afterEach(() => vi.unstubAllGlobals());

    it('throws TypeError for invalid arguments', () => {
      expect(() => DataStream.fromWebSocket('', () => [])).toThrow(TypeError);
      expect(() => DataStream.fromWebSocket('wss://x', null)).toThrow(TypeError);
    });

    it('emits transform(event.data) for each message', async () => {
      const stream = DataStream.fromWebSocket('wss://example.com', (raw) => [JSON.parse(raw)]);
      const socket = FakeWebSocket.instances[0];
      const iterator = stream[Symbol.asyncIterator]();

      const pending = iterator.next();
      socket.emit('message', { data: '{"price":1}' });
      const result = await pending;

      expect(result.value).toEqual({ added: [{ price: 1 }], updated: [], removed: [] });
    });

    it('queues messages that arrive before next() is called', async () => {
      const stream = DataStream.fromWebSocket('wss://example.com', (raw) => [raw]);
      const socket = FakeWebSocket.instances[0];
      socket.emit('message', { data: 'a' });
      socket.emit('message', { data: 'b' });

      const iterator = stream[Symbol.asyncIterator]();
      expect((await iterator.next()).value).toEqual({ added: ['a'], updated: [], removed: [] });
      expect((await iterator.next()).value).toEqual({ added: ['b'], updated: [], removed: [] });
    });

    it('completes iteration when the socket closes', async () => {
      const stream = DataStream.fromWebSocket('wss://example.com', (raw) => [raw]);
      const socket = FakeWebSocket.instances[0];
      const iterator = stream[Symbol.asyncIterator]();

      const pending = iterator.next();
      socket.emit('close', {});
      const result = await pending;
      expect(result.done).toBe(true);
    });

    it('rejects a pending next() on socket error', async () => {
      const stream = DataStream.fromWebSocket('wss://example.com', (raw) => [raw]);
      const socket = FakeWebSocket.instances[0];
      const iterator = stream[Symbol.asyncIterator]();

      const pending = iterator.next();
      socket.emit('error', {});
      await expect(pending).rejects.toThrow(/socket error/);
    });

    it('dispose() closes the underlying socket', () => {
      const stream = DataStream.fromWebSocket('wss://example.com', (raw) => [raw]);
      const socket = FakeWebSocket.instances[0];
      const closeSpy = vi.spyOn(socket, 'close');
      stream.dispose();
      expect(closeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispose()', () => {
    it('is idempotent', () => {
      const stream = DataStream.fromArray([1], 1, 0);
      expect(() => {
        stream.dispose();
        stream.dispose();
      }).not.toThrow();
    });

    it('makes further iteration throw', () => {
      const stream = DataStream.fromArray([1], 1, 0);
      stream.dispose();
      expect(() => stream[Symbol.asyncIterator]()).toThrow('DataStream: stream has been disposed.');
    });
  });
});
