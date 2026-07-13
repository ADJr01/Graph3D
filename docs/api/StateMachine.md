# StateMachine

<a name="module_StateMachine.StateMachine"></a>

## StateMachine
Per-chart datum interaction state (`default`/`hovered`/`focused`/
`selected`/`dragging`) with a configurable visual response per state.
Wraps one chart — duck-typed to its `selection()` method, the same escape
hatch `Picker` (Prompt 147) uses — rather than being owned by `GraphChart`
itself: `chart/` sits below `interact/` in CLAUDE.md §1.4's layering
table, so a chart importing `StateMachine` would close a real dependency
cycle. A caller wanting `chart.stateOf(datum)`-style access constructs
`new StateMachine(chart)` alongside the chart and calls `stateOf(datum)`
on that.

`style(state, responseFn)` registers what a state *looks like*: `setState`
calls it with `(selection, datum)` — `selection` already filtered down to
just that datum's node — whenever a datum transitions into that state. No
separate "leave" hook exists here: leaving a state is just entering
another one (typically `'default'`), and that state's own `responseFn` (if
any) is responsible for whatever appearance it wants — declarative, same
as `chart.color(fn)`/`chart.opacity(fn)`'s absolute (never relative)
writes. Detecting *when* a datum should transition (pointer hover-enter/
leave, click-to-select, drag-start/end) is Prompt 149's job, not this
one's — `StateMachine` only stores state and applies its configured
response; it has no pointer/event wiring of its own.

**Kind**: static class of [<code>StateMachine</code>](#module_StateMachine)  

* [.StateMachine](#module_StateMachine.StateMachine)
    * [new exports.StateMachine(chart)](#new_module_StateMachine.StateMachine_new)
    * [.chart](#module_StateMachine.StateMachine+chart) ⇒ <code>function</code>
    * [.style(state, [responseFn])](#module_StateMachine.StateMachine+style) ⇒ <code>function</code>
    * [.hoverStyle([options])](#module_StateMachine.StateMachine+hoverStyle) ⇒ <code>Object</code>
    * [.selectStyle([options])](#module_StateMachine.StateMachine+selectStyle) ⇒ <code>Object</code>
    * [.stateOf(datum)](#module_StateMachine.StateMachine+stateOf) ⇒ <code>\*</code>
    * [.setState(datum, state)](#module_StateMachine.StateMachine+setState) ⇒ <code>this</code>

<a name="new_module_StateMachine.StateMachine_new"></a>

### new exports.StateMachine(chart)
**Throws**:

- <code>TypeError</code> If `chart` doesn't expose a `selection()` method.


| Param | Type | Description |
| --- | --- | --- |
| chart | <code>function</code> | Any `GraphChart` — duck-typed to its `selection()` method. |

**Example**  
```js
const stateMachine = new StateMachine(chart);
stateMachine.style('hovered', (selection) => selection.attr('scale.x', 1.1));
stateMachine.setState(datum, 'hovered');
stateMachine.stateOf(datum); // 'hovered'
```
<a name="module_StateMachine.StateMachine+chart"></a>

### stateMachine.chart ⇒ <code>function</code>
The chart this state machine wraps.

**Kind**: instance property of [<code>StateMachine</code>](#module_StateMachine.StateMachine)  
**Example**  
```js
stateMachine.chart.selection();
```
<a name="module_StateMachine.StateMachine+style"></a>

### stateMachine.style(state, [responseFn]) ⇒ <code>function</code>
Gets or sets the visual response for `state` — called with
`(selection, datum)` (`selection` filtered to just that one datum's
node) every time a datum transitions into `state` via `setState`. A
state with no configured response is a no-op transition (state
bookkeeping still updates; nothing visual happens).

**Kind**: instance method of [<code>StateMachine</code>](#module_StateMachine.StateMachine)  
**Throws**:

- <code>TypeError</code> If `state` isn't one of the fixed vocabulary, or `responseFn` is given and isn't a function.


| Param | Type |
| --- | --- |
| state | <code>\*</code> | 
| [responseFn] | <code>function</code> | 

**Example**  
```js
stateMachine.style('selected', (selection) => selection.attr('color', 'gold'));
```
<a name="module_StateMachine.StateMachine+hoverStyle"></a>

### stateMachine.hoverStyle([options]) ⇒ <code>Object</code>
Gets or sets Prompt 150's default hover appearance: a shader effect
(`material.effects`' registered presets — defaults to `neonEdge`, an
outline-style glow) plus a uniform scale bump (default `1.05`, i.e.
+5%). Applied automatically by `setState` on every 'default'↔'hovered'
transition — resolves `chart.hoverEffect()`'s config first if the chart
exposes one and has actually configured it (Prompt 150's other named
entry point), falling back to this config otherwise. Pass `{ scale: 1 }`
to disable the scale bump entirely while keeping the effect (or vice
versa via `{ effect: null }`).

**Kind**: instance method of [<code>StateMachine</code>](#module_StateMachine.StateMachine)  
**Throws**:

- <code>TypeError</code> If `options` is given and isn't a plain object, or `scale` isn't a positive finite number.


| Param | Type |
| --- | --- |
| [options] | <code>Object</code> | 

**Example**  
```js
stateMachine.hoverStyle({ effect: { name: 'glow', options: { intensity: 2 } }, scale: 1.1 });
```
<a name="module_StateMachine.StateMachine+selectStyle"></a>

### stateMachine.selectStyle([options]) ⇒ <code>Object</code>
Gets or sets Prompt 150's default select appearance — same shape and
defaulting rules as `hoverStyle`, but with no scale bump by default
("selected → outline variant" carries no scale change per the prompt's
own wording), applied on every 'default'↔'selected' transition.

**Kind**: instance method of [<code>StateMachine</code>](#module_StateMachine.StateMachine)  
**Throws**:

- <code>TypeError</code> If `options` is given and isn't a plain object, or `scale` isn't a positive finite number.


| Param | Type |
| --- | --- |
| [options] | <code>Object</code> | 

**Example**  
```js
stateMachine.selectStyle({ effect: { name: 'glow', options: { color: 'gold' } } });
```
<a name="module_StateMachine.StateMachine+stateOf"></a>

### stateMachine.stateOf(datum) ⇒ <code>\*</code>
The current state of `datum` — `'default'` if never set (or last set to
`'default'`).

**Kind**: instance method of [<code>StateMachine</code>](#module_StateMachine.StateMachine)  

| Param | Type |
| --- | --- |
| datum | <code>\*</code> | 

**Example**  
```js
stateMachine.stateOf(datum); // 'default'
```
<a name="module_StateMachine.StateMachine+setState"></a>

### stateMachine.setState(datum, state) ⇒ <code>this</code>
Transitions `datum` to `state` and applies that state's configured
`style()` response (if any) to the datum's current node in this
chart's live selection — a no-op visually (bookkeeping still updates)
if `datum` isn't currently bound/rendered, or no response is configured
for `state`. A no-op entirely (bookkeeping *and* visuals) if `datum` is
already in `state`.

**Kind**: instance method of [<code>StateMachine</code>](#module_StateMachine.StateMachine)  
**Throws**:

- <code>TypeError</code> If `state` isn't one of the fixed vocabulary.


| Param | Type |
| --- | --- |
| datum | <code>\*</code> | 
| state | <code>\*</code> | 

**Example**  
```js
stateMachine.setState(datum, 'hovered');
```
