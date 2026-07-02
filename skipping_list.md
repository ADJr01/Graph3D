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

### ☐ `GraphMesh`/`GraphInstancedObject.material` returns raw `THREE.Material`, not a `GraphObjectMaterial` wrapper
- **Where:** `src/object/GraphMesh.js` (`get material()`), `src/object/GraphInstancedObject.js` (`get material()`)
- **Why skipped:** Prompt 46 asked for a `GraphObjectMaterial` wrapper (Phase 6), but `object/` cannot import from `material/` (a higher layer, CLAUDE.md §1.4). Returning the raw material was the only layer-compliant option until `material/` exists.
- **Revisit when:** `src/material/GraphObjectMaterial.js` exists (Phase 6). Full detail already tracked in `.claude/TODO.md`.

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

### ☐ `Selection.attr('opacity', ...)` has no visual effect on the instanced backend yet
- **Where:** `src/compose/selection/attr.js:90` (`applyOpacity`)
- **Why skipped:** Per-instance opacity requires a shader that reads a custom attribute — that's the Phase 6 `dataDriven` material (Prompt 106), not built yet. `attr('opacity', ...)` on an instanced backend today only writes the value into an auto-defined `'opacity'` instance attribute (real data plumbing, ready for Prompt 106 to consume) — nothing renders it differently until then.
- **Revisit when:** Prompt 106 (`presets/dataDriven.js`) is implemented — confirm it reads the `'opacity'` attribute this code already writes, and add a real visual-effect test.

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

### ☐ `Selection.style('emissiveIntensity', ...)` has no visual effect on the instanced backend yet
- **Where:** `src/compose/selection/style.js:71`
- **Why skipped:** Same root cause as the existing `attr('opacity', ...)` entry above — the value lands in a real per-instance attribute, but no shader reads it until the Phase 6 `dataDriven` material (Prompt 106) exists.
- **Revisit when:** Prompt 106 is implemented — confirm it reads `emissiveIntensity` too, not just `opacity`.

### ☐ `Selection.style()` on a material-global prop collapses a per-datum accessor to one shared-material write
- **Where:** `src/compose/selection/style.js` (the fallback branch after the `color`/`opacity`/`emissiveIntensity` checks)
- **Why skipped:** The instanced backend's members all share ONE `THREE.Material` — a per-datum `(d, i) => value` accessor has no way to vary a true material-global property (e.g. `roughness`) per instance without a per-property custom attribute the Phase 6 `dataDriven` material would need to read. Resolves the accessor once (from the first datum) and warns via `console.warn` rather than silently keeping only the last-resolved value.
- **Revisit when:** A prompt asks for per-instance-capable coverage of additional material properties beyond `color`/`opacity`/`emissiveIntensity` (would need a new per-property attribute + Phase 6 shader read, mirroring `emissiveIntensity`'s path).

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

## Phase 0 (pre-Phase-4) — carried over from `.claude/TODO.md`

These are tracked in full detail in `.claude/TODO.md`; listed here only as a
pointer so this file is a complete index of open items:

- ☐ Missing built-in HDR binary assets (`studio-1k`/`cinema-night`/`daylight`) — Phase 2, Prompt 27.
- ☐ `npm run build` fails — un-externalized `three/examples/jsm/*` dynamic imports force Rollup code-splitting the current `rollup.config.js` doesn't support.
- ☐ `Graph3D`'s `hdr`/`theme` constructor options are stored but never consumed by `GraphScene`.
- ☐ No bundled Draco/KTX2 decoder assets (Phase 3, Prompt 43).
- ☐ `GraphInstancedObject`'s internal octree has a fixed `±10,000` default bounds, not data-driven or validated at write time (Phase 3, Prompt 45).
- ☐ Volumetric fog presets (`'volumetric-low'`/`'volumetric-cinematic'`) fall back to exponential fog with a `console.warn` until the Phase 7 god-rays postfx pass exists (`src/scene/GraphSceneEnvironment.js:448`).

---

## How to use this file going forward

After every implemented prompt, before closing out: grep `src/` for new
`ponytail:` comments introduced in that prompt's diff, and add an entry here
if the simplification is a *feature* gap (something a future prompt or user
request would complete) rather than a permanent design choice (e.g. an
intentional swallow-and-log in a panic-disposal path is not a skip — it's
correct forever, don't list those).
