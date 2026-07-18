# Lasso

<a name="module_Lasso.Lasso"></a>

## Lasso
Free-form screen-space polygon → a real `Selection` per registered chart
with at least one datum inside it (Prompt 152) — same drag lifecycle,
per-chart `'select'` firing, and "no visual rendering of its own" scope
split as `Brush` (see that file's doc comment); the only real difference
is the containment test (`pointInPolygon` vs an AABB) and that a drag
accumulates a point path instead of two corners.

Also fires `chart.dispatch('lassoStart', ...)` on every registered chart
when the drag begins, and `chart.dispatch('lassoEnd', ...)` on each chart
that gets a `'select'` below (Prompt 156's chart-level event surface,
`scatterChart.on('lassoEnd', fn)`) — alongside, not instead of, this
lasso's own `on('lassoStart'|'select', ...)`.

**Kind**: static class of [<code>Lasso</code>](#module_Lasso)  

* [.Lasso](#module_Lasso.Lasso)
    * [new exports.Lasso(options)](#new_module_Lasso.Lasso_new)
    * [.register(chart)](#module_Lasso.Lasso+register) ⇒ <code>this</code>
    * [.unregister(chart)](#module_Lasso.Lasso+unregister) ⇒ <code>this</code>
    * [.on(event, handler)](#module_Lasso.Lasso+on) ⇒ <code>this</code>
    * [.dispose()](#module_Lasso.Lasso+dispose)

<a name="new_module_Lasso.Lasso_new"></a>

### new exports.Lasso(options)
**Throws**:

- <code>TypeError</code> If `camera` is not a `THREE.Camera`, or `domElement` lacks `addEventListener`/`removeEventListener`.


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

**Example**  
```js
const lasso = new Lasso({ camera: scene.camera.three, domElement: canvas });
lasso.register(scatterChart);
lasso.on('lasso', (points) => drawPolygonOverlay(points));
lasso.on('select', (selection) => selection.attr('color', 'gold'));
```
<a name="module_Lasso.Lasso+register"></a>

### lasso.register(chart) ⇒ <code>this</code>
Add a chart to the set tested on drag-end. No-op if already registered.

**Kind**: instance method of [<code>Lasso</code>](#module_Lasso.Lasso)  
**Throws**:

- <code>TypeError</code> If `chart` doesn't expose a `selection()` method.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| chart | <code>GraphChart</code> | Duck-typed to `selection()`. |

**Example**  
```js
lasso.register(scatterChart);
```
<a name="module_Lasso.Lasso+unregister"></a>

### lasso.unregister(chart) ⇒ <code>this</code>
Remove a chart from the set tested on drag-end. No-op if not registered.

**Kind**: instance method of [<code>Lasso</code>](#module_Lasso.Lasso)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| chart | <code>GraphChart</code> | 

**Example**  
```js
lasso.unregister(scatterChart);
```
<a name="module_Lasso.Lasso+on"></a>

### lasso.on(event, handler) ⇒ <code>this</code>
Registers a handler for one of this lasso's events: `'lassoStart'`
(drag begins, called with the origin point `{x, y}`), `'lasso'` (fires
on every `pointermove` while dragging, called with the point path so
far), `'lassoEnd'` (drag ends, called with the final point path), or
`'select'` (called once per registered chart with ≥1 matching datum,
`(selection, chart)`).

**Kind**: instance method of [<code>Lasso</code>](#module_Lasso.Lasso)  
**Throws**:

- <code>TypeError</code> If `event` isn't recognized, or `handler` isn't a function.


| Param | Type |
| --- | --- |
| event | <code>\*</code> | 
| handler | <code>function</code> | 

**Example**  
```js
lasso.on('select', (selection) => selection.attr('color', 'gold'));
```
<a name="module_Lasso.Lasso+dispose"></a>

### lasso.dispose()
Removes the registered pointer listeners and clears registered charts.
Idempotent.

**Kind**: instance method of [<code>Lasso</code>](#module_Lasso.Lasso)  
**Example**  
```js
lasso.dispose();
```
