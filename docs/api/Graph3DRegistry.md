# Graph3DRegistry

<a name="module_Graph3DRegistry.Graph3DRegistry"></a>

## Graph3DRegistry
Module-level singleton registry of all live Graph3D instances.
Enables page-wide lifecycle control (dispose, pause, resume) and
provides a stable HMR teardown hook via `panicDispose`.

**Kind**: static class of [<code>Graph3DRegistry</code>](#module_Graph3DRegistry)  

* [.Graph3DRegistry](#module_Graph3DRegistry.Graph3DRegistry)
    * [new exports.Graph3DRegistry()](#new_module_Graph3DRegistry.Graph3DRegistry_new)
    * [.register(instance)](#module_Graph3DRegistry.Graph3DRegistry+register)
    * [.unregister(instance)](#module_Graph3DRegistry.Graph3DRegistry+unregister)
    * [.all()](#module_Graph3DRegistry.Graph3DRegistry+all) ⇒ <code>\*</code>
    * [.disposeAll()](#module_Graph3DRegistry.Graph3DRegistry+disposeAll)
    * [.pauseAll()](#module_Graph3DRegistry.Graph3DRegistry+pauseAll)
    * [.resumeAll()](#module_Graph3DRegistry.Graph3DRegistry+resumeAll)
    * [.panicDispose()](#module_Graph3DRegistry.Graph3DRegistry+panicDispose)

<a name="new_module_Graph3DRegistry.Graph3DRegistry_new"></a>

### new exports.Graph3DRegistry()
**Example**  
```js
import { registry } from './Graph3DRegistry.js';
registry.register(myGraph);
// later:
registry.disposeAll();
```
<a name="module_Graph3DRegistry.Graph3DRegistry+register"></a>

### graph3DRegistry.register(instance)
Register a Graph3D instance. No-op if already registered.

**Kind**: instance method of [<code>Graph3DRegistry</code>](#module_Graph3DRegistry.Graph3DRegistry)  
**Throws**:

- <code>TypeError</code> If `instance` is not an object.


| Param | Type | Description |
| --- | --- | --- |
| instance | <code>object</code> | A live Graph3D instance. |

**Example**  
```js
registry.register(graph);
```
<a name="module_Graph3DRegistry.Graph3DRegistry+unregister"></a>

### graph3DRegistry.unregister(instance)
Unregister a Graph3D instance. No-op if not registered.

**Kind**: instance method of [<code>Graph3DRegistry</code>](#module_Graph3DRegistry.Graph3DRegistry)  

| Param | Type | Description |
| --- | --- | --- |
| instance | <code>object</code> | The instance to remove. |

**Example**  
```js
registry.unregister(graph);
```
<a name="module_Graph3DRegistry.Graph3DRegistry+all"></a>

### graph3DRegistry.all() ⇒ <code>\*</code>
Return a snapshot array of all currently registered instances.

**Kind**: instance method of [<code>Graph3DRegistry</code>](#module_Graph3DRegistry.Graph3DRegistry)  
**Returns**: <code>\*</code> - Live instances in registration order.  
**Example**  
```js
const all = registry.all();
```
<a name="module_Graph3DRegistry.Graph3DRegistry+disposeAll"></a>

### graph3DRegistry.disposeAll()
Call `dispose()` on every registered instance, then clear the registry.
Instances are disposed in reverse-registration order to respect
typical parent-before-child teardown patterns.

**Kind**: instance method of [<code>Graph3DRegistry</code>](#module_Graph3DRegistry.Graph3DRegistry)  
**Throws**:

- <code>Error</code> Re-throws the first disposal error after attempting all disposals.

**Example**  
```js
registry.disposeAll();
```
<a name="module_Graph3DRegistry.Graph3DRegistry+pauseAll"></a>

### graph3DRegistry.pauseAll()
Call `pause()` on every registered instance that implements it.

**Kind**: instance method of [<code>Graph3DRegistry</code>](#module_Graph3DRegistry.Graph3DRegistry)  
**Example**  
```js
registry.pauseAll();
```
<a name="module_Graph3DRegistry.Graph3DRegistry+resumeAll"></a>

### graph3DRegistry.resumeAll()
Call `resume()` on every registered instance that implements it.

**Kind**: instance method of [<code>Graph3DRegistry</code>](#module_Graph3DRegistry.Graph3DRegistry)  
**Example**  
```js
registry.resumeAll();
```
<a name="module_Graph3DRegistry.Graph3DRegistry+panicDispose"></a>

### graph3DRegistry.panicDispose()
Emergency teardown for HMR scenarios. Disposes every instance
without re-throwing — errors are swallowed and logged so the HMR
replacement module can mount cleanly regardless of prior state.
Clears the registry even if individual disposals fail.

**Kind**: instance method of [<code>Graph3DRegistry</code>](#module_Graph3DRegistry.Graph3DRegistry)  
**Example**  
```js
// vite HMR hook
if (import.meta.hot) {
  import.meta.hot.dispose(() => registry.panicDispose());
}
```
