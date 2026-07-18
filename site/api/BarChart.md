# BarChart

<a name="module_BarChart.BarChart"></a>

## BarChart
`GraphChart` specialized for bar charts (Prompt 132). Defaults to
`generator.bar()`, `material('standard')`, and an 800ms transition — every
other `GraphChart` default (instanced-over-50-datums via `GraphObjectFactory`,
`material.standard()` fallback) already applies unchanged. Adds bar-specific
layout: `.grouped(keyFn)`/`.stacked(keyFn)` place multiple series per
category side-by-side or y-stacked (via `layout.stack`, CLAUDE.md §1.1 DRY —
no re-implemented stacking math), `.horizontal()`/`.vertical()` swap growth
axis, and `.depthSeries()` moves series along `z` instead of `x` when
combined with `.grouped()`. `.color(fn)` (Prompt 127) without an explicit
palette falls back to `palette.viridis` here — `GraphChart` itself never
consumes `#colorField` (no chart type existed for it to serve until now).
`.opacity(fn)`/`.visible(fn)`/`.size(fn)` (Prompt 141) are likewise applied
per-datum after every render/update — `.size(fn)` multiplies the bar's
footprint only (see `#applyStyleFields`), never the value-encoding axis.

**Kind**: static class of [<code>BarChart</code>](#module_BarChart)  

* [.BarChart](#module_BarChart.BarChart)
    * [new exports.BarChart(scene)](#new_module_BarChart.BarChart_new)
    * [.grouped(keyFn)](#module_BarChart.BarChart+grouped) ⇒ <code>this</code>
    * [.stacked(keyFn)](#module_BarChart.BarChart+stacked) ⇒ <code>this</code>
    * [.horizontal()](#module_BarChart.BarChart+horizontal) ⇒ <code>this</code>
    * [.vertical()](#module_BarChart.BarChart+vertical) ⇒ <code>this</code>
    * [.depthSeries()](#module_BarChart.BarChart+depthSeries) ⇒ <code>this</code>
    * [.render()](#module_BarChart.BarChart+render) ⇒ <code>this</code>
    * [.update()](#module_BarChart.BarChart+update) ⇒ <code>this</code>

<a name="new_module_BarChart.BarChart_new"></a>

### new exports.BarChart(scene)
**Throws**:

- <code>TypeError</code> If `scene` is falsy.


| Param | Type | Description |
| --- | --- | --- |
| scene | <code>object</code> | The raw `THREE.Scene` this chart will attach to. |

**Example**  
```js
new BarChart(scene)
  .data(rows, (d) => d.id)
  .x((d) => d.category, scale.band().domain(categories).range([-6, 6]))
  .y((d) => d.value, scale.linear().domain([0, 100]).range([0, 6]))
  .color((d) => d.value)
  .render();
```
<a name="module_BarChart.BarChart+grouped"></a>

### barChart.grouped(keyFn) ⇒ <code>this</code>
Lays out multiple series per category side-by-side, narrowing each
series' bar to `originalWidth / seriesCount` — the classic grouped-bar
layout. Offsets along `x` by default, or `z` if `.depthSeries()` is
active. Overwrites any previously configured `.stacked()`.

**Kind**: instance method of [<code>BarChart</code>](#module_BarChart.BarChart)  
**Throws**:

- <code>TypeError</code> If `keyFn` isn't a function.


| Param | Type | Description |
| --- | --- | --- |
| keyFn | <code>function</code> | Resolves each datum's series identity. |

**Example**  
```js
chart.grouped((d) => d.series);
```
<a name="module_BarChart.BarChart+stacked"></a>

### barChart.stacked(keyFn) ⇒ <code>this</code>
Lays out multiple series per category as a single stacked column, via
`layout.stack()` (CLAUDE.md §1.1 DRY — the same stacking math
`layout.stack` already implements, not reimplemented here). Stacks
datums sharing the same resolved `x` value, ordered by first-seen series.
`.depthSeries()` has no combined effect with `.stacked()` — it only
changes `.grouped()`'s offset axis. Overwrites any previously configured
`.grouped()`.

**Kind**: instance method of [<code>BarChart</code>](#module_BarChart.BarChart)  
**Throws**:

- <code>TypeError</code> If `keyFn` isn't a function.


| Param | Type | Description |
| --- | --- | --- |
| keyFn | <code>function</code> | Resolves each datum's series identity. |

**Example**  
```js
chart.stacked((d) => d.series);
```
<a name="module_BarChart.BarChart+horizontal"></a>

### barChart.horizontal() ⇒ <code>this</code>
Bars grow along `x` (value axis horizontal), category laid out along `y`.

**Kind**: instance method of [<code>BarChart</code>](#module_BarChart.BarChart)  
**Example**  
```js
chart.horizontal();
```
<a name="module_BarChart.BarChart+vertical"></a>

### barChart.vertical() ⇒ <code>this</code>
Bars grow along `y` (value axis vertical), category laid out along `x`.
This is the default orientation.

**Kind**: instance method of [<code>BarChart</code>](#module_BarChart.BarChart)  
**Example**  
```js
chart.vertical();
```
<a name="module_BarChart.BarChart+depthSeries"></a>

### barChart.depthSeries() ⇒ <code>this</code>
Moves `.grouped()`'s series offset from `x` to `z` — each series occupies
its own depth lane instead of being clustered side-by-side, turning a 2D
grouped bar layout into a 3D one. No effect until `.grouped()` is also
configured; no combined effect with `.stacked()` (see `.stacked()`'s own note).

**Kind**: instance method of [<code>BarChart</code>](#module_BarChart.BarChart)  
**Example**  
```js
chart.grouped((d) => d.series).depthSeries();
```
<a name="module_BarChart.BarChart+render"></a>

### barChart.render() ⇒ <code>this</code>
First call materializes via `GraphChart.render()`; every later call
routes to this class's own `update()` override (same "first render vs.
update" dispatch `GraphChart.render()` already implements). Applies
`.color()`'s palette fallback, `.opacity()`, `.visible()`, and `.size()`
(Prompt 141) afterward either way.

**Kind**: instance method of [<code>BarChart</code>](#module_BarChart.BarChart)  
**Throws**:

- <code>Error</code> If `data(arr)` was never called before this render.

**See**: GraphChart#render  
<a name="module_BarChart.BarChart+update"></a>

### barChart.update() ⇒ <code>this</code>
Diffs and rewrites bound data via `GraphChart.update()`, then re-applies
every Prompt 127/141 style field across the (possibly changed) live selection.

**Kind**: instance method of [<code>BarChart</code>](#module_BarChart.BarChart)  
**Throws**:

- <code>Error</code> If `render()` hasn't successfully run yet.

**See**: GraphChart#update  
