# GraphAnimKeyframe

<a name="module_GraphAnimKeyframe.GraphAnimKeyframe"></a>

## GraphAnimKeyframe
A per-property animation track: a dot-path plus one or more `{offset,value}` stops (`offset ∈ [0, 1]`). All value interpolation betweenconsecutive stops delegates to `compose/interpolate` (CLAUDE.md §1.1 DRY —no local lerp lives here); the interpolator for each stop pair is builtonce at construction, so `valueAt` is just a segment lookup.

**Kind**: static class of [<code>GraphAnimKeyframe</code>](#module_GraphAnimKeyframe)  

* [.GraphAnimKeyframe](#module_GraphAnimKeyframe.GraphAnimKeyframe)
    * [new exports.GraphAnimKeyframe(path, stops)](#new_module_GraphAnimKeyframe.GraphAnimKeyframe_new)
    * [.path](#module_GraphAnimKeyframe.GraphAnimKeyframe+path) ⇒ <code>string</code>
    * [.valueAt(t)](#module_GraphAnimKeyframe.GraphAnimKeyframe+valueAt) ⇒ <code>\*</code>
    * [.apply(target, t)](#module_GraphAnimKeyframe.GraphAnimKeyframe+apply) ⇒ <code>this</code>

<a name="new_module_GraphAnimKeyframe.GraphAnimKeyframe_new"></a>

### new exports.GraphAnimKeyframe(path, stops)
**Throws**:

- <code>TypeError</code> If `path` isn't a non-empty string, `stops` isn't a non-empty array,  or two stop values at adjacent offsets aren't interpolatable (see `compose/interpolate`).
- <code>RangeError</code> If any stop's `offset` is outside `[0, 1]`.


| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | A dot-path, e.g. `'position.y'` or `'material.opacity'`. |
| stops | <code>Object</code> | At least one stop; sorted by `offset` internally. |

**Example**  
```js
const track = new GraphAnimKeyframe('position.y', [  { offset: 0, value: 0 },  { offset: 1, value: 10 },]);track.valueAt(0.5); // 5
```
<a name="module_GraphAnimKeyframe.GraphAnimKeyframe+path"></a>

### graphAnimKeyframe.path ⇒ <code>string</code>
**Kind**: instance property of [<code>GraphAnimKeyframe</code>](#module_GraphAnimKeyframe.GraphAnimKeyframe)  
**Returns**: <code>string</code> - The dot-path this track writes to.  
<a name="module_GraphAnimKeyframe.GraphAnimKeyframe+valueAt"></a>

### graphAnimKeyframe.valueAt(t) ⇒ <code>\*</code>
The interpolated value at normalized progress `t`, clamped to `[0, 1]`(values before the first stop or after the last hold at that stop's value).

**Kind**: instance method of [<code>GraphAnimKeyframe</code>](#module_GraphAnimKeyframe.GraphAnimKeyframe)  

| Param | Type |
| --- | --- |
| t | <code>number</code> | 

**Example**  
```js
track.valueAt(0.5);
```
<a name="module_GraphAnimKeyframe.GraphAnimKeyframe+apply"></a>

### graphAnimKeyframe.apply(target, t) ⇒ <code>this</code>
Writes [valueAt](valueAt)`(t)` onto `target` at this track's path.

**Kind**: instance method of [<code>GraphAnimKeyframe</code>](#module_GraphAnimKeyframe.GraphAnimKeyframe)  

| Param | Type |
| --- | --- |
| target | <code>object</code> | 
| t | <code>number</code> | 

**Example**  
```js
track.apply(mesh, 0.5);
```
