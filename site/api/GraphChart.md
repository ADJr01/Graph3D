# GraphChart

<a name="module_GraphChart.GraphChart"></a>

## GraphChart
Fluent, chainable base class every chart type (Prompt 132+: `BarChart`,`LineChart`, `ScatterChart`, ...) extends. Owns the configuration state achart accumulates before it renders anything — data, per-axis accessor/scalepairs, color/size/shape accessors, material choice, filter/sort, `.use()`middleware transforms, transition defaults, and lifecycle handlers — via aD3-flavored setter/getter methodper field (no-arg call reads, one-or-more-arg call writes and returns `this`for chaining).`data(arr, keyFn)` is join-native (Prompt 128): it delegates straight to aninternally-owned `Selection`'s own `.data()` (the Phase 4 join, `compose/selection/join.js`), so it returns a `JoinResult` — the same object acaller gets from `Selection.data()` — with `.enter()/.exit()/.join()`, not`this`. That internal `Selection` starts wrapping an empty `meshes: []`backend (nothing rendered yet); `render()`/`update()` (Prompts 129/130)replace it with a real backend once one exists, so user hooks and thechart's own internal diffing consume the exact same join (CLAUDE.md §1.1DRY) instead of two independent implementations drifting apart.`render()` (Prompt 129) materializes this configuration into a real sceneobject on its first call; every later call routes to `update()` (Prompt130) instead, which diffs the latest `data()` array against what'scurrently bound and writes only what changed. `destroy()` (Prompt 131)permanently tears the chart down — every other public method throwsafterward (CLAUDE.md's Disposal Contract).

**Kind**: static class of [<code>GraphChart</code>](#module_GraphChart)  

* [.GraphChart](#module_GraphChart.GraphChart)
    * [new exports.GraphChart(scene, generator)](#new_module_GraphChart.GraphChart_new)
    * [.scene](#module_GraphChart.GraphChart+scene) ⇒ <code>object</code>
    * [.generator](#module_GraphChart.GraphChart+generator) ⇒ <code>function</code>
    * [.data([arr], [keyFn])](#module_GraphChart.GraphChart+data) ⇒ <code>Array</code> \| <code>Selection</code>
    * [.x([accessorOrScale], [scaleObj])](#module_GraphChart.GraphChart+x) ⇒ <code>Object</code>
    * [.y([accessorOrScale], [scaleObj])](#module_GraphChart.GraphChart+y) ⇒ <code>Object</code>
    * [.z([accessorOrScale], [scaleObj])](#module_GraphChart.GraphChart+z) ⇒ <code>Object</code>
    * [.color([accessorOrConstant], [palette])](#module_GraphChart.GraphChart+color) ⇒ <code>Object</code>
    * [.size([valueOrFn])](#module_GraphChart.GraphChart+size) ⇒ <code>function</code>
    * [.shape([valueOrFn])](#module_GraphChart.GraphChart+shape) ⇒ <code>function</code>
    * [.opacity([valueOrFn])](#module_GraphChart.GraphChart+opacity) ⇒ <code>function</code>
    * [.visible([valueOrFn])](#module_GraphChart.GraphChart+visible) ⇒ <code>function</code>
    * [.material([presetName], [options])](#module_GraphChart.GraphChart+material) ⇒ <code>Object</code>
    * [.legend([options])](#module_GraphChart.GraphChart+legend) ⇒ <code>Object</code>
    * [.tooltip([handlerFn])](#module_GraphChart.GraphChart+tooltip) ⇒ <code>function</code>
    * [.setAriaLabel(label, [options])](#module_GraphChart.GraphChart+setAriaLabel) ⇒ <code>this</code>
    * [.setLongDescription(text, [options])](#module_GraphChart.GraphChart+setLongDescription) ⇒ <code>this</code>
    * [.hoverEffect([presetName], [options])](#module_GraphChart.GraphChart+hoverEffect) ⇒ <code>Object</code>
    * [.selectEffect([presetName], [options])](#module_GraphChart.GraphChart+selectEffect) ⇒ <code>Object</code>
    * [.filter([predicateFn])](#module_GraphChart.GraphChart+filter) ⇒ <code>function</code>
    * [.sort([compareFn])](#module_GraphChart.GraphChart+sort) ⇒ <code>function</code>
    * [.use(middlewareFn)](#module_GraphChart.GraphChart+use) ⇒ <code>this</code>
    * [.transition([durationMs], [easingNameOrFn])](#module_GraphChart.GraphChart+transition) ⇒ <code>Object</code>
    * [.exitAnimation([name], [options])](#module_GraphChart.GraphChart+exitAnimation) ⇒ <code>Object</code>
    * [.draggable([value])](#module_GraphChart.GraphChart+draggable) ⇒ <code>boolean</code> \| <code>this</code>
    * [.pickingEnabled([value])](#module_GraphChart.GraphChart+pickingEnabled) ⇒ <code>boolean</code> \| <code>this</code>
    * [.stream(dataStream)](#module_GraphChart.GraphChart+stream) ⇒ <code>this</code>
    * [.enableLOD(options)](#module_GraphChart.GraphChart+enableLOD) ⇒ <code>this</code>
    * [.disableLOD()](#module_GraphChart.GraphChart+disableLOD) ⇒ <code>this</code>
    * [.compact()](#module_GraphChart.GraphChart+compact) ⇒ <code>this</code>
    * [.window([size])](#module_GraphChart.GraphChart+window) ⇒ <code>number</code> \| <code>null</code> \| <code>this</code>
    * [.exportSelection(selectedData)](#module_GraphChart.GraphChart+exportSelection) ⇒ <code>\*</code>
    * [.importSelection(keys)](#module_GraphChart.GraphChart+importSelection) ⇒ <code>\*</code>
    * [.exportPNG(options)](#module_GraphChart.GraphChart+exportPNG) ⇒ <code>string</code>
    * [.exportSVG(options)](#module_GraphChart.GraphChart+exportSVG) ⇒ <code>\*</code>
    * [.on(event, handler)](#module_GraphChart.GraphChart+on) ⇒ <code>this</code>
    * [.dispatch(event, payload)](#module_GraphChart.GraphChart+dispatch) ⇒ <code>this</code>
    * [.handlers()](#module_GraphChart.GraphChart+handlers) ⇒ <code>Object</code>
    * [.onEnter(fn)](#module_GraphChart.GraphChart+onEnter) ⇒ <code>this</code>
    * [.onUpdate(fn)](#module_GraphChart.GraphChart+onUpdate) ⇒ <code>this</code>
    * [.onExit(fn)](#module_GraphChart.GraphChart+onExit) ⇒ <code>this</code>
    * [.selection()](#module_GraphChart.GraphChart+selection) ⇒ <code>Selection</code>
    * [.render()](#module_GraphChart.GraphChart+render) ⇒ <code>this</code>
    * [.update()](#module_GraphChart.GraphChart+update) ⇒ <code>this</code>
    * [.destroy()](#module_GraphChart.GraphChart+destroy) ⇒ <code>void</code>

<a name="new_module_GraphChart.GraphChart_new"></a>

### new exports.GraphChart(scene, generator)
**Throws**:

- <code>TypeError</code> If `scene` is falsy, or `generator` lacks `.compute`.


| Param | Type | Description |
| --- | --- | --- |
| scene | <code>object</code> | The raw `THREE.Scene` this chart will attach to. |
| generator | <code>function</code> | A `compose/generator`   instance (e.g. `generator.bar()`) — duck-typed to a `.compute(data)` function. |

**Example**  
```js
class BarChart extends GraphChart {}new BarChart(scene, generator.bar())  .data(rows, (d) => d.id)  .x((d) => d.label)  .y((d) => d.value, scale.linear().domain([0, 100]).range([0, 10]))  .material('standard')  .transition(800);
```
<a name="module_GraphChart.GraphChart+scene"></a>

### graphChart.scene ⇒ <code>object</code>
**Kind**: instance property of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Returns**: <code>object</code> - The raw `THREE.Scene` passed to the constructor.  
<a name="module_GraphChart.GraphChart+generator"></a>

### graphChart.generator ⇒ <code>function</code>
**Kind**: instance property of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Returns**: <code>function</code> - The generator passed to the constructor.  
<a name="module_GraphChart.GraphChart+data"></a>

### graphChart.data([arr], [keyFn]) ⇒ <code>Array</code> \| <code>Selection</code>
Two-in-one, matching `Selection.data()`: no-arg reads every datumcurrently bound to this chart's live backend (empty until `render()` hasmaterialized real nodes). Given `arr` (and optionally `keyFn`), joins itagainst that backend and returns the resulting `JoinResult` — `.enter()`/`.exit()`/`.join(enterFn, updateFn, exitFn)` for micro-controlling theentering/updating/departing members directly, in addition to every plain`Selection` method (`attr`, `style`, `filter`, ...) since a `JoinResult`*is* the update selection.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Returns**: <code>Array</code> \| <code>Selection</code> - The bound data (no-arg form), or a `JoinResult` (join form).  
**Throws**:

- <code>TypeError</code> If `arr` isn't an array, or `keyFn` is given and isn't a function.
- <code>Error</code> If `.enter()` is called on the result and this chart hasn't rendered yet  (no mesh template exists to materialize entering members against) — call `render()` first.


| Param | Type | Description |
| --- | --- | --- |
| [arr] | <code>Array</code> | The datum array to join against the current backend. Omit to read the currently bound data. |
| [keyFn] | <code>function</code> | Join identity. Defaults to a positional (index) join. |

**Example**  
```js
const joined = chart.data(rows, (d) => d.id);joined.join(  (enter) => enter.attr('scale.y', 0.01),  (update) => update.attr('position.y', (d) => d.value),);
```
<a name="module_GraphChart.GraphChart+x"></a>

### graphChart.x([accessorOrScale], [scaleObj]) ⇒ <code>Object</code>
Gets or sets the x-axis accessor and optional scale.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `accessorOrScale` is given and is neither a constant, function, nor string.


| Param | Type | Description |
| --- | --- | --- |
| [accessorOrScale] | <code>\*</code> | A constant, `(datum, index) => value` accessor, or a scale (scales are callable). |
| [scaleObj] | <code>object</code> | A `compose/scale` instance mapping accessor output to world-space range. |

**Example**  
```js
chart.x((d) => d.label, scale.band().domain(labels).range([0, 10]));
```
<a name="module_GraphChart.GraphChart+y"></a>

### graphChart.y([accessorOrScale], [scaleObj]) ⇒ <code>Object</code>
Gets or sets the y-axis accessor and optional scale.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `accessorOrScale` is given and is neither a constant, function, nor string.


| Param | Type | Description |
| --- | --- | --- |
| [accessorOrScale] | <code>\*</code> | A constant, `(datum, index) => value` accessor, or a scale (scales are callable). |
| [scaleObj] | <code>object</code> | A `compose/scale` instance mapping accessor output to world-space range. |

**Example**  
```js
chart.y((d) => d.value, scale.linear().domain([0, 100]).range([0, 10]));
```
<a name="module_GraphChart.GraphChart+z"></a>

### graphChart.z([accessorOrScale], [scaleObj]) ⇒ <code>Object</code>
Gets or sets the z-axis accessor and optional scale.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `accessorOrScale` is given and is neither a constant, function, nor string.


| Param | Type | Description |
| --- | --- | --- |
| [accessorOrScale] | <code>\*</code> | A constant, `(datum, index) => value` accessor, or a scale (scales are callable). |
| [scaleObj] | <code>object</code> | A `compose/scale` instance mapping accessor output to world-space range. |

**Example**  
```js
chart.z((d) => d.depth);
```
<a name="module_GraphChart.GraphChart+color"></a>

### graphChart.color([accessorOrConstant], [palette]) ⇒ <code>Object</code>
Gets or sets the per-datum color accessor and optional palette.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  

| Param | Type | Description |
| --- | --- | --- |
| [accessorOrConstant] | <code>\*</code> | A constant color, or `(datum, index) => value` accessor   whose output is fed through `palette` (if given) or used directly as a color. |
| [palette] | <code>\*</code> | A `compose/palette` ramp (`(t) => '#rrggbb'`) or categorical cycler. |

**Example**  
```js
chart.color((d) => d.value, palette.viridis);
```
<a name="module_GraphChart.GraphChart+size"></a>

### graphChart.size([valueOrFn]) ⇒ <code>function</code>
Gets or sets the per-datum size accessor.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  

| Param | Type | Description |
| --- | --- | --- |
| [valueOrFn] | <code>\*</code> | A constant, or `(datum, index) => value` accessor. |

**Example**  
```js
chart.size((d) => Math.sqrt(d.population));
```
<a name="module_GraphChart.GraphChart+shape"></a>

### graphChart.shape([valueOrFn]) ⇒ <code>function</code>
Gets or sets the per-datum shape accessor.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  

| Param | Type | Description |
| --- | --- | --- |
| [valueOrFn] | <code>\*</code> | A constant shape name, or `(datum, index) => name` accessor. |

**Example**  
```js
chart.shape('sphere');
```
<a name="module_GraphChart.GraphChart+opacity"></a>

### graphChart.opacity([valueOrFn]) ⇒ <code>function</code>
Gets or sets a constant opacity, or a per-datum accessor, applied via`chart/opacityField.js`'s `applyOpacityField` after every`render()`/`update()` — moved here from `ScatterChart` (Prompt 134'soriginal, sole consumer) once `HeatmapChart` (Prompt 136) needed theidentical setter (CLAUDE.md §1.1 DRY two-strike rule).

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  

| Param | Type |
| --- | --- |
| [valueOrFn] | <code>function</code> | 

**Example**  
```js
chart.opacity(0.6);
```
**Example**  
```js
chart.opacity((d) => d.confidence);
```
<a name="module_GraphChart.GraphChart+visible"></a>

### graphChart.visible([valueOrFn]) ⇒ <code>function</code>
Gets or sets a constant visibility, or a per-datum predicate, appliedvia `chart/visibleField.js`'s `applyVisibleField` after every`render()`/`update()` (Prompt 141) — a direct passthrough to`Selection.attr('visible', ...)` (Prompt 75), same shape as `.opacity()`.Unlike `.filter()` (which excludes a datum from `data()`/layout entirely,before `render()` ever runs), `.visible()` only toggles a renderedmember's `Object3D.visible`/instance-visibility after the fact — thedatum still occupies its computed position/scale, just hidden.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  

| Param | Type |
| --- | --- |
| [valueOrFn] | <code>function</code> | 

**Example**  
```js
chart.visible((d) => d.value > 0);
```
<a name="module_GraphChart.GraphChart+material"></a>

### graphChart.material([presetName], [options]) ⇒ <code>Object</code>
Gets or sets the material preset used to render this chart's datums.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `presetName` isn't a valid preset name, or `options` isn't a plain object.


| Param | Type | Description |
| --- | --- | --- |
| [presetName] | <code>string</code> | One of `material`'s preset keys (e.g. `'standard'`, `'neon'`, `'glow'`). |
| [options] | <code>object</code> | Options forwarded to the preset factory. |

**Example**  
```js
chart.material('standard', { color: '#3b82f6', roughness: 0.4 });
```
<a name="module_GraphChart.GraphChart+legend"></a>

### graphChart.legend([options]) ⇒ <code>Object</code>
Gets or sets an HTML overlay legend synced to `.color()`/`.size()`(Prompt 143) — a gradient bar (or swatch list, for a categoricalpalette) for `.color()`'s encoding, and three sample dots at the data'smin/mid/max `.size()` multiplier, rendered into `options.container` via`chart/legendField.js`'s `applyLegend` (called immediately here, thenagain on every later `render()`/`update()` by the chart types thatconsume it — the same per-chart "sync" pattern `.opacity()`/`.visible()`/`.size()` already follow). The chart only ever writes into the containerit's given — it never creates or positions DOM elements of its own.Inert on `TreeChart`/`PackChart` (bind a single root datum, not anarray — no per-datum domain to fit).

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `options` isn't a plain object, or `options.container` isn't a DOM element.


| Param | Type | Description |
| --- | --- | --- |
| [options] | <code>Object</code> | `container` must be a DOM element (duck-typed to `.appendChild`). |

**Example**  
```js
chart.color((d) => d.value).legend({ container: document.getElementById('legend') });
```
<a name="module_GraphChart.GraphChart+tooltip"></a>

### graphChart.tooltip([handlerFn]) ⇒ <code>function</code>
Gets or sets the tooltip content handler (Prompt 143).ponytail: config-only, doesn't show anything itself — no hover-detectionmechanism exists yet in this phase (Phase 9's `interact/Tooltip.js`,Prompt 151, owns the actual DOM element and pointer wiring); this onlystores what to show once that lands. `chart/tooltipField.js`'s `resolveTooltipContent` is the"sensible default on hover when no handler is set" this prompt asksfor: it calls `handlerFn(datum, index)` if one is configured, otherwiseformats the datum itself.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `handlerFn` is given and isn't a function.


| Param | Type |
| --- | --- |
| [handlerFn] | <code>function</code> | 

**Example**  
```js
chart.tooltip((d) => `${d.label}: ${d.value}`);
```
<a name="module_GraphChart.GraphChart+setAriaLabel"></a>

### graphChart.setAriaLabel(label, [options]) ⇒ <code>this</code>
Sets this chart's accessible name (Prompt 180) — a `<canvas>` carries noreadable content of its own, so this is written into a visually-hidden`<div>` inserted immediately after `options.container` in the DOM(`document.createElement`, not a THREE.js concept), where a screenreader actually encounters it. `KeyboardNav`'s ARIA live region (Prompt154) already handles *per-datum* announcements as focus moves; this isthe chart's own static label, read once on arrival.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `label` isn't a non-empty string.
- <code>TypeError</code> If the hidden div doesn't exist yet and `options.container` isn't a DOM element.


| Param | Type | Description |
| --- | --- | --- |
| label | <code>string</code> |  |
| [options] | <code>Object</code> | `container` is required   only the first time either this or `setLongDescription()` is called —   both write into the same hidden div. |

**Example**  
```js
chart.setAriaLabel('Quarterly revenue by region', { container: canvas });
```
<a name="module_GraphChart.GraphChart+setLongDescription"></a>

### graphChart.setLongDescription(text, [options]) ⇒ <code>this</code>
Sets this chart's accessible long description (Prompt 180), overridingthe auto-generated one (a data-point count and value range) every`render()`/`update()` writes into the same hidden div otherwise —useful when the data alone doesn't convey what the chart is showing.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `text` isn't a non-empty string.
- <code>TypeError</code> If the hidden div doesn't exist yet and `options.container` isn't a DOM element.


| Param | Type | Description |
| --- | --- | --- |
| text | <code>string</code> |  |
| [options] | <code>Object</code> | Same contract as `setAriaLabel()`'s. |

**Example**  
```js
chart.setLongDescription('Revenue climbed steadily each quarter, peaking in Q4.');
```
<a name="module_GraphChart.GraphChart+hoverEffect"></a>

### graphChart.hoverEffect([presetName], [options]) ⇒ <code>Object</code>
Gets or sets which registered `material.effects` preset (Prompt 150)plays on the hovered datum only — `interact/StateMachine` (via`interact/PointerRouter`'s existing hover detection) reads this back onevery hover-enter/leave and applies/removes it through`material.applyEffect`/`removeEffect`, the same way it already appliesits own built-in default (a `neonEdge` outline) when this is leftunconfigured — config-only, same "doesn't show anything itself" shapeas `tooltip()`, since the actual hover-detection lives one layer up.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>Error</code> If `presetName` isn't a registered effect (includes a "did you mean" suggestion).
- <code>TypeError</code> If `options` is given and isn't a plain object.


| Param | Type | Description |
| --- | --- | --- |
| [presetName] | <code>string</code> | A registered effect name (`effects.list()`). |
| [options] | <code>Object</code> | Merged over the preset's own `defaultOptions`. |

**Example**  
```js
chart.hoverEffect('fire', { intensity: 1.2 });
```
<a name="module_GraphChart.GraphChart+selectEffect"></a>

### graphChart.selectEffect([presetName], [options]) ⇒ <code>Object</code>
Gets or sets which registered `material.effects` preset (Prompt 150)plays on selected datums, cleared on deselect — same config-only shapeand `StateMachine` resolution as `hoverEffect`.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>Error</code> If `presetName` isn't a registered effect (includes a "did you mean" suggestion).
- <code>TypeError</code> If `options` is given and isn't a plain object.


| Param | Type | Description |
| --- | --- | --- |
| [presetName] | <code>string</code> | A registered effect name (`effects.list()`). |
| [options] | <code>Object</code> | Merged over the preset's own `defaultOptions`. |

**Example**  
```js
chart.selectEffect('glow', { color: '#22ffcc' });
```
<a name="module_GraphChart.GraphChart+filter"></a>

### graphChart.filter([predicateFn]) ⇒ <code>function</code>
Gets or sets a predicate filtering data before rendering.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `predicateFn` is given and isn't a function.


| Param | Type | Description |
| --- | --- | --- |
| [predicateFn] | <code>function</code> | Returns `true` to keep a datum. |

**Example**  
```js
chart.filter((d) => d.value > 0);
```
<a name="module_GraphChart.GraphChart+sort"></a>

### graphChart.sort([compareFn]) ⇒ <code>function</code>
Gets or sets a comparator ordering data before rendering.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `compareFn` is given and isn't a function.


| Param | Type | Description |
| --- | --- | --- |
| [compareFn] | <code>function</code> | Standard `Array.prototype.sort` comparator. |

**Example**  
```js
chart.sort((a, b) => a.value - b.value);
```
<a name="module_GraphChart.GraphChart+use"></a>

### graphChart.use(middlewareFn) ⇒ <code>this</code>
Registers a data-transform middleware (Prompt 142), run in registrationorder against the last array passed to `data()` — after `.filter()`,before `.sort()` — every time `render()`/`update()` recomputes buffers.Each middleware is a plain `(data) => data` function; `compose/transform`(`transform.smooth`/`decimate`/`aggregate`/`normalize`/`sort`) providesready-made ones, but any function of that shape works. Composable — call`.use()` multiple times to chain several transforms.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `middlewareFn` isn't a function.


| Param | Type | Description |
| --- | --- | --- |
| middlewareFn | <code>function</code> | Transforms the array and returns the replacement. |

**Example**  
```js
chart.data(rawSamples).use(transform.smooth(5)).use(transform.decimate(200));
```
<a name="module_GraphChart.GraphChart+transition"></a>

### graphChart.transition([durationMs], [easingNameOrFn]) ⇒ <code>Object</code>
Gets or sets the default transition duration/easing `update()` (Prompt130) will use for enter/update/exit animation. Validates `easingNameOrFn`eagerly against `GraphAnimCurve.resolve` (CLAUDE.md §1.1 DRY — no secondeasing table lives here), mirroring `Transition.easing()`.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `durationMs` isn't a non-negative number, or `easingNameOrFn` doesn't resolve to a valid easing.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [durationMs] | <code>number</code> |  | Non-negative duration in milliseconds. Omit to read the current config. |
| [easingNameOrFn] | <code>function</code> | <code>linear</code> | A `GraphAnimCurve` curve name, or a raw `(t) => number` function. Default `'linear'`. |

**Example**  
```js
chart.transition(800, 'easeOutCubic');
```
<a name="module_GraphChart.GraphChart+exitAnimation"></a>

### graphChart.exitAnimation([name], [options]) ⇒ <code>Object</code>
Gets or sets a default particle exit animation (Prompt 122) for`update()`'s exit-join: departing datums play `options.system.preset(name,...)` and are removed immediately, instead of the built-in shrink-and-fadedissolve. Only takes effect when no `on('exit', fn)` handler isregistered — a registered handler always has full control (it can stillcall `exited.remove(name, options)` itself). Delegates straight to`Selection.remove(animationName, options)` (CLAUDE.md §1.1 DRY — nosecond particle-triggering implementation here); `options.system` is a`postfx/particles` `ParticleSystem`, duck-typed rather than imported,since `chart/` has no renderer/camera of its own to build one — thecaller constructs and passes it, exactly as a direct`Selection.remove('dissolve', { system })` call already requires.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `name` is given and isn't a non-empty string, or `options.system` doesn't expose `.preset(name, opts)`.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [name] | <code>string</code> |  | A preset name registered on `options.system`. Omit to read the current config. |
| [options] | <code>Object</code> | <code>{}</code> |  |
| [options.system] | <code>Object</code> |  | Required when `name` is given. |

**Example**  
```js
chart.exitAnimation('dissolve', { system: particleSystem });
```
<a name="module_GraphChart.GraphChart+draggable"></a>

### graphChart.draggable([value]) ⇒ <code>boolean</code> \| <code>this</code>
Gets or sets whether `PointerRouter` (Prompt 154) lets a pointer dragreposition this chart's datums — config-only, same "doesn't showanything itself" shape as `tooltip()`/`hoverEffect()`, since `chart/`sits below `interact/` and cannot itself detect a pointer drag.`PointerRouter` duck-type-checks this method before starting a draggesture, so a chart that never calls `draggable(true)` behaves exactlyas before this prompt. Default `false`.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `value` is given and isn't a boolean.


| Param | Type | Description |
| --- | --- | --- |
| [value] | <code>boolean</code> | Omit to read the current value. |

**Example**  
```js
chart.draggable(true);
```
<a name="module_GraphChart.GraphChart+pickingEnabled"></a>

### graphChart.pickingEnabled([value]) ⇒ <code>boolean</code> \| <code>this</code>
Gets or sets whether `Picker` (Prompt 147) hit-tests this chart at all —config-only, same shape as `draggable()`/`tooltip()`, since `chart/`cannot itself skip a raycast (`Picker.pickAt()` duck-type-checks thisbefore testing a registered chart, Prompt 156). Lets a large, static"backdrop" chart nobody interacts with opt out of every future pick'scost. Default `true`.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `value` is given and isn't a boolean.


| Param | Type | Description |
| --- | --- | --- |
| [value] | <code>boolean</code> | Omit to read the current value. |

**Example**  
```js
staticBackgroundChart.pickingEnabled(false);
```
<a name="module_GraphChart.GraphChart+stream"></a>

### graphChart.stream(dataStream) ⇒ <code>this</code>
Binds a live `DataStream` (Prompt 160) to this chart: pulls its chunksand, for each, folds `{added, updated, removed}` into the currentlybound data (`chart/streamField.js`'s `applyStreamChunk`) and drives itthrough the exact same `data(nextData, keyFn) + update()` call a manualcaller would make — one join, one code path (CLAUDE.md §1.1 DRY), not asecond enter/update/exit implementation living here.Backpressure: at most one chunk is ever "pending" — if another arriveswhile the previous one is still being folded/applied, it overwrites(drops) the one waiting rather than queuing unboundedly. A chart mid-stream shows the *latest* state, not a complete history of every chunkthat ever arrived; under sustained overload, some intermediate chunksare never applied at all.Calling `stream()` again replaces the previous binding (disposing its`dataStream` first, if it exposes `.dispose()`); `destroy()` does the same.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `dataStream` isn't async-iterable.
- <code>Error</code> If `render()` hasn't been called yet.


| Param | Type | Description |
| --- | --- | --- |
| dataStream | <code>Object</code> | A `DataStream` instance, or any async iterable of chunks — duck-typed   (`chart/` cannot import `stream/`, which sits above it in the layer order). |

**Example**  
```js
chart.data(initialRows, (d) => d.id).render();chart.stream(DataStream.fromWebSocket(url, (raw) => [JSON.parse(raw)]));
```
<a name="module_GraphChart.GraphChart+enableLOD"></a>

### graphChart.enableLOD(options) ⇒ <code>this</code>
Enables camera-distance-driven level-of-detail (Prompt 163): every frame(`core/Graph3DLoop`), checks `camera`'s distance to this chart's `scene`and, when it crosses into a different `levels` bucket, re-decimates thedataset bound at the time `enableLOD()` was called down to that bucket's`maxPoints` — via `compose/transform`'s existing `transform.decimate`(the same uniform-stride sampling `.use(transform.decimate(n))` alreadydoes, CLAUDE.md §1.1 DRY, no second decimation algorithm here) — andre-binds it through the normal `data() + update()` join (one path, not asecond rendering pipeline). Applies the initial level immediately, beforethe first frame.Self-contained: `chart/` never imports `stream/` (it sits above `chart/`in CLAUDE.md §1.4's layer order) — `camera` is accepted duck-typed (anyobject exposing `.position.distanceTo`), the same pattern `stream()`uses for its `dataStream` parameter. `stream/LOD.js` exposes theidentical distance-bucketing algorithm as a standalone class for drivingLOD on non-`GraphChart` targets; the two don't share an implementationfor the same reason `stream()` doesn't import `DataStream`.Calling `enableLOD()` again replaces the previous binding (against afreshly re-captured dataset); `disableLOD()`/`destroy()` stop it.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `levels` isn't a non-empty array of `{maxDistance, maxPoints}`, or `camera` doesn't expose `position.distanceTo`.
- <code>Error</code> If `render()` hasn't been called yet.


| Param | Type |
| --- | --- |
| options | <code>function</code> | 

**Example**  
```js
chart.data(hugeSeries, (d) => d.id).render();chart.enableLOD({  camera: scene.camera.three,  levels: [    { maxDistance: 20, maxPoints: 5000 },    { maxDistance: 100, maxPoints: 500 },  ],});
```
<a name="module_GraphChart.GraphChart+disableLOD"></a>

### graphChart.disableLOD() ⇒ <code>this</code>
Disables an `enableLOD()` binding, if any — stops the per-frame distancecheck. Does not restore the full (pre-decimation) dataset; call`chart.data(originalRows).update()` for that. No-op if LOD isn't active.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Example**  
```js
chart.disableLOD();
```
<a name="module_GraphChart.GraphChart+compact"></a>

### graphChart.compact() ⇒ <code>this</code>
One-way merge (Prompt 168) of this chart's currently-static,individually-addressable `GraphMesh` instances (the below-`INSTANCING_THRESHOLD` `render()` path) into a single`GraphInstancedObject` — collapsing N draw calls/geometries/materialsinto one, at the cost of losing per-mesh addressability for the mergedset. Reads each mesh's *live* position/scale/color (whatever `.attr()`/`.style()` handlers may have written, not just what `render()`originally computed) so nothing currently visible changes.Meant to be called once a chart's data has settled ("gone static") —e.g. the scrolled-past portion of a `window()`-capped stream, or anylarge `GraphMesh[]`-backed chart nobody is animating anymore — as adirect response to a `memoryPressure()` reading (`stream/`) crossing acaller-chosen threshold: fewer live `THREE.Mesh`/`Geometry`/`Material`instances means less JS heap and GPU driver overhead. Not automatic —`chart/` never polls memory pressure itself; the caller decides when.**One-way**: irreversible for this chart instance — there is no pathback to individually-addressable meshes short of a fresh chart +`render()`. A no-op if the backend is already instanced (nothing leftto merge) or if nothing is currently bound. Compacting while a`.transition()`-driven write is still mid-flight against these meshesdisposes the meshes it's writing to — call once things have settled.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>Error</code> If `render()` hasn't been called yet.

**Example**  
```js
chart.data(staleHistoricalRows, (d) => d.id).render();// ...later, once this data has stopped changing:chart.compact();
```
<a name="module_GraphChart.GraphChart+window"></a>

### graphChart.window([size]) ⇒ <code>number</code> \| <code>null</code> \| <code>this</code>
Gets or sets a FIFO cap (Prompt 168) on how many of the most-recently-bound datums stay visible: once `data()`'s array exceeds `size`, theoldest (frontmost) entries are trimmed before every `render()`/`update()` — `#prepareData()`'s first step, ahead of `.filter()`/`.use()`/`.sort()` — so `update()`'s existing join treats them as exitsand dissolves them out exactly like any other departing datum(CLAUDE.md §1.1 DRY: no second exit/removal path lives here — `window()`only shrinks what `update()` sees as "current"; the built-inshrink-and-fade dissolve, or a registered `on('exit', fn)`/`exitAnimation()`, handles the rest exactly as it always does).Meant for `stream()`-driven charts whose `data()` array keeps growing —caps memory/instance count at a fixed ceiling regardless of how longthe stream has been running, instead of every chunk making the chart(and its underlying `GraphInstancedObject` capacity) grow forever.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `size` is given and isn't a positive integer.


| Param | Type | Description |
| --- | --- | --- |
| [size] | <code>number</code> | A positive integer. Omit to read the current cap (`null` if unset). |

**Example**  
```js
chart.data(initialRows, (d) => d.id).window(500).render();chart.stream(DataStream.fromWebSocket(url, parse)); // oldest rows dissolve out past 500
```
<a name="module_GraphChart.GraphChart+exportSelection"></a>

### graphChart.exportSelection(selectedData) ⇒ <code>\*</code>
Converts a list of this chart's currently-selected datums (e.g. from`PointerRouter.selectedEntries()`/`KeyboardNav`) into portable join keys— the same `keyFn` passed to the last `data(arr, keyFn)` call (or thedatum itself, if none was given) — suitable for `JSON.stringify` andlater restoring via `importSelection()`. Necessary because interactiveselection is tracked by `interact/`'s `PointerRouter`/`KeyboardNav` keyedon datum *object identity*, which `chart/` cannot depend on (CLAUDE.md§1.4) and which breaks across a fresh `data(newRows)` call anyway — evensame-content rows become new object instances.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Returns**: <code>\*</code> - Portable keys, in `selectedData`'s order.  
**Throws**:

- <code>TypeError</code> If `selectedData` isn't an array.
- <code>Error</code> If `data(arr)` hasn't been called yet.


| Param | Type | Description |
| --- | --- | --- |
| selectedData | <code>\*</code> | Datums currently marked selected. |

**Example**  
```js
const keys = chart.exportSelection(router.selectedEntries().map((e) => e.datum));localStorage.setItem('selection', JSON.stringify(keys));
```
<a name="module_GraphChart.GraphChart+importSelection"></a>

### graphChart.importSelection(keys) ⇒ <code>\*</code>
The inverse of `exportSelection()`: resolves a previously-exported listof keys back to this chart's *current* live `data()` entries — for acaller to re-apply whatever interactive selected state it manages (e.g.`stateMachineFor(chart).setState(datum, 'selected')` for each) after afresh `data(newRows)` call has replaced the underlying datum objects.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Returns**: <code>\*</code> - The subset of the current `data()` array whose key matches, in `data()` order.  
**Throws**:

- <code>TypeError</code> If `keys` isn't an array.
- <code>Error</code> If `data(arr)` hasn't been called yet.


| Param | Type | Description |
| --- | --- | --- |
| keys | <code>\*</code> | Keys previously returned by `exportSelection()`. |

**Example**  
```js
chart.data(reloadedRows, (d) => d.id);for (const datum of chart.importSelection(savedKeys)) stateMachineFor(chart).setState(datum, 'selected');
```
<a name="module_GraphChart.GraphChart+exportPNG"></a>

### graphChart.exportPNG(options) ⇒ <code>string</code>
Renders this chart's scene through `renderer`/`camera` and captures theresult as a PNG data URL. Lossy in one specific sense, documented here:charts don't own an isolated render target — `renderer`/`camera` renderthe *whole* `THREE.Scene` this chart is attached to, so the captureincludes every other chart or object sharing that scene, not just thischart's own datums. For a chart-only image, keep that chart alone on itsown scene.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Returns**: <code>string</code> - A `data:image/png;base64,...` URL.  
**Throws**:

- <code>TypeError</code> If `renderer` or `camera` is missing/invalid.
- <code>Error</code> If called after `destroy()`.


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

**Example**  
```js
const dataUrl = chart.exportPNG({ renderer: g.renderer.three, camera: scene.camera.three });const img = document.createElement('img');img.src = dataUrl;
```
<a name="module_GraphChart.GraphChart+exportSVG"></a>

### graphChart.exportSVG(options) ⇒ <code>\*</code>
Renders this chart's scene to SVG markup via Three.js's `SVGRenderer`addon (lazy-loaded on first call — never bundled unless this method isactually used). Documented lossy: `SVGRenderer` has no concept ofper-instance transforms, so this chart's default instanced backend(`GraphInstancedObject`, one `THREE.InstancedMesh` standing in for everydatum) draws as a single shape at the object's own base transform ratherthan one shape per datum — only mesh-backend charts (one real`GraphMesh` per datum) render faithfully. `SVGRenderer` also has notexture, shading, or shadow support (its own documented limitation).

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Returns**: <code>\*</code> - Serialized `<svg>...</svg>` markup.  
**Throws**:

- <code>TypeError</code> If `camera` is missing, or `width`/`height` isn't a positive number.
- <code>Error</code> If called after `destroy()`.


| Param | Type |
| --- | --- |
| options | <code>Object</code> | 

**Example**  
```js
const svg = await chart.exportSVG({ camera: scene.camera.three, width: 800, height: 600 });
```
<a name="module_GraphChart.GraphChart+on"></a>

### graphChart.on(event, handler) ⇒ <code>this</code>
Registers a handler for either a lifecycle event (`'enter'`/`'update'`/`'exit'` — fired internally by `update()`, Prompt 130, as datums enter,update, or exit on each `data()` call, `handler(selection)`) or aninteraction event (`'hover'`/`'select'`/`'deselect'`/`'brushStart'`/`'brushEnd'`/`'lassoStart'`/`'lassoEnd'`/`'dragStart'`/`'dragEnd'`/`'focus'` — fired externally via `dispatch()`, Prompt 156, by whichever`interact/` class detected it: `PointerRouter` for `hover`/`select`/`deselect`/`dragStart`/`dragEnd`, `Brush`/`Lasso` for their `*Start`/`*End` pairs, `KeyboardNav` for `focus`/`select`/`deselect`,`handler(payload)`). Both share this one entry point (matching D3's ownunified `.on()`) but are stored and dispatched separately internally —see `INTERACTION_EVENTS`'s own comment for why.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `event` isn't recognized, or `handler` isn't a function.


| Param | Type | Description |
| --- | --- | --- |
| event | <code>\*</code> | Event name to listen for. |
| handler | <code>function</code> | Called with the event's payload (a `Selection` for lifecycle events, an interaction payload object otherwise). |

**Example**  
```js
chart.on('exit', (selection) => selection.transition().duration(400).attr('opacity', 0).remove());
```
**Example**  
```js
chart.on('select', ({ datum }) => console.log('selected', datum));
```
<a name="module_GraphChart.GraphChart+dispatch"></a>

### graphChart.dispatch(event, payload) ⇒ <code>this</code>
Fires every handler `on(event, handler)` registered for one of the*interaction* events (Prompt 156) — called by `interact/`'s`PointerRouter`/`Brush`/`Lasso`/`KeyboardNav`, which import `chart/` (theallowed direction); `chart/` never calls this on itself, since it cannotdetect a pointer/keyboard event. Deliberately rejects `'enter'`/`'update'`/`'exit'` — those are only ever dispatched internally by`update()`'s own data-join, never through this generic path.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>TypeError</code> If `event` isn't a recognized interaction event.


| Param | Type | Description |
| --- | --- | --- |
| event | <code>\*</code> | Interaction event name to fire. |
| payload | <code>\*</code> | Passed as-is to every registered handler. |

**Example**  
```js
chart.dispatch('select', { chart, datum, mesh, instanceIndex, worldPoint, domEvent });
```
<a name="module_GraphChart.GraphChart+handlers"></a>

### graphChart.handlers() ⇒ <code>Object</code>
**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Returns**: <code>Object</code> - Registered *lifecycle* handlers, keyed by event — interaction-event handlers (registered via the same `on()`) live in a separate internal map, not reflected here.  
<a name="module_GraphChart.GraphChart+onEnter"></a>

### graphChart.onEnter(fn) ⇒ <code>this</code>
Sugar for `on('enter', fn)`.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  

| Param | Type | Description |
| --- | --- | --- |
| fn | <code>function</code> | Called with the newly entered `Selection`. |

**Example**  
```js
chart.onEnter((entered) => entered.attr('scale.y', 0.01));
```
<a name="module_GraphChart.GraphChart+onUpdate"></a>

### graphChart.onUpdate(fn) ⇒ <code>this</code>
Sugar for `on('update', fn)`.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  

| Param | Type | Description |
| --- | --- | --- |
| fn | <code>function</code> | Called with the updated `Selection`. |

**Example**  
```js
chart.onUpdate((updated) => updated.attr('position.y', (d) => d.value));
```
<a name="module_GraphChart.GraphChart+onExit"></a>

### graphChart.onExit(fn) ⇒ <code>this</code>
Sugar for `on('exit', fn)`.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  

| Param | Type | Description |
| --- | --- | --- |
| fn | <code>function</code> | Called with the exiting `Selection`. |

**Example**  
```js
chart.onExit((exited) => exited.transition().duration(400).attr('opacity', 0).remove());
```
<a name="module_GraphChart.GraphChart+selection"></a>

### graphChart.selection() ⇒ <code>Selection</code>
The live `Selection` over every datum currently rendered by this chart(Prompt 128) — empty until `render()` (Prompt 129) materializes realnodes, then kept current by `update()` (Prompt 130). Backed by the sameinternal `Selection` `data()` joins against, so post-render micro-control(`chart.selection().attr(...)`) and the chart's own diffing share onelive backend instead of two independent views drifting apart.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Example**  
```js
chart.selection().filter((d) => d.value > 90).attr('color', 'gold');
```
<a name="module_GraphChart.GraphChart+render"></a>

### graphChart.render() ⇒ <code>this</code>
First call (Prompt 129): applies `filter`/`sort` (if set) to the lastarray passed to `data()`, fits every scaled `x`/`y`/`z` field's domain tothe result (`scale.domain(...)`, via that field's own accessor — see`#applyScaleDomain`), wires the resolved `accessor ∘ scale` functionsinto the generator's own `x`/`y`/`z` setters (only the ones it exposes —`generator.bar()` has no `z`), computes instance buffers via`generator.compute(data)`, and materializes them into a real backend —`GraphObjectFactory` picks a `GraphInstancedObject` or a `GraphMesh[]`per `INSTANCING_THRESHOLD` (CLAUDE.md §1.1 DRY: that dispatch alreadylives there, not duplicated here). `#backendSelection` is then replacedwith a `Selection` over the real backend, so `data()`/`selection()`reflect it from this point on.Every subsequent call routes to `update()` instead (Prompt 130).

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>Error</code> If `data(arr)` was never called before this render.

**Example**  
```js
chart.data(rows).y((d) => d.value, scale.linear().domain([0, 1]).range([0, 10]));chart.render();
```
<a name="module_GraphChart.GraphChart+update"></a>

### graphChart.update() ⇒ <code>this</code>
Every later `render()` call routes here (Prompt 130): joins the lastarray passed to `data()` against the currently bound data (`diffData` —the single diff authority `compose/selection/diff.js` already anticipatedthis consumer, CLAUDE.md §1.1 DRY) and, for both the surviving (update)and newly-entering members, either invokes the user's registered`on('enter'|'update', fn)` handlers (if any — the handler owns writingwhatever it wants) or, absent any, writes `generator`-recomputedposition/scale directly — animated toward those values if `.transition()`is configured, snapped immediately otherwise ("respects activetransitions"). Departing members likewise either run the user's`on('exit', fn)` handlers, or fall back to the default: shrink to`scale` 0 and fade `opacity` to 0, then `.remove()` — a "dissolve" thatdoesn't depend on any particular material (unlike a pure opacity fade,which has no visual effect on the instanced backend without the Phase 6`dataDriven` material — see `attr.js`'s own note on that limitation).

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Throws**:

- <code>Error</code> If `render()` hasn't successfully run yet.

**Example**  
```js
chart.data(nextRows); // same keyFn as the original data(rows, keyFn) callchart.update();
```
<a name="module_GraphChart.GraphChart+destroy"></a>

### graphChart.destroy() ⇒ <code>void</code>
Permanently tears down this chart (Prompt 131): stops every transition`update()` started that hasn't finished yet (`SelectionTransition.stop()`— abandons pending writes rather than snapping to their end value, sincethe chart is going away regardless), force-disposes any members stillmid dissolve-out (excluded from `#backendSelection` since they'redeparting, not live — see `#pendingExits`), disposes the live backenditself (every `GraphMesh`, or the one `GraphInstancedObject`, via`Selection.dispose()`), and drops registered lifecycle *and*interaction-event handlers.Idempotent — safe to call twice. Every other public method throwsafterward (CLAUDE.md's Disposal Contract).Doesn't dispose any axis/annotation, because `GraphChart` doesn't attachone itself yet — no current prompt wires either onto a chart instance,so there is nothing of that kind to release here.

**Kind**: instance method of [<code>GraphChart</code>](#module_GraphChart.GraphChart)  
**Example**  
```js
chart.destroy();
```
