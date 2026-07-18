# Graph3DLoop

<a name="module_Graph3DLoop.Graph3DLoop"></a>

## Graph3DLoop
RAF-based animation loop. A single instance (`loop`) is shared across the
entire page to satisfy the "one RAF per page" requirement. Use `add`/`remove`
to register callbacks; the RAF starts and stops automatically.

**Kind**: static class of [<code>Graph3DLoop</code>](#module_Graph3DLoop)  

* [.Graph3DLoop](#module_Graph3DLoop.Graph3DLoop)
    * [new exports.Graph3DLoop()](#new_module_Graph3DLoop.Graph3DLoop_new)
    * [.isRunning](#module_Graph3DLoop.Graph3DLoop+isRunning) ⇒ <code>boolean</code>
    * [.add(callback)](#module_Graph3DLoop.Graph3DLoop+add)
    * [.remove(callback)](#module_Graph3DLoop.Graph3DLoop+remove)
    * [.start()](#module_Graph3DLoop.Graph3DLoop+start)
    * [.stop()](#module_Graph3DLoop.Graph3DLoop+stop)
    * [.dispose()](#module_Graph3DLoop.Graph3DLoop+dispose)

<a name="new_module_Graph3DLoop.Graph3DLoop_new"></a>

### new exports.Graph3DLoop()
**Example**  
```js
import { loop } from './Graph3DLoop.js';
const unsubscribe = (delta, elapsed) => mesh.rotation.y += delta;
loop.add(unsubscribe);
// later:
loop.remove(unsubscribe);
```
<a name="module_Graph3DLoop.Graph3DLoop+isRunning"></a>

### graph3DLoop.isRunning ⇒ <code>boolean</code>
True while the loop is intended to be active (even if temporarily suspended by tab hide).

**Kind**: instance property of [<code>Graph3DLoop</code>](#module_Graph3DLoop.Graph3DLoop)  
<a name="module_Graph3DLoop.Graph3DLoop+add"></a>

### graph3DLoop.add(callback)
Register a frame callback. Auto-starts the loop on the first add.

**Kind**: instance method of [<code>Graph3DLoop</code>](#module_Graph3DLoop.Graph3DLoop)  
**Throws**:

- <code>TypeError</code> If `callback` is not a function.


| Param | Type |
| --- | --- |
| callback | <code>Object</code> | 

**Example**  
```js
loop.add((delta) => { mesh.rotation.y += delta; });
```
<a name="module_Graph3DLoop.Graph3DLoop+remove"></a>

### graph3DLoop.remove(callback)
Unregister a frame callback. Auto-stops the loop when the last callback is removed.

**Kind**: instance method of [<code>Graph3DLoop</code>](#module_Graph3DLoop.Graph3DLoop)  

| Param | Type | Description |
| --- | --- | --- |
| callback | <code>function</code> | Must be the same reference passed to `add`. |

**Example**  
```js
const tick = (delta) => { mesh.rotation.y += delta; };
loop.add(tick);
loop.remove(tick);
```
<a name="module_Graph3DLoop.Graph3DLoop+start"></a>

### graph3DLoop.start()
Manually start the loop. No-op if already running.
Respects tab visibility — RAF is deferred if the tab is hidden.

**Kind**: instance method of [<code>Graph3DLoop</code>](#module_Graph3DLoop.Graph3DLoop)  
**Example**  
```js
loop.start();
```
<a name="module_Graph3DLoop.Graph3DLoop+stop"></a>

### graph3DLoop.stop()
Manually stop the loop. No-op if already stopped.
Resets the last-time reference so the next `start` gets delta=0 on its first tick.

**Kind**: instance method of [<code>Graph3DLoop</code>](#module_Graph3DLoop.Graph3DLoop)  
**Example**  
```js
loop.stop();
```
<a name="module_Graph3DLoop.Graph3DLoop+dispose"></a>

### graph3DLoop.dispose()
Release all resources: cancels the RAF, clears all callbacks, removes the
visibility listener. Safe to call multiple times.

**Kind**: instance method of [<code>Graph3DLoop</code>](#module_Graph3DLoop.Graph3DLoop)  
**Example**  
```js
loop.dispose();
```
