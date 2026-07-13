# FocusFollower

<a name="module_FocusFollower.FocusFollower"></a>

## FocusFollower
Continuously orbits a `THREE.Camera` around whichever datum is currently
"focused" — deliberately fed the world position explicitly (`follow(chart,
datum)`) rather than wiring itself to `PointerRouter`'s hover/select events
or `KeyboardNav`'s Tab cursor directly: both are legitimate focus sources
(Prompt 154) and there's no single canonical "focus" event yet (that
unification is Prompt 156's job) — so a caller wires whichever one it wants
via its own `on('hover-enter', ...)`/Tab-cycling callback, same as
`StateMachine`'s "detect vs. respond" split.

Delegates the actual orbit motion to `anim/CameraTour.orbit()` (CLAUDE.md
§1.1 DRY — no second camera-path engine here) — each lap's `onComplete`
immediately restarts an identical orbit around the same target, since
`CameraTour.orbit()` itself only ever flies once around and stops.
`follow()` cancels any orbit already in progress and starts a fresh one
around the new target; `stop()` cancels without moving the camera further.

**Kind**: static class of [<code>FocusFollower</code>](#module_FocusFollower)  

* [.FocusFollower](#module_FocusFollower.FocusFollower)
    * [new exports.FocusFollower(options)](#new_module_FocusFollower.FocusFollower_new)
    * [.isFollowing](#module_FocusFollower.FocusFollower+isFollowing) ⇒ <code>boolean</code>
    * [.follow(chart, datum)](#module_FocusFollower.FocusFollower+follow) ⇒ <code>this</code>
    * [.stop()](#module_FocusFollower.FocusFollower+stop) ⇒ <code>this</code>
    * [.dispose()](#module_FocusFollower.FocusFollower+dispose)

<a name="new_module_FocusFollower.FocusFollower_new"></a>

### new exports.FocusFollower(options)
**Throws**:

- <code>TypeError</code> If `camera` is not a `THREE.Camera`, or a numeric option is not a positive number.


| Param | Type |
| --- | --- |
| options | <code>function</code> | 

**Example**  
```js
const follower = new FocusFollower({ camera: scene.camera.three, radius: 12 });
barChart.selection().on('hover-enter', (d) => {}); // Selection.dispatch source
router.stateMachineFor(barChart); // (however the caller detects focus)
follower.follow(barChart, someDatum);
follower.stop();
```
<a name="module_FocusFollower.FocusFollower+isFollowing"></a>

### focusFollower.isFollowing ⇒ <code>boolean</code>
**Kind**: instance property of [<code>FocusFollower</code>](#module_FocusFollower.FocusFollower)  
**Returns**: <code>boolean</code> - Whether the camera is currently orbiting a focused datum.  
<a name="module_FocusFollower.FocusFollower+follow"></a>

### focusFollower.follow(chart, datum) ⇒ <code>this</code>
Starts (or redirects) a continuous orbit around `datum`'s current world
position within `chart`. Cancels any orbit already in progress first.

**Kind**: instance method of [<code>FocusFollower</code>](#module_FocusFollower.FocusFollower)  
**Throws**:

- <code>TypeError</code> If `chart` doesn't expose `selection()`/`scene`.
- <code>Error</code> If `datum` isn't currently bound to `chart`, or if called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| chart | <code>GraphChart</code> | Any `GraphChart` — duck-typed to `selection()`/`scene`. |
| datum | <code>\*</code> | Must be one of `chart`'s currently bound `data()` entries. |

**Example**  
```js
follower.follow(barChart, hit.datum);
```
<a name="module_FocusFollower.FocusFollower+stop"></a>

### focusFollower.stop() ⇒ <code>this</code>
Cancels the in-progress orbit, if any, leaving the camera where it is. No-op if not following.

**Kind**: instance method of [<code>FocusFollower</code>](#module_FocusFollower.FocusFollower)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
follower.stop();
```
<a name="module_FocusFollower.FocusFollower+dispose"></a>

### focusFollower.dispose()
Cancels any in-progress orbit. Idempotent.

**Kind**: instance method of [<code>FocusFollower</code>](#module_FocusFollower.FocusFollower)  
**Example**  
```js
follower.dispose();
```
