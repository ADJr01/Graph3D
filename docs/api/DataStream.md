# DataStream

<a name="module_DataStream.DataStream"></a>

## DataStream
A live source of data chunks. Wraps any async iterable and normalizes
every yielded value into `{added, updated, removed}`, giving `chart.stream()`
(Prompt 161) one consumption path regardless of where the data comes from
(CLAUDE.md §1.1 DRY).

Construct via the static factories, not `new DataStream(...)` directly.

**Kind**: static class of [<code>DataStream</code>](#module_DataStream)  

* [.DataStream](#module_DataStream.DataStream)
    * [new exports.DataStream(source, [onDispose])](#new_module_DataStream.DataStream_new)
    * _instance_
        * [.Symbol.asyncIterator()](#module_DataStream.DataStream+Symbol.asyncIterator) ⇒ <code>Object</code>
        * [.dispose()](#module_DataStream.DataStream+dispose)
    * _static_
        * [.from(asyncIterable)](#module_DataStream.DataStream.from) ⇒ <code>DataStream</code>
        * [.fromArray(arr, chunkSize, ms)](#module_DataStream.DataStream.fromArray) ⇒ <code>DataStream</code>
        * [.fromInterval(producer, ms)](#module_DataStream.DataStream.fromInterval) ⇒ <code>DataStream</code>
        * [.fromWebSocket(url, transform)](#module_DataStream.DataStream.fromWebSocket) ⇒ <code>DataStream</code>

<a name="new_module_DataStream.DataStream_new"></a>

### new exports.DataStream(source, [onDispose])
Prefer the static factories (`from`/`fromArray`/`fromInterval`/`fromWebSocket`)
over calling this directly.

**Throws**:

- <code>TypeError</code> If `source` isn't async-iterable.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| source | <code>AsyncIterable</code> |  |  |
| [onDispose] | <code>function</code> | <code></code> | Releases any resource the source owns (socket, timer). |

**Example**  
```js
const stream = DataStream.fromArray(bigDataset, 500, 16);
for await (const { added } of stream) {
  chart.data(chart.data().concat(added));
}
stream.dispose();
```
<a name="module_DataStream.DataStream+Symbol.asyncIterator"></a>

### dataStream.Symbol.asyncIterator() ⇒ <code>Object</code>
Iterates the stream's chunks, normalizing each one to `{added, updated, removed}`
regardless of the shape the underlying source yields.

**Kind**: instance method of [<code>DataStream</code>](#module_DataStream.DataStream)  
**Throws**:

- <code>Error</code> If the stream has been disposed.

**Example**  
```js
for await (const { added } of stream) {
  chart.data(added, (d) => d.id).render();
}
```
<a name="module_DataStream.DataStream+dispose"></a>

### dataStream.dispose()
Releases whatever resource the source owns (closes the socket, stops the
timer/generator loop). Idempotent — safe to call more than once.

**Kind**: instance method of [<code>DataStream</code>](#module_DataStream.DataStream)  
**Example**  
```js
stream.dispose();
```
<a name="module_DataStream.DataStream.from"></a>

### DataStream.from(asyncIterable) ⇒ <code>DataStream</code>
Wraps a caller-supplied async iterable as-is — the escape hatch for
sources not covered by the other factories.

**Kind**: static method of [<code>DataStream</code>](#module_DataStream.DataStream)  

| Param | Type |
| --- | --- |
| asyncIterable | <code>AsyncIterable</code> | 

**Example**  
```js
DataStream.from(myAsyncGenerator());
```
<a name="module_DataStream.DataStream.fromArray"></a>

### DataStream.fromArray(arr, chunkSize, ms) ⇒ <code>DataStream</code>
Emits `arr` in slices of `chunkSize`, one slice every `ms` milliseconds
(the first slice fires immediately). Useful for demoing/benchmarking
streaming behavior against a static dataset.

**Kind**: static method of [<code>DataStream</code>](#module_DataStream.DataStream)  
**Throws**:

- <code>TypeError</code> If `arr`, `chunkSize`, or `ms` are invalid.


| Param | Type | Description |
| --- | --- | --- |
| arr | <code>Array</code> |  |
| chunkSize | <code>number</code> | Positive integer. |
| ms | <code>number</code> | Non-negative delay between slices. |

**Example**  
```js
DataStream.fromArray(rows, 1000, 16);
```
<a name="module_DataStream.DataStream.fromInterval"></a>

### DataStream.fromInterval(producer, ms) ⇒ <code>DataStream</code>
Calls `producer()` every `ms` milliseconds and emits its return value as
a chunk (an array is treated as `added`; a `{added,updated,removed}`
object is passed through). Stops when `dispose()` is called.

**Kind**: static method of [<code>DataStream</code>](#module_DataStream.DataStream)  
**Throws**:

- <code>TypeError</code> If `producer` or `ms` are invalid.


| Param | Type | Description |
| --- | --- | --- |
| producer | <code>function</code> |  |
| ms | <code>number</code> | Positive polling interval. |

**Example**  
```js
DataStream.fromInterval(() => pollNewRows(), 1000);
```
<a name="module_DataStream.DataStream.fromWebSocket"></a>

### DataStream.fromWebSocket(url, transform) ⇒ <code>DataStream</code>
Opens a `WebSocket` to `url` and emits `transform(event.data)` for every
message (an array is treated as `added`; a `{added,updated,removed}`
object is passed through). Ends the stream when the socket closes;
rejects in-flight consumption on a socket error.

**Kind**: static method of [<code>DataStream</code>](#module_DataStream.DataStream)  
**Throws**:

- <code>TypeError</code> If `url` or `transform` are invalid.


| Param | Type |
| --- | --- |
| url | <code>string</code> | 
| transform | <code>function</code> | 

**Example**  
```js
DataStream.fromWebSocket('wss://example.com/ticks', (raw) => [JSON.parse(raw)]);
```
