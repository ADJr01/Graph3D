# SelectionTransition

<a name="module_SelectionTransition.SelectionTransition"></a>

## SelectionTransition
`Selection.transition()`'s return value (Prompt 91) — an animatedcounterpart to `Selection.attr()`/`.style()`/`.remove()`: every scheduledwrite captures each node's *current* value as the tween's start andinterpolates toward the target via `compose/interpolate` (Prompt 87'ssingle interpolation authority — no local lerp here either). Configure`.duration()`/`.delay()`/`.easing()` before scheduling writes; each`.attr()`/`.style()` call captures the current configuration for thatproperty only, so different properties can animate on differentschedules within one `SelectionTransition` (matches d3).Driven by one internal `GraphAnimTimeline` registered with the shared`anim` engine (Prompt 89) — a single `onUpdate` tick loops every scheduledjob and every node within it, then commits each instanced job's bufferexactly once per frame (`commitMatrix`/`commitColor`/`commitAttribute`),never per-instance, per the Prompt 91 requirement.This is a sanctioned exception to CLAUDE.md §1.4's "a layer may onlyimport from layers below it": `compose/selection` importing from `anim/`mirrors the existing `scene/`→`compose/selection` carve-out (`GraphScene.selectAll`) — `anim/` itself stays agnostic (it operates on opaquetargets via property paths, never referencing `Selection` or `object/`types), so this crossing doesn't close a cycle; it's `compose/selection`reaching for the one existing timeline/easing engine instead of buildinga second one (DRY).Not constructed directly — obtained via `Selection.transition()`.

**Kind**: static class of [<code>SelectionTransition</code>](#module_SelectionTransition)  

* [.SelectionTransition](#module_SelectionTransition.SelectionTransition)
    * [new exports.SelectionTransition(backend, size, datumAt)](#new_module_SelectionTransition.SelectionTransition_new)
    * [.duration(ms)](#module_SelectionTransition.SelectionTransition+duration) ⇒ <code>this</code>
    * [.delay(msOrFn)](#module_SelectionTransition.SelectionTransition+delay) ⇒ <code>this</code>
    * [.easing(nameOrFn)](#module_SelectionTransition.SelectionTransition+easing) ⇒ <code>this</code>
    * [.on(event, handler)](#module_SelectionTransition.SelectionTransition+on) ⇒ <code>this</code>
    * [.attr(path, valueOrFn)](#module_SelectionTransition.SelectionTransition+attr) ⇒ <code>this</code>
    * [.style(materialProp, valueOrFn)](#module_SelectionTransition.SelectionTransition+style) ⇒ <code>this</code>
    * [.remove()](#module_SelectionTransition.SelectionTransition+remove) ⇒ <code>this</code>
    * [.stop()](#module_SelectionTransition.SelectionTransition+stop) ⇒ <code>void</code>

<a name="new_module_SelectionTransition.SelectionTransition_new"></a>

### new exports.SelectionTransition(backend, size, datumAt)

| Param | Type |
| --- | --- |
| backend | <code>Object</code> | 
| size | <code>number</code> | 
| datumAt | <code>function</code> | 

**Example**  
```js
selection.transition().duration(600).easing('easeOutCubic')  .attr('position.y', (d) => d.value)  .attr('color', (d) => d.color);
```
**Example**  
```js
joined.exit().transition().duration(400).attr('opacity', 0).remove();
```
<a name="module_SelectionTransition.SelectionTransition+duration"></a>

### selectionTransition.duration(ms) ⇒ <code>this</code>
**Kind**: instance method of [<code>SelectionTransition</code>](#module_SelectionTransition.SelectionTransition)  
**Throws**:

- <code>TypeError</code> If `ms` is not a non-negative number.


| Param | Type | Description |
| --- | --- | --- |
| ms | <code>number</code> | Non-negative duration in milliseconds, applied to properties scheduled from here on. |

**Example**  
```js
transition.duration(600);
```
<a name="module_SelectionTransition.SelectionTransition+delay"></a>

### selectionTransition.delay(msOrFn) ⇒ <code>this</code>
**Kind**: instance method of [<code>SelectionTransition</code>](#module_SelectionTransition.SelectionTransition)  
**Throws**:

- <code>TypeError</code> If `msOrFn` is neither a number nor a function.


| Param | Type | Description |
| --- | --- | --- |
| msOrFn | <code>function</code> | A non-negative delay in   milliseconds, or a per-datum function (staggering), applied to properties scheduled from here on. |

**Example**  
```js
transition.delay((d, i) => i * 50); // stagger
```
<a name="module_SelectionTransition.SelectionTransition+easing"></a>

### selectionTransition.easing(nameOrFn) ⇒ <code>this</code>
**Kind**: instance method of [<code>SelectionTransition</code>](#module_SelectionTransition.SelectionTransition)  
**Throws**:

- <code>TypeError</code> If `nameOrFn` does not resolve to a valid easing (see `GraphAnimCurve.resolve`).


| Param | Type | Description |
| --- | --- | --- |
| nameOrFn | <code>function</code> | A `GraphAnimCurve` curve name, or a raw `(t) => number` function. |

**Example**  
```js
transition.easing('easeInOutCubic');
```
<a name="module_SelectionTransition.SelectionTransition+on"></a>

### selectionTransition.on(event, handler) ⇒ <code>this</code>
Registers a lifecycle handler. `'start'` fires once, the first time anyscheduled node begins animating (accounting for `.delay()`); `'end'`fires once this transition's internal timeline completes; `'interrupt'`fires once (Prompt 93) if a later `selection.transition()` call schedulesa write to the same node (mesh, or instanced raw index) and path thistransition is still animating — that node's write is removed from thistransition (it stops fighting the newer one over the same buffer slot),while any of this transition's other, unrelated nodes/jobs keep animating.

**Kind**: instance method of [<code>SelectionTransition</code>](#module_SelectionTransition.SelectionTransition)  
**Throws**:

- <code>TypeError</code> If `event` isn't recognized, or `handler` isn't a function.


| Param | Type |
| --- | --- |
| event | <code>\*</code> | 
| handler | <code>function</code> | 

**Example**  
```js
transition.on('interrupt', () => console.log('superseded'));
```
<a name="module_SelectionTransition.SelectionTransition+attr"></a>

### selectionTransition.attr(path, valueOrFn) ⇒ <code>this</code>
Schedules an animated write to `path`, starting from each node's currentvalue (read from the live buffer/material) and interpolating toward`valueOrFn`'s resolved value using this transition's currentduration/delay/easing. Same path vocabulary as `Selection.attr` (Prompt75) except `'visible'`, which is a boolean toggle and has no meaningfultween — use `Selection.attr('visible', ...)` directly for that.

**Kind**: instance method of [<code>SelectionTransition</code>](#module_SelectionTransition.SelectionTransition)  
**Throws**:

- <code>TypeError</code> If `path` is malformed, targets `'visible'`, or a  resolved value can't be interpolated against the current one.
- <code>Error</code> If `path` names an undefined custom instanced attribute,  or a mesh material with no `'color'` property when `path === 'color'`.


| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> |  |
| valueOrFn | <code>\*</code> | A constant, or `(datum: *, index: number) => value`. |

**Example**  
```js
selectionTransition.attr('position.y', (d) => d.value * scale);
```
<a name="module_SelectionTransition.SelectionTransition+style"></a>

### selectionTransition.style(materialProp, valueOrFn) ⇒ <code>this</code>
Schedules an animated write to a material property — the animatedcounterpart to `Selection.style` (Prompt 77). `'color'`/`'opacity'`behave exactly as `.attr('color'|'opacity', ...)`. On the instancedbackend, any other `materialProp` is material-global (shared across allinstances): it animates once, toward the value resolved from the firstdatum, with a `console.warn` — mirrors `Selection.style`'s existingbehavior for the same reason (one shared material, no per-instance pathfor arbitrary props yet).

**Kind**: instance method of [<code>SelectionTransition</code>](#module_SelectionTransition.SelectionTransition)  
**Throws**:

- <code>TypeError</code> If `materialProp` is not a non-empty string.
- <code>Error</code> If no material in the selection has `materialProp`.


| Param | Type | Description |
| --- | --- | --- |
| materialProp | <code>string</code> |  |
| valueOrFn | <code>\*</code> | A constant, or `(datum: *, index: number) => value`. |

**Example**  
```js
selectionTransition.style('roughness', 0.4);
```
<a name="module_SelectionTransition.SelectionTransition+remove"></a>

### selectionTransition.remove() ⇒ <code>this</code>
Schedules removal (Prompt 79's `Selection.remove`) once every scheduledwrite on this transition completes — disposes each `GraphMesh`, orfrees each instance index back to the join system's free-list. Safe tocall with no prior `.attr()`/`.style()` calls (removal alone stillrespects the configured `.duration()`/`.delay()`).

**Kind**: instance method of [<code>SelectionTransition</code>](#module_SelectionTransition.SelectionTransition)  
**Example**  
```js
joined.exit().transition().duration(400).attr('opacity', 0).remove();
```
<a name="module_SelectionTransition.SelectionTransition+stop"></a>

### selectionTransition.stop() ⇒ <code>void</code>
Immediately unregisters this transition's internal timeline from theshared `anim` engine, abandoning every pending write — no further ticksfire, and any `.remove()` scheduled on this transition never runs.Idempotent (safe on an already-finished, never-started, oralready-stopped transition). For tearing down a chart mid-animation(`GraphChart.destroy()`, Prompt 131), where letting the tween finish (andfiring `'end'` handlers) no longer matters — not a graceful finish.

**Kind**: instance method of [<code>SelectionTransition</code>](#module_SelectionTransition.SelectionTransition)  
**Example**  
```js
transition.stop();
```
