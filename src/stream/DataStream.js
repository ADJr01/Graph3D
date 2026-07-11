const CHUNK_KEYS = ['added', 'updated', 'removed'];

/**
 * Normalizes a raw yielded value into a `{added, updated, removed}` chunk —
 * the single point where every `DataStream`, regardless of source
 * (`from`/`fromArray`/`fromInterval`/`fromWebSocket`), gets validated
 * (CLAUDE.md §1.5 Fail Fast: validate once at the boundary, not once per
 * factory). A bare array is sugar for "these were added."
 * @param {*} value
 * @returns {{added: Array, updated: Array, removed: Array}}
 * @throws {TypeError} If `value` is neither an array nor a chunk-shaped object.
 */
function normalizeChunk(value) {
  if (Array.isArray(value)) return { added: value, updated: [], removed: [] };
  if (value && typeof value === 'object' && CHUNK_KEYS.some((key) => key in value)) {
    return { added: value.added ?? [], updated: value.updated ?? [], removed: value.removed ?? [] };
  }
  throw new TypeError(
    `DataStream: chunk must be an array or an object with added/updated/removed arrays, received ${JSON.stringify(value)}.`,
  );
}

/** @param {number} ms @returns {Promise<void>} */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A live source of data chunks. Wraps any async iterable and normalizes
 * every yielded value into `{added, updated, removed}`, giving `chart.stream()`
 * (Prompt 161) one consumption path regardless of where the data comes from
 * (CLAUDE.md §1.1 DRY).
 *
 * Construct via the static factories, not `new DataStream(...)` directly.
 *
 * @example
 * const stream = DataStream.fromArray(bigDataset, 500, 16);
 * for await (const { added } of stream) {
 *   chart.data(chart.data().concat(added));
 * }
 * stream.dispose();
 */
export class DataStream {
  /** @type {AsyncIterable} */
  #source;
  /** @type {(() => void)|null} */
  #onDispose;
  #disposed = false;

  /**
   * @param {AsyncIterable} source
   * @param {() => void} [onDispose] - Releases any resource the source owns (socket, timer).
   * @throws {TypeError} If `source` isn't async-iterable.
   */
  constructor(source, onDispose = null) {
    if (!source || typeof source[Symbol.asyncIterator] !== 'function') {
      throw new TypeError(`DataStream: source must be an async iterable, received ${JSON.stringify(source)}.`);
    }
    this.#source = source;
    this.#onDispose = onDispose;
  }

  /**
   * Wraps a caller-supplied async iterable as-is — the escape hatch for
   * sources not covered by the other factories.
   * @param {AsyncIterable} asyncIterable
   * @returns {DataStream}
   * @example DataStream.from(myAsyncGenerator());
   */
  static from(asyncIterable) {
    return new DataStream(asyncIterable);
  }

  /**
   * Emits `arr` in slices of `chunkSize`, one slice every `ms` milliseconds
   * (the first slice fires immediately). Useful for demoing/benchmarking
   * streaming behavior against a static dataset.
   * @param {Array} arr
   * @param {number} chunkSize - Positive integer.
   * @param {number} ms - Non-negative delay between slices.
   * @returns {DataStream}
   * @throws {TypeError} If `arr`, `chunkSize`, or `ms` are invalid.
   * @example DataStream.fromArray(rows, 1000, 16);
   */
  static fromArray(arr, chunkSize, ms) {
    if (!Array.isArray(arr)) throw new TypeError(`DataStream.fromArray: arr must be an array, received ${JSON.stringify(arr)}.`);
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
      throw new TypeError(`DataStream.fromArray: chunkSize must be a positive integer, received ${JSON.stringify(chunkSize)}.`);
    }
    if (typeof ms !== 'number' || !(ms >= 0)) {
      throw new TypeError(`DataStream.fromArray: ms must be a non-negative number, received ${JSON.stringify(ms)}.`);
    }

    let disposed = false;
    async function* generate() {
      for (let i = 0; i < arr.length; i += chunkSize) {
        if (i > 0) await delay(ms);
        if (disposed) return;
        yield arr.slice(i, i + chunkSize);
      }
    }
    return new DataStream(generate(), () => {
      disposed = true;
    });
  }

  /**
   * Calls `producer()` every `ms` milliseconds and emits its return value as
   * a chunk (an array is treated as `added`; a `{added,updated,removed}`
   * object is passed through). Stops when `dispose()` is called.
   * @param {() => (Array|{added?: Array, updated?: Array, removed?: Array})} producer
   * @param {number} ms - Positive polling interval.
   * @returns {DataStream}
   * @throws {TypeError} If `producer` or `ms` are invalid.
   * @example DataStream.fromInterval(() => pollNewRows(), 1000);
   */
  static fromInterval(producer, ms) {
    if (typeof producer !== 'function') {
      throw new TypeError(`DataStream.fromInterval: producer must be a function, received ${JSON.stringify(producer)}.`);
    }
    if (typeof ms !== 'number' || !(ms > 0)) {
      throw new TypeError(`DataStream.fromInterval: ms must be a positive number, received ${JSON.stringify(ms)}.`);
    }

    let disposed = false;
    async function* generate() {
      while (!disposed) {
        await delay(ms);
        if (disposed) return;
        yield producer();
      }
    }
    return new DataStream(generate(), () => {
      disposed = true;
    });
  }

  /**
   * Opens a `WebSocket` to `url` and emits `transform(event.data)` for every
   * message (an array is treated as `added`; a `{added,updated,removed}`
   * object is passed through). Ends the stream when the socket closes;
   * rejects in-flight consumption on a socket error.
   * @param {string} url
   * @param {(rawData: *) => (Array|{added?: Array, updated?: Array, removed?: Array})} transform
   * @returns {DataStream}
   * @throws {TypeError} If `url` or `transform` are invalid.
   * @example DataStream.fromWebSocket('wss://example.com/ticks', (raw) => [JSON.parse(raw)]);
   */
  static fromWebSocket(url, transform) {
    if (typeof url !== 'string' || url.length === 0) {
      throw new TypeError(`DataStream.fromWebSocket: url must be a non-empty string, received ${JSON.stringify(url)}.`);
    }
    if (typeof transform !== 'function') {
      throw new TypeError(`DataStream.fromWebSocket: transform must be a function, received ${JSON.stringify(transform)}.`);
    }

    const queue = [];
    let pending = null; // {resolve, reject} for an in-flight next() with nothing queued yet
    let closed = false;
    let socketError = null;

    const socket = new WebSocket(url);
    socket.addEventListener('message', (event) => {
      const chunk = transform(event.data);
      if (pending) {
        pending.resolve({ value: chunk, done: false });
        pending = null;
      } else {
        queue.push(chunk);
      }
    });
    socket.addEventListener('close', () => {
      closed = true;
      if (pending) {
        pending.resolve({ value: undefined, done: true });
        pending = null;
      }
    });
    socket.addEventListener('error', () => {
      socketError = new Error(`DataStream.fromWebSocket: socket error for ${url}.`);
      if (pending) {
        pending.reject(socketError);
        pending = null;
      }
    });

    const iterable = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (queue.length > 0) return Promise.resolve({ value: queue.shift(), done: false });
            if (socketError) return Promise.reject(socketError);
            if (closed) return Promise.resolve({ value: undefined, done: true });
            return new Promise((resolve, reject) => {
              pending = { resolve, reject };
            });
          },
        };
      },
    };

    return new DataStream(iterable, () => socket.close());
  }

  /** @returns {AsyncIterator<{added: Array, updated: Array, removed: Array}>} */
  [Symbol.asyncIterator]() {
    this.#assertNotDisposed();
    const iterator = this.#source[Symbol.asyncIterator]();
    return {
      next: async () => {
        const result = await iterator.next();
        if (result.done) return result;
        return { value: normalizeChunk(result.value), done: false };
      },
    };
  }

  /**
   * Releases whatever resource the source owns (closes the socket, stops the
   * timer/generator loop). Idempotent — safe to call more than once.
   * @example stream.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#onDispose) this.#onDispose();
  }

  #assertNotDisposed() {
    if (this.#disposed) throw new Error('DataStream: stream has been disposed.');
  }
}
