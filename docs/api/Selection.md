# Selection

<a name="module_Selection.Selection"></a>

## Selection
A uniform per-datum handle set over either backend a chart renderswith — individual `GraphMesh`es (low datum count) or one`GraphInstancedObject` (high datum count) — so micro-control code doesn'tneed to branch on which rendering path a chart chose (CLAUDE.md's Prompt74 "D3 for 3D" soul). Charts and scenes construct and hand out `Selection`s(via `GraphScene.selectAll`/`selectInstance`, chart internals, or thePhase-4 data-join) — user code never calls `new Selection(...)` directly.Bound data is read through the same per-object storage the `object/`layer already provides for exactly this purpose — `GraphMesh`'s`getUserData('datum')` and `GraphInstancedObject`'s`getInstanceUserData(i)` — rather than a second, duplicate copy living onthe `Selection` itself (CLAUDE.md §1.1 DRY): whatever materialized themesh/instance is responsible for having bound its datum there first.

**Kind**: static class of [<code>Selection</code>](#module_Selection)  

* [.Selection](#module_Selection.Selection)
    * [new exports.Selection(backend)](#new_module_Selection.Selection_new)
    * _instance_
        * [.backend](#module_Selection.Selection+backend) ⇒ <code>Object</code>
        * [.size()](#module_Selection.Selection+size) ⇒ <code>number</code>
        * [.empty()](#module_Selection.Selection+empty) ⇒ <code>boolean</code>
        * [.datum(index)](#module_Selection.Selection+datum) ⇒ <code>\*</code>
        * [.data([newData], [keyFn])](#module_Selection.Selection+data) ⇒ <code>\*</code>
        * [.nodes()](#module_Selection.Selection+nodes) ⇒ <code>\*</code>
        * [.attr(path, valueOrFn)](#module_Selection.Selection+attr) ⇒ <code>this</code>
        * [.style(materialProp, valueOrFn)](#module_Selection.Selection+style) ⇒ <code>this</code>
        * [.filter(predicateFn)](#module_Selection.Selection+filter) ⇒ <code>Selection</code>
        * [.each(fn)](#module_Selection.Selection+each) ⇒ <code>this</code>
        * [.sort(comparator)](#module_Selection.Selection+sort) ⇒ <code>Selection</code>
        * [.call(fn, ...args)](#module_Selection.Selection+call) ⇒ <code>this</code>
        * [.merge(other)](#module_Selection.Selection+merge) ⇒ <code>Selection</code>
        * [.remove([animationName], [options])](#module_Selection.Selection+remove) ⇒ <code>this</code>
        * [.dispose()](#module_Selection.Selection+dispose) ⇒ <code>void</code>
        * [.transition()](#module_Selection.Selection+transition) ⇒ <code>SelectionTransition</code>
        * [.on(event, handler)](#module_Selection.Selection+on) ⇒ <code>this</code>
    * _static_
        * [.dispatch(eventName, hit)](#module_Selection.Selection.dispatch)

<a name="new_module_Selection.Selection_new"></a>

### new exports.Selection(backend)
**Throws**:

- <code>TypeError</code> If `backend` doesn't match either recognized shape.
- <code>RangeError</code> If an instanced-backend index exceeds the object's capacity.


| Param | Type |
| --- | --- |
| backend | <code>Object</code> | 

**Example**  
```js
const selection = new Selection({ type: 'instanced', object: bars, indices: Uint32Array.from([0, 1, 2]) });selection.size(); // 3selection.data(); // [datum0, datum1, datum2]
```
<a name="module_Selection.Selection+backend"></a>

### selection.backend ⇒ <code>Object</code>
Escape hatch to the raw backend this selection wraps — mirrors`GraphObject`'s own `get three()` (an escape hatch to raw Three.js).Most callers should prefer `Selection`'s own uniform methods (`attr`,`style`, `filter`, ...) instead; this exists for chart-type-specificoperations those don't cover, e.g. `ScatterChart.pick()` (Prompt 134)needing the real `GraphInstancedObject` to reach its alreadyoctree-backed `pick(raycaster)`.

**Kind**: instance property of [<code>Selection</code>](#module_Selection.Selection)  
**Example**  
```js
selection.backend.type; // 'meshes' | 'instanced'
```
<a name="module_Selection.Selection+size"></a>

### selection.size() ⇒ <code>number</code>
**Kind**: instance method of [<code>Selection</code>](#module_Selection.Selection)  
**Returns**: <code>number</code> - The number of datums this selection covers.  
**Example**  
```js
selection.size(); // 3
```
<a name="module_Selection.Selection+empty"></a>

### selection.empty() ⇒ <code>boolean</code>
**Kind**: instance method of [<code>Selection</code>](#module_Selection.Selection)  
**Returns**: <code>boolean</code> - `true` if this selection covers zero datums.  
**Example**  
```js
selection.empty(); // false
```
<a name="module_Selection.Selection+datum"></a>

### selection.datum(index) ⇒ <code>\*</code>
The datum bound to the node at position `index` within this selection.

**Kind**: instance method of [<code>Selection</code>](#module_Selection.Selection)  
**Throws**:

- <code>RangeError</code> If `index` is outside `[0, size())`.


| Param | Type |
| --- | --- |
| index | <code>number</code> | 

**Example**  
```js
selection.datum(0); // { category: 'Q1', value: 42 }
```
<a name="module_Selection.Selection+data"></a>

### selection.data([newData], [keyFn]) ⇒ <code>\*</code>
Two-in-one, matching d3's own `.data()`: called with no arguments, readsevery bound datum in selection order. Called with `newData` (andoptionally `keyFn`), **joins** it against the currently bound data(Prompt 78) — the single diff authority is `diff.js`'s `diffData`,consumed here via `join.js`'s `computeJoin` (CLAUDE.md §1.1 DRY: thefuture `GraphChartDataBinding` reuses the same `diffData`). Matchedmembers are rebound to their new datum in place (same node, new data);the returned `JoinResult` **is** the update selection, plus `.enter()`/`.exit()`/`.join()` for the members that entered/departed.

**Kind**: instance method of [<code>Selection</code>](#module_Selection.Selection)  
**Returns**: <code>\*</code> - The bound data (no-arg form), or a `JoinResult` (join form).  
**Throws**:

- <code>TypeError</code> If `newData` is provided but is not an array, or  `keyFn` is provided but is not a function.
- <code>Error</code> If `keyFn` produces a duplicate key within `newData`.


| Param | Type | Description |
| --- | --- | --- |
| [newData] | <code>\*</code> |  |
| [keyFn] | <code>function</code> | Defaults to a positional   join (index `i` in both the old and new data is "the same" node). |

**Example**  
```js
selection.data(); // [{ value: 1 }, { value: 2 }]
```
**Example**  
```js
const joined = selection.data(rows, (d) => d.id);joined.enter().attr('color', 'seagreen');joined.exit().remove();
```
<a name="module_Selection.Selection+nodes"></a>

### selection.nodes() ⇒ <code>\*</code>
A per-datum proxy handle for every member of this selection, uniformacross both backends — the analogue of d3's `.nodes()`.

**Kind**: instance method of [<code>Selection</code>](#module_Selection.Selection)  
**Example**  
```js
selection.nodes()[0].datum;
```
<a name="module_Selection.Selection+attr"></a>

### selection.attr(path, valueOrFn) ⇒ <code>this</code>
Writes an attribute across every node in this selection — the write pathfor "micro-control that survives instancing" (Prompt 75). `path` is oneof the fixed vocabulary entries (`position.x/y/z`, `rotation.x/y/z`,`scale.x/y/z`, `color`, `opacity`, `visible`) or a custom per-instanceattribute name previously registered via `GraphInstancedObject`'s`defineAttribute` (Prompt 38, instanced backend only). The routingitself — and the single-commit-per-flush discipline — lives in`attr.js`, not here (CLAUDE.md §1.2 KISS: this class stays a thin,readable dispatch surface).

**Kind**: instance method of [<code>Selection</code>](#module_Selection.Selection)  
**Throws**:

- <code>TypeError</code> If `path` is malformed, or a resolved value has the  wrong type for `path` (e.g. a non-boolean for `'visible'`).
- <code>Error</code> If `path` names a custom attribute used on a meshes  backend, or an instanced custom attribute never defined via  `defineAttribute`.


| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> |  |
| valueOrFn | <code>\*</code> | A constant, or `(datum: *, index: number) => value`. |

**Example**  
```js
selection.attr('position.y', (d) => d.value * scale);
```
**Example**  
```js
selection.attr('color', 'crimson');
```
**Example**  
```js
selection.attr('visible', (d) => d.value > 0);
```
<a name="module_Selection.Selection+style"></a>

### selection.style(materialProp, valueOrFn) ⇒ <code>this</code>
Writes a material property across every node in this selection —material-level micro-control (Prompt 77), as opposed to `attr`'s fixedtransform/color/opacity/visible vocabulary. `color`/`opacity` behaveexactly as `attr('color'|'opacity', ...)`. On the meshes backend, any`materialProp` writes per-datum since each mesh owns its material. Onthe instanced backend, only `color`/`opacity`/`emissiveIntensity` areper-instance-capable (routed to instance buffers/attributes); everyother `materialProp` is material-global — the instanced backend sharesone material across all instances, so a per-datum accessor collapses toa single write (resolved from the first datum) with a `console.warn`.

**Kind**: instance method of [<code>Selection</code>](#module_Selection.Selection)  
**Throws**:

- <code>TypeError</code> If `materialProp` is not a non-empty string.
- <code>Error</code> If no material in the selection has `materialProp`.


| Param | Type | Description |
| --- | --- | --- |
| materialProp | <code>string</code> |  |
| valueOrFn | <code>\*</code> | A constant, or `(datum: *, index: number) => value`. |

**Example**  
```js
selection.style('roughness', 0.4);
```
**Example**  
```js
selection.style('emissiveIntensity', (d) => d.highlighted ? 1 : 0);
```
<a name="module_Selection.Selection+filter"></a>

### selection.filter(predicateFn) ⇒ <code>Selection</code>
A new `Selection`, narrowed to the members for which `predicateFn`returns truthy — shares this selection's backend (the same `GraphMesh`references, or the same `GraphInstancedObject` with a narrowed`indices`), so writes on the result (`attr`, etc.) still land on thereal render targets.

**Kind**: instance method of [<code>Selection</code>](#module_Selection.Selection)  
**Throws**:

- <code>TypeError</code> If `predicateFn` is not a function.


| Param | Type |
| --- | --- |
| predicateFn | <code>function</code> | 

**Example**  
```js
selection.filter((d) => d.value > 90).attr('color', 'gold');
```
<a name="module_Selection.Selection+each"></a>

### selection.each(fn) ⇒ <code>this</code>
Calls `fn(datum, index, handle)` once per node, in selection order.

**Kind**: instance method of [<code>Selection</code>](#module_Selection.Selection)  
**Throws**:

- <code>TypeError</code> If `fn` is not a function.


| Param | Type |
| --- | --- |
| fn | <code>function</code> | 

**Example**  
```js
selection.each((d, i) => console.log(d, i));
```
<a name="module_Selection.Selection+sort"></a>

### selection.sort(comparator) ⇒ <code>Selection</code>
A new `Selection` with the same members, reordered by `comparator` — alogical reorder of this selection's own datum→index mapping only. Itdoes not rewrite any instance buffer or mesh array in place (see`combinators.js`'s `sortBackend` for why that's the correct, KISSscope for `sort` alone).

**Kind**: instance method of [<code>Selection</code>](#module_Selection.Selection)  
**Throws**:

- <code>TypeError</code> If `comparator` is not a function.


| Param | Type | Description |
| --- | --- | --- |
| comparator | <code>function</code> | Same contract as `Array.prototype.sort`. |

**Example**  
```js
selection.sort((a, b) => a.value - b.value);
```
<a name="module_Selection.Selection+call"></a>

### selection.call(fn, ...args) ⇒ <code>this</code>
D3-style reusable-behavior hook: calls `fn(this, ...args)` and returns`this`, so a reusable behavior function can be dropped into a chainwithout breaking it.

**Kind**: instance method of [<code>Selection</code>](#module_Selection.Selection)  
**Throws**:

- <code>TypeError</code> If `fn` is not a function.


| Param | Type |
| --- | --- |
| fn | <code>function</code> | 
| ...args | <code>\*</code> | 

**Example**  
```js
selection.call(highlightAboveThreshold, 90).attr('opacity', 1);
```
<a name="module_Selection.Selection+merge"></a>

### selection.merge(other) ⇒ <code>Selection</code>
A new `Selection` covering this selection's members followed by`other`'s. Both must share the same backend *type*, and — for theinstanced backend — the same `GraphInstancedObject` (a `Uint32Array` ofindices is only meaningful relative to one object's instance slots).Does not deduplicate overlapping members.

**Kind**: instance method of [<code>Selection</code>](#module_Selection.Selection)  
**Throws**:

- <code>TypeError</code> If `other` is not a `Selection`.
- <code>Error</code> If `other` has a different backend type, or (instanced)  a different `GraphInstancedObject`.


| Param | Type |
| --- | --- |
| other | <code>Selection</code> | 

**Example**  
```js
enterSelection.merge(updateSelection).attr('position.y', (d) => d.value);
```
<a name="module_Selection.Selection+remove"></a>

### selection.remove([animationName], [options]) ⇒ <code>this</code>
Permanently removes every member of this selection (Prompt 79):disposes each `GraphMesh` (meshes backend), or frees each instance indexback to the join system's free-list for a future `enter()` to recycle(instanced backend). Typically called on an `.exit()` result, but workson any selection.Passing `animationName` (Prompt 122, e.g. `'dissolve'`) plays a particleexit effect at each departing node's location first — the node is stillfreed immediately after, since the burst is a short-lived visual, not aremoval delay (there's no chart-level animated-exit lifecycle yet; thatlands with `GraphChart.exitAnimation` in Phase 8). `options.system` mustbe a particle system exposing `.preset(name, opts)` — i.e. a`postfx/particles` `ParticleSystem`, duck-typed rather than imported,since `Selection` (compose/) has no scene/camera/renderer of its own tobuild one and must not import `postfx/` per CLAUDE.md §1.4. Meshesbackend passes each node's raw mesh (`options.system.preset(name, {mesh })`, e.g. `ParticleSystem`'s `'dissolve'` preset surface-samplesit); instanced backend passes its local-space position instead.

**Kind**: instance method of [<code>Selection</code>](#module_Selection.Selection)  
**Throws**:

- <code>TypeError</code> If `animationName` is given without a valid `options.system`.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [animationName] | <code>string</code> |  | A preset name registered on `options.system`. |
| [options] | <code>Object</code> | <code>{}</code> |  |
| [options.system] | <code>Object</code> |  | Required when `animationName` is given. |

**Example**  
```js
joined.exit().remove();
```
**Example**  
```js
joined.exit().remove('dissolve', { system: rain });
```
<a name="module_Selection.Selection+dispose"></a>

### selection.dispose() ⇒ <code>void</code>
Permanently disposes the underlying rendering resource(s) thisselection's backend owns: every `GraphMesh` (meshes backend), or theshared `GraphInstancedObject` itself, once, regardless of how manyindices this particular selection covers — the instanced object is asingle chart-owned resource, not a per-index one. Unlike `remove()`(which only frees this selection's own members for potential reuse),`dispose()` releases the resource for good — meant for tearing down achart's entire backend (`GraphChart.destroy()`, Prompt 131), not fornarrowed/filtered selections a caller still wants to use.

**Kind**: instance method of [<code>Selection</code>](#module_Selection.Selection)  
**Example**  
```js
chart.selection().dispose();
```
<a name="module_Selection.Selection+transition"></a>

### selection.transition() ⇒ <code>SelectionTransition</code>
A `SelectionTransition` (Prompt 91) over this selection's members —`.attr()`/`.style()` on it animate toward the given values (interpolatingfrom each node's current value) instead of snapping, driven by theshared `anim` engine (Phase 5). `.remove()` on it defers removal untilevery scheduled write completes.

**Kind**: instance method of [<code>Selection</code>](#module_Selection.Selection)  
**Example**  
```js
joined.exit().transition().duration(400).attr('opacity', 0).remove();
```
**Example**  
```js
selection.transition().duration(600).delay((d, i) => i * 40).attr('position.y', (d) => d.value);
```
<a name="module_Selection.Selection+on"></a>

### selection.on(event, handler) ⇒ <code>this</code>
Registers `handler` for `event` (any non-empty string — pointer/interaction events like `'click'`/`'hover-enter'`/`'hover-leave'`, not afixed vocabulary the way `GraphChart.on('enter'|'update'|'exit', ...)`is) on this selection's members only — filtering first scopes whichdatums it fires for: `chart.selection().filter(d => d.value > 90).on('click', fn)`only calls `fn` for datums that passed the filter. Multiple handlers forthe same event accumulate (registration order), mirroring`GraphChart.on()`. Actually firing a handler is driven by`Selection.dispatch()` (Prompt 149) — called by `interact/PointerRouter`once a real pointer event and `Picker` hit resolve to a specific node;`.on()` itself has no pointer/event wiring of its own, it only records"call `handler` when a hit lands on one of my members."

**Kind**: instance method of [<code>Selection</code>](#module_Selection.Selection)  
**Throws**:

- <code>TypeError</code> If `event` isn't a non-empty string, or `handler` isn't a function.


| Param | Type |
| --- | --- |
| event | <code>string</code> | 
| handler | <code>function</code> | 

**Example**  
```js
chart.selection().filter((d) => d.value > 90).on('click', (d) => console.log('clicked', d));
```
<a name="module_Selection.Selection.dispatch"></a>

### Selection.dispatch(eventName, hit)
The one place a pointer-wiring consumer (`interact/PointerRouter`,Prompt 149) reaches into every currently-`.on()`'d `Selection` (acrossevery chart — a `Selection` carries no chart reference of its own,`mesh`/`instanceIndex` identify the hit node directly, `Picker`'s ownhit vocabulary) to find and invoke matching handlers. A no-op if no liveselection has a handler for `event`, or none of them contain the hitnode.

**Kind**: static method of [<code>Selection</code>](#module_Selection.Selection)  

| Param | Type | Description |
| --- | --- | --- |
| eventName | <code>string</code> |  |
| hit | <code>Object</code> | `mesh`/`instanceIndex` identify the hit node (same shape `Picker.pickAt()` returns, plus `domEvent` — the raw DOM event, forwarded to handlers as-is). |

**Example**  
```js
Selection.dispatch('click', { mesh, instanceIndex, datum, worldPoint, domEvent: pointerEvent });
```
