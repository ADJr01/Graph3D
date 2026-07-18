# GraphSceneSetup

<a name="module_GraphSceneSetup.GraphSceneSetup"></a>

## GraphSceneSetup
Orchestrates the sub-managers a chart needs to render into a `GraphScene`
with sensible defaults, so chart types (Phase 8) don't each reimplement
"does this scene already have lights / shadows?" checks.

**Kind**: static class of [<code>GraphSceneSetup</code>](#module_GraphSceneSetup)  

* [.GraphSceneSetup](#module_GraphSceneSetup.GraphSceneSetup)
    * [new exports.GraphSceneSetup()](#new_module_GraphSceneSetup.GraphSceneSetup_new)
    * [.ensureDefaults(scene, [options])](#module_GraphSceneSetup.GraphSceneSetup.ensureDefaults) ⇒ <code>Object</code>

<a name="new_module_GraphSceneSetup.GraphSceneSetup_new"></a>

### new exports.GraphSceneSetup()
**Example**  
```js
const { light, shadows } = await GraphSceneSetup.ensureDefaults(scene, {
  renderer: graph3d.renderer.three,
});
```
<a name="module_GraphSceneSetup.GraphSceneSetup.ensureDefaults"></a>

### GraphSceneSetup.ensureDefaults(scene, [options]) ⇒ <code>Object</code>
Ensure `scene` has a camera, lights, and (when a renderer is supplied)
an environment manager and shadows — filling in sensible defaults for
whichever piece is missing. Existing setup is left untouched, so this is
idempotent to call once per scene.

- **camera** — `GraphScene` always constructs one; returned as-is.
- **lights** — added via `GraphSceneLight` only if the scene has no light yet.
- **environment** — constructed via `GraphSceneEnvironment` only if `renderer`
  is supplied; no HDR/fog/background is forced, so this is `null` without a renderer.
- **shadows** — enabled via `GraphSceneShadows` only if `renderer` is supplied
  and its shadow map isn't already enabled.

**Kind**: static method of [<code>GraphSceneSetup</code>](#module_GraphSceneSetup.GraphSceneSetup)  
**Throws**:

- <code>TypeError</code> If `scene` is not a `GraphScene`.


| Param | Type |
| --- | --- |
| scene | <code>GraphScene</code> | 
| [options] | <code>Object</code> | 

**Example**  
```js
const setup = await GraphSceneSetup.ensureDefaults(scene);
```
**Example**  
```js
// With a renderer, also gets an environment manager and default shadows
const setup = await GraphSceneSetup.ensureDefaults(scene, { renderer: graph3d.renderer.three });
```
