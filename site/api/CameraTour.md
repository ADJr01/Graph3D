# CameraTour

<a name="module_CameraTour.CameraTour"></a>

## CameraTour
Flies a `THREE.Camera` through a sequence of waypoints (Prompt 94, fleshingout Phase 2's `GraphSceneCamera.tour()`/`cameraPrimitives.tour()` stub witha richer, standalone playback controller): each waypoint's `at` position,`lookAt` target, and optional `fov` interpolate from the previouswaypoint's end state over that waypoint's own `duration`/`easing`(resolved through `anim/GraphAnimCurve` — no local easing table). Driven bythe shared RAF `loop` (never a second `requestAnimationFrame`).Operates directly on a raw `THREE.Camera` — like `compose/axis`/`compose/annotation`'s existing sanctioned touches of `THREE.*`, this is adomain-specific animator that has to know about cameras, not the fullyopaque `GraphAnimTimeline`/`GraphAnimKeyframe` engine — so it takes no`scene/` dependency at all (no new CLAUDE.md exception needed).Auto-plays on construction, matching this codebase's other "call it, itstarts" builders (`Transition.to()`, `GraphSceneCamera.tour()`).

**Kind**: static class of [<code>CameraTour</code>](#module_CameraTour)  

* [.CameraTour](#module_CameraTour.CameraTour)
    * [new exports.CameraTour(camera, waypoints)](#new_module_CameraTour.CameraTour_new)
    * _instance_
        * [.isPlaying](#module_CameraTour.CameraTour+isPlaying) ⇒ <code>boolean</code>
        * [.currentWaypointIndex](#module_CameraTour.CameraTour+currentWaypointIndex) ⇒ <code>number</code>
        * [.play()](#module_CameraTour.CameraTour+play) ⇒ <code>this</code>
        * [.pause()](#module_CameraTour.CameraTour+pause) ⇒ <code>this</code>
        * [.resume()](#module_CameraTour.CameraTour+resume) ⇒ <code>this</code>
        * [.skipToNext()](#module_CameraTour.CameraTour+skipToNext) ⇒ <code>this</code>
        * [.onComplete(handler)](#module_CameraTour.CameraTour+onComplete) ⇒ <code>this</code>
        * [.cancel()](#module_CameraTour.CameraTour+cancel) ⇒ <code>this</code>
    * _static_
        * [.orbit(camera, [options])](#module_CameraTour.CameraTour.orbit) ⇒ <code>CameraTour</code>
        * [.flyTo(camera, options)](#module_CameraTour.CameraTour.flyTo) ⇒ <code>CameraTour</code>
        * [.cinematicReveal(camera, [options])](#module_CameraTour.CameraTour.cinematicReveal) ⇒ <code>CameraTour</code>

<a name="new_module_CameraTour.CameraTour_new"></a>

### new exports.CameraTour(camera, waypoints)
**Throws**:

- <code>TypeError</code> If `camera` is not a `THREE.Camera`, or `waypoints` is  empty or has malformed entries.


| Param | Type |
| --- | --- |
| camera | <code>THREE.Camera</code> | 
| waypoints | <code>\*</code> | 

**Example**  
```js
const t = new CameraTour(camera, [  { at: [10, 10, 10], lookAt: [0, 0, 0], duration: 2000, easing: 'easeOutCubic' },  { at: [-10, 5, 10], lookAt: [0, 0, 0], duration: 1500 },]);t.pause();t.resume();t.skipToNext();
```
**Example**  
```js
CameraTour.orbit(camera, { center: [0, 0, 0], radius: 15 });
```
<a name="module_CameraTour.CameraTour+isPlaying"></a>

### cameraTour.isPlaying ⇒ <code>boolean</code>
**Kind**: instance property of [<code>CameraTour</code>](#module_CameraTour.CameraTour)  
**Returns**: <code>boolean</code> - Whether this tour is currently advancing on the shared loop.  
<a name="module_CameraTour.CameraTour+currentWaypointIndex"></a>

### cameraTour.currentWaypointIndex ⇒ <code>number</code>
**Kind**: instance property of [<code>CameraTour</code>](#module_CameraTour.CameraTour)  
**Returns**: <code>number</code> - Index of the waypoint currently being flown toward.  
<a name="module_CameraTour.CameraTour+play"></a>

### cameraTour.play() ⇒ <code>this</code>
Resumes (or starts) advancing through waypoints. No-op if alreadyplaying, or if `cancel()` was called (a cancelled tour cannot restart).

**Kind**: instance method of [<code>CameraTour</code>](#module_CameraTour.CameraTour)  
**Example**  
```js
tour.play();
```
<a name="module_CameraTour.CameraTour+pause"></a>

### cameraTour.pause() ⇒ <code>this</code>
Freezes playback at the current position between waypoints. No-op ifalready paused or cancelled.

**Kind**: instance method of [<code>CameraTour</code>](#module_CameraTour.CameraTour)  
**Example**  
```js
tour.pause();
```
<a name="module_CameraTour.CameraTour+resume"></a>

### cameraTour.resume() ⇒ <code>this</code>
Alias for `play()`, read better after a `pause()`.

**Kind**: instance method of [<code>CameraTour</code>](#module_CameraTour.CameraTour)  
**Example**  
```js
tour.resume();
```
<a name="module_CameraTour.CameraTour+skipToNext"></a>

### cameraTour.skipToNext() ⇒ <code>this</code>
Snaps immediately to the end of the current waypoint and advances to thenext one (or completes, if this was the last). No-op once the tour hasalready completed or been cancelled.

**Kind**: instance method of [<code>CameraTour</code>](#module_CameraTour.CameraTour)  
**Example**  
```js
tour.skipToNext();
```
<a name="module_CameraTour.CameraTour+onComplete"></a>

### cameraTour.onComplete(handler) ⇒ <code>this</code>
Registers a callback fired once when every waypoint has been reached.Never fires if `cancel()` is called first.

**Kind**: instance method of [<code>CameraTour</code>](#module_CameraTour.CameraTour)  
**Throws**:

- <code>TypeError</code> If `handler` is not a function.


| Param | Type |
| --- | --- |
| handler | <code>function</code> | 

**Example**  
```js
tour.onComplete(() => console.log('tour done'));
```
<a name="module_CameraTour.CameraTour+cancel"></a>

### cameraTour.cancel() ⇒ <code>this</code>
Stops playback permanently and unregisters from the shared loop.Idempotent; `play()`/`resume()`/`skipToNext()` become no-ops afterward.

**Kind**: instance method of [<code>CameraTour</code>](#module_CameraTour.CameraTour)  
**Example**  
```js
tour.cancel();
```
<a name="module_CameraTour.CameraTour.orbit"></a>

### CameraTour.orbit(camera, [options]) ⇒ <code>CameraTour</code>
A continuous orbit around `center` at a fixed `radius`/`height`, splitinto `segments` equal waypoints spanning `duration` in total.

**Kind**: static method of [<code>CameraTour</code>](#module_CameraTour.CameraTour)  
**Throws**:

- <code>TypeError</code> If `segments` is not an integer >= 3.


| Param | Type |
| --- | --- |
| camera | <code>THREE.Camera</code> | 
| [options] | <code>function</code> | 

**Example**  
```js
CameraTour.orbit(camera, { center: [0, 0, 0], radius: 15, duration: 8000 });
```
<a name="module_CameraTour.CameraTour.flyTo"></a>

### CameraTour.flyTo(camera, options) ⇒ <code>CameraTour</code>
A single straight-line flight to `at`/`lookAt` (and `fov`, for perspective cameras).

**Kind**: static method of [<code>CameraTour</code>](#module_CameraTour.CameraTour)  

| Param | Type |
| --- | --- |
| camera | <code>THREE.Camera</code> | 
| options | <code>function</code> | 

**Example**  
```js
CameraTour.flyTo(camera, { at: [5, 5, 5], lookAt: [0, 0, 0], duration: 1200 });
```
<a name="module_CameraTour.CameraTour.cinematicReveal"></a>

### CameraTour.cinematicReveal(camera, [options]) ⇒ <code>CameraTour</code>
A canned two-beat establishing shot: a wide, high, narrow-FOV openingview of `target` easing into a closer, lower, wider-FOV framing —the "sweep down into the scene" cinematic opening.

**Kind**: static method of [<code>CameraTour</code>](#module_CameraTour.CameraTour)  

| Param | Type |
| --- | --- |
| camera | <code>THREE.Camera</code> | 
| [options] | <code>function</code> | 

**Example**  
```js
CameraTour.cinematicReveal(camera, { target: [0, 0, 0] });
```
