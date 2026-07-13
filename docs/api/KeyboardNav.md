# KeyboardNav

<a name="module_KeyboardNav.KeyboardNav"></a>

## KeyboardNav
Keyboard-driven accessible navigation across every registered chart's
datums (Prompt 154) — the keyboard counterpart to `PointerRouter`'s mouse
driving of the same `StateMachine` vocabulary, but deliberately a separate
class rather than folded into `PointerRouter`: a different event source
(`keydown`, not pointer events), a different registered-target shape (an
ordered list of charts to cycle through, not a `Picker` to ray-test), and a
DOM resource of its own (the ARIA live region) — the same "small, focused
file per concern" split `Brush`/`Lasso`/`regionSelect.js` already follow.

- **Tab** (Shift+Tab to go backwards) advances a single roving focus
  cursor across every registered chart's current `data()`, in
  registration order, wrapping at both ends; the previously-focused datum
  (if any) returns to `'default'` and the newly-focused one becomes
  `'focused'` via that chart's own `StateMachine` (a fresh one per chart,
  cached the same way `PointerRouter.stateMachineFor` caches its own —
  see the "Scope" note below for what that means when both are used on the
  same chart). `preventDefault()` is called so the browser's own
  focus-shifting Tab behavior doesn't also fire.
- **Enter** selects the currently-focused datum (`'selected'`), replacing
  whatever this class had previously selected (`'default'` — or `'focused'`
  if it's still the focus cursor's current position — mirrors
  `PointerRouter`'s own non-Shift-click "single-select replaces" rule).
  A no-op if nothing is currently focused.
- **Escape** clears the current keyboard-driven selection (back to
  `'focused'` if it's still under the focus cursor, else `'default'`)
  without moving the focus cursor itself — matches the ARIA APG listbox/grid
  pattern (Escape drops a selection, Tab/arrow position is preserved so the
  user doesn't lose their place). A no-op if nothing is currently selected.
- Every Tab/Enter/Escape action also updates the ARIA live region's text
  (`describe(datum, chart)`, default a `"key: value"` summary) so a screen
  reader announces it.
- Tab also calls `chart.dispatch('focus', {chart, datum, domEvent})`; Enter
  calls `chart.dispatch('select', ...)` (and `'deselect'` on whatever chart
  held the previous selection, if different); Escape calls
  `chart.dispatch('deselect', ...)` (Prompt 156's chart-level event
  surface, `barChart.on('focus', fn)`) — alongside, not instead of, the
  `StateMachine`/live-region updates above.

**Scope**: `KeyboardNav` keeps its own `StateMachine` cache, independent of
any `PointerRouter`'s — if both are used against the same chart, they don't
share "what's currently selected" bookkeeping (each only clears what it
itself selected), a known, documented gap (`skipping_list.md`), not a
silent bug — `PointerRouter` exposes no public API for "the current
cross-chart selection" that this class could read/clear instead.

**Kind**: static class of [<code>KeyboardNav</code>](#module_KeyboardNav)  

* [.KeyboardNav](#module_KeyboardNav.KeyboardNav)
    * [new exports.KeyboardNav(options)](#new_module_KeyboardNav.KeyboardNav_new)
    * [.liveRegion](#module_KeyboardNav.KeyboardNav+liveRegion) ⇒ <code>HTMLElement</code>
    * [.register(chart)](#module_KeyboardNav.KeyboardNav+register) ⇒ <code>this</code>
    * [.unregister(chart)](#module_KeyboardNav.KeyboardNav+unregister) ⇒ <code>this</code>
    * [.stateMachineFor(chart)](#module_KeyboardNav.KeyboardNav+stateMachineFor) ⇒ <code>StateMachine</code>
    * [.dispose()](#module_KeyboardNav.KeyboardNav+dispose)

<a name="new_module_KeyboardNav.KeyboardNav_new"></a>

### new exports.KeyboardNav(options)
**Throws**:

- <code>TypeError</code> If `domElement` doesn't expose `addEventListener`/`removeEventListener`, or `describe` is given and isn't a function.


| Param | Type | Description |
| --- | --- | --- |
| options | <code>function</code> | `domElement` also gets   `tabIndex = 0` if it doesn't already have a non-negative one, so it can   actually receive keyboard focus (a canvas has none by default). `describe`   formats a datum for the ARIA live region; defaults to a `"key: value"` summary. |

**Example**  
```js
const nav = new KeyboardNav({ domElement: canvas });
nav.register(barChart).register(scatterChart);
// Tab into the canvas, then Tab/Shift+Tab to move, Enter to select, Esc to clear.
```
<a name="module_KeyboardNav.KeyboardNav+liveRegion"></a>

### keyboardNav.liveRegion ⇒ <code>HTMLElement</code>
The live region element this instance announces into — exposed mainly
for tests/inspection (`nav.liveRegion.textContent`); callers don't
normally need to touch it directly.

**Kind**: instance property of [<code>KeyboardNav</code>](#module_KeyboardNav.KeyboardNav)  
**Example**  
```js
nav.liveRegion.textContent; // 'value: 42, category: "a" (2 of 5)'
```
<a name="module_KeyboardNav.KeyboardNav+register"></a>

### keyboardNav.register(chart) ⇒ <code>this</code>
Adds a chart to the Tab cycle. No-op if already registered.

**Kind**: instance method of [<code>KeyboardNav</code>](#module_KeyboardNav.KeyboardNav)  
**Throws**:

- <code>TypeError</code> If `chart` doesn't expose `selection()`/`data()` methods.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| chart | <code>GraphChart</code> | Duck-typed to `selection()`/`data()`. |

**Example**  
```js
nav.register(barChart);
```
<a name="module_KeyboardNav.KeyboardNav+unregister"></a>

### keyboardNav.unregister(chart) ⇒ <code>this</code>
Removes a chart from the Tab cycle. No-op if not registered.

**Kind**: instance method of [<code>KeyboardNav</code>](#module_KeyboardNav.KeyboardNav)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| chart | <code>GraphChart</code> | 

**Example**  
```js
nav.unregister(barChart);
```
<a name="module_KeyboardNav.KeyboardNav+stateMachineFor"></a>

### keyboardNav.stateMachineFor(chart) ⇒ <code>StateMachine</code>
The `StateMachine` this instance drives for `chart`, creating one
(lazily, cached thereafter) on first access — mirrors
`PointerRouter.stateMachineFor` exactly, letting a caller configure
`.style('focused', ...)` (e.g. a focus ring) the same way it would
configure `'hovered'`/`'selected'` on a `PointerRouter`. See the class
doc comment's "Scope" note: this cache is independent of any
`PointerRouter`'s own.

**Kind**: instance method of [<code>KeyboardNav</code>](#module_KeyboardNav.KeyboardNav)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| chart | <code>GraphChart</code> | 

**Example**  
```js
nav.stateMachineFor(barChart).style('focused', (s) => s.attr('scale.x', 1.1));
```
<a name="module_KeyboardNav.KeyboardNav+dispose"></a>

### keyboardNav.dispose()
Removes the `keydown` listener and the ARIA live region from the
document, and releases this instance's `StateMachine`s/focus/selection
bookkeeping. Idempotent. Does not reset any datum's current state —
charts/state machines may still be in use elsewhere after this instance
is gone.

**Kind**: instance method of [<code>KeyboardNav</code>](#module_KeyboardNav.KeyboardNav)  
**Example**  
```js
nav.dispose();
```
