# FrameBudget

<a name="module_FrameBudget.FrameBudget"></a>

## FrameBudget.FrameBudget ⇐ <code>EventTarget</code>
Per-frame timing watchdog. Tracks consecutive over-budget frames and dispatches
a `graph3d:slow-frame` CustomEvent once the threshold is met, then resets so
subsequent bursts also emit. Extends `EventTarget` for zero-coupling event delivery.

Frame times are in **milliseconds**. If you receive delta in seconds from
`Graph3DLoop`, multiply by 1000 before passing to `record`.

**Kind**: static class of [<code>FrameBudget</code>](#module_FrameBudget)  
**Extends**: <code>EventTarget</code>  

* [.FrameBudget](#module_FrameBudget.FrameBudget) ⇐ <code>EventTarget</code>
    * [new exports.FrameBudget([options])](#new_module_FrameBudget.FrameBudget_new)
    * [.budgetMs](#module_FrameBudget.FrameBudget+budgetMs) ⇒ <code>number</code>
    * [.windowSize](#module_FrameBudget.FrameBudget+windowSize) ⇒ <code>number</code>
    * [.record(frameMs, [context])](#module_FrameBudget.FrameBudget+record)
    * [.reset()](#module_FrameBudget.FrameBudget+reset)
    * [.dispose()](#module_FrameBudget.FrameBudget+dispose)

<a name="new_module_FrameBudget.FrameBudget_new"></a>

### new exports.FrameBudget([options])
**Throws**:

- <code>TypeError</code> If `budgetMs` is not a positive number.
- <code>TypeError</code> If `windowSize` is not a positive integer.


| Param | Type |
| --- | --- |
| [options] | <code>FrameBudgetOptions</code> | 

**Example**  
```js
const budget = new FrameBudget({ budgetMs: 16, windowSize: 5 });
budget.addEventListener('graph3d:slow-frame', ({ detail }) => {
  console.warn('slow frame', detail.fps.toFixed(1), 'fps');
});

// Inside the render loop (delta is in seconds from Graph3DLoop):
budget.record(delta * 1000, {
  chartId: 'scatter-1',
  drawCalls: renderer.info.render.calls,
  triangleCount: renderer.info.render.triangles,
  meshCount: renderer.info.memory.geometries,
});
```
<a name="module_FrameBudget.FrameBudget+budgetMs"></a>

### frameBudget.budgetMs ⇒ <code>number</code>
The configured per-frame budget in milliseconds.

**Kind**: instance property of [<code>FrameBudget</code>](#module_FrameBudget.FrameBudget)  
<a name="module_FrameBudget.FrameBudget+windowSize"></a>

### frameBudget.windowSize ⇒ <code>number</code>
The number of consecutive slow frames required to emit.

**Kind**: instance property of [<code>FrameBudget</code>](#module_FrameBudget.FrameBudget)  
<a name="module_FrameBudget.FrameBudget+record"></a>

### frameBudget.record(frameMs, [context])
Record one frame's elapsed time and update the slow-frame counter.
Dispatches `graph3d:slow-frame` when `windowSize` consecutive frames
each exceed `budgetMs`, then resets the counter.

**Kind**: instance method of [<code>FrameBudget</code>](#module_FrameBudget.FrameBudget)  
**Throws**:

- <code>Error</code> If called after `dispose()`.
- <code>TypeError</code> If `frameMs` is not a non-negative number.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| frameMs | <code>number</code> |  | Elapsed time for this frame in **milliseconds**. |
| [context] | <code>object</code> |  | Renderer stats to include in the event detail. |
| [context.chartId] | <code>string</code> \| <code>null</code> | <code>null</code> |  |
| [context.drawCalls] | <code>number</code> | <code>0</code> |  |
| [context.triangleCount] | <code>number</code> | <code>0</code> |  |
| [context.meshCount] | <code>number</code> | <code>0</code> |  |

**Example**  
```js
budget.record(16.7, { chartId: 'scatter-1', drawCalls: 42, triangleCount: 120000, meshCount: 3 });
```
<a name="module_FrameBudget.FrameBudget+reset"></a>

### frameBudget.reset()
Reset the consecutive-frame counter and the rolling time buffer.
Call this on pause/resume or scene change to avoid false positives
caused by a gap in the frame stream.

**Kind**: instance method of [<code>FrameBudget</code>](#module_FrameBudget.FrameBudget)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
budget.reset();
```
<a name="module_FrameBudget.FrameBudget+dispose"></a>

### frameBudget.dispose()
Release internal state. Safe to call multiple times (idempotent).
After disposal, `record` and `reset` throw; `addEventListener` and
`removeEventListener` become no-ops via the parent EventTarget.

**Kind**: instance method of [<code>FrameBudget</code>](#module_FrameBudget.FrameBudget)  
**Example**  
```js
budget.dispose();
```
