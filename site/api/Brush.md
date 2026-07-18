# Brush

<a name="module_Brush.Brush"></a>

## Brush
Draggable axis-aligned screen-space rectangle → a real `Selection` per
registered chart with at least one datum inside it (Prompt 152). Attaches
real `pointerdown`/`pointermove`/`pointerup` listeners to `domElement` and
tracks a drag gesture; on release, projects every registered chart's
datums to screen space (`interact/regionSelect.js`, shared with `Lasso`)
and tests each against the final rectangle.

Deliberately does not render the drag rectangle itself — same scope split
as `Picker` not rendering a cursor, `PointerRouter` not rendering a
tooltip: `interact/` detects, callers decide what (if anything) to draw.
Listen for `'brush'` (fires on every `pointermove` while dragging, with
the rectangle so far) to draw a live overlay.

A `Selection` can't span multiple charts' backends (`Selection.merge()`
throws across different charts/`GraphInstancedObject`s — `compose/selection/combinators.js`),
so `'select'` fires once per chart that has ≥1 match, not once per drag —
a single-chart setup collapses to exactly one `'select'` call, matching
the prompt's own "emit `select` with a real `Selection`" wording.

Also fires `chart.dispatch('brushStart', ...)` on every registered chart
when the drag begins, and `chart.dispatch('brushEnd', ...)` on each chart
that gets a `'select'` above (Prompt 156's chart-level event surface,
`barChart.on('brushEnd', fn)`) — alongside, not instead of, this brush's
own `on('brushStart'|'select', ...)`.

**Kind**: static class of [<code>Brush</code>](#module_Brush)  

* [.Brush](#module_Brush.Brush)
    * [new exports.Brush(options)](#new_module_Brush.Brush_new)
    * [.register(chart)](#module_Brush.Brush+register) ⇒ <code>this</code>
    * [.unregister(chart)](#module_Brush.Brush+unregister) ⇒ <code>this</code>
    * [.on(event, handler)](#module_Brush.Brush+on) ⇒ <code>this</code>
    * [.dispose()](#module_Brush.Brush+dispose)

<a name="new_module_Brush.Brush_new"></a>

### new exports.Brush(options)
**Throws**:

- <code>TypeError</code> If `camera` is not a `THREE.Camera`, or `domElement` lacks `addEventListener`/`removeEventListener`.


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

**Example**  
```js
const brush = new Brush({ camera: scene.camera.three, domElement: canvas });
brush.register(barChart).register(scatterChart);
brush.on('select', (selection, chart) => selection.attr('color', 'gold'));
```
<a name="module_Brush.Brush+register"></a>

### brush.register(chart) ⇒ <code>this</code>
Add a chart to the set tested on drag-end. No-op if already registered.

**Kind**: instance method of [<code>Brush</code>](#module_Brush.Brush)  
**Throws**:

- <code>TypeError</code> If `chart` doesn't expose a `selection()` method.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| chart | <code>GraphChart</code> | Duck-typed to `selection()`. |

**Example**  
```js
brush.register(barChart);
```
<a name="module_Brush.Brush+unregister"></a>

### brush.unregister(chart) ⇒ <code>this</code>
Remove a chart from the set tested on drag-end. No-op if not registered.

**Kind**: instance method of [<code>Brush</code>](#module_Brush.Brush)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| chart | <code>GraphChart</code> | 

**Example**  
```js
brush.unregister(barChart);
```
<a name="module_Brush.Brush+on"></a>

### brush.on(event, handler) ⇒ <code>this</code>
Registers a handler for one of this brush's events: `'brushStart'`
(drag begins, called with the origin `{x, y}`), `'brush'` (fires on
every `pointermove` while dragging, called with the current rectangle
`{x, y, width, height}`), `'brushEnd'` (drag ends, called with the final
rectangle), or `'select'` (called once per registered chart with ≥1
matching datum, `(selection, chart)`).

**Kind**: instance method of [<code>Brush</code>](#module_Brush.Brush)  
**Throws**:

- <code>TypeError</code> If `event` isn't recognized, or `handler` isn't a function.


| Param | Type |
| --- | --- |
| event | <code>\*</code> | 
| handler | <code>function</code> | 

**Example**  
```js
brush.on('select', (selection, chart) => selection.attr('color', 'gold'));
```
<a name="module_Brush.Brush+dispose"></a>

### brush.dispose()
Removes the registered pointer listeners and clears registered charts.
Idempotent.

**Kind**: instance method of [<code>Brush</code>](#module_Brush.Brush)  
**Example**  
```js
brush.dispose();
```
