# Transition

<a name="module_Transition.Transition"></a>

## Transition
D3-flavored transition builder (Prompt 90): configure `.duration()`/`.delay()`/`.easing()`/`.on()`, then `.to(props)` to animate `target`'sdot-paths toward the given values instead of snapping. A thin sugar layerover `GraphAnimTimeline`/`GraphAnim` (CLAUDE.md §1.1 DRY — no tween mathlives here, only D3-flavored configuration).

**Kind**: static class of [<code>Transition</code>](#module_Transition)  

* [.Transition](#module_Transition.Transition)
    * [new exports.Transition(target)](#new_module_Transition.Transition_new)
    * _instance_
        * [.duration(ms)](#module_Transition.Transition+duration) ⇒ <code>this</code>
        * [.delay(msOrFn)](#module_Transition.Transition+delay) ⇒ <code>this</code>
        * [.easing(nameOrFn)](#module_Transition.Transition+easing) ⇒ <code>this</code>
        * [.on(event, handler)](#module_Transition.Transition+on) ⇒ <code>this</code>
        * [.to(props)](#module_Transition.Transition+to) ⇒ <code>GraphAnimTimeline</code>
    * _static_
        * [.runningOn(target)](#module_Transition.Transition.runningOn) ⇒ <code>number</code>
        * [.cancelAllOn(target)](#module_Transition.Transition.cancelAllOn) ⇒ <code>number</code>

<a name="new_module_Transition.Transition_new"></a>

### new exports.Transition(target)
**Throws**:

- <code>TypeError</code> If `target` is not a non-null object.


| Param | Type | Description |
| --- | --- | --- |
| target | <code>object</code> | The object whose dot-paths will be animated. |

**Example**  
```js
new Transition(bar.scale)  .duration(600)  .easing('easeOutCubic')  .on('end', () => console.log('done'))  .to({ y: 2.4 });
```
<a name="module_Transition.Transition+duration"></a>

### transition.duration(ms) ⇒ <code>this</code>
**Kind**: instance method of [<code>Transition</code>](#module_Transition.Transition)  
**Throws**:

- <code>TypeError</code> If `ms` is not a non-negative number.


| Param | Type | Description |
| --- | --- | --- |
| ms | <code>number</code> | Non-negative duration in milliseconds. |

**Example**  
```js
transition.duration(600);
```
<a name="module_Transition.Transition+delay"></a>

### transition.delay(msOrFn) ⇒ <code>this</code>
**Kind**: instance method of [<code>Transition</code>](#module_Transition.Transition)  
**Throws**:

- <code>TypeError</code> If `msOrFn` is neither a number nor a function.


| Param | Type | Description |
| --- | --- | --- |
| msOrFn | <code>function</code> | A non-negative delay in milliseconds, or a function returning one. |

**Example**  
```js
transition.delay(100);
```
<a name="module_Transition.Transition+easing"></a>

### transition.easing(nameOrFn) ⇒ <code>this</code>
**Kind**: instance method of [<code>Transition</code>](#module_Transition.Transition)  
**Throws**:

- <code>TypeError</code> If `nameOrFn` does not resolve to a valid easing (see `GraphAnimCurve.resolve`).


| Param | Type | Description |
| --- | --- | --- |
| nameOrFn | <code>function</code> | A `GraphAnimCurve` curve name, or a raw `(t) => number` function. |

**Example**  
```js
transition.easing('easeInOutCubic');
```
<a name="module_Transition.Transition+on"></a>

### transition.on(event, handler) ⇒ <code>this</code>
Registers a lifecycle handler. `'start'` fires once playback (past anyconfigured delay) begins; `'end'` fires once this transition completesnormally; `'interrupt'` fires once (Prompt 93) if a later `.to()` call onthe same target and an overlapping dot-path supersedes this one beforeit finishes — in which case `'end'` does *not* also fire for this transition.

**Kind**: instance method of [<code>Transition</code>](#module_Transition.Transition)  
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
<a name="module_Transition.Transition+to"></a>

### transition.to(props) ⇒ <code>GraphAnimTimeline</code>
Animates `target`'s dot-paths in `props` to the given values, using thistransition's configured duration/delay/easing. Registers the underlyingtimeline with the shared `anim` engine (Prompt 89) and starts it immediately.

**Kind**: instance method of [<code>Transition</code>](#module_Transition.Transition)  
**Returns**: <code>GraphAnimTimeline</code> - The underlying timeline (for `.stop()`, further sequencing via `.then()`, etc).  
**Throws**:

- <code>TypeError</code> If `props` isn't a plain object, or a configured delay function returns a non-number.


| Param | Type | Description |
| --- | --- | --- |
| props | <code>\*</code> | Dot-path → target value. |

**Example**  
```js
transition.to({ 'position.y': 4, opacity: 0 });
```
<a name="module_Transition.Transition.runningOn"></a>

### Transition.runningOn(target) ⇒ <code>number</code>
How many dot-paths on `target` currently have a `Transition` stillanimating them (Prompt 96) — the introspection primitive a future`chart.runningTransitions()` delegates to once `src/chart/` exists(Phase 8); usable standalone today against any target.

**Kind**: static method of [<code>Transition</code>](#module_Transition.Transition)  

| Param | Type |
| --- | --- |
| target | <code>object</code> | 

**Example**  
```js
Transition.runningOn(mesh.position); // 2, if x and y are both mid-tween
```
<a name="module_Transition.Transition.cancelAllOn"></a>

### Transition.cancelAllOn(target) ⇒ <code>number</code>
Immediately stops every `Transition` currently animating any path of`target` (Prompt 96) — the introspection primitive a future`chart.cancelTransitions()` delegates to. Each stopped transition issimply unregistered from `anim`, frozen at its current interpolatedvalue — neither its `'end'` nor `'interrupt'` handlers fire (this is ahard stop requested by the caller, not one transition supersedinganother).

**Kind**: static method of [<code>Transition</code>](#module_Transition.Transition)  
**Returns**: <code>number</code> - How many were stopped.  

| Param | Type |
| --- | --- |
| target | <code>object</code> | 

**Example**  
```js
Transition.cancelAllOn(mesh.position);
```
