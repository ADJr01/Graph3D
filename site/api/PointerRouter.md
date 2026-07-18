# PointerRouter

<a name="module_PointerRouter.PointerRouter"></a>

## PointerRouter
Wires real DOM pointer events on `domElement` into `picker`'s hit-testing
and a per-chart `StateMachine` (Prompt 148) — the "detect when a datum
should transition" half `StateMachine` itself deliberately doesn't own —
plus `Selection.dispatch()` (Prompt 149) so a caller's own
`chart.selection().filter(...).on('click', fn)` handlers fire too.

- **`pointermove`** → hover-enter/leave: `Picker.pickAt()` each move;
  comparing against the previous hit fires `Selection.dispatch('hover-leave'|'hover-enter', ...)`
  and transitions the datum to/from `'hovered'` via that chart's
  `StateMachine` — but only when the datum is currently `'default'`
  (entering) or `'hovered'` (leaving): a `'selected'`/`'dragging'` datum
  keeps that state while merely hovered over or away from, since a state
  machine transition should reflect the *strongest* current interaction,
  not the most recent one. `Selection.dispatch('hover-enter'|'hover-leave', ...)`
  still always fires regardless (useful for e.g. a tooltip that should
  track the pointer independent of selection).
- **`click`** → select / shift-multi-select: without a held Shift key, every
  previously selected datum (across every chart) is cleared back to
  `'default'` first (single-select replaces); the clicked datum (if any)
  is then set to `'selected'`. With Shift held, the clear step is skipped
  and the clicked datum's selection is *toggled* instead — added if not
  already selected, removed if it was (accumulating a multi-selection
  across possibly multiple charts, since `picker` itself may be
  registered against several). `Selection.dispatch('click', ...)` always
  fires for a hit, regardless of the resulting selection state.

- **`pointerdown`/`pointermove`/`pointerup`** → drag-and-drop (Prompt 154),
  only for a hit chart with `chart.draggable() === true`: `pointerdown` on
  a draggable chart's datum transitions it to `'dragging'` (interrupting
  whatever state it was in — an explicit drag is the strongest possible
  interaction) and remembers whether it was `'selected'` beforehand;
  `pointermove` repositions the datum by unprojecting the pointer through
  `picker.camera` onto the plane parallel to the screen at the datum's
  original depth (so it tracks the cursor exactly, for both perspective and
  orthographic cameras), writing through `Selection.attr('position.*', ...)`
  like any other micro-control write; `pointerup` fires `Selection.dispatch('dragEnd', ...)`
  and restores the pre-drag state (`'selected'` if it was, else `'default'`)
  — `Selection.dispatch('dragStart', ...)` fires from `pointerdown` instead.
  A drag suppresses this router's own hover tracking for its duration (no
  hover-enter/leave noise for datums the cursor merely passes over
  mid-drag) and suppresses the `click` that a real browser fires right
  after the terminating `pointerup`, so a drag never also re-triggers
  click-to-select on the same gesture.

Deliberately does not render the dragged datum's position live except via
that direct write (no separate "drag ghost"/preview) — the write itself
is the visual feedback, the same "detect, don't render more than that"
split `Brush`/`Lasso` (Prompt 152) already follow. What a `'dragging'`
state *looks like* beyond that position write is `StateMachine.style()`'s
job, configured by the caller, same as every other state.

- **`registerLabel`/`unregisterLabel`** (Prompt 155) → `click` also
  hit-tests every registered `annotation.label()` object by projecting its
  `position` to screen space (a label has no real mesh to raycast against
  yet — Phase 6's SDF text) and firing `label.emit('click', ...)` for the
  closest one within `LABEL_HIT_RADIUS_PX`, independent of any chart-datum
  click handling that same click also triggers.
- **`selectedEntries()`** (Prompt 155) exposes the `{chart, datum}` pairs
  this router currently considers selected — e.g. for
  `chart.exportSelection(router.selectedEntries().map((e) => e.datum))`.
- Every transition above also calls `chart.dispatch(event, payload)`
  (Prompt 156) — `'hover'` on hover-enter, `'select'`/`'deselect'` on
  click, `'dragStart'`/`'dragEnd'` on drag — alongside the existing
  `Selection.dispatch()` calls, so `barChart.on('select', fn)` works the
  same way `barChart.selection().on('click', fn)` already did.

**Kind**: static class of [<code>PointerRouter</code>](#module_PointerRouter)  

* [.PointerRouter](#module_PointerRouter.PointerRouter)
    * [new exports.PointerRouter(options)](#new_module_PointerRouter.PointerRouter_new)
    * [.stateMachineFor(chart)](#module_PointerRouter.PointerRouter+stateMachineFor) ⇒ <code>StateMachine</code>
    * [.selectedEntries()](#module_PointerRouter.PointerRouter+selectedEntries) ⇒ <code>Object</code>
    * [.registerLabel(label)](#module_PointerRouter.PointerRouter+registerLabel) ⇒ <code>this</code>
    * [.unregisterLabel(label)](#module_PointerRouter.PointerRouter+unregisterLabel) ⇒ <code>this</code>
    * [.dispose()](#module_PointerRouter.PointerRouter+dispose)

<a name="new_module_PointerRouter.PointerRouter_new"></a>

### new exports.PointerRouter(options)
**Throws**:

- <code>TypeError</code> If `picker` is not a `Picker`, or `domElement` doesn't expose `addEventListener`/`removeEventListener`.


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

**Example**  
```js
const picker = new Picker({ camera, domElement: canvas });
picker.register(barChart);
const router = new PointerRouter({ picker, domElement: canvas });
router.stateMachineFor(barChart).style('hovered', (s) => s.attr('scale.x', 1.1));
barChart.selection().filter((d) => d.value > 90).on('click', (d) => console.log('clicked', d));
```
<a name="module_PointerRouter.PointerRouter+stateMachineFor"></a>

### pointerRouter.stateMachineFor(chart) ⇒ <code>StateMachine</code>
The `StateMachine` this router drives for `chart`, creating one (lazily,
cached thereafter) on first access — a chart only ever needs to have
been `picker.register()`ed for its hits to reach here at all.

**Kind**: instance method of [<code>PointerRouter</code>](#module_PointerRouter.PointerRouter)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| chart | <code>GraphChart</code> | 

**Example**  
```js
router.stateMachineFor(barChart).style('selected', (s) => s.attr('color', 'gold'));
```
<a name="module_PointerRouter.PointerRouter+selectedEntries"></a>

### pointerRouter.selectedEntries() ⇒ <code>Object</code>
Every currently-selected `{chart, datum}` pair, in selection order —
exposes this router's own private `#selected` bookkeeping (Prompt 155,
resolving the gap `skipping_list.md` flagged after Prompt 154) so a
caller can serialize it (e.g. via `chart.exportSelection()`) or drive a
`FocusFollower` from whichever entry it cares about.

**Kind**: instance method of [<code>PointerRouter</code>](#module_PointerRouter.PointerRouter)  
**Throws**:

- <code>Error</code> If called after `dispose()`.

**Example**  
```js
router.selectedEntries().map((e) => e.datum);
```
<a name="module_PointerRouter.PointerRouter+registerLabel"></a>

### pointerRouter.registerLabel(label) ⇒ <code>this</code>
Registers an `annotation.label()` object so a `click` landing within
`LABEL_HIT_RADIUS_PX` of its projected screen position fires
`label.emit('click', { label, domEvent })` (Prompt 155) — the closest
registered label within range wins if several overlap. No-op if already registered.

**Kind**: instance method of [<code>PointerRouter</code>](#module_PointerRouter.PointerRouter)  
**Throws**:

- <code>TypeError</code> If `label` isn't an `annotation.label()` object.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| label | <code>Object</code> | An `annotation.label()` return value. |

**Example**  
```js
router.registerLabel(annotation.label({ text: 'Peak', position: { x: 3, y: 5, z: 0 } }));
```
<a name="module_PointerRouter.PointerRouter+unregisterLabel"></a>

### pointerRouter.unregisterLabel(label) ⇒ <code>this</code>
Removes a label from the set `click` hit-tests against. No-op if not registered.

**Kind**: instance method of [<code>PointerRouter</code>](#module_PointerRouter.PointerRouter)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| label | <code>Object</code> | 

**Example**  
```js
router.unregisterLabel(peakLabel);
```
<a name="module_PointerRouter.PointerRouter+dispose"></a>

### pointerRouter.dispose()
Removes the `pointerdown`/`pointermove`/`pointerup`/`click` listeners
from `domElement` and releases this router's `StateMachine`s, selection,
registered labels, and in-progress-drag bookkeeping. Idempotent. Does not
reset any datum's current state — charts/state machines may still be in
use elsewhere after this router is gone.

**Kind**: instance method of [<code>PointerRouter</code>](#module_PointerRouter.PointerRouter)  
**Example**  
```js
router.dispose();
```
