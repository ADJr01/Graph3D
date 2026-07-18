# Aggregator

<a name="module_Aggregator.Aggregator"></a>

## Aggregator
Off-main-thread grouped reduction over a plain data array — a friendly
wrapper over `core/worker/tasks.js`'s built-in `'aggregate'` task (already
shipped in every worker's bootstrap bundle, CLAUDE.md §1.1 DRY: no second
reducer implementation lives here). Owns its own `WorkerPool`, created
lazily the same way `WorkerPool` itself creates workers lazily.

**Kind**: static class of [<code>Aggregator</code>](#module_Aggregator)  

* [.Aggregator](#module_Aggregator.Aggregator)
    * [new exports.Aggregator()](#new_module_Aggregator.Aggregator_new)
    * [.run(data, [options])](#module_Aggregator.Aggregator+run) ⇒ <code>\*</code>
    * [.dispose()](#module_Aggregator.Aggregator+dispose)

<a name="new_module_Aggregator.Aggregator_new"></a>

### new exports.Aggregator()
Creates its own lazily-used `WorkerPool` for `run()`.

**Example**  
```js
const aggregator = new Aggregator();
const totals = await aggregator.run(sales, { groupKey: 'region', valueKey: 'amount' });
// { north: 1200, south: 900, ... }
const p95 = await aggregator.run(latencies, { valueKey: 'ms', fn: 'percentile', p: 0.95 });
aggregator.dispose();
```
<a name="module_Aggregator.Aggregator+run"></a>

### aggregator.run(data, [options]) ⇒ <code>\*</code>
Groups `data` by `options.groupKey` (or a single `'__all__'` group if
omitted) and reduces each group's `options.valueKey` field (or the raw
datum, if omitted) via `options.fn`.

**Kind**: instance method of [<code>Aggregator</code>](#module_Aggregator.Aggregator)  
**Returns**: <code>\*</code> - Resolves with one reduced value per group key.  
**Throws**:

- <code>TypeError</code> If `data` isn't an array.
- <code>Error</code> If this aggregator has been disposed.


| Param | Type | Description |
| --- | --- | --- |
| data | <code>Array</code> |  |
| [options] | <code>Object</code> | `p` (a number in `[0, 1]`) is required when `fn` is `'percentile'`. |

**Example**  
```js
aggregator.run(rows, { groupKey: 'category', valueKey: 'value', fn: 'mean' });
```
<a name="module_Aggregator.Aggregator+dispose"></a>

### aggregator.dispose()
Terminates the underlying worker pool. Idempotent — safe to call twice.

**Kind**: instance method of [<code>Aggregator</code>](#module_Aggregator.Aggregator)  
**Example**  
```js
aggregator.dispose();
```
