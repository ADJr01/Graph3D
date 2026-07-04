# Skipping List

Every deliberate simplification made while implementing `prompts.md`, in one
place, so they can be revisited one-by-one once the numbered prompts are
done. An entry here is not a bug — each was a considered "lazy is correct
for now" call, documented in-code (usually with a `ponytail:` comment) and
cross-referenced here with a concrete trigger for when it stops being good
enough.

This file is **not** a duplicate of `.claude/TODO.md`: TODO.md tracks
missing assets, unwired constructor options, and build issues discovered
during Phase 2–3 auditing. This file tracks intentional scope-narrowing
inside otherwise-complete prompts — a feature that works, on purpose, for a
smaller case than the "real" thing would cover. Skim both at project end.

Status: `☐` open, `☑` resolved (leave resolved entries in place with the
resolving prompt/commit noted, don't delete — the history is useful).

---

## Phase 3 — Object Layer

### ☑ `GraphMesh`/`GraphInstancedObject.material` returns raw `THREE.Material`, not a `GraphObjectMaterial` wrapper
- **Where:** `src/object/GraphMesh.js` (`get material()`), `src/object/GraphInstancedObject.js` (`get material()`)
- **Why skipped:** Prompt 46 asked for a `GraphObjectMaterial` wrapper (Phase 6), but `object/` cannot import from `material/` (a higher layer, CLAUDE.md §1.4). Returning the raw material was the only layer-compliant option until `material/` exists.
- **Resolved:** Prompt 100 — `src/material/GraphObjectMaterial.js` now exists (`material/` is allowed to import `object/`, being a lower layer, so the wrapping happens on that side of the boundary). But note this only *half*-resolves the original framing: the `.material` getters themselves will never return a `GraphObjectMaterial` — that direction of import stays permanently forbidden by CLAUDE.md §1.4, not just "until Phase 6." Callers who want the richer wrapper construct it explicitly: `new GraphObjectMaterial(mesh)`.

---

## Phase 4A — Scales

### ☐ `scale.log().ticks()` skips d3-array's "too few ticks → fall back to linear-in-log-space" refinement
- **Where:** `src/compose/scale/log.js:20` (`logTickMagnitudes`)
- **Why skipped:** Covers the common decade-spanning case; the extra refinement only matters for domains that produce very few log ticks.
- **Revisit when:** Sparse decade-spanning ticks on a log axis look too coarse in a real chart.

### ☐ `scale.log().tickFormat()` ignores `'s'`/precision specifiers
- **Where:** `src/compose/scale/log.js:122`
- **Why skipped:** No domain-derived step exists for a log scale the way linear scales have one, so only the default `'f'` formatter gets the "blank the non-power ticks" axis-label behavior.
- **Revisit when:** An axis needs SI-prefix (`'s'`) formatting on a log scale.

### ☐ `scale.time()`'s date formatter supports a fixed strftime token subset, English-only, UTC-only
- **Where:** `src/compose/scale/time.js:154` (`formatDate`)
- **Why skipped:** Covers every token `autoFormat` itself needs; a full strftime implementation (locales, timezones) wasn't required by any current prompt.
- **Revisit when:** A chart needs a time axis in a non-UTC timezone or non-English month/day names.

### ☐ `scale.time()`'s `autoFormat` doesn't distinguish week-start ticks from plain day ticks
- **Where:** `src/compose/scale/time.js:177`
- **Why skipped:** d3 gives a week-boundary tick a visibly different label from a plain day; this implementation formats both the same way.
- **Revisit when:** A week-aligned time axis needs that visual distinction.

---

## Phase 4B — Palettes

### ☐ `palette.custom()` resolves hex/`rgb()`/`hsl()` CSS syntax but not named color keywords
- **Where:** `src/compose/palette/custom.js:59` (`toHex`)
- **Why skipped:** No keyword table exists yet; adding the full CSS named-color list (~150 entries) had no current consumer.
- **Revisit when:** A user-facing example/test passes a keyword like `'steelblue'` into `palette.custom()`.

### ☐ `palette.sequentialMultiHue` colormaps are ~10-stop approximations, not the full 256-entry lookup tables
- **Where:** `src/compose/palette/sequentialMultiHue.js:3`
- **Why skipped:** A close visual approximation via `ramp()` over the existing color-interpolation machinery, rather than adding `d3-scale-chromatic` as a dependency (CLAUDE.md §9 requires justification for any new dependency, and none was ever given here).
- **Revisit when:** A side-by-side comparison against matplotlib/d3-scale-chromatic's real output shows a visible banding/mismatch that matters for a shipped chart.

---

## Phase 4C — Layouts (Prompts 70–73)

### ☐ `layout.force`'s `collide` force is O(n²) brute-force, not Barnes-Hut
- **Where:** `src/compose/layout/force/forces.js:142` (`forceCollide`)
- **Why skipped:** Collide is inherently short-range (only close pairs matter), unlike `charge`, which genuinely needs whole-graph long-range approximation. Barnes-Hut for collide would be premature optimization without a measured need (CLAUDE.md §1.3).
- **Revisit when:** A collide-heavy scene (many overlapping nodes) exceeds a few thousand nodes and profiling shows collide as the bottleneck. Swap in a spatial grid/octree query.

### ☐ `layout.force` has no GPGPU/typed-array path
- **Where:** `src/compose/layout/force/index.js` (operates on plain `node.x/y/z/vx/vy/vz` object properties)
- **Why skipped:** `prompts.md` Prompt 165 ("Wire `layout.force` to GPGPU above 5000 nodes") explicitly plans this as separate, later work — Prompt 72's scope is the CPU/plain-object version.
- **Revisit when:** Prompt 165 is reached.

### ☐ No `.linkDistance()`/`.cluster()` convenience helpers on `layout.force`
- **Where:** `src/compose/layout/force/index.js`
- **Why skipped:** These belong to the future `NetworkChart` (Prompt 137), which will consume `layout.force` directly — no current consumer for standalone convenience sugar (CLAUDE.md §1.3 YAGNI).
- **Revisit when:** Prompt 137 (`NetworkChart`) is implemented.

### ☐ `layout.pack`'s sphere placement is a force-relaxation heuristic, not an exact minimal-enclosing-sphere solver
- **Where:** `src/compose/layout/pack.js:4` (`packChildren`)
- **Why skipped:** Reuses the already-built, already-tested `layout.force` `collide`+`center` forces (Prompt 72) instead of implementing a true 3D generalization of d3.pack's circle-enclosure algorithm (non-trivial tangent-sphere geometry). Visually good enough for a data-viz pack chart.
- **Revisit when:** A chart needs mathematically tight packing (no wasted space in the enclosing sphere) rather than a visually-non-overlapping arrangement.

### ☐ `layout.tree`'s angular wedge allocation isn't width-aware
- **Where:** `src/compose/layout/tree.js:6` (`layoutRadial`)
- **Why skipped:** A "conical tree" / sunburst-style heuristic (wedge width ∝ leaf count) guarantees siblings never collide by construction, without full Reingold-Tilford contour tracking.
- **Revisit when:** A wide leaf node visibly crowds a narrow sibling in a real hierarchy chart.

### ☐ No `.radius()`/`.size()` chainable convenience on `layout.pack`/`layout.tree` beyond `padding`/`levelHeight`/`levelRadius`
- **Where:** `src/compose/layout/pack.js`, `src/compose/layout/tree.js`
- **Why skipped:** No current consumer (Prompt 73 only requires the config-object form); a consuming chart (Prompt 137+) may want a different chaining surface.
- **Revisit when:** A hierarchy-consuming chart is built and asks for it.

---

## Phase 4D — Selection & Data-Join (Prompts 74–82)

### ☑ `Selection.attr('opacity', ...)` has no visual effect on the instanced backend yet
- **Where:** `src/compose/selection/attr.js:90` (`applyOpacity`)
- **Why skipped:** Per-instance opacity requires a shader that reads a custom attribute — that's the Phase 6 `dataDriven` material (Prompt 106), not built yet. `attr('opacity', ...)` on an instanced backend today only writes the value into an auto-defined `'opacity'` instance attribute (real data plumbing, ready for Prompt 106 to consume) — nothing renders it differently until then.
- **Resolved:** Prompt 106 — `material.dataDriven({ perInstanceOpacity: true })` declares `attribute float opacity;` and reads exactly the `'opacity'` `InstancedBufferAttribute` this code already writes, gated behind a `USE_INSTANCE_OPACITY` define (tests confirm the define and attribute declaration; a true pixel-level render assertion isn't possible in this project's jsdom test environment — see the "shader GLSL is untested by real WebGL compilation" entry below).

### ☐ `Selection.attr` material props are limited to `color`/`opacity` — no `roughness`/`metalness`/etc.
- **Where:** `src/compose/selection/attr.js`
- **Why skipped:** Prompt 75's fixed vocabulary is `position/rotation/scale/color/opacity/visible` + custom attributes only. Arbitrary material-property micro-control is explicitly Prompt 77's `Selection.style(materialProp, valueOrFn)`.
- **Revisit when:** Prompt 77 is implemented (next in sequence after this list was written).

### ☐ `Selection.attr` custom-attribute auto-definition only covers the first-class `'opacity'` vocab entry
- **Where:** `src/compose/selection/attr.js` (`applyOpacity` vs `applyCustomAttribute`)
- **Why skipped:** Arbitrary custom attribute names must go through `GraphInstancedObject.defineAttribute` explicitly (Prompt 38's convention) — only `'opacity'` gets special auto-create treatment since it's a fixed-vocabulary path, not a user-named one.
- **Revisit when:** A prompt asks for auto-defining arbitrary attributes on first write (currently no such prompt).

### ☐ `Selection.sort()` only reorders the logical datum→index mapping — no physical `.order()` method
- **Where:** `src/compose/selection/combinators.js` (`sortBackend`)
- **Why skipped:** Prompt 76 explicitly scopes `sort()` to the logical mapping ("without touching buffers unless `.order()` is called") and does not itself ask for `.order()`. No consumer needs physical mesh-array/buffer reordering yet.
- **Revisit when:** A prompt explicitly asks for `Selection.order()` (physically reordering meshes in the scene graph / instance slots to match sort order — e.g. for correct transparency draw order).

### ☐ `Selection.merge()` does not deduplicate overlapping members
- **Where:** `src/compose/selection/combinators.js` (`mergeBackend`)
- **Why skipped:** Matches d3's own `.merge()`, which also doesn't dedupe. No current join scenario produces legitimately overlapping selections.
- **Revisit when:** The Prompt 78 data-join lands and enter/update/exit selections are merged — confirm they're always disjoint by construction, or add a dedupe option if not. ☑ Confirmed disjoint by construction (Prompt 79's `join()` merges `update` with `enter`, which are always disjoint sets by `diffData`'s design) — the dedupe gap itself is still open, revisit trigger unchanged.

### ☑ `Selection.style('emissiveIntensity', ...)` has no visual effect on the instanced backend yet
- **Where:** `src/compose/selection/style.js:71`
- **Why skipped:** Same root cause as the existing `attr('opacity', ...)` entry above — the value lands in a real per-instance attribute, but no shader reads it until the Phase 6 `dataDriven` material (Prompt 106) exists.
- **Resolved:** Prompt 106 — `material.dataDriven({ perInstanceEmissiveIntensity: true })` declares `attribute float emissiveIntensity;` and reads exactly the `'emissiveIntensity'` `InstancedBufferAttribute` this code already writes, gated behind a `USE_INSTANCE_EMISSIVE_INTENSITY` define, mirroring `perInstanceOpacity`'s path exactly.

### ☐ `Selection.style()` on a material-global prop collapses a per-datum accessor to one shared-material write
- **Where:** `src/compose/selection/style.js` (the fallback branch after the `color`/`opacity`/`emissiveIntensity` checks)
- **Why skipped:** The instanced backend's members all share ONE `THREE.Material` — a per-datum `(d, i) => value` accessor has no way to vary a true material-global property (e.g. `roughness`) per instance without a per-property custom attribute a shader would need to read. `dataDriven` (Prompt 106) only completes this for `color`/`opacity`/`emissiveIntensity` — the three Prompt 77 already named — not for arbitrary properties like `roughness`/`metalness`. Resolves the accessor once (from the first datum) and warns via `console.warn` rather than silently keeping only the last-resolved value.
- **Revisit when:** A prompt asks for per-instance-capable coverage of additional material properties beyond `color`/`opacity`/`emissiveIntensity` — would need a new per-property attribute plus a `dataDriven`-style shader read for that specific property (no generic mechanism exists; each one is bespoke).

### ☐ Join enter-materialization for the meshes backend requires an explicit `template` on the backend descriptor
- **Where:** `src/compose/selection/join.js` (`materializeEnter`), `src/compose/selection/Selection.js` (`validateBackend`'s meshes branch accepts an optional `template: { scene, name, geometry, material }`)
- **Why skipped:** Unlike the instanced backend (which always carries a live `GraphInstancedObject` to grow), a `{ type: 'meshes' }` backend with zero prior members has no shape/material info to create new ones from. Rather than guessing or requiring a real chart layer (which doesn't exist until Phase 5+), a Selection constructed with no `template` simply throws a clear error if `.enter()` is ever called with something to materialize — construct `new Selection({ type: 'meshes', meshes: [], template })` directly for a from-scratch join.
- **Revisit when:** A chart type (Phase 5+) or the Prompt 85 flagship demo needs to bootstrap a meshes-backend join from zero — decide whether the chart layer should always supply a template, or whether `GraphObjectFactory` should grow a `deriveTemplate()` helper.

### ☐ `GraphScene.selectAll(name)` never supplies a mesh template
- **Where:** `src/scene/GraphScene.js` (`selectAll`)
- **Why skipped:** `selectAll` only wraps *already-registered* objects into a `Selection` (mirroring `selectByName`) — it has no opinion on what a not-yet-existing mesh should look like. A name with nothing registered returns an empty, template-less `Selection`, which is fine to read but throws on `.data(...).enter()` (see the entry above).
- **Revisit when:** The same trigger as the template entry above — whichever prompt introduces the chart layer's "create the initial batch, then let subsequent `.data()` calls join against it" pattern should decide where the template comes from.

### ☐ `slotAllocator`'s free-list assumes one logical join per `GraphInstancedObject`
- **Where:** `src/compose/selection/slotAllocator.js`
- **Why skipped:** The free-list/next-fresh-index bookkeeping is keyed by object identity (`WeakMap<GraphInstancedObject, ...>`), assuming the object's whole index space belongs to a single chart series' join. Two independent joins recycling slots on the *same* `GraphInstancedObject` would collide (each unaware of the other's allocations).
- **Revisit when:** A prompt asks for multiple independent data joins sharing one instanced batch — add a per-selection/per-join allocator key instead of keying purely by object.

---

## Phase 4E — Axis & Annotation (Prompts 83–85)

### ☐ `Axis`'s per-tick labels and `annotation.label` are metadata only — no visible text
- **Where:** `src/compose/annotation/label.js`, consumed by `src/compose/axis/Axis.js` (`#labelsValue`) and `annotation.callout`
- **Why skipped:** Prompt 83 explicitly scopes this ("Label rendering stubs to SDF text (Phase 6)") — `material/SDFText.js` doesn't exist yet, so there's nothing to render text *with*. `label()` returns `{ type: 'label', text, position, style }`; nothing in the scene graph represents it.
- **Revisit when:** Phase 6's `material/SDFText.js` lands — swap the stub for a real `SDFText.create(text, style)` call at each label's `position`, in both `Axis.render()` and `annotation.label`/`callout`.

### ☐ `Axis`/`annotation` need a real chart layer's carve-out justification, same as `compose/selection`
- **Where:** `src/compose/axis/Axis.js`, `src/compose/annotation/index.js` — both import `GraphMesh` from `object/` and construct raw `THREE.BufferGeometry`/`THREE.Material`
- **Why skipped:** No data-only chart layer exists yet (Phase 8) to build these scene objects on `Axis`/`annotation`'s behalf — mirrors the identical, already-sanctioned `compose/selection` carve-out (CLAUDE.md §1.4). Documented as a third instance of the same pattern rather than re-litigated as a new question.
- **Revisit when:** Never, structurally — this is a permanent, intentional exception, not a gap. Listed here only so a future SoC audit doesn't flag it as new.

### ☐ `Axis.render()` throws on a second call instead of supporting in-place updates
- **Where:** `src/compose/axis/Axis.js` (`render`)
- **Why skipped:** No current prompt needs a scale-changed re-render; a chart wanting that can `dispose()` and `render()` again. Adding diff-based tick reconciliation now would be speculative (CLAUDE.md §1.3 YAGNI) — nothing consumes it.
- **Revisit when:** A chart type (Phase 8+) needs to redraw an axis after its domain changes without a full dispose/rebuild.

### ☐ `annotation.referenceLine`/`referencePlane`'s "good defaults" (`extent`/`size` = 10) are a fixed constant, not data-driven
- **Where:** `src/compose/annotation/index.js` (`DEFAULT_REFERENCE_LINE_EXTENT`, `DEFAULT_PLANE_SIZE`)
- **Why skipped:** Prompt 84 asks for "good defaults," not data-derived sizing — no chart exists yet to report its own extent for these to size against automatically.
- **Revisit when:** A chart type (Phase 8+) wants a reference line/plane that auto-sizes to the chart's own data extent.

### ☑ `Selection.merge()`'s meshes-backend result silently dropped a from-scratch join's `template`
- **Where:** `src/compose/selection/combinators.js` (`mergeBackend`)
- **Why it was a bug, not a skip:** Every `JoinResult.join()` call's default path (`this.merge(entered)`) hands its result back as the *next* cycle's selection — losing `.template` there meant any multi-cycle join into a from-scratch meshes Selection would throw on its second `.enter()` with new members. Caught while building the Prompt 85 capstone (which needs exactly this pattern) and fixed by carrying `template` forward through `merge()`, mirroring `computeJoin`'s existing carry-forward. Not listed as an open item — it's fixed, with a regression test in `combinators.test.js`.

---

## Phase 5 — Animation & Transitions (Prompts 86–99) — PHASE DONE

### ☑ `Transition.on('interrupt', ...)` throws — cross-transition interrupt bookkeeping doesn't exist yet
- **Where:** `src/anim/Transition.js` (`on`)
- **Why skipped:** Prompt 90 lists `'interrupt'` as a supported event, but firing it requires knowing when a *new* transition supersedes an old one on the same target/path — that bookkeeping (a global in-flight-transitions registry keyed by target+path, plus "pick up from current interpolated state") is explicitly Prompt 93's job. Registering a handler that could never fire would be a silent broken promise (CLAUDE.md §1.5 Fail Fast), so it throws instead — mirroring the existing `Selection.transition()`/`Selection.on()` Phase-gated-stub pattern from Phase 4D.
- **Resolved:** Prompt 93 — `GraphAnimTimeline.interruptPath(path)` plus a `WeakMap<target, Map<path, entry>>` registry in `Transition.js` (and the node-identity-keyed equivalent in `SelectionTransition.js`) now fire `'interrupt'` for real.

### ☐ No chart layer exists yet for ".transition() animates instead of snapping" to attach to
- **Where:** `src/anim/Transition.js` (the class itself — no wiring point exists)
- **Why skipped:** Prompt 90's text describes an end-to-end behavior ("chart methods following `.transition()` animate instead of snapping"), but `src/chart/` doesn't exist yet (Phase 8) — there are no chart methods to wire it into. `Transition` is built and tested standalone.
- **Revisit when:** Phase 8's chart layer lands and a chart method (e.g. `.data()`, `.attr()`) needs to check for an active `.transition()` configuration before writing values directly.

### ☐ `GraphAnimTimeline` is single-target only — no multi-target orchestration within one timeline
- **Where:** `src/anim/GraphAnimTimeline.js` (constructor takes one `target`)
- **Why skipped:** No prompt in 86–90 specifies a multi-target timeline API, and animating many objects together is expected to be `Selection.transition()`'s job (Prompt 91 — one bulk buffer-write pass) rather than N individual `GraphAnimTimeline`s. Kept to one target per timeline for an unambiguous `.to(props)`/`.from(props)` signature (CLAUDE.md §1.2 KISS).
- **Revisit when:** A concrete use case needs one timeline to sequence/parallelize animations across multiple distinct target objects — something `SelectionTransition`'s per-datum model doesn't cover.

### ☐ `spring()` treats `t` as literal elapsed seconds, not a duration-normalized progress
- **Where:** `src/anim/GraphAnimCurve.js` (`spring`)
- **Why skipped:** A physically real damped-harmonic-oscillator response has no built-in "always ≈1 at t=1" property the way the Penner curves do — `spring()(1)` isn't guaranteed close to 1 for arbitrary stiffness/damping (only true once the system has settled). Auto-fitting the physics to a [0,1] window would mean picking an implicit target duration, which no current prompt specifies.
- **Revisit when:** A caller feeds `spring()` through `GraphAnimTimeline`/`Transition` (both of which assume a curve reaches 1 at t=1) and the mismatch is visibly wrong — decide whether to auto-fit spring settle-time to the configured duration, or document `spring` as duration-driving instead of duration-driven.

### ☐ `SelectionTransition`s on the same node/path aren't interrupt-aware — concurrent ones fight
- **Where:** `src/compose/selection/SelectionTransition.js` (each instance registers its own independent internal timeline with `anim`)
- **Why skipped:** Prompt 91 doesn't ask for interrupt semantics (that's explicitly Prompt 93: "a new transition on the same target/attribute emits `'interrupt'` on the old one and picks up from the current interpolated state"). Two `SelectionTransition`s scheduling `.attr()` on the same node+path today both keep writing every frame independently — whichever's internal timeline's `onUpdate` runs last in `anim`'s iteration order wins that frame, which looks like flicker/fighting rather than a clean handoff.
- **Revisit when:** Prompt 93 is implemented — needs a registry keyed by `(backend member, path)` so a new `.attr()` call can detect and interrupt an in-flight one on the same target, mirroring `anim/Transition.js`'s already-stubbed `on('interrupt', ...)`.

### ☐ `SelectionTransition.attr()` on a custom instanced attribute requires it to already be `defineAttribute`d
- **Where:** `src/compose/selection/SelectionTransition.js` (`#scheduleCustomAttribute`)
- **Why skipped:** Unlike `'opacity'` (a known scalar, auto-defined on first use), an arbitrary custom attribute's `itemSize` isn't knowable from a single resolved value alone at schedule time without extra inference. This matches the base `Selection.attr()`'s existing behavior for the same path (also requires pre-definition), so it's consistency, not a new restriction — but it's easy to trip over from `SelectionTransition` specifically since the base `Selection.attr()` error message is the only hint.
- **Revisit when:** A concrete caller wants `SelectionTransition.attr(customName, ...)` to auto-define on first use — would need itemSize inferred from the resolved value's shape (number vs array length).

### ☐ A single-index setter doesn't cancel an in-flight bulk transition on the same buffer
- **Where:** `src/object/GraphInstancedObject.js` (`setInstancePosition`/`setInstanceRotation`/`setInstanceScale`/`setInstanceColor`)
- **Why skipped:** Prompt 92 only asked to wire animation into the *bulk* setters. Calling e.g. `setInstancePosition(5, ...)` while a `setAllPositions(..., { duration })` transition is still running gets clobbered on the next frame's tick, which re-derives every instance's position from its own captured `from`/`to` arrays and overwrites index 5 again. The bulk setters do cancel each other correctly (a later `setAllPositions` call cancels a prior in-flight one on the same key) — only the cross-cutting single-vs-bulk interaction is unhandled.
- **Revisit when:** Still open after Prompt 93 — that prompt's interrupt registries live in `anim/Transition.js`/`compose/selection/SelectionTransition.js` specifically (keyed by dot-path target or by mesh/raw-index), and `GraphInstancedObject`'s bulk setters don't route through either one, so this cross-cutting single-vs-bulk interaction is still unhandled. Revisit if a chart's per-instance interaction code (Phase 9) needs to write a single instance while a bulk `.data()` transition is in flight.

### ☐ A bulk transition doesn't reconcile with capacity growth mid-flight
- **Where:** `src/object/GraphInstancedObject.js` (`setAllPositions`/`setAllScales`/`setAllColors`, `#runBulkTransition`)
- **Why skipped:** The `from`/`to` arrays and the per-frame loop bound are captured/frozen at schedule time (`positions.length / 3`, not the live `this.#capacity`) specifically so a `setInstanceCount` growth mid-transition can't index out of bounds — but the practical effect is that newly-grown instances are simply untouched by the in-flight transition rather than reconciled into it. No current prompt calls `setInstanceCount` mid-transition, so this is an intentionally minimal safety guard, not a full solution.
- **Revisit when:** A chart's `update()` cycle can grow capacity while a prior bulk transition (e.g. from the previous `.data()` call) is still animating — decide whether newly-entered instances should snap in immediately or join the in-flight tween.

### ☐ Bulk-setter `options.duration` is in milliseconds; the rest of `anim/`'s raw engine (`GraphAnimTimeline`) uses seconds
- **Where:** `src/object/GraphInstancedObject.js` (`setAllPositions`/`setAllScales`/`setAllColors`)
- **Why skipped:** Prompt 92 says "wire `Transition` into the bulk setters," and `anim/Transition.js` (Prompt 90, the actual `Transition` class) is the ms-flavored D3 sugar layer — matching its unit convention seemed like the more faithful reading of "Transition" than `GraphAnimTimeline`'s raw-engine seconds. Not reconciled: a caller who already thinks in `GraphAnimTimeline`'s seconds (e.g. inside `anim/`) has to convert at this boundary.
- **Revisit when:** Phase 8's chart layer actually wires a bulk `.data()` re-render through both `Transition` and these bulk setters together — confirm the unit choice reads naturally end-to-end, or normalize on one unit across `anim/`+`object/`.

### ☐ `SelectionTransition`'s `'end'` firing on partial interrupt is asymmetric with `Transition`'s
- **Where:** `src/compose/selection/SelectionTransition.js` (`#finish`) vs `src/anim/Transition.js` (`to`'s `onComplete` handler)
- **Why skipped:** `Transition` suppresses `'end'` entirely once *any* of its paths gets interrupted (its `#interrupted` flag gates the whole handler list) — a defensible choice since one `Transition` instance is conceptually "one animation." `SelectionTransition` deliberately does **not** suppress `'end'` when only some of its many nodes get interrupted (e.g. one datum out of a thousand-node stagger) — firing `'end'` still communicates that the transition, as a whole, ran to completion for the overwhelming majority of its scope. Both are principled but genuinely different semantics for what looks like "the same" flag.
- **Revisit when:** Prompt 98's cross-cutting tests, or a real chart use case, need `'end'`/`'interrupt'` to compose predictably across both APIs — decide whether to unify (e.g. "did every node/path finish, or none/some got interrupted") or keep them intentionally distinct and just document it prominently in `docs/concepts/anim.md`.

### ☐ `anim/CameraTour.js` duplicates `scene/cameraPrimitives.js`'s waypoint-lerp math instead of replacing it
- **Where:** `src/anim/CameraTour.js` (new, Prompt 94) vs `src/scene/cameraPrimitives.js`'s `tour()` (Phase 2, still used unchanged by `GraphSceneCamera.tour()`)
- **Why skipped:** Prompt 94 says "fleshing out Phase 2's stub," which reads as CameraTour becoming the canonical implementation — but `cameraPrimitives.tour()` is already shipped with its own passing test suite (`tests/scene/GraphSceneCamera.test.js`) built around its exact internals (`loop.add.mock.calls[0][0]`, its own tiny local `EASINGS` table). Migrating `GraphSceneCamera.tour()` to delegate to the new `CameraTour` would touch already-tested Phase 2 code for a benefit (removing the duplication) that doesn't change any observable behavior today — a real DRY violation (two waypoint-interpolation implementations, two easing tables) I judged not worth the cross-phase risk within this pass. `anim/CameraTour.js` is the more capable one (pause/resume/skipToNext, `GraphAnimCurve`-backed easing, presets) and is what `examples/05-transitions/main.js` (Prompt 97) uses.
- **Revisit when:** Someone owns a deliberate Phase 2/5 consolidation pass — migrate `GraphSceneCamera.tour()` to construct a `CameraTour` internally (keeping its own return-type/`CameraController.cancel()` contract via a thin adapter, or accepting a breaking change to return `CameraTour` directly) and delete `cameraPrimitives.js`'s `tour()`/`EASINGS`/`resolveEasing`. `dollyZoom`/`follow`/`focusOn` are unaffected either way — they're a different concept, not waypoint sequences.

### ☐ `respectReducedMotion` doesn't auto-detect `prefers-reduced-motion`, and doesn't cover `CameraTour`
- **Where:** `src/anim/GraphAnim.js` (`respectReducedMotion`)
- **Why skipped:** Two deliberate narrowings in one setting. (1) `GraphAnim` never reads `window.matchMedia` itself — doing so would give `anim/` a `window`/DOM dependency it has never had (it's environment-agnostic today, testable in plain Node), so detecting the media query is left to the application, which sets the boolean itself. (2) `CameraTour` registers directly with `core/Graph3DLoop`'s `loop`, not with `anim`'s `#timelines` Set, so `anim.respectReducedMotion` has no effect on an in-flight camera tour — a reduced-motion user would still see camera movement, just not `Transition`/`SelectionTransition`-driven property tweens.
- **Revisit when:** A real app integration (Prompt 97's example, or later) needs the media query wired automatically, or `CameraTour` needs its own reduced-motion behavior (most plausibly: skip straight to the final waypoint's `at`/`lookAt`/`fov`, mirroring `skipToNext()` repeated to the end).

### ☐ `chart.cancelTransitions()`/`runningTransitions()` don't exist — no chart class to attach them to yet
- **Where:** would be `src/chart/GraphChart.js` (Phase 8, doesn't exist)
- **Why skipped:** Prompt 96 names these as chart-level methods, but there's no `src/chart/` layer yet (same situation already logged for Prompt 90's ".transition() animates instead of snapping"). What's buildable *now* is the introspection primitive they'll delegate to: `Transition.runningOn(target)` / `Transition.cancelAllOn(target)`, built on the Prompt 93 interrupt registry (`activeTransitionsByTarget`). A future `GraphChart.runningTransitions()` would call `Transition.runningOn(datumTarget)` per bound object; `cancelTransitions()` would call `Transition.cancelAllOn(...)` the same way.
- **Revisit when:** Phase 8 builds `GraphChart` — wire the two methods as thin per-chart aggregations over its own bound targets.

### ☐ `SelectionTransition` has no `runningOn()`/`cancelAllOn()` equivalent
- **Where:** `src/compose/selection/SelectionTransition.js`
- **Why skipped:** `Transition`'s registry is keyed by a single dot-path `target` object, a natural fit for "how many transitions are running on this thing." `SelectionTransition`'s interrupt registry (Prompt 93) is keyed by *node identity* (`GraphMesh`, or `GraphInstancedObject`+raw index) — querying "everything running for this whole `Selection`" would mean iterating every member's identity across two separate `WeakMap`s, a different (and messier) shape than `Transition`'s single-target lookup. Left out of this pass rather than force a rushed API.
- **Revisit when:** A concrete `chart.runningTransitions()`/`cancelTransitions()` implementation (Phase 8) needs to cover instanced-backend charts, not just mesh-backend ones with plain `Transition`s.

### ☐ `onGroupComplete()` only fires on a forward crossing, never on the reverse re-crossing of the same boundary
- **Where:** `src/anim/GraphAnimTimeline.js` (`#fireCrossedGroups`)
- **Why skipped:** Deliberate, matching `onComplete`'s existing forward-only completion semantics for `'restart'` loops. For `'pingpong'`, a group boundary is crossed twice per full cycle (once forward, once in reverse) — only the forward crossing fires, so `onGroupComplete` means "this group's *forward* animation just finished," not "playback just passed this timestamp in either direction." Documented in the method's own JSDoc, not hidden.
- **Revisit when:** A concrete use case wants a group-complete-equivalent event on the reverse leg too (e.g. a ping-ponging highlight effect) — would need a second `fired`-style flag gated on `direction < 0` instead of reusing the same one.

---

## Phase 6 — Materials & Procedural FX (Prompts 100–115) — PHASE DONE

### ☐ `bindUniforms({ resolution: 'auto' })` tracks `window.innerWidth/innerHeight`, not the actual renderer's drawing-buffer size
- **Where:** `src/material/GraphObjectMaterial.js` (`#bindAutoResolution`)
- **Why skipped:** `GraphObjectMaterial` wraps a `GraphMesh`/`GraphInstancedObject`, neither of which has any reference back to the `Graph3DRenderer`/canvas that renders them — `Graph3D` owns the renderer and there's no bridge from a scene object to "the renderer currently drawing me." `window.innerWidth/innerHeight * devicePixelRatio` is the only universally-available resolution source without new cross-layer plumbing, and matches every current example's fullscreen canvas exactly.
- **Revisit when:** A canvas that doesn't fill the viewport needs a correct `resolution` uniform — would need `bindUniforms` (or the constructor) to accept an explicit size source (a `Graph3DRenderer` reference, or a plain `{width, height}` getter) instead of always falling back to `window`.

### ☐ `bindUniforms`'s `'auto'` only covers `time` and `resolution`
- **Where:** `src/material/GraphObjectMaterial.js` (`bindUniforms`)
- **Why skipped:** Prompt 100 names exactly these two as the auto-bindable examples; no current prompt or example needs a third (e.g. `cameraPosition`, `frameCount`). Adding more speculative auto-keys with no consumer would violate YAGNI.
- **Revisit when:** A material preset (Phase 6, Prompts 101–106) needs another self-updating uniform `bindUniforms` doesn't cover yet.

### ☐ `GraphObjectMaterial` doesn't support multi-material targets
- **Where:** `src/material/GraphObjectMaterial.js` (constructor)
- **Why skipped:** `GraphMesh`/`GraphInstancedObject` both allow `material` to be a `THREE.Material[]` (multi-material meshes), but `set()`/`applyShader()`/`setMap()` all assume a single addressable material — there's no current example using multi-material targets, and guessing which array slot a caller means would be worse than refusing up front.
- **Revisit when:** A concrete multi-material use case appears — would need slot-indexed variants of `set`/`applyShader`/`setMap`, or a per-slot sub-wrapper.

### ☐ `GraphObjectMaterial.set()`/`applyShader()` unconditionally dispose the material being replaced
- **Where:** `src/material/GraphObjectMaterial.js` (`set`)
- **Why skipped:** Matches this codebase's "disposal is mandatory, not opt-in" default (CLAUDE.md §3) and prevents the common leak of an orphaned old material — but it also means a material instance can't be swapped out and back in later (e.g. toggling between two cached presets) without reconstructing it each time, since the first swap disposes it.
- **Revisit when:** A toggle/preset-caching use case needs to swap between pre-built materials repeatedly — would need an explicit `{ dispose: false }` escape hatch on `set()`.

### ☐ `pbr.js` factories add no Graph3D-specific defaults or validation beyond "is this a plain object"
- **Where:** `src/material/presets/pbr.js`
- **Why skipped:** These seven are deliberately thin pass-throughs to THREE's own `MeshStandardMaterial`/`MeshPhysicalMaterial`/etc. constructors — no prompt or example asks for opinionated defaults (a brand color, forced `flatShading`, etc.), and THREE's own constructors already validate their own option shapes. Inventing Graph3D-flavored defaults with no current consumer would violate YAGNI; the later presets (`holographic`, `crystal`, `glass`, ...) are where deliberate, documented defaults belong, since those are genuinely new looks, not re-exposed THREE materials.
- **Revisit when:** A concrete example needs a shared default (e.g. every bar chart wants `roughness: 0.6` unless overridden) — would go through `generator`/`chart` defaults, not into these factories.

### ☑ `holographic`'s vertex shader mixed a view-space normal with a world-space view direction
- **Where:** `src/material/presets/holographic.js` / `src/material/presets/shaderChunks.js` (`WORLD_SPACE_VERTEX_MAIN`)
- **Why skipped (original Prompt 102 bug):** The original vertex shader built `vNormal` from THREE's built-in `normalMatrix` uniform — which is `transpose(inverse(modelViewMatrix))`, i.e. **view-space** — while `vViewDir` (`cameraPosition - worldPosition`) is **world-space**. `dot(vNormal, vViewDir)` in the fragment shader was therefore comparing vectors in two different coordinate frames, which only coincidentally looks right when the camera transform happens to be near-identity. Caught while extracting the shared vertex-shader chunk for `crystal.js` (Prompt 103), which needs a *correct* world-space normal/view-direction pair for `reflect()`/`refract()` against a world-space cubemap.
- **Resolved:** Prompt 103 — `shaderChunks.js`'s `WORLD_SPACE_VERTEX_MAIN` now builds `vNormal` from `modelMatrix` (and `instanceMatrix`, when instanced) directly, so both varyings live in world space. `holographic.js` was refactored to import this shared chunk instead of its own copy.

### ☐ `holographic`/`crystal`'s shared world-space normal transform assumes uniform scale
- **Where:** `src/material/presets/shaderChunks.js` (`WORLD_SPACE_VERTEX_MAIN`)
- **Why skipped:** `worldNormal = mat3(modelMatrix) * mat3(instanceMatrix) * normal` is exact only when `modelMatrix`/`instanceMatrix` have uniform scale (the common case: unscaled meshes, or `setAllScales` with equal x/y/z) — a true normal transform needs the inverse-transpose of the non-uniform-scale matrix, which isn't worth computing per-vertex for a decorative fresnel/refraction effect without a concrete case that shows the skew.
- **Revisit when:** A chart with strongly non-uniform scale visibly distorts the fresnel rim or refraction using either material.

### ☐ `holographic`'s shader GLSL is untested by real WebGL compilation
- **Where:** `tests/material/presets/holographic.test.js`
- **Why skipped:** jsdom's `HTMLCanvasElement.getContext()` isn't implemented in this project's test environment (pre-existing, logged in `.claude/TODO.md` — the "canvas npm package" warnings every test run already shows), so no test here can actually compile the vertex/fragment GLSL against a real GL context. Tests instead cover the material's structural contract (uniforms, defaults, validation, disposal) and trust manual GLSL review; a syntax error in the shader strings would only surface when actually rendered in a browser.
- **Revisit when:** A headless-GL test harness (or a real-browser test runner) is added for this project — then add a "compiles and renders one frame without a GL error" smoke test for every shader-based preset.

### ☐ `holographic`'s `time` uniform does nothing until externally driven
- **Where:** `src/material/presets/holographic.js`
- **Why skipped:** Consistent with `GraphObjectMaterial`'s design (Prompt 100): presets are pure factories with no lifecycle of their own; animating `time` is `GraphObjectMaterial.bindUniforms({ time: 'auto' })`'s job, not something the preset should duplicate by subscribing to `loop` itself. Documented in the factory's own JSDoc so it isn't a silent gap.
- **Revisit when:** Never, by design — this is the intended division of labor between `material/presets/*` (data) and `GraphObjectMaterial` (lifecycle). Listed here only so it isn't mistaken for an oversight.

### ☐ `crystal`'s "caustic approximation" is chromatic dispersion + a sine sparkle, not a light-transport simulation
- **Where:** `src/material/presets/crystal.js` (fragment shader)
- **Why skipped:** Prompt 103 itself calls for a "cubemap caustic approximation," not real caustics (which need photon mapping or screen-space caustic techniques far beyond a single material preset). Per-channel refraction at slightly different ratios (real IOR-vs-wavelength dispersion, the same trick THREE's own official cubemap-refraction example uses) plus a fresnel-weighted animated sparkle reads as "crystal" without simulating light transport. Documented in the shader's own comment, not hidden.
- **Revisit when:** Never, by design — an actual caustic simulation is a `postfx/`-scale feature (Phase 7), not a `material/` preset's job.

### ☐ `crystal` requires a raw `THREE.CubeTexture`, not a PMREM-processed environment texture
- **Where:** `src/material/presets/crystal.js`
- **Why skipped:** THREE's built-in PBR materials (and `scene.environment`, set via `GraphSceneEnvironment`) use a `PMREMGenerator`-processed equirect-atlas texture (`CubeUVReflectionMapping`), sampled with THREE's own internal shader chunks — reproducing that sampling math by hand in a custom shader is a large, error-prone undertaking with no current consumer. `crystal`'s hand-written GLSL instead requires a plain `samplerCube`-compatible `THREE.CubeTexture` (e.g. from `THREE.CubeTextureLoader`, the same type `GraphSceneEnvironment.setSkybox()` loads for a 6-image skybox array) — simpler, and already achievable in this codebase without new plumbing.
- **Revisit when:** A chart wants `crystal` to reflect/refract the scene's actual PMREM `environment` (not a separately-loaded skybox cubemap) — would need to either sample the PMREM atlas manually or fall back to THREE's own `MeshPhysicalMaterial` (transmission workflow, like `glass.js`) for that case instead.

### ☐ `glass`/`frostedGlass`'s transmission workflow depends on renderer/scene setup this preset doesn't control
- **Where:** `src/material/presets/glass.js`
- **Why skipped:** `THREE.MeshPhysicalMaterial`'s `transmission` property only looks correct when the renderer has a background/opaque scene behind it to sample into (THREE renders an internal transmission pass) — a `glass` material in an empty scene, or one whose renderer/camera setup doesn't support the transmission render target, will look flat or wrong. This is inherent to THREE's own transmission feature, not something `glass.js` can fix by itself; it's a thin, validated wrapper, consistent with `pbr.js`'s and this preset's own "expose THREE's real feature, don't reinvent it" philosophy.
- **Revisit when:** A concrete example shows `glass`/`frostedGlass` looking wrong in Graph3D's default scene setup — would investigate `Graph3DRenderer`'s options (e.g. whether `transmissionResolution` needs tuning) rather than the preset itself.

### ☐ `neon`'s `pulse` bypasses `anim/` entirely, subscribing to `loop` directly like `CameraTour`
- **Where:** `src/material/presets/neon.js` (`pulse`)
- **Why skipped:** `pulse` is a continuous, target-less oscillation (breathe forever between `min`/`max`), not a "tween to a value and stop" — the same shape of problem `CameraTour` (Prompt 94) already solved by registering directly with `loop` instead of building a `GraphAnimTimeline`. Reusing that precedent kept `pulse` simple (hand-rolled `cos()`, no timeline/keyframe machinery) — but it also means, like `CameraTour`, `anim.respectReducedMotion` has no effect on a pulsing material. An infinite `GraphAnimTimeline.loop(Infinity, 'pingpong')` was considered and rejected: `respectReducedMotion` snaps a timeline to `timeline.duration` *every tick*, which for an infinite pingpong loop would flicker between `min`/`max` every frame instead of settling — worse than just not being affected at all.
- **Revisit when:** `anim/`'s reduced-motion handling grows a notion of "settle a looping timeline at its rest value" rather than "snap to this tick's end" — then `pulse` (and `CameraTour`) could both migrate to the real engine and inherit reduced-motion support for free.

### ☑ `neon`'s pulse-cleanup override replaces `material.dispose` with a plain function, not a subclass method
- **Where:** `src/material/presets/neon.js` (`neon`)
- **Why skipped:** CLAUDE.md §1.2 KISS restricts inheritance in this codebase to exactly two lines (`GraphChart`, `GraphObject`) — subclassing `THREE.MeshStandardMaterial` to add a `pulse`-aware `dispose()` would add a third. Reassigning the single `dispose` own-property on the returned instance is ordinary object composition (not a Proxy/decorator/dynamic class), and it keeps the existing `disposeMaterial()`/`GraphMesh.dispose()` call path working unmodified — nothing elsewhere in the codebase needs to know a pulsing neon material requires extra cleanup.
- **Resolved:** Prompt 106 — `dataDriven`'s internally-created `paletteTexture` needed the exact same "fold cleanup into `.dispose()`" treatment (a real leak otherwise: `disposeMaterial()` only walks a material's own top-level properties, never `.uniforms`), so this was the predicted second occurrence. Extracted into `src/material/presets/lifecycle.js`'s `wrapDisposeWithCleanup(material, cleanup)`; `neon.js` refactored to use it too.

### ☐ `glow`'s rim-glow fresnel exponent (`power`) has no physically-motivated default, just a look that reads well
- **Where:** `src/material/presets/glow.js`
- **Why skipped:** Unlike `glass`/`velvet` (real THREE PBR features with physically meaningful defaults) or `crystal` (dispersion tied to a real IOR), `glow`'s fresnel `pow(..., power)` is a purely decorative falloff curve — `power = 2.5` was picked because it looks like a glow, not derived from anything. No prompt or example asks for a more principled model (e.g. a real Fresnel-Schlick reflectance term).
- **Revisit when:** A concrete look needs `glow`'s falloff to match real material reflectance rather than an arbitrary exponent.

### ☐ `dataDriven`'s `valueAttribute` expects a pre-normalized `[0, 1]` scalar — no domain-remapping uniform
- **Where:** `src/material/presets/dataDriven.js`
- **Why skipped:** `compose/scale`'s `scale.linear().domain([min, max])` already solves "map raw data into `[0, 1]`" correctly and is the established single authority for domain math (CLAUDE.md §1.1 DRY) — duplicating a `valueDomainMin`/`valueDomainMax` uniform and remapping inside the shader would reimplement exactly that. Callers write `selection.attr('value', (d) => scale(d.value))`, pre-normalizing on the CPU/JS side; the shader just `clamp()`s defensively against float edge cases.
- **Revisit when:** A profiling result shows CPU-side per-datum scale calls are a measured bottleneck at very large instance counts — would justify pushing the domain remap onto the GPU instead.

### ☑ `dataDriven`'s `color` (via `instanceColor`) needed no new option — read automatically like THREE's own materials
- **Where:** `src/material/presets/dataDriven.js`
- **Why it works:** THREE itself defines `USE_INSTANCING_COLOR` and auto-declares `attribute vec3 instanceColor;` per-object (`WebGLProgram.js`) whenever `object.instanceColor !== null` — regardless of material type. `dataDriven`'s shader just checks `#ifdef USE_INSTANCING_COLOR` and multiplies it into the palette-derived color; no JS-side option, define, or validation needed on this material's side, since THREE manages that define itself. Documented here (not as an open item) so a future reader doesn't wonder why `color`, unlike `opacity`/`emissiveIntensity`, has no `perInstance*` boolean.

### ☐ `dataDriven`'s shader GLSL is untested by real WebGL compilation
- **Where:** `tests/material/presets/dataDriven.test.js`
- **Why skipped:** Same pre-existing gap as `holographic`/`crystal`/`glow` (jsdom's `HTMLCanvasElement.getContext()` isn't implemented here — see those entries and `.claude/TODO.md`). Tests cover the structural contract (uniforms, `defines`, templated attribute names appearing in the shader source string, validation, disposal) but can't compile the GLSL against a real GL context, so a typo inside an `#ifdef` branch that's never exercised by the default options wouldn't be caught until an actual browser render.
- **Revisit when:** A headless-GL or real-browser test harness is added — add a "compiles and renders one frame without a GL error" smoke test across every `perInstance*`/`USE_INSTANCING_COLOR` combination, since those are exactly the branches most likely to have an unnoticed GLSL error.

### ☐ `glow`'s rim-glow fresnel exponent (`power`) has no physically-motivated default, just a look that reads well
- **Where:** `src/material/presets/glow.js`
- **Why skipped:** Unlike `glass`/`velvet` (real THREE PBR features with physically meaningful defaults) or `crystal` (dispersion tied to a real IOR), `glow`'s fresnel `pow(..., power)` is a purely decorative falloff curve — `power = 2.5` was picked because it looks like a glow, not derived from anything. No prompt or example asks for a more principled model (e.g. a real Fresnel-Schlick reflectance term).
- **Revisit when:** A concrete look needs `glow`'s falloff to match real material reflectance rather than an arbitrary exponent.

### ☐ `liquidMercury`/`chrome`/`gold`/`copper`/`pearl`/`obsidian` can't be visually tuned against the actual `'studio-1k'` HDR — that binary asset doesn't exist yet
- **Where:** `src/material/presets/{liquidMercury,chrome,gold,copper,pearl,obsidian}.js`
- **Why skipped:** Prompt 105 asks for these "tuned against the default studio HDR," but `studio-1k.hdr` is a pre-existing, already-tracked gap (`.claude/TODO.md`: "Missing built-in HDR binary assets," Phase 2 Prompt 27) — the file referenced by `GraphSceneThemes`'s `studio-light`/`studio-dark` presets has never actually existed in this repo, so there is no HDR to render these against and empirically tune. Colors instead come from well-established physically-based metal reflectance references (the Filament/Unreal PBR "F0" charts for `chrome`/`gold`/`copper`; mercury approximated the same way, being a similarly neutral high-reflectance metal); `roughness`/`clearcoat` values are reasonable starting points, not measured against a real render.
- **Revisit when:** The `studio-1k.hdr` asset is added (Phase 2's tracked TODO) and Prompt 113's `examples/06-materials/main.js` gallery can render all of Phase 6's presets side by side — that's the point these six should get an actual visual pass, and defaults adjusted if any look off.

### ☐ `buildMetalPreset`'s shared helper covers 4 of 6 Prompt 105 presets; `pearl`/`obsidian` stayed standalone
- **Where:** `src/material/presets/metal.js`, `pearl.js`, `obsidian.js`
- **Why skipped:** `liquidMercury`/`chrome`/`gold`/`copper` are all "metalness 1 + one color + one roughness" — genuinely the same shape, extracted once (DRY). `pearl` (iridescence + clearcoat, non-metallic) and `obsidian` (clearcoat + near-black, non-metallic, no iridescence) don't share enough properties with each other or the metal template to justify forcing a second shared abstraction — that would be premature generalization over two dissimilar-enough dielectric looks (KISS/YAGNI), so each stayed a standalone `MeshPhysicalMaterial` wrapper, matching `velvet.js`'s already-established standalone pattern.
- **Revisit when:** A third non-metallic "coated dielectric" preset appears with enough real overlap with `pearl`/`obsidian` to justify a shared builder.

### ☐ `liquidMercury`'s "liquid" quality is purely optical (near-zero roughness), no procedural ripple/displacement
- **Where:** `src/material/presets/liquidMercury.js`
- **Why skipped:** A true liquid-metal surface (rippling, flowing) would need vertex displacement driven by noise/time — a materially bigger feature (custom shader + geometry perturbation + likely its own `time` uniform wiring) than what the other five Prompt 105 presets need, and no prompt or example asks for animated liquid surfaces. Real mercury's actual appearance already comes almost entirely from being a near-perfect specular reflector, which `metalness: 1, roughness: 0.02` alone reproduces convincingly for a static (or externally-animated-via-transform) object.
- **Revisit when:** A concrete example wants a literally rippling liquid-metal surface — would likely become its own `crystal`-style custom `THREE.ShaderMaterial` with vertex displacement, not an extension of this preset.

### ☐ `SDFText`'s bundled Roboto MSDF atlas binary assets don't exist
- **Where:** `src/material/text/SDFText.js`, `src/material/text/assets/` (directory doesn't exist)
- **Why skipped:** Full detail in `.claude/TODO.md` — same category of gap as the missing HDR assets (Phase 2, Prompt 27): generating a real MSDF atlas needs an actual font-to-MSDF tool run against a Roboto TTF, neither of which is available in this environment. The rendering/layout engine (atlas loading+caching, per-glyph quad layout with kerning/letterSpacing/align, MSDF shader with outline/glow) is fully built and unit-tested against a mock atlas — `SDFText.create()` rejects with a clear, actionable error identifying exactly what's missing rather than silently rendering nothing.
- **Revisit when:** The two asset files are added under `src/material/text/assets/` — then also add a real-atlas visual smoke test (same "needs a real GL context" caveat already logged for `holographic`/`crystal`/`glow`/`dataDriven`).

### ☐ Prompt 109 ("wire SDF text into Axis labels") could not be completed — deferred, not silently skipped
- **Where:** `src/compose/axis/Axis.js`, `src/compose/annotation/label.js`
- **Why skipped:** `Axis.render()` and `annotation.label()` are both synchronous today; `SDFText.create()` is necessarily async (loading a texture + JSON is inherently asynchronous). Wiring them together as literally specified would require either (a) `Axis.render()` becoming async — an API-breaking change touching every existing sync call site, test, and example across Phases 4–5 — or (b) a two-phase "render sync now, upgrade to real SDF text asynchronously when ready" design, adding real complexity. Since the atlas binary assets are *also* missing (previous entry), text can't actually render correctly either way right now, regardless of which design is chosen — so the existing `{type:'label', text, position, style}` metadata stub was left in place rather than taking on either risk for a feature that can't be visually confirmed yet.
- **Revisit when:** The atlas assets exist AND a concrete decision is made on sync-vs-async `Axis`/`annotation.label` semantics — full detail and the two design options are written up in `.claude/TODO.md`.

### ☐ `texture/procedural.js`'s hash/noise is a non-cryptographic sin-fract shader trick
- **Where:** `src/material/texture/procedural.js` (`hash2`)
- **Why skipped:** `noise`/`voronoi`/`cellular` all sample through one `hash2(x, y, seed)` — a standard, widely-used shader hashing technique (`sin(...) * largeConstant`, take the fractional part), not a high-quality PRNG. It has known, mild directional artifacts at large coordinate magnitudes, invisible at the texture sizes/scales this module targets (decorative procedural textures, not scientific randomness). Reused across all three generators rather than each rolling its own (CLAUDE.md §1.1 DRY).
- **Revisit when:** Visible hash artifacts show up at some combination of `scale`/`cellCount`/`size` in real use — would swap in a proper integer-hash (e.g. a small xxhash/PCG variant) behind the same `hash2` signature, no call-site changes needed.

### ☐ Procedural textures are generated synchronously on the CPU, once, at call time
- **Where:** `src/material/texture/procedural.js` (`buildDataTexture`)
- **Why skipped:** Every generator loops `size × size` pixels synchronously before returning — fine at the default/typical 256×256–512×512 range (sub-millisecond to a few milliseconds), but a caller requesting a very large size (e.g. 4096×4096 `voronoi`, which does a 3×3 feature-point search per pixel) would block the main thread noticeably. No prompt or example asks for textures anywhere near that size, so a worker-offloaded or async generation path would be premature (YAGNI) — matches this library's general "measure first" stance on optimization (CLAUDE.md §1.3).
- **Revisit when:** A concrete example needs a large procedural texture and profiling shows main-thread blocking — `core/WorkerPool` already exists and could host this.

### ☐ `addPlanarReflection` only accepts a `GraphMesh`, not `GraphInstancedObject`
- **Where:** `src/material/planarReflection.js`
- **Why skipped:** A mirror reflection is inherently a single-surface technique (`Reflector` renders the scene once from one virtual camera into one render target) — "instancing a mirror" has no coherent meaning (each instance would need its own separate camera/render-target pass, defeating the entire point of instancing). Restricting to `GraphMesh` is a deliberate, permanent design choice matching the technique's own nature, not a deferred gap.
- **Revisit when:** Never, by design — listed here only so it isn't mistaken for an oversight.

### ☐ `retainTexture`/`releaseTexture` don't auto-detect cross-wrapper texture sharing
- **Where:** `src/material/GraphObjectMaterial.js`, `src/core/GraphDisposal.js`
- **Why skipped:** `GraphObjectMaterial.set()`/`setMap()` correctly protect a texture shared between the *old and new* material within one call (both sides are visible to that one call) — but two **independently constructed** `GraphObjectMaterial`s that happen to share a texture from the start (e.g. one `THREE.CubeTexture` handed to many separate `material.crystal()` calls) aren't automatically detected as sharing it; there's no scene-wide registry to check against without a much larger, likely-fragile mechanism. The advanced caller marks this explicitly: call `retainTexture(texture)` once per *extra* material sharing it, documented in `GraphObjectMaterial`'s own class doc and exercised in `tests/integration/GraphObjectMaterial-disposal.test.js`.
- **Revisit when:** A concrete chart pattern (e.g. "N bars all reflecting the same studio cubemap via `crystal()`") makes manual `retainTexture()` bookkeeping error-prone enough to justify an automatic mechanism — e.g. a small opt-in "shared texture handle" wrapper that ref-counts on construction/disposal by itself.

### ☐ Prompt 112's literal `GraphInstancedObject.material.setPaletteForAttribute` signature isn't possible — implemented as `material.setPaletteForAttribute(object, ...)` instead
- **Where:** `src/material/setPaletteForAttribute.js`
- **Why skipped:** `GraphInstancedObject.material` is a plain getter returning the raw `THREE.Material` (see the Phase 3 entry above — permanently so, `object/` can never return a `material/` type). There's nowhere to hang a `.setPaletteForAttribute` method off of `object.material` itself. Implemented instead as a standalone `material` namespace function taking the object as its first argument (`material.setPaletteForAttribute(bars, 'value', palette.viridis)`) — same convenience, the only signature this codebase's layering actually allows.
- **Revisit when:** Never, by design — listed here only so the literal prompt wording isn't mistaken for an unmet requirement.

### ☐ `setPaletteForAttribute` always constructs a fresh `GraphObjectMaterial`, never reuses an existing one for the same target
- **Where:** `src/material/setPaletteForAttribute.js`
- **Why skipped:** `GraphObjectMaterial` has no registry mapping a target back to a previously-constructed wrapper (each one is a lightweight, stateless-until-used object — cheap to create). Reusing one would need such a registry, adding real complexity (another WeakMap, lifecycle questions about which wrapper "wins") for no current benefit, since a fresh wrapper behaves identically to a reused one for this function's purposes.
- **Revisit when:** A concrete case shows constructing many short-lived `GraphObjectMaterial`s has a measurable cost.

### ☐ `applyShader`'s `preserveUniforms` defaults to `false`, not `true`
- **Where:** `src/material/GraphObjectMaterial.js` (`applyShader`)
- **Why skipped:** Prompt 112 asks for hot-reload "via `applyShader`," but defaulting to always-preserve would silently bleed uniform values between two *unrelated* shaders that happen to share a name — e.g. `crystal`'s `color` (a white tint) leaking into `glow`'s `color` (a rim-glow hue) if a caller swaps between totally different presets, not actually hot-reloading the same shader. Opt-in (`{ preserveUniforms: true }`) keeps the common "swap to a different look" path exactly as predictable as it was before this prompt, while still giving dev-mode hot-reload the exact behavior it needs when explicitly requested.
- **Revisit when:** Never, by design — listed here so the non-default choice isn't mistaken for an incomplete implementation.

### ☐ `examples/06-materials` grid omits `crystal`, `physical`, `lambert`, `basic`, `frostedGlass` to fit exactly 16 cells
- **Where:** `examples/06-materials/main.js`
- **Why skipped:** Prompt 113 specifies a 4×4 (16-cell) grid; Phase 6 shipped 21 material-producing presets. `crystal` was dropped because it requires an external `THREE.CubeTexture` (a real photographed/rendered cubemap image) this repo doesn't have — unlike `matcap`'s stand-in, there's no clean procedural substitute for a full environment cubemap. `physical`/`lambert`/`basic`/`frostedGlass` were dropped as the most visually redundant with a sibling already in the grid (`standard`/`phong`/`toon` and `glass`, respectively) — a deliberate curation, not an oversight.
- **Revisit when:** Never, by design — if `crystal` needs to be shown, it'd need its own cubemap asset (same category of gap as the missing HDRs) or a small procedurally-baked cubemap (6 canvas faces) built specifically for this example.

### ☐ `examples/06-materials`'s `matcap` bar uses a procedural radial gradient, not a real captured matcap image
- **Where:** `examples/06-materials/main.js` (`matcapTexture`)
- **Why skipped:** A real matcap is a photographed or rendered image of a lit sphere, baked once; this repo has no such asset bundled (same category of gap as the HDRs/cubemap above). `texture.gradient({ type: 'radial', ... })` (Prompt 110) approximates the soft center-to-edge falloff reasonably well for a demo, without depending on an external file.
- **Revisit when:** A real matcap image asset is added to the repo for this example to load instead.

### ☐ `examples/06-materials` adds a procedural PMREM fallback environment when `studio-dark`'s HDR fails to load
- **Where:** `examples/06-materials/main.js` (`buildFallbackEnvironment`)
- **Why skipped:** Observed directly while testing this example in a browser: without *any* environment map, metal/PBR presets (`chrome`, `gold`, `copper`, `pearl`, `liquidMercury`, `velvet`) render essentially pure black — physically correct (metals have near-zero diffuse response; with no scene lights hitting them from a Reflective angle and no environment to reflect, there's nothing for the eye to see), but a poor look for a "hero screenshot" whose whole point is showing these presets off. Building a real PMREM environment from a `texture.gradient()` output (Prompt 110) gives them *something* to reflect, purely as a fallback — the moment `studio-1k.hdr` is added to the repo, `applyTheme` succeeds and this fallback path never runs.
- **Revisit when:** The `studio-1k.hdr` asset is added — this fallback becomes dead code at that point and could be removed, though leaving it doesn't hurt (it only runs on `applyTheme` failure).

### ☐ Prompt 114's "SDF crisp at multiple distances" is tested via structural proxy, not a real render
- **Where:** `tests/integration/phase6.test.js`, describe block "(b) SDFText stays crisp at multiple distances"
- **Why skipped:** Same pre-existing jsdom/no-GL-context limitation as every other custom-shader preset in this phase (`holographic`/`crystal`/`glow`/`dataDriven` — see their own entries above). "Crisp at multiple distances" can't be verified by actually rendering and measuring pixels here. Instead: (1) doubling `fontSize` doubles every vertex position exactly, proving the quad geometry is scaled like vector data, not re-baked at a fixed resolution; (2) the fragment shader's anti-aliasing uses `fwidth()` (a screen-space derivative, inherently resolution/distance-independent) rather than a fixed texel threshold; (3) the identical shader source is reused regardless of `fontSize`, with no per-size variant. Together these prove the *mechanism* that gives MSDF text its distance-independence is present and wired correctly — not that it visually looks crisp, which needs an actual GPU render to confirm.
- **Revisit when:** A headless-GL or real-browser test harness exists (same revisit trigger already logged for the other shader presets) — add a real "render at near and far camera distances, diff the two images for aliasing" smoke test once the bundled MSDF atlas assets also exist (they don't yet either — see the entry above this one).

---

## Phase 7 — PostFX & Particles (Prompts 116–126)

### ☐ `motionBlur` is camera-only reprojection blur, not true per-object velocity-buffer motion blur
- **Where:** `src/postfx/passes/motionBlur.js`
- **Why skipped:** Prompt 117 asks for "motionBlur (velocity buffer)." A literal per-object velocity buffer needs a second full-scene render with each object's *previous-frame* model matrix available to an override material — that's state `object/` (or `scene/`) would need to track per-instance, and `postfx/` must not reach into either (CLAUDE.md §1.4 SoC: `postfx/`'s own row explicitly excludes chart/object internals). The shipped pass instead reprojects each pixel's *depth* through the camera's previous-frame view-projection matrix (a real, standard screen-space technique — moving the camera blurs the frame) entirely within `postfx/`'s own boundaries: its own depth pre-pass (mirroring `BokehPass`'s/`SSAOPass`'s established idiom) plus a tracked `previousViewProjection` matrix, no per-object state needed.
- **Revisit when:** A per-object motion vector becomes available lower in the stack (e.g. `object/` starts tracking each instance's previous-frame transform for some other reason, like TAA or a future chart-transition need) — at that point `motionBlur` could accept an optional velocity-texture input and blend it in for objects that move independently of the camera.

### ☐ `godRays` is a screen-space depth-mask approximation, not a true participating-media (raymarched fog volume) simulation
- **Where:** `src/postfx/passes/godRays.js`
- **Why skipped:** "Real" volumetric light scattering raymarches through an actual 3D fog density field. Building that is a much larger feature (a fog-volume renderer) that no current prompt asks for — `GraphSceneEnvironment`'s `'volumetric-*'` fog presets still render as plain `FogExp2` (see the entry below and `src/scene/GraphSceneEnvironment.js`). The shipped pass instead marches from each pixel toward the light's projected screen position, accumulating brightness only where its own depth pre-pass (reusing `motionBlur`'s `DepthPrepass`, now shared via `passes/_shared.js`) shows background rather than geometry — the same cheap, standard approximation most real-time engines use for "god rays," and enough to deliver the light-shaft look `GraphSceneEnvironment`'s `'volumetric-cinematic'` preset promises.
- **Revisit when:** A real fog-volume/participating-media renderer is built for some other reason (e.g. a `chart` type needs true volumetric density visualization) — at that point `godRays` could sample that volume's density instead of a binary background/geometry test.

### ☐ `outline` isn't literally "auto-wired to the Phase 9 state machine" — Phase 9 doesn't exist yet
- **Where:** `src/postfx/passes/outline.js`
- **Why skipped:** Prompt 118 asks for auto-wiring to "the Phase 9 state machine," but Phase 9 (`interact/`, hover/selection picking) hasn't been built (Prompts 141–165). Even once it exists, `postfx/` must never import from `interact/` — it's a layer above `postfx/` in CLAUDE.md §1.4's coupling table, so the wiring has to run the other direction (`interact/` calling into `postfx/`, not the reverse). The pass is built so that direction is a one-line call once Phase 9 exists: `graph3d.postfx.configure('outline', { selectedObjects })` updates the highlighted set on an already-enabled pass with no extra glue needed.
- **Revisit when:** Phase 9's state machine exists — wire its hover/selection transitions to call `graph3d.postfx.configure('outline', { selectedObjects })` (auto-`enable`-if-needed can live in `interact/`, since it's allowed to import `postfx/`).

### ☐ `ssr`'s "weak GPU" auto-disable reuses `CapabilityProbe`'s existing fields; there's no dedicated GPU-tier score
- **Where:** `src/postfx/passes/ssr.js`
- **Why skipped:** Prompt 119 asks to "auto-disable on weak GPUs via CapabilityProbe," but `Capabilities` (`src/core/CapabilityProbe.js`) has no `tier`/`isLowEnd` field — it only exposes raw feature flags (`webgl2`, `floatTextures`, `maxTextureSize`, etc.), no benchmark-based scoring. Building a true GPU-tier classifier (vendor/renderer string heuristics, a runtime micro-benchmark, or a bundled device database) is a much bigger feature no current prompt asks for. `ssr`'s `canEnable` instead treats "no WebGL2 or no float-texture support" as "weak" — the closest existing signals, and a reasonable proxy since `SSRPass` specifically needs a solid render-target/G-buffer pipeline.
- **Revisit when:** A real GPU-tier signal is added to `CapabilityProbe` for some other reason (e.g. a chart type needs to pick LOD strategy by device class) — `ssr`'s `canEnable` could switch to reading that instead of the two raw flags.

### ☐ Postfx presets exclude `godRays`/`outline`/`ssr` — they need scene-specific setup a generic preset can't assume
- **Where:** `src/postfx/presets.js`
- **Why skipped:** `godRays` throws without a scene light, `outline` needs a `selectedObjects` array, and `ssr` is most useful with a `groundReflector` from `material.addPlanarReflection` — none of that exists reliably across arbitrary scenes, so a mood preset (`cinematic`/`cyberpunk`/etc.) can't safely enable them by default without risking a preset call that throws depending on scene contents. Presets only combine the scene-agnostic stylistic passes (`bloom`/`ssao`/`dof`/`vignette`/`chromaticAberration`/`filmGrain`/`fxaa`/`smaa`). `colorGrading` is excluded too — without a hand-authored tinted LUT asset, its only default (an identity LUT) is a visual no-op regardless of `intensity`, so there's nothing for a preset to meaningfully tune yet.
- **Revisit when:** Either (a) real tinted LUT assets are added for `colorGrading` to give presets something to tune, or (b) a preset explicitly documents "requires a scene light/selection/reflector" and opts into `godRays`/`outline`/`ssr` for a narrower, scene-aware use case (e.g. a `'volumetric'` preset that assumes the caller already set up lighting).

### ☐ `ParticleSystem`'s GPU simulation path is untested beyond construction/mode-selection — no real WebGL context under jsdom
- **Where:** `src/postfx/particles/ParticleSystem.js`, `tests/postfx/particles/ParticleSystem.test.js`
- **Why skipped:** The GPU path's `emit()`/`update()` call real `WebGLRenderer` methods (`copyTextureToTexture`, `setRenderTarget`, rendering the `FullScreenQuad` sim pass) that jsdom's stubbed `HTMLCanvasElement.getContext()` can't back — the same pre-existing limitation logged for every other shader-driven feature in this codebase (`crystal`/`holographic`/`glow` materials, `godRays`/`motionBlur` passes). The CPU path is fully behaviorally tested (real emit/update/recycle/death assertions on actual attribute arrays); the GPU path is tested for construction, capability-based mode selection, and disposal only. The simulation math itself (`position += velocity * delta`, age/lifetime death, the `aParticleUV` texel-center mapping) is only exercised by hand-tracing, not a running shader.
- **Revisit when:** A headless-GL or real-browser test harness exists (same revisit trigger already logged for the shader-preset materials) — add a "spawn N particles, step update() M times, read back the render target via `readRenderTargetPixels`, assert positions match CPU-computed expectations" integration test.
- **Update (Prompt 124):** this gap was real, not theoretical — building `examples/07-postfx/main.js` and running it in an actual browser surfaced a genuine bug this test suite couldn't: `particleShaders.js`'s `POSITION_LOOKUP_GPU`/`_CPU` spliced `attribute`/`uniform` declarations *inside* `void main() { ... }` (invalid GLSL — attributes/uniforms must be global scope), which jsdom's construction-only tests never exercised. Fixed by splitting each into `declarations`/`body` halves placed correctly in the vertex shader templates. Confirms the revisit trigger above is worth prioritizing once a headless-GL harness is feasible, rather than continuing to rely on manual example-running to catch this class of bug.

### ☐ `ParticleSystem`'s ring buffer force-recycles the oldest particles — no free-list, no overflow error
- **Where:** `src/postfx/particles/ringBuffer.js` (`advanceRingCursor`), `ParticleSystem.emit()`
- **Why skipped:** Tracking which of `capacity` slots are actually "dead" (`age >= lifetime`) would need either a CPU-side liveness bitmap kept in sync with the GPU-simulated age texture (impossible without an expensive per-frame readback) or a compaction pass — real complexity for a simple pooled-particle system. The shipped design is the standard, simplest approach: a round-robin cursor that always advances by `count`, silently overwriting whatever was in those slots — if particles are emitted faster than they die, the oldest (still-visible) ones get cut off early instead of the newest queued particles waiting. This is a genuine, if uncommon, visual artifact under sustained over-emission, not a crash.
- **Revisit when:** A concrete example needs guaranteed no-early-death behavior under sustained heavy emission — a GPU-side atomic free-list (via a compute-capable path, e.g. WebGPU) or a CPU-tracked liveness count (cheap only on the CPU sim path) would be the fix, likely scoped separately per backend.

### ☐ Particle behaviors' CPU math (`behaviors.js`) and GLSL (`behaviorShaders.js`) are hand-duplicated, not shared code
- **Where:** `src/postfx/particles/behaviors.js`, `src/postfx/particles/behaviorShaders.js`
- **Why skipped:** A fragment shader can't `import` a JS module — the hash/noise/curl-noise formulas (and the `attract`/`repel`/`swirl` force formulas) are written twice, once as JS (for the CPU sim path) and once as GLSL (for the GPU sim path). This is a genuine, unavoidable violation of CLAUDE.md §1.1 DRY's letter, not its spirit: the two implementations are kept formula-identical by design (verified by hand, cross-referenced in each file's doc comment) and there is no third option (a GLSL-to-JS or JS-to-GLSL transpiler is far out of scope). A change to one formula requires manually mirroring it in the other file — nothing enforces that automatically.
- **Revisit when:** If a shader transpilation/shared-DSL approach is ever adopted for some other reason (e.g. a broader move to a shading-language-agnostic effect system), route both paths through it instead.

### ☐ GPU-path and CPU-path particle behaviors are not verified to produce matching results
- **Where:** `src/postfx/particles/behaviors.js` vs `behaviorShaders.js`
- **Why skipped:** Originally deferred to "Prompt 125, or whenever a headless-GL/real-browser harness exists." Prompt 125 (Phase 7's cross-cutting test prompt) has now arrived and confirmed the blocker is still real, not just deferred: `tests/integration/phase7.test.js` documents explicitly why this parity check isn't included — jsdom still can't back the GPU path's real `WebGLRenderer` calls, so there's no way to read back GPU sim results to diff against the CPU path. The hash/noise functions were ported formula-for-formula by hand and the radial/swirl formulas were verified algebraically to match (see `behaviors.js`'s and `behaviorShaders.js`'s own doc comments), but no automated test proves the two numerically agree.
- **Revisit when:** A headless-GL or real-browser test harness exists — read back the GPU velocity/position render targets after N steps and diff against a CPU simulation seeded with the same initial state.

### ☐ Presets don't fade opacity over a particle's lifetime — every particle pops out at death, not fades
- **Where:** `src/postfx/particles/presets.js`, the shared fragment shader in `particleShaders.js`
- **Why skipped:** Prompt 120 established a binary `discard` at `age >= lifetime`; adding a smooth alpha fade would need blending the particle material (most presets already use `AdditiveBlending`/`NormalBlending`, which is compatible) plus threading `age/lifetime` into an opacity term in the fragment shader — a real, scoped feature Prompt 121 didn't ask for. All six presets (`dust`/`sparks`/`smoke`/`confetti`/`dataStream`/`dissolve`) inherit this: they read as a hard pop rather than the smooth fade a "smoke" or "dust" look would ideally have.
- **Revisit when:** A concrete example's visual quality bar requires it — thread `1.0 - age/lifetime` (or a caller-suppliable fade curve) into `gl_FragColor.a` and switch the shared material's `transparent` flag on.

### ☐ Preset-added behaviors are keyed by behavior name, not by preset — two presets both using e.g. `wind` overwrite each other
- **Where:** `src/postfx/particles/presets.js`, `ParticleSystem.addBehavior`
- **Why skipped:** `addBehavior`/`removeBehavior`/`configureBehavior` are keyed by the six fixed behavior names (`gravity`/`wind`/`attract`/`repel`/`curl`/`swirl`) — a deliberate simplicity choice (CLAUDE.md §1.2 KISS) matching how `PostFX.registerPass` is keyed by pass name, not by caller. Calling `system.preset('dust')` then `system.preset('smoke')` means `smoke`'s `wind` settings silently replace `dust`'s, since both target the same `'wind'` slot — there's no per-preset namespacing. This only matters when applying multiple presets *to the same `ParticleSystem` instance* that both touch the same behavior name; using one preset per system (the common case — e.g. a dedicated "rain" system and a separate "sparks" system) is unaffected.
- **Revisit when:** A concrete example needs multiple co-active presets on one system with genuinely independent forces — would need per-source behavior namespacing (e.g. compound keys) or documented guidance to use separate `ParticleSystem` instances per look, which is likely the better answer regardless.

### ☐ `sampleMeshSurface` samples a mesh's rest-pose geometry, not its currently-posed (skinned/morphed) shape
- **Where:** `src/postfx/particles/meshSampling.js`
- **Why skipped:** Reading a `SkinnedMesh`'s or morph-targeted mesh's *currently deformed* vertex positions requires either a CPU-side skinning/morphing evaluation (real, non-trivial math) or a GPU readback of the already-skinned vertex buffer (not straightforwardly available from JS for a `THREE.SkinnedMesh`) — well beyond what `spawnAt`/the `dissolve` preset need for the charts this library targets (static/data-driven meshes, not animated character rigs). `sampleMeshSurface` reads `geometry.attributes.position` directly, which is the bind/rest pose for a skinned mesh.
- **Revisit when:** A concrete example needs `spawnAt`/`dissolve` on an animated (skinned or morphed) mesh — at that point, baking the current pose into a temporary static geometry before sampling (a real, if expensive, technique) would be the fix.

### ☐ `chart.exitAnimation('dissolve')` (Prompt 122's other half) isn't wired — `GraphChart` doesn't exist yet
- **Where:** N/A — no `src/chart/` yet.
- **Why skipped:** Prompt 122 asks for two things: `Selection.exit().remove('dissolve')` (implemented — see `Selection.remove(animationName, options)`, `src/compose/selection/Selection.js`) and `chart.exitAnimation('dissolve')`. The latter requires `GraphChart`, which is Prompt 127+ (Phase 8), five prompts after this one in the sequence — there is nothing to wire it to yet. `Selection.remove(animationName, options)` takes `options.system` (a particle system exposing `.preset(name, opts)`, duck-typed — `compose/` must not import `postfx/` per CLAUDE.md §1.4, and `Selection` has no scene/camera/renderer of its own to construct one itself) rather than resolving a system implicitly, precisely because that implicit "the chart already knows its own scene/camera/renderer/postfx" resolution is what `GraphChart.exitAnimation` will provide once it exists — building that resolution mechanism now, ahead of `GraphChart`, would mean inventing scaffolding for a consumer that isn't there yet (YAGNI).
- **Revisit when:** Prompt 127+ builds `GraphChart` — add `chart.exitAnimation(name)` storing a default animation name, consumed by the chart's own `update()`/exit-join path (Prompt 130) which already has direct access to its `postfx`-obtained `ParticleSystem`; it should call the same `Selection.remove(animationName, { system, ...opts })` path added here, not a second implementation.

---

## Phase 0 (pre-Phase-4) — carried over from `.claude/TODO.md`

These are tracked in full detail in `.claude/TODO.md`; listed here only as a
pointer so this file is a complete index of open items:

- ☐ Missing built-in HDR binary assets (`studio-1k`/`cinema-night`/`daylight`) — Phase 2, Prompt 27.
- ☐ `npm run build` fails — un-externalized `three/examples/jsm/*` dynamic imports force Rollup code-splitting the current `rollup.config.js` doesn't support.
- ☐ `Graph3D`'s `hdr`/`theme` constructor options are stored but never consumed by `GraphScene`.
- ☐ No bundled Draco/KTX2 decoder assets (Phase 3, Prompt 43).
- ☐ `GraphInstancedObject`'s internal octree has a fixed `±10,000` default bounds, not data-driven or validated at write time (Phase 3, Prompt 45).
- ☐ `'volumetric-low'` fog preset falls back to exponential fog with a `console.warn` and isn't wired to any postfx pass (`src/scene/GraphSceneEnvironment.js`) — `'volumetric-cinematic'` was resolved in Phase 7 Prompt 118 (auto-activates the `godRays` pass); see that phase's section above for the remaining fog-is-always-exponential scope note.

---

## How to use this file going forward

After every implemented prompt, before closing out: grep `src/` for new
`ponytail:` comments introduced in that prompt's diff, and add an entry here
if the simplification is a *feature* gap (something a future prompt or user
request would complete) rather than a permanent design choice (e.g. an
intentional swallow-and-log in a panic-disposal path is not a skip — it's
correct forever, don't list those).
