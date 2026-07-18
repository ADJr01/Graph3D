# GraphAnim

<a name="module_GraphAnim.GraphAnim"></a>

## GraphAnim
The animation engine root (Prompt 89): one shared RAF tick (via`core/Graph3DLoop`'s singleton `loop` — never a second `requestAnimationFrame`,CLAUDE.md's "single loop guarantee") advances every registered`GraphAnimTimeline`. Subscribes to `loop` only while at least one timelineis registered, mirroring `Graph3DLoop`'s own auto-start/stop pattern so anidle engine costs nothing.`respectReducedMotion` (Prompt 95): when set, every registered timeline isadvanced by its own full single-pass `duration` each tick instead of thereal frame delta — enough to cross its finish line in one tick for thecommon single-loop case (a full pass always covers however much of itselfremains), so `.attr()`/`.to()`-style transitions land on their end valuesimmediately rather than animating through them. `GraphAnim` doesn't read`matchMedia` itself (that's an application concern, and would tie thislayer to `window`) — set it from the result of your own`prefers-reduced-motion` check.

**Kind**: static class of [<code>GraphAnim</code>](#module_GraphAnim)  

* [.GraphAnim](#module_GraphAnim.GraphAnim)
    * [new exports.GraphAnim()](#new_module_GraphAnim.GraphAnim_new)
    * [.respectReducedMotion](#module_GraphAnim.GraphAnim+respectReducedMotion) ⇒ <code>boolean</code>
    * [.respectReducedMotion](#module_GraphAnim.GraphAnim+respectReducedMotion)
    * [.isPaused](#module_GraphAnim.GraphAnim+isPaused) ⇒ <code>boolean</code>
    * [.size](#module_GraphAnim.GraphAnim+size) ⇒ <code>number</code>
    * [.timelines](#module_GraphAnim.GraphAnim+timelines) ⇒ <code>\*</code>
    * [.timeline(target)](#module_GraphAnim.GraphAnim+timeline) ⇒ <code>GraphAnimTimeline</code>
    * [.add(timeline)](#module_GraphAnim.GraphAnim+add) ⇒ <code>GraphAnimTimeline</code>
    * [.remove(timeline)](#module_GraphAnim.GraphAnim+remove) ⇒ <code>void</code>
    * [.tween(from, to, options, onUpdate)](#module_GraphAnim.GraphAnim+tween) ⇒ <code>GraphAnimTimeline</code>
    * [.pause()](#module_GraphAnim.GraphAnim+pause) ⇒ <code>void</code>
    * [.resume()](#module_GraphAnim.GraphAnim+resume) ⇒ <code>void</code>
    * [.dispose()](#module_GraphAnim.GraphAnim+dispose) ⇒ <code>void</code>

<a name="new_module_GraphAnim.GraphAnim_new"></a>

### new exports.GraphAnim()
**Example**  
```js
const tl = anim.timeline(mesh.position);tl.to({ y: 5 }, { duration: 1 }).play();// later:anim.dispose();
```
**Example**  
```js
anim.respectReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```
<a name="module_GraphAnim.GraphAnim+respectReducedMotion"></a>

### graphAnim.respectReducedMotion ⇒ <code>boolean</code>
Whether registered timelines snap straight to their end values insteadof animating through them (Prompt 95) — see the class doc for how thisis applied per tick.

**Kind**: instance property of [<code>GraphAnim</code>](#module_GraphAnim.GraphAnim)  
<a name="module_GraphAnim.GraphAnim+respectReducedMotion"></a>

### graphAnim.respectReducedMotion
**Kind**: instance property of [<code>GraphAnim</code>](#module_GraphAnim.GraphAnim)  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>boolean</code> | @throws {TypeError} If `value` is not a boolean. |

<a name="module_GraphAnim.GraphAnim+isPaused"></a>

### graphAnim.isPaused ⇒ <code>boolean</code>
**Kind**: instance property of [<code>GraphAnim</code>](#module_GraphAnim.GraphAnim)  
**Returns**: <code>boolean</code> - `true` while `pause()` is in effect.  
<a name="module_GraphAnim.GraphAnim+size"></a>

### graphAnim.size ⇒ <code>number</code>
**Kind**: instance property of [<code>GraphAnim</code>](#module_GraphAnim.GraphAnim)  
**Returns**: <code>number</code> - Number of timelines currently registered.  
<a name="module_GraphAnim.GraphAnim+timelines"></a>

### graphAnim.timelines ⇒ <code>\*</code>
Every timeline currently registered with this engine — the introspectionprimitive `Graph3D.devtools.listActiveTimelines` (Prompt 178) reads.A snapshot array, not a live view: mutating it doesn't affect this engine.

**Kind**: instance property of [<code>GraphAnim</code>](#module_GraphAnim.GraphAnim)  
**Example**  
```js
anim.timelines.filter((tl) => tl.isPlaying).length;
```
<a name="module_GraphAnim.GraphAnim+timeline"></a>

### graphAnim.timeline(target) ⇒ <code>GraphAnimTimeline</code>
Creates a `GraphAnimTimeline` bound to `target` and registers it with this engine.

**Kind**: instance method of [<code>GraphAnim</code>](#module_GraphAnim.GraphAnim)  
**Throws**:

- <code>Error</code> If this engine has been disposed.


| Param | Type | Description |
| --- | --- | --- |
| target | <code>object</code> | The object whose dot-paths the timeline will animate. |

**Example**  
```js
const tl = anim.timeline(mesh.position);
```
<a name="module_GraphAnim.GraphAnim+add"></a>

### graphAnim.add(timeline) ⇒ <code>GraphAnimTimeline</code>
Registers an existing timeline (e.g. one constructed directly via `newGraphAnimTimeline(target)`) so it receives per-frame `update()` calls.

**Kind**: instance method of [<code>GraphAnim</code>](#module_GraphAnim.GraphAnim)  
**Returns**: <code>GraphAnimTimeline</code> - `timeline`, for chaining.  
**Throws**:

- <code>TypeError</code> If `timeline` is not a `GraphAnimTimeline`.
- <code>Error</code> If this engine has been disposed.


| Param | Type |
| --- | --- |
| timeline | <code>GraphAnimTimeline</code> | 

**Example**  
```js
anim.add(new GraphAnimTimeline(mesh.position)).to({ y: 1 }, { duration: 1 }).play();
```
<a name="module_GraphAnim.GraphAnim+remove"></a>

### graphAnim.remove(timeline) ⇒ <code>void</code>
Unregisters a timeline. No-op if it was never registered.

**Kind**: instance method of [<code>GraphAnim</code>](#module_GraphAnim.GraphAnim)  

| Param | Type |
| --- | --- |
| timeline | <code>GraphAnimTimeline</code> | 

**Example**  
```js
anim.remove(tl);
```
<a name="module_GraphAnim.GraphAnim+tween"></a>

### graphAnim.tween(from, to, options, onUpdate) ⇒ <code>GraphAnimTimeline</code>
An ad-hoc tween (Prompt 95) for callers who just want an interpolatedvalue on every frame without building a full target object/dot-path —e.g. driving a shader uniform or a non-object value. Builds a throwawaysingle-property `GraphAnimTimeline` under the hood (so it inherits`respectReducedMotion`, pause/resume, and disposal for free — CLAUDE.md§1.1 DRY, not a second tween loop) whose one property's value isinterpolated via `compose/interpolate` (Prompt 87's single interpolationauthority) and handed to `onUpdate` each frame.

**Kind**: instance method of [<code>GraphAnim</code>](#module_GraphAnim.GraphAnim)  
**Returns**: <code>GraphAnimTimeline</code> - The underlying timeline (for `.pause()`, `.stop()`, `anim.remove()`, etc).  
**Throws**:

- <code>TypeError</code> If `onUpdate` is not a function, or `from`/`to` can't be interpolated (see `interpolate`).
- <code>Error</code> If this engine has been disposed.


| Param | Type | Description |
| --- | --- | --- |
| from | <code>\*</code> | Start value — any type `compose/interpolate` supports. |
| to | <code>\*</code> | End value, same shape as `from`. |
| options | <code>function</code> | Same shape as `GraphAnimTimeline.to`'s (seconds). |
| onUpdate | <code>function</code> | Called with the interpolated value on every tick. |

**Example**  
```js
anim.tween(0, 1, { duration: 0.5 }, (v) => (material.opacity = v));
```
<a name="module_GraphAnim.GraphAnim+pause"></a>

### graphAnim.pause() ⇒ <code>void</code>
Globally pauses ticking: registered timelines stop receiving `update()`calls until `resume()`, regardless of their own individual play state.

**Kind**: instance method of [<code>GraphAnim</code>](#module_GraphAnim.GraphAnim)  
**Example**  
```js
anim.pause();
```
<a name="module_GraphAnim.GraphAnim+resume"></a>

### graphAnim.resume() ⇒ <code>void</code>
Resumes ticking after `pause()`.

**Kind**: instance method of [<code>GraphAnim</code>](#module_GraphAnim.GraphAnim)  
**Example**  
```js
anim.resume();
```
<a name="module_GraphAnim.GraphAnim+dispose"></a>

### graphAnim.dispose() ⇒ <code>void</code>
Unsubscribes from the shared RAF loop and drops every tracked timeline.Idempotent. After disposal, `timeline()`/`add()` throw; `remove()`/`pause()`/`resume()` become no-ops (nothing is ticking regardless).

**Kind**: instance method of [<code>GraphAnim</code>](#module_GraphAnim.GraphAnim)  
**Example**  
```js
anim.dispose();
```
