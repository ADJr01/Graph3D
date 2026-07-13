# GraphAnimTimeline

<a name="module_GraphAnimTimeline.GraphAnimTimeline"></a>

## GraphAnimTimeline
Sequences one or more property tracks on a single `target`, D3/GSAP-flavored:`.to()`/`.from()` calls made back-to-back run in **parallel** starting atthe current cursor; `.then()` advances the cursor past the current group sothe next calls run **sequentially** after it. Playback is driven by`update(deltaSeconds)` — call it yourself, or register the timeline with`GraphAnim` (Prompt 89) for automatic per-frame ticking.

**Kind**: static class of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline)  

* [.GraphAnimTimeline](#module_GraphAnimTimeline.GraphAnimTimeline)
    * [new exports.GraphAnimTimeline(target)](#new_module_GraphAnimTimeline.GraphAnimTimeline_new)
    * [.duration](#module_GraphAnimTimeline.GraphAnimTimeline+duration) ⇒ <code>number</code>
    * [.time](#module_GraphAnimTimeline.GraphAnimTimeline+time) ⇒ <code>number</code>
    * [.isPlaying](#module_GraphAnimTimeline.GraphAnimTimeline+isPlaying) ⇒ <code>boolean</code>
    * [.to(props, [options])](#module_GraphAnimTimeline.GraphAnimTimeline+to) ⇒ <code>this</code>
    * [.from(props, [options])](#module_GraphAnimTimeline.GraphAnimTimeline+from) ⇒ <code>this</code>
    * [.wait(duration)](#module_GraphAnimTimeline.GraphAnimTimeline+wait) ⇒ <code>this</code>
    * [.then()](#module_GraphAnimTimeline.GraphAnimTimeline+then) ⇒ <code>this</code>
    * [.loop([count], [mode])](#module_GraphAnimTimeline.GraphAnimTimeline+loop) ⇒ <code>this</code>
    * [.play()](#module_GraphAnimTimeline.GraphAnimTimeline+play) ⇒ <code>this</code>
    * [.pause()](#module_GraphAnimTimeline.GraphAnimTimeline+pause) ⇒ <code>this</code>
    * [.stop()](#module_GraphAnimTimeline.GraphAnimTimeline+stop) ⇒ <code>this</code>
    * [.reverse()](#module_GraphAnimTimeline.GraphAnimTimeline+reverse) ⇒ <code>this</code>
    * [.seek(time)](#module_GraphAnimTimeline.GraphAnimTimeline+seek) ⇒ <code>this</code>
    * [.interruptPath(path)](#module_GraphAnimTimeline.GraphAnimTimeline+interruptPath) ⇒ <code>boolean</code>
    * [.onUpdate(fn)](#module_GraphAnimTimeline.GraphAnimTimeline+onUpdate) ⇒ <code>this</code>
    * [.onComplete(fn)](#module_GraphAnimTimeline.GraphAnimTimeline+onComplete) ⇒ <code>this</code>
    * [.onGroupComplete(fn)](#module_GraphAnimTimeline.GraphAnimTimeline+onGroupComplete) ⇒ <code>this</code>
    * [.update(deltaSeconds)](#module_GraphAnimTimeline.GraphAnimTimeline+update) ⇒ <code>void</code>
    * [.dispose()](#module_GraphAnimTimeline.GraphAnimTimeline+dispose) ⇒ <code>void</code>

<a name="new_module_GraphAnimTimeline.GraphAnimTimeline_new"></a>

### new exports.GraphAnimTimeline(target)
**Throws**:

- <code>TypeError</code> If `target` is not a non-null object.


| Param | Type | Description |
| --- | --- | --- |
| target | <code>object</code> | The object whose dot-paths this timeline animates. |

**Example**  
```js
const tl = new GraphAnimTimeline(mesh.position);tl.to({ y: 5 }, { duration: 1 })  .then()  .to({ y: 0 }, { duration: 0.5, easing: 'easeInBounce' })  .onComplete(() => console.log('done'))  .play();
```
<a name="module_GraphAnimTimeline.GraphAnimTimeline+duration"></a>

### graphAnimTimeline.duration ⇒ <code>number</code>
**Kind**: instance property of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Returns**: <code>number</code> - Total single-pass duration in seconds (excludes repeats from `.loop()`).  
<a name="module_GraphAnimTimeline.GraphAnimTimeline+time"></a>

### graphAnimTimeline.time ⇒ <code>number</code>
**Kind**: instance property of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Returns**: <code>number</code> - Current playback position in seconds, within `[0, duration]`.  
<a name="module_GraphAnimTimeline.GraphAnimTimeline+isPlaying"></a>

### graphAnimTimeline.isPlaying ⇒ <code>boolean</code>
**Kind**: instance property of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Returns**: <code>boolean</code> - Whether this timeline is currently advancing on `update()`.  
<a name="module_GraphAnimTimeline.GraphAnimTimeline+to"></a>

### graphAnimTimeline.to(props, [options]) ⇒ <code>this</code>
Animates dot-paths in `props` from their current value (read from`target` right now) to the given value.

**Kind**: instance method of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Throws**:

- <code>TypeError</code> If `props`/`duration`/`delay` are malformed, or `easing` doesn't resolve.


| Param | Type | Description |
| --- | --- | --- |
| props | <code>\*</code> | Dot-path → target value. |
| [options] | <code>function</code> |  |

**Example**  
```js
timeline.to({ 'position.y': 5, opacity: 0 }, { duration: 1, easing: 'easeOutCubic' });
```
<a name="module_GraphAnimTimeline.GraphAnimTimeline+from"></a>

### graphAnimTimeline.from(props, [options]) ⇒ <code>this</code>
Animates dot-paths in `props` from the given value to their currentvalue (read from `target` right now).

**Kind**: instance method of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Throws**:

- <code>TypeError</code> If `props`/`duration`/`delay` are malformed, or `easing` doesn't resolve.


| Param | Type | Description |
| --- | --- | --- |
| props | <code>\*</code> | Dot-path → starting value. |
| [options] | <code>function</code> |  |

**Example**  
```js
timeline.from({ 'scale.y': 0.01 }, { duration: 0.4 });
```
<a name="module_GraphAnimTimeline.GraphAnimTimeline+wait"></a>

### graphAnimTimeline.wait(duration) ⇒ <code>this</code>
Inserts a gap: the next `.to()`/`.from()` group starts `duration` secondsafter the last track added so far finishes.

**Kind**: instance method of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Throws**:

- <code>TypeError</code> If `duration` is not a non-negative number.


| Param | Type | Description |
| --- | --- | --- |
| duration | <code>number</code> | Non-negative seconds. |

**Example**  
```js
timeline.to({ y: 1 }, { duration: 1 }).wait(0.5).to({ y: 0 }, { duration: 1 });
```
<a name="module_GraphAnimTimeline.GraphAnimTimeline+then"></a>

### graphAnimTimeline.then() ⇒ <code>this</code>
Ends the current parallel group: the next `.to()`/`.from()` calls startonly once every track added so far has finished (sequential chaining).Seals the group just ended (Prompt 96's keyframe groups) so its own`onGroupComplete` handlers fire independently of the timeline's overall`onComplete`, and opens a fresh group for the calls that follow.

**Kind**: instance method of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Example**  
```js
timeline.to({ y: 1 }, { duration: 1 }).then().to({ x: 1 }, { duration: 1 });
```
<a name="module_GraphAnimTimeline.GraphAnimTimeline+loop"></a>

### graphAnimTimeline.loop([count], [mode]) ⇒ <code>this</code>
Repeats the full single-pass timeline.

**Kind**: instance method of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Throws**:

- <code>TypeError</code> If `count` is not a positive number, or `mode` is not `'restart'`/`'pingpong'`.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [count] | <code>number</code> |  | Total number of passes, including the first (`Infinity` for endless). Must be positive. |
| [mode] | <code>\*</code> | <code>restart</code> | `'restart'` jumps back to `t=0`; `'pingpong'` reverses direction instead. |

**Example**  
```js
timeline.loop(Infinity, 'pingpong').play();
```
<a name="module_GraphAnimTimeline.GraphAnimTimeline+play"></a>

### graphAnimTimeline.play() ⇒ <code>this</code>
Starts (or resumes) advancing on `update()`. Immediately applies thecurrent position so `target` reflects it without waiting for the next tick.

**Kind**: instance method of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Example**  
```js
timeline.play();
```
<a name="module_GraphAnimTimeline.GraphAnimTimeline+pause"></a>

### graphAnimTimeline.pause() ⇒ <code>this</code>
Freezes playback at the current position; `update()` becomes a no-op until `play()`.

**Kind**: instance method of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Example**  
```js
timeline.pause();
```
<a name="module_GraphAnimTimeline.GraphAnimTimeline+stop"></a>

### graphAnimTimeline.stop() ⇒ <code>this</code>
Stops playback and resets to `t=0` (direction forward, loop count reset), applying that state immediately.

**Kind**: instance method of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Example**  
```js
timeline.stop();
```
<a name="module_GraphAnimTimeline.GraphAnimTimeline+reverse"></a>

### graphAnimTimeline.reverse() ⇒ <code>this</code>
Flips playback direction from the current position. Does not change `isPlaying`.

**Kind**: instance method of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Example**  
```js
timeline.reverse();
```
<a name="module_GraphAnimTimeline.GraphAnimTimeline+seek"></a>

### graphAnimTimeline.seek(time) ⇒ <code>this</code>
Jumps to an absolute position (seconds), clamped to `[0, duration]`, andapplies it immediately. Does not change `isPlaying`, direction, or loop count.

**Kind**: instance method of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Throws**:

- <code>TypeError</code> If `time` is not a finite number.


| Param | Type |
| --- | --- |
| time | <code>number</code> | 

**Example**  
```js
timeline.seek(0.5);
```
<a name="module_GraphAnimTimeline.GraphAnimTimeline+interruptPath"></a>

### graphAnimTimeline.interruptPath(path) ⇒ <code>boolean</code>
Removes every still-live track animating `path`, leaving every othertrack on this timeline untouched — the primitive `anim/Transition` and`compose/selection/SelectionTransition` build interrupt semantics on topof (Prompt 93): a superseding transition on the same target+path callsthis on the transition it's replacing so that timeline stops writing`path` from the next `update()` on, instead of the two fighting over itevery frame. This timeline's own clock (and any *other* path it's stillanimating) is unaffected — only `path`'s tracks are removed.

**Kind**: instance method of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Returns**: <code>boolean</code> - Whether any track was removed (`false` if none matched).  

| Param | Type |
| --- | --- |
| path | <code>string</code> | 

**Example**  
```js
timelineA.interruptPath('position.y');
```
<a name="module_GraphAnimTimeline.GraphAnimTimeline+onUpdate"></a>

### graphAnimTimeline.onUpdate(fn) ⇒ <code>this</code>
Registers a callback fired at the end of every `update()` tick while playing.

**Kind**: instance method of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Throws**:

- <code>TypeError</code> If `fn` is not a function.


| Param | Type |
| --- | --- |
| fn | <code>function</code> | 

**Example**  
```js
timeline.onUpdate((t) => console.log(t));
```
<a name="module_GraphAnimTimeline.GraphAnimTimeline+onComplete"></a>

### graphAnimTimeline.onComplete(fn) ⇒ <code>this</code>
Registers a callback fired once when the timeline finishes all its looppasses (never fires if `.loop(Infinity, ...)` is set).

**Kind**: instance method of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Throws**:

- <code>TypeError</code> If `fn` is not a function.


| Param | Type |
| --- | --- |
| fn | <code>function</code> | 

**Example**  
```js
timeline.onComplete(() => console.log('done'));
```
<a name="module_GraphAnimTimeline.GraphAnimTimeline+onGroupComplete"></a>

### graphAnimTimeline.onGroupComplete(fn) ⇒ <code>this</code>
Registers a callback fired once the *current* `.then()`-delimited groupof parallel tracks finishes (Prompt 96's keyframe groups) — independentof `onComplete`, which only fires once the whole timeline (every group)is done. Attaches to whichever group is currently being built; call itright after the `.to()`/`.from()` calls it should cover, before the next`.then()`. Fires again on each subsequent loop pass; does not fire on a`'pingpong'` pass that re-crosses the boundary in reverse.

**Kind**: instance method of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Throws**:

- <code>TypeError</code> If `fn` is not a function.


| Param | Type |
| --- | --- |
| fn | <code>function</code> | 

**Example**  
```js
timeline.to({ y: 1 }, { duration: 1 }).onGroupComplete(() => console.log('group 1 done'))  .then()  .to({ x: 1 }, { duration: 1 }).onGroupComplete(() => console.log('group 2 done'));
```
<a name="module_GraphAnimTimeline.GraphAnimTimeline+update"></a>

### graphAnimTimeline.update(deltaSeconds) ⇒ <code>void</code>
Advances playback by `deltaSeconds` (scaled by direction), applies theresulting state, and fires `onUpdate`/`onComplete`. No-op while paused/stopped.

**Kind**: instance method of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Throws**:

- <code>TypeError</code> If `deltaSeconds` is not a finite number.


| Param | Type |
| --- | --- |
| deltaSeconds | <code>number</code> | 

**Example**  
```js
timeline.update(0.016);
```
<a name="module_GraphAnimTimeline.GraphAnimTimeline+dispose"></a>

### graphAnimTimeline.dispose() ⇒ <code>void</code>
Clears all tracks and callbacks. Not a GPU/DOM/RAF resource, so this is hygiene rather than the formal disposal contract (CLAUDE.md §3).

**Kind**: instance method of [<code>GraphAnimTimeline</code>](#module_GraphAnimTimeline.GraphAnimTimeline)  
**Example**  
```js
timeline.dispose();
```
