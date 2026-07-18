# JoinDiff

<a name="module_JoinDiff.JoinDiff"></a>

## JoinDiff
Worker-offloaded join diff (Prompt 167): a thin wrapper over
`compose/selection/diffData` (the single diff authority, CLAUDE.md §1.1
DRY) that offloads the Map-based key-matching work to a worker once
`oldData`/`newData` cross `threshold`, via `core/worker/tasks.js`'s
`'joinDiff'` built-in task.

`keyFn` is a closure and can't be transferred to a worker, so `diff()`
evaluates it on the main thread first (`oldData.map(keyFn)`/
`newData.map(keyFn)` — unavoidable, keyFn is opaque), sends only the
resulting keys, and re-attaches `datum` from the original arrays once the
worker returns matched index lists. The worker runs the *exact* same
Map-insertion-order algorithm as `diffData`'s keyed branch, so results are
byte-for-byte identical regardless of which path ran.

A positional diff (no `keyFn`) is already O(1) index arithmetic — never
worth a worker round-trip — so `diff()` always resolves it synchronously
via `diffData` regardless of `threshold`.

**Kind**: static class of [<code>JoinDiff</code>](#module_JoinDiff)  

* [.JoinDiff](#module_JoinDiff.JoinDiff)
    * [new exports.JoinDiff([options])](#new_module_JoinDiff.JoinDiff_new)
    * [.diff(oldData, newData, [keyFn])](#module_JoinDiff.JoinDiff+diff) ⇒ <code>Object</code>
    * [.dispose()](#module_JoinDiff.JoinDiff+dispose)

<a name="new_module_JoinDiff.JoinDiff_new"></a>

### new exports.JoinDiff([options])
**Throws**:

- <code>TypeError</code> If `threshold` isn't a positive number.


| Param | Type |
| --- | --- |
| [options] | <code>Object</code> | 

**Example**  
```js
const joinDiff = new JoinDiff();
const { enter, update, exit } = await joinDiff.diff(oldRows, newRows, (d) => d.id);
joinDiff.dispose();
```
<a name="module_JoinDiff.JoinDiff+diff"></a>

### joinDiff.diff(oldData, newData, [keyFn]) ⇒ <code>Object</code>
Diffs `oldData` against `newData` — same contract, signature, and
output shape as `diffData(oldData, newData, keyFn)`, just asynchronous.

**Kind**: instance method of [<code>JoinDiff</code>](#module_JoinDiff.JoinDiff)  
**Throws**:

- <code>TypeError</code> If `oldData`/`newData` are not arrays, or `keyFn` is provided but not a function.
- <code>Error</code> If `keyFn` produces the same key for two different `newData` entries.
- <code>Error</code> If this instance has been disposed.


| Param | Type |
| --- | --- |
| oldData | <code>\*</code> | 
| newData | <code>\*</code> | 
| [keyFn] | <code>function</code> | 

**Example**  
```js
joinDiff.diff(oldRows, newRows, (d) => d.id);
```
<a name="module_JoinDiff.JoinDiff+dispose"></a>

### joinDiff.dispose()
Terminates the underlying worker pool, if one was ever created. Idempotent.

**Kind**: instance method of [<code>JoinDiff</code>](#module_JoinDiff.JoinDiff)  
**Example**  
```js
joinDiff.dispose();
```
