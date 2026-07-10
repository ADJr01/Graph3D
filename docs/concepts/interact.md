# Interaction — Phase 9 (complete)

Interact is Layer 9 of Graph3D.js — picking, hover/focus/select state, tooltips, brush/lasso selection, and cross-filtering, all built on `chart/`'s public API (`selection()`) rather than reaching into any chart's private internals. `Picker` (Prompt 147) is a centralized ray-based hit-tester that works uniformly across every chart type. `StateMachine` (Prompt 148) tracks each datum's interaction state and applies a configurable visual response when it changes — including, as of Prompt 150, a default hover/select appearance out of the box, with no configuration required. `PointerRouter` (Prompt 149) wires real pointer events on a canvas into both of those, plus `Selection.on(event, handler)` (Prompt 149) for per-datum, filter-scoped event handling. `material.effects` (Prompt 150) is a registry of premade GLSL shader effects (`glow`, `fire`, `crackers`, `lightenup`, `pulse`, `ripple`, `neonEdge`) that `chart.hoverEffect()`/`selectEffect()` and `StateMachine`'s own defaults both draw from. `Brush`/`Lasso` (Prompt 152) are screen-space region-selection gestures — a draggable rectangle and a free-form polygon — each producing a real `Selection` per matched chart. `link` (Prompt 153) wires that selection into cross-filtering: a `'select'` event on a `Brush`/`Lasso` or, as of Prompt 156/158, a plain chart, filters another chart's data to match — and can chain to propagate a selection through several linked charts in sequence. `PointerRouter` also drives drag-and-drop (Prompt 154, `chart.draggable(true)`); `KeyboardNav` (Prompt 154) is its accessible, keyboard-driven counterpart — Tab/Shift+Tab cycles datums, Enter selects, Escape clears, and an ARIA live region announces every step. `FocusFollower` (Prompt 155) continuously orbits the camera around a focused datum's world position; `PointerRouter` also hit-tests `annotation.label(...).on('click', fn)` handlers and exposes `selectedEntries()`; `chart.exportSelection()/importSelection()` round-trip an interactively-selected set through its join keys, surviving a `data()` reload. As of Prompt 156, `chart.on(event, handler)` accepts a full interaction-event vocabulary (`hover`/`select`/`deselect`/`brushStart`/`brushEnd`/`lassoStart`/`lassoEnd`/`dragStart`/`dragEnd`/`focus`) alongside its original `enter`/`update`/`exit` — every `interact/` class that detects one of these now also calls the hit chart's own `dispatch(event, payload)`; `chart.pickingEnabled(false)` opts a chart out of `Picker` hit-testing entirely. Prompt 158's cross-cutting integration tests (`tests/integration/phase9.test.js`) closed the one real gap that surfaced from combining Prompts 153 and 156: `link()` now accepts a plain chart's click-driven `'select'` payload as a source, not just a `Brush`/`Lasso`'s `Selection`.

```js
import { Picker, PointerRouter } from 'graph3d';

const picker = new Picker({ camera: scene.camera.three, domElement: canvas });
picker.register(barChart).register(scatterChart);

const router = new PointerRouter({ picker, domElement: canvas });
// Hovering/selecting already shows a default outline + 5% hover scale with
// zero configuration (Prompt 150) — style()/hoverStyle()/hoverEffect() below
// are all *optional* overrides of that baseline, not requirements.
router.stateMachineFor(barChart).style('hovered', (selection) => selection.attr('scale.x', 1.1));
router.stateMachineFor(barChart).style('selected', (selection) => selection.attr('color', 'gold'));

barChart.hoverEffect('fire', { intensity: 1.2 }); // swap the default outline for a full preset
barChart.selection().filter((d) => d.value > 90).on('click', (d) => console.log('clicked', d));
```

---

## `Picker` — centralized hit-testing

`ScatterChart.pick(raycaster)`/`PieChart.pick(raycaster)` (Phase 8) were the first picking methods in the library, but they're one-off: only those two chart types have one, and each caller has to build its own `THREE.Raycaster` from screen coordinates by hand. `Picker` generalizes this to any chart type and to plain pixel coordinates:

- **`register(chart)`/`unregister(chart)`** — add or remove a chart from the set `pickAt()` hit-tests against. `chart` is duck-typed to a `selection()` method — any `GraphChart` subclass qualifies, not just the two with a `.pick()` of their own.
- **`pickAt(x, y)`** — `x`/`y` are canvas-local pixel coordinates, top-left origin, in the same physical-pixel space as `domElement.width`/`.height` (e.g. a pointer event's `offsetX`/`offsetY` on the canvas itself, not `clientX`/`clientY`, and not adjusted for device-pixel-ratio scaling if the canvas's CSS size differs from its drawing-buffer size). Casts one ray through `camera` and returns the closest hit across every registered chart:

  ```js
  {
    chart,          // the GraphChart instance that owns the hit backend
    mesh,           // the raw THREE.Mesh (meshes backend) or THREE.InstancedMesh (instanced backend)
    instanceIndex,  // the hit instance's index, or null for a meshes-backend hit
    datum,          // the datum bound to the hit mesh/instance
    worldPoint,     // THREE.Vector3, the exact ray-surface intersection point
  }
  ```

  or `null` if nothing was hit.

Per registered chart, `Picker` dispatches on `chart.selection().backend`'s own shape (`Selection.backend`, the same escape hatch `ScatterChart.pick()` established) rather than building a second spatial index:

- **`backend.type === 'instanced'`** — the octree path: `GraphInstancedObject.pickDetailed(raycaster)` (Prompt 147, sharing its private traversal with the pre-existing `pick()`) queries the object's own octree for ray candidates before doing any real geometry raycast, then returns the closest hit's instance index, world point, and distance in one call.
- **`backend.type === 'meshes'`** — the raycaster fallback: a plain `THREE.Raycaster.intersectObjects` over the chart's (at most `INSTANCING_THRESHOLD`, i.e. ≤ 50) individual `GraphMesh`es — not worth building an octree for that few candidates.

Before either path runs, `pickAt()` forces `chart.scene.updateMatrixWorld(true)` for every registered chart's scene (deduped — registered charts commonly share one). `THREE.Object3D.matrixWorld` is otherwise only recomputed by a real `WebGLRenderer.render()` call; a pick requested between frames (e.g. from a `pointermove` handler firing before the first frame renders) would otherwise silently hit-test a `GraphMesh` against a stale, possibly-still-identity world transform.

### One pick per frame

Repeated `pickAt(x, y)` calls at the exact same coordinates within the same rendered frame reuse the cached result instead of re-raycasting every registered chart — cheap for a hover-highlight loop that reads the current pick more than once per frame. The cache is cleared by a one-shot callback on the shared `loop` (Prompt 20's single RAF manager — `Picker` never starts a second `requestAnimationFrame`, per the anti-patterns table in `CLAUDE.md` §2), so a call at a *different* `(x, y)` within the same frame is never held back by the cache — only identical repeats are.

### Scope

`Picker` doesn't own or dispose the charts it's registered with — `dispose()` only clears its own internal set and pending cache-invalidation callback. It also doesn't do any GPU-side (render-to-texture / color-ID) picking; every hit-test is CPU-side (octree-accelerated for instanced backends, brute-force `THREE.Raycaster` for the low-count meshes backends) — consistent with `ScatterChart.pick()`/`PieChart.pick()`'s existing approach, and sufficient at the scales those already handle.

## `StateMachine` — per-chart datum interaction state

Wraps one chart — `new StateMachine(chart)`, duck-typed to `chart.selection()`, the same escape hatch `Picker` uses. Deliberately not owned by `GraphChart` itself: `chart/` sits below `interact/` in `CLAUDE.md` §1.4's layering table, so a chart importing `StateMachine` would close a real dependency cycle — a caller wanting `chart`-scoped `stateOf(datum)` access constructs a `StateMachine` alongside the chart, the same way it constructs a `Picker` alongside a scene/camera.

- **Fixed state vocabulary**: `'default'` (implicit — never stored, so an untouched chart carries zero bookkeeping), `'hovered'`, `'focused'`, `'selected'`, `'dragging'`.
- **`stateOf(datum)`** — the datum's current state, `'default'` if never set.
- **`setState(datum, state)`** — transitions `datum` to `state` and applies that state's configured `style()` response (if any) to the datum's current node in the chart's live selection. A no-op (bookkeeping *and* visuals) if `datum` is already in `state`; a visual no-op (bookkeeping still updates) if the datum isn't currently bound/rendered, or no response is configured for `state`.
- **`style(state, responseFn)`** — two-in-one getter/setter (no-arg reads, one-arg writes and returns `this`, mirroring `chart.tooltip(handlerFn)`'s convention). `responseFn(selection, datum)` receives a `Selection` already filtered to just that one datum's node.

There's no separate "leave" hook: leaving a state is just entering another one (typically `'default'`), and that state's own `responseFn` — if configured — is responsible for whatever appearance it wants, declaratively, the same as `chart.color(fn)`/`chart.opacity(fn)`'s absolute (never relative) writes. `StateMachine` itself has no pointer/event wiring — *detecting* when a datum should transition (hover-enter/leave, click-to-select, drag-start/end) is `PointerRouter`'s job; `StateMachine` only stores state and applies its configured response when told to.

```js
const stateMachine = new StateMachine(scatterChart);
stateMachine.style('selected', (selection) => selection.attr('color', 'gold'));
stateMachine.setState(clickedDatum, 'selected');
stateMachine.stateOf(clickedDatum); // 'selected'
```

### Default hover/select visuals (Prompt 150)

Every `StateMachine` — even a freshly constructed one with no `.style()` ever called — already shows *something* on hover/select, entirely independent of the `style()` map above (so `stateMachine.style('hovered')` still reads back `null` until you actually configure one): entering `'hovered'` bumps the datum's uniform scale by `hoverStyle().scale` (default `1.05`, i.e. +5%) and applies `hoverStyle().effect` (default `{ name: 'neonEdge', options: {...} }` — a glowing silhouette edge, the closest built-in analogue to "outline pass"); entering `'selected'` applies `selectStyle().effect` (default `neonEdge` again, with a different color — "an outline variant") with no scale change. Leaving either state reverts both, exactly (the pre-hover scale is captured and restored, not divided back out, so it stays correct regardless of what other states the datum passes through in between).

- **`hoverStyle(options)`** / **`selectStyle(options)`** — two-in-one getter/setter, same convention as `style()`. `options` is `{ effect?: {name, options?} | null, scale?: number }` (`selectStyle` also accepts `scale`, but its default is `1` since the prompt only calls for a scale bump on hover). Pass `{ effect: null }` to disable the effect while keeping the scale, or `{ scale: 1 }` to disable the scale while keeping the effect.
- **`chart.hoverEffect(presetName, options)`** / **`chart.selectEffect(presetName, options)`** (see `material.effects` below) — a per-chart override, resolved first if configured; falls back to the state machine's own `hoverStyle`/`selectStyle` effect otherwise. Config-only, same "doesn't show anything itself" shape as `chart.tooltip()` — `StateMachine.setState` is what actually reads it back and applies it.

```js
const stateMachine = new StateMachine(barChart);
stateMachine.hoverStyle({ scale: 1.1 }); // bigger bump, same default outline effect
barChart.hoverEffect('fire', { intensity: 1.2 }); // or: swap the outline for a full preset entirely
```

## `material.effects` — premade GLSL hover/select shader effects (Prompt 150)

`src/material/effects/` is a registry of seven self-contained, named GLSL presets — `glow` (emissive halo pulse), `fire` (animated flame ramp rising along local Y), `crackers` (flickering surface sparks), `lightenup` (brightness lift + fresnel rim), `pulse` (rhythmic emissive beat), `ripple` (radial highlight wave), `neonEdge` (glowing silhouette edge, `StateMachine`'s own default) — applied to a chart's material non-destructively via `onBeforeCompile`, so the original material is unaffected once an effect is removed.

- **`effects.list()`** — every preset's name and option schema, for docs/tooling to enumerate.
- **`chart.hoverEffect(presetName, options)`** / **`chart.selectEffect(presetName, options)`** — two-in-one getter/setter on `GraphChart` itself (unlike `hoverStyle`/`selectStyle`, this needs no pointer access to *store* — only `StateMachine.setState` needs pointer-adjacent info to *apply* it, so the config lives on the chart, same as `chart.tooltip()`). Validated eagerly against the registry — an unregistered name throws with a Levenshtein "did you mean" suggestion (Fail Fast; only the 7 registered presets are accepted, no user-authored GLSL in this prompt — see below).

```js
chart.hoverEffect('fire', { intensity: 1.2 });   // hovered datum only
chart.selectEffect('glow', { color: '#22ffcc' }); // applied on select, cleared on deselect
```

**Per-datum targeting** differs by backend, both driven by `EffectController` (`applyEffect`/`removeEffect`, `src/material/effects/EffectController.js`):

- **Instanced backend**: the preset is baked into the chart's one *shared* material exactly once (idempotent — re-targeting a different instance with the same preset+options never re-triggers `onBeforeCompile`/a shader recompile), driving a per-instance `effectPhase_<slot>` attribute (`GraphInstancedObject.defineAttribute`, Prompt 38) that gates the effect in the fragment shader — an instance with phase `0` renders no effect at all, so only the targeted instance(s) show it despite every instance sharing one draw call.
- **Meshes backend**: the hit mesh's material is cloned once (on first active slot) and swapped in; `onBeforeCompile` is applied to the clone. Once every slot (`'hover'`, `'select'`) active on that mesh has faded back out, the original material reference is restored byte-identical and the clone disposed (its own compiled program only — never its textures, which are shared with the original via `THREE.Material.clone()` and still in use).

Both paths animate the effect's `0..1` phase in over ~150ms on enter and back out on leave via a shared `PhaseAnimator` (one RAF `loop` tick driving any number of concurrent phase animations — never a second `requestAnimationFrame`, mirroring `GraphInstancedObject`'s own bulk-transition convention). Two slots (`hover` + `select`) can be baked into and animating on the same material concurrently without colliding — every preset's uniform/attribute names are suffixed by slot (`uColor_hover` vs `uColor_select`).

**Scope**: only the 7 registered presets are accepted — no user-authored/custom GLSL (a future `EffectSystem`, Prompt 269+, generalizes this registry into a full authoring API; this prompt's registry/injector is what that one extends). `crackers` is a surface-space flicker approximation, not literal ejected/displaced particles (documented in `skipping_list.md`, consistent with the prompt's own "no particle system dependency" constraint). `lightenup`/`neonEdge` reuse THREE's built-in `vNormal`/`vViewPosition` fragment varyings for their fresnel term, which — unlike `dithering_fragment`/`begin_vertex`, present in every built-in material this library ships — aren't declared by `material.basic()`'s shader; applying either preset to a `material.basic()`-backed chart is a known, documented limitation, not silently handled.

## `Selection.on(event, handler)` — per-datum, filter-scoped event handling

Replaces the Prompt 80 throw-stub. `event` is any non-empty string — an open vocabulary (`'click'`, `'hover-enter'`, `'hover-leave'`, or anything else a caller and its dispatcher agree on), unlike `GraphChart.on('enter'|'update'|'exit', ...)`'s fixed lifecycle vocabulary. Multiple handlers for the same event accumulate, called in registration order. Registering a handler doesn't fire it — something has to call the static `Selection.dispatch(eventName, hit)` for it to ever run:

```js
chart.selection().filter((d) => d.value > 90).on('click', (datum, index, domEvent, worldPoint) => { ... });

// later, e.g. from PointerRouter or a hand-rolled pointer handler:
Selection.dispatch('click', { mesh, instanceIndex, datum, worldPoint, domEvent });
```

**Filtering scopes handlers to the filtered members**: `chart.selection().filter(d => d.value > 90).on('click', fn)` only calls `fn` for datums that passed the filter, because `.filter()` returns a *new* `Selection` sharing the same underlying `GraphMesh` references (or the same `GraphInstancedObject` with a narrowed `indices`) — `.dispatch()` matches a hit's `mesh`/`instanceIndex` (`Picker`'s own hit vocabulary) against *that* selection's own narrowed membership, not the chart's full backend.

`dispatch(eventName, { mesh, instanceIndex, datum, worldPoint, domEvent })` walks every currently-`.on()`'d `Selection` (across every chart — a `Selection` carries no chart reference, `mesh`/`instanceIndex` identify the hit node directly) looking for one with a handler for `eventName` whose membership includes the hit node, then calls `handler(datum, index, domEvent, worldPoint)` — `index` is the position *within that selection* (matching `datum(index)`'s own convention), not a raw instance/backend index.

**A registered-and-discarded filtered selection is kept alive.** `.on()` adds `this` to a module-level registry so `.dispatch()` can find it later; `Selection.dispose()` removes it again. A chart's own root selection is disposed by `chart.destroy()` (so its handlers correctly stop firing once the chart is torn down), but an ad hoc `chart.selection().filter(...).on(...)` result that's never stored or disposed keeps its handler(s) reachable — and therefore alive — for the app's lifetime. This is an accepted, documented tradeoff (see `skipping_list.md`), not a bug: "handlers register per-Selection-scope" (the prompt's own wording) requires that scoped selection to persist *somewhere* for its handler to ever fire on a later event.

## `PointerRouter` — wiring pointer events to `Picker` + `StateMachine` + `Selection.dispatch`

`new PointerRouter({ picker, domElement })` attaches real `pointermove`/`click` listeners to `domElement` and, on each one, calls `picker.pickAt()` to translate it into picking + state-machine + `Selection.on()` behavior:

- **Hover-enter/leave** (`pointermove`): comparing the new hit against the previous one fires `Selection.dispatch('hover-leave'|'hover-enter', ...)` and transitions the datum via `stateMachineFor(chart).setState(datum, 'hovered'|'default')` — but *only* when the datum's current state is exactly `'default'` (entering) or `'hovered'` (leaving). A `'selected'`/`'dragging'` datum keeps that state while merely hovered over or away from — a state transition should reflect the strongest current interaction, not just the most recent pointer position — while the `Selection.dispatch()` calls still always fire regardless (useful for e.g. a tooltip that should track the pointer independent of selection).
- **Select / shift-multi-select** (`click`): without Shift held, every previously selected datum (across every registered chart) clears back to `'default'` first (single-select replaces), then the clicked datum (if any) becomes `'selected'`. With Shift held, the clear step is skipped and the clicked datum's selection *toggles* instead — accumulating a multi-selection, possibly spanning several charts since one `Picker` can be registered against many. `Selection.dispatch('click', ...)` always fires for a hit.

`stateMachineFor(chart)` lazily creates (and caches) one `StateMachine` per chart the router ever hit-tests — a chart only needs to already be `picker.register()`ed, no separate registration step on the router itself. `PointerRouter` deliberately does not handle drag (`'dragging'` is a state `StateMachine` supports, nothing here drives it yet) or visual styling at all — it only detects transitions and calls `stateMachineFor(chart).setState(...)`; *every* visual response, default or configured (`style()`, `hoverStyle()`/`selectStyle()`, `chart.hoverEffect()`/`selectEffect()`), is `StateMachine.setState`'s own responsibility (Prompt 150), so `setState(datum, 'hovered')` called directly — without going through a `PointerRouter` at all — gets the exact same default outline+scale.

`dispose()` removes both listeners and releases its `StateMachine`s/selection bookkeeping — it does not reset any datum's current visual state, since the chart/state machines may still be in use elsewhere after the router itself is gone.

## `Brush` / `Lasso` — screen-space region selection (Prompt 152)

Two independent drag gestures over `domElement`, each producing a real `Selection` per registered chart with at least one matching datum — `src/interact/Brush.js` (`new Brush({ camera, domElement })`, a draggable axis-aligned rectangle) and `src/interact/Lasso.js` (`new Lasso({ camera, domElement })`, a free-form polygon traced by the drag path). Both share `register(chart)`/`unregister(chart)` (own set, same convention as `Picker`) and the same lifecycle shape — `pointerdown` starts a gesture, `pointermove` extends it (and fires a progress event so a caller can draw a live overlay — neither class renders one itself, the same "detect, don't render" split as `Picker` not drawing a cursor), `pointerup` finalizes it and runs the selection query.

```js
const brush = new Brush({ camera: scene.camera.three, domElement: canvas });
brush.register(barChart).register(scatterChart);
brush.on('brush', (rect) => drawOverlayRect(rect)); // optional live feedback
brush.on('select', (selection, chart) => selection.attr('color', 'gold'));

const lasso = new Lasso({ camera: scene.camera.three, domElement: canvas });
lasso.register(scatterChart);
lasso.on('select', (selection) => selection.filter((d) => d.value > 0).attr('scale.x', 1.2));
```

- **`Brush` events**: `'brushStart'` (drag begins, `{x, y}` origin), `'brush'` (every `pointermove` while dragging, the current normalized rectangle `{x, y, width, height}` — always positive `width`/`height` regardless of drag direction), `'brushEnd'` (drag ends, the final rectangle), `'select'` (`(selection, chart)`, once per matched chart).
- **`Lasso` events**: `'lassoStart'` (`{x, y}` origin), `'lasso'` (every `pointermove`, the accumulated point path so far), `'lassoEnd'` (the final path), `'select'` (same shape as `Brush`'s). A path with fewer than 3 points (a plain click) encloses no area and matches nothing.

**Why `'select'` fires once per chart, not once per gesture**: a `Selection` can't span more than one chart's backend — `Selection.merge()` throws across two different charts (or two different `GraphInstancedObject`s), since an instanced backend's `indices` are only meaningful relative to one specific object (`compose/selection/combinators.js`). Registering `Brush`/`Lasso` against several charts and dragging one region over all of them therefore fires `'select'` once per chart that had ≥1 match (a chart with zero matches is silently skipped, no empty-`Selection` noise) — with exactly one registered chart, this collapses to the single call the prompt's own "emit `select` with a real `Selection`" wording describes.

**The containment query** (`src/interact/regionSelect.js`, shared by both — DRY two-strike rule) projects every one of a chart's datums to canvas-pixel screen space (`projectToScreen`, `THREE.Vector3.project(camera)`, discarding a datum whose projected NDC `z` falls outside `[-1, 1]` — behind the camera or past the far plane, not actually visible) and tests each against the region (`Brush`: AABB bounds check; `Lasso`: ray-casting point-in-polygon, the same small self-contained algorithm `registry.js`'s Levenshtein suggestion uses — no dependency for either). Reads the *world* position straight off the underlying `THREE.Object3D`/`InstancedMesh` (combining an instanced member's local instance matrix with the batch's own `matrixWorld`) rather than through `GraphMesh.getPosition()`/`GraphInstancedObject.getInstancePosition()` (which are *local*-only, correct for `Selection.attr`'s relative reads but wrong here) — and forces `chart.scene.updateMatrixWorld(true)` first, the same staleness gap `Picker.pickAt()` closes for its own ray (Prompt 147), since a region query on `pointerup` can just as easily land between frames.

**Scope**: neither class renders the drag rectangle/lasso path, applies any visual response to the matched datums, or requires a minimum drag distance to activate — all left to the caller via the emitted events (`StateMachine` from Prompt 150 is a natural pairing: `brush.on('select', (selection, chart) => selection.each((d) => stateMachineFor(chart).setState(d, 'selected')))`-style wiring). `dispose()` removes the three pointer listeners and clears the registered-chart set; idempotent.

## `link` — cross-filtering (Prompt 153)

`src/interact/CrossFilter.js` exports a single function, `link(source, target, { transform })`, rather than a class — there's no per-link state a caller needs to hold onto beyond the closure `link()` sets up internally, so a class wrapper would just be ceremony around one operation.

```js
import { Brush, link } from 'graph3d';

const brush = new Brush({ camera: scene.camera.three, domElement: canvas });
brush.register(scatterChart);

link(brush, barChart);                 // default: filter barChart to rows also present in the brushed selection
link(brush, pieChart, {                // custom transform: filter by a derived predicate instead of row identity
  transform: (selected) => {
    const categories = new Set(selected.map((d) => d.category));
    return (d) => categories.has(d.category);
  },
});
```

`source` is duck-typed to `on(event, handler)` and can be either a `Brush`/`Lasso` registered against the chart being brushed/lassoed (`'select'` fires with `(selection, chart)`, `selection` a real `Selection`, Prompt 152) or, as of Prompt 156, a plain `GraphChart` (`'select'` fires with a single hit `payload`, `payload.datum`) — `link()` normalizes both shapes internally before handing selected data to `transform` (Prompt 158), so `link(chartA, chartB)` off a real click works exactly like `link(brush, chartB)` off a drag. `target` is duck-typed to `data()`/`render()` — any `GraphChart`. Calling `link()` again with a *different* `source` and `target` — e.g. `link(chartB, chartC)` after `link(chartA, chartB)` — chains a selection through a propagating sequence: clicking in `chartA` filters `chartB`, and clicking a (now-filtered) datum in `chartB` filters `chartC` in turn, since `chartB` re-rendering as `link()`'s target doesn't stop it from also dispatching its own `'select'` as a source.

`target`'s full dataset is captured once, at `link()` time (`target.data()`), and every subsequent `'select'` re-filters from that captured snapshot rather than from `target.data()`'s then-current (possibly already-filtered) value — narrowing a brush and then widening it again re-derives from the original rows both times instead of compounding. One `source` can drive several targets ("B/C") simply by calling `link()` again with a different `target` — no separate multi-target API.

`transform(selectedData)` receives the array of data currently selected in `source` (`selection.data()`) and must return a predicate `(datum) => boolean` applied to `target`'s captured dataset. The default (`selectedData.includes(datum)`) assumes `source` and `target` render different views over the *same* row objects — the common linked-views case; pass `transform` explicitly whenever that assumption doesn't hold.

**Scope**: `link()` only reacts to `'select'` — since `Brush`/`Lasso` deliberately never fire `'select'` for a zero-match region (Prompt 152), releasing a brush/lasso over empty space does not clear a previously-applied filter back to the full dataset; call `target.data(fullRows).render()` manually to reset. There is also no `unlink()` — no event system in this codebase (`GraphChart.on`, `Selection.on`, `Brush`/`Lasso`'s emitter) currently supports removing a handler once added, so `link()` doesn't invent one just for this case.

## Drag-and-drop + `KeyboardNav` — accessible interaction (Prompt 154)

`chart.draggable(true)` opts a chart into `PointerRouter`-driven drag-and-drop — config-only (same "doesn't show anything itself" shape as `tooltip()`/`hoverEffect()`), since `chart/` sits below `interact/` and cannot itself detect a pointer drag:

```js
scatterChart.draggable(true);
const router = new PointerRouter({ picker, domElement: canvas });
scatterChart.selection().filter((d) => d.pinned).on('dragEnd', (d) => save(d));
```

A `pointerdown` on a draggable chart's hit datum transitions it to `'dragging'` (interrupting whatever state it was in — an explicit drag is the strongest possible interaction) and fires `Selection.dispatch('dragStart', ...)`; every following `pointermove` repositions it by unprojecting the pointer through `picker.camera` onto the plane parallel to the screen at the datum's original depth (so it tracks the cursor exactly, for both perspective and orthographic cameras), writing the result through `Selection.attr('position.*', ...)` like any other micro-control write — the write itself *is* the visual feedback, no separate drag-ghost/preview rendering, the same "detect, don't render more than that" split `Brush`/`Lasso` already follow. `pointerup` fires `Selection.dispatch('dragEnd', ...)` and restores the pre-drag state (`'selected'` if it was, else `'default'`). A drag suppresses this router's own hover tracking for its duration and suppresses the `click` a real browser fires right after the terminating `pointerup`, so a drag never also re-triggers click-to-select on the same gesture. What `'dragging'` *looks like* beyond the position write is `StateMachine.style()`'s job, same as every other state.

`KeyboardNav` is the accessible, keyboard-driven counterpart — a separate class from `PointerRouter` (different event source, different registered-target shape, and its own DOM resource, the ARIA live region), sharing the same `StateMachine` vocabulary:

```js
import { KeyboardNav } from 'graph3d';

const nav = new KeyboardNav({ domElement: canvas });
nav.register(barChart).register(scatterChart);
nav.stateMachineFor(barChart).style('focused', (s) => s.attr('scale.x', 1.15)); // e.g. a focus ring
// Tab into the canvas, then Tab/Shift+Tab to move, Enter to select, Esc to clear.
```

- **Tab** (Shift+Tab to go backwards) advances a single roving focus cursor across every registered chart's current `data()`, in registration order, wrapping at both ends — the previously-focused datum returns to `'default'`, the newly-focused one becomes `'focused'`. `preventDefault()` stops the browser's own focus-shifting Tab behavior. The canvas gets `tabIndex = 0` automatically (if it doesn't already have a non-negative one) so it can actually receive keyboard focus at all — a `<canvas>` has none by default.
- **Enter** selects the focused datum (`'selected'`), replacing whatever `KeyboardNav` itself had previously selected — a no-op if nothing is focused.
- **Escape** clears the current keyboard-driven selection (back to `'focused'` if it's still under the focus cursor, else `'default'`) *without* moving the focus cursor — matches the ARIA APG listbox/grid pattern, so the user doesn't lose their place. A no-op if nothing is selected.
- Every action updates a visually-hidden `aria-live="polite"` region (`nav.liveRegion`) via `describe(datum, chart)` — defaults to a `"key: value"` summary per own-enumerable property, override via the constructor's `describe` option for data whose readable label isn't obvious from its raw shape.

**Scope**: `KeyboardNav` keeps its own `StateMachine` cache, independent of any `PointerRouter`'s — if both are used against the same chart, they don't share "what's currently selected" bookkeeping (each only ever clears what it itself selected). `PointerRouter.selectedEntries()` (Prompt 155, below) now exposes its own selection for a caller to read, but `KeyboardNav` still doesn't consume it automatically; documented in `skipping_list.md`, not silently papered over.

## `FocusFollower`, label clicks, `selectedEntries()`, selection round-tripping (Prompt 155)

`FocusFollower` continuously orbits a `THREE.Camera` around whichever datum is currently "focused," delegating the actual flight path to `anim/CameraTour.orbit()` (CLAUDE.md §1.1 DRY — no second camera-path engine here). It doesn't wire itself to any particular focus source — `PointerRouter`'s hover/select events and `KeyboardNav`'s Tab cursor are both legitimate ones, and there's no single canonical "focus" event yet (that unification is Prompt 156's job) — so a caller feeds it explicitly:

```js
import { FocusFollower } from 'graph3d';

const follower = new FocusFollower({ camera: scene.camera.three, radius: 12, height: 4 });
barChart.selection().on('click', (d) => follower.follow(barChart, d));
follower.stop(); // camera stays where it is
```

`follow(chart, datum)` cancels any orbit already in progress and starts a fresh one around `datum`'s current world position; each lap restarts automatically (`CameraTour.orbit()` itself only ever flies once around and stops) for a genuinely continuous orbit until `stop()`/`dispose()`/another `follow()` call ends it.

`annotation.label(...)` objects are now clickable: `.on('click', handler)` registers a handler (the only event this tiny registry supports today — grow it when a real consumer needs another one), and `PointerRouter.registerLabel(label)` opts a label into click hit-testing. A label has no real mesh to raycast against yet (Phase 6's SDF text), so `PointerRouter` instead projects `label.position` to screen space and fires the closest registered label within a 20px radius of the click:

```js
const peak = annotation.label({ text: 'Peak: 42%', position: { x: 3, y: 5, z: 0 } });
peak.on('click', () => console.log('clicked the peak label'));
router.registerLabel(peak);
```

`PointerRouter.selectedEntries()` exposes its own `{chart, datum}` selection (resolving the gap `KeyboardNav`'s scope note above flags) — combined with `chart.exportSelection(selectedData)`/`chart.importSelection(keys)`, an interactive selection survives a `data()` reload even though the new rows are entirely new object instances:

```js
const keys = barChart.exportSelection(router.selectedEntries().filter((e) => e.chart === barChart).map((e) => e.datum));
localStorage.setItem('selection', JSON.stringify(keys));

// ...later, after a fresh barChart.data(reloadedRows, (d) => d.id):
for (const datum of barChart.importSelection(JSON.parse(localStorage.getItem('selection')))) {
  router.stateMachineFor(barChart).setState(datum, 'selected');
}
```

`exportSelection`/`importSelection` key off the same `keyFn` passed to the chart's last `data(arr, keyFn)` call (falling back to the datum itself if none was given — the same object-identity limitation a positional join already carries elsewhere).

## Full chart event surface + `pickingEnabled(false)` (Prompt 156)

`chart.on(event, handler)` now accepts two kinds of event: the original lifecycle trio (`'enter'`/`'update'`/`'exit'`, fired internally by `update()`'s own data-join) and a new interaction vocabulary — `'hover'`/`'select'`/`'deselect'`/`'brushStart'`/`'brushEnd'`/`'lassoStart'`/`'lassoEnd'`/`'dragStart'`/`'dragEnd'`/`'focus'` — fired externally by whichever `interact/` class detects it, through the chart's own new `dispatch(event, payload)` method:

```js
barChart.on('hover', ({ datum }) => console.log('hovering', datum));
barChart.on('select', ({ datum }) => console.log('selected', datum));
barChart.on('deselect', ({ datum }) => console.log('deselected', datum));
barChart.on('focus', ({ datum }) => console.log('keyboard-focused', datum)); // from KeyboardNav's Tab cursor
barChart.on('dragStart', ({ datum }) => console.log('drag started', datum));
```

This is sugar alongside — not a replacement for — the finer-grained `chart.selection().filter(...).on('click'|'hover-enter'|'hover-leave'|'dragStart'|'dragEnd', fn)` from Prompts 149/154 (per-datum, filter-scoped, but re-registered per `Selection` instance) and `Brush`/`Lasso`'s own `brush.on('select'|'brushStart'|'brush'|'brushEnd', fn)` (not chart-scoped at all, since one brush can span several charts). `chart.on(event, handler)` handlers persist across `render()`/`update()` re-binding (stored on the chart itself, in a map separate from the lifecycle `#handlers` — see `GraphChart.js`'s `INTERACTION_EVENTS` comment for why the two aren't merged), which `chart.selection().on(...)` cannot do: a fresh `Selection` replaces `#backendSelection` on every `update()`, silently dropping any handler registered directly on the old one.

Who fires what:

- **`PointerRouter`**: `'hover'` on hover-enter (not leave — `Selection`'s own `'hover-leave'` still covers that); `'select'`/`'deselect'` on click (a plain click's "clear everyone else" step also fires `'deselect'` on every chart it clears); `'dragStart'`/`'dragEnd'` alongside `Selection.dispatch()`'s existing calls.
- **`Brush`/`Lasso`**: `'brushStart'`/`'lassoStart'` on every registered chart when the drag begins; `'brushEnd'`/`'lassoEnd'` only on charts that also get a `'select'` (i.e. had ≥1 match) — the drag-lifecycle "start" is a heads-up to everyone, the "end" reports an actual result.
- **`KeyboardNav`**: `'focus'` on Tab/Shift+Tab; `'select'`/`'deselect'` on Enter/Escape, mirroring `PointerRouter`'s click semantics for the keyboard modality.

`chart.pickingEnabled(false)` opts a chart out of `Picker.pickAt()` entirely — config-only, same "chart can't detect a pointer itself" shape as `draggable()`/`tooltip()`; `Picker` duck-type-checks it and skips a disabled chart before ever raycasting against it. Useful for a large static "backdrop" chart nobody interacts with.

---

## What's genuinely out of scope for Phase 9

- **No dedicated `GraphTooltip`/`interact/Tooltip.js` class.** An early plan slot for one (referenced as "Prompt 151" in `chart.tooltip()`'s own original docs) was renumbered out of the actual `prompts.md` sequence and never built. `chart.tooltip(handlerFn)` (Prompt 143) stores content; a caller wires the actual DOM display by hand off `chart.on('hover', ...)` (Prompt 156) — `examples/20-interaction/main.js` (Prompt 157) is the reference pattern for that, including the "sticky until replaced, hidden on canvas `pointerleave`" simplification it documents.
- **`KeyboardNav` and `PointerRouter` don't share "currently selected" bookkeeping.** Each only clears the selection it itself made — Tab+Enter and click-to-select can both end up `'selected'` at once on the same chart. `PointerRouter.selectedEntries()` (Prompt 155) exists as the read-side precondition for fixing this, but nothing consumes it automatically yet.
- **`Brush`/`Lasso` only listen on `domElement`, not `window`.** A drag released outside the canvas never fires `'brushEnd'`/`'lassoEnd'`/`'select'` — matches `PointerRouter`'s own `domElement`-only convention, not a special-case bug.
- **`link()` has no `unlink()`, and never resets a target when its source releases over empty space.** No event-removal capability exists anywhere in this codebase yet (`GraphChart.on()`, `Selection.on()`, `Brush`/`Lasso`'s `createEventEmitter`) for `link()` to build one on top of.
- **`FocusFollower` has no automatic default focus source.** `chart.on('hover'|'select'|'focus', ...)` are three distinct events (Prompt 156), not unified into one canonical "this is focused" signal — a caller always picks which one drives the camera via an explicit `follow(chart, datum)` call.
- **No headless-GL rendering in this project's test suite.** Every shader effect (`material.effects`), the default hover/select visuals, and every pointer/pick interaction are tested structurally (state, uniforms, mesh/material identity, disposal) against `jsdom`, never actually compiled/rendered against a real GL context — a syntax error inside an untested shader branch wouldn't surface until a real browser render (the same limitation `docs/concepts/material.md`'s own Phase 6 notes flag).

See `skipping_list.md`'s Phase 9 section for the full, itemized list with revisit triggers.
