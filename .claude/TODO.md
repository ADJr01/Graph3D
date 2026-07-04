# Deferred work, observed refactors, unreproducible bugs

## `types/index.d.ts` has never existed (noticed during Phase 5, Prompts 86–90)

CLAUDE.md §4's Definition of Done requires "Public API additions are reflected
in `types/index.d.ts`," and JSDoc is described as "checked against
`types/index.d.ts` in CI" (§1.6). No such file exists anywhere in the repo —
not for Phase 1–4's public API either, so this predates Phase 5 and isn't
specific to it. Every phase so far has shipped its public surface via JSDoc
+ `src/index.js`/layer `index.js` exports only. Not resolved during Phase 5:
deciding whether to hand-write it, generate it from JSDoc (e.g. via
`tsc --emitDeclarationOnly --allowJs`), or drop that Definition-of-Done line
is a call bigger than one prompt's scope.

## Missing built-in HDR binary assets (Phase 2, Prompt 27)

`GraphSceneEnvironment`'s built-in preset names (`studio-1k`, `cinema-night`, `daylight`)
resolve to `src/scene/env/*.hdr`, but those `.hdr` files were never added to the
repo. Any `applyTheme()`/`setHDR()` call that needs one currently rejects with a
file-not-found error (caught and surfaced, not silent). Add the three `.hdr`
files under `src/scene/env/` to make every built-in theme/HDR preset load.

## `npm run build` fails (pre-existing, unrelated to Phase 2)

`npx rollup -c` errors with `Invalid value for option "output.file" - when
building multiple chunks, the "output.dir" option must be used`. Root cause:
un-externalized dynamic imports of `three/examples/jsm/{controls/OrbitControls,
csm/CSM,loaders/RGBELoader}.js` (Prompts 23/26/27) force Rollup into
code-splitting, which the current single-`output.file` config in
`rollup.config.js` doesn't support. Needs `output.dir` + externalizing those
`three/examples/jsm/*` specifiers (or switching to `output.manualChunks`)
before the next production build is attempted.

## `Graph3D`'s `hdr`/`theme` constructor options are stored but never consumed

Per Prompt 17, `new Graph3D({ hdr, theme, ... })` stores both as plain public
fields (`src/core/Graph3D.js` lines ~109-110), with a comment saying they're
"stored for higher layers: hdr → GraphSceneEnvironment (Phase 2), theme →
material presets (Phase 6)." Nothing in Phase 2 actually reads `graph3d.hdr`
or `graph3d.theme` — `GraphScene`'s constructor builds a bare
`GraphSceneEnvironment` without ever calling `setHDR(graph3d.hdr)`. The
constructor's own `@example` (`new Graph3D({ canvas, hdr: '/env/studio.hdr',
theme: 'studio-dark' })`) implies this does something; right now it's a
silent no-op. Either wire `GraphScene`'s constructor to call
`environment.setHDR(graph3d.hdr)` when set, or correct the JSDoc/example to
stop implying it's applied automatically. Deliberately not resolved during
the Phase 2 audit — deciding whether "auto-apply on scene creation" is
in-scope behavior vs. scope creep is a call for whoever owns Phase 2 sign-off.

## No bundled Draco/KTX2 decoder assets (Phase 3, Prompt 43)

`GraphObjectLoader.loadGLTF` wires up `DRACOLoader`/`KTX2Loader` on the
`GLTFLoader` instance, but only once the consumer calls
`GraphObjectLoader.configureDracoDecoder(path)` /
`configureKTX2Transcoder(path, renderer)` — this package doesn't bundle the
decoder/transcoder binaries (`draco_decoder.wasm`, the Basis transcoder
files, etc.), mirroring the missing-HDR-assets gap above. Without
configuration, loading a Draco- or KTX2-compressed `.glb` will fail with
`GLTFLoader`'s own error (e.g. "no DRACOLoader instance provided") rather
than silently falling back. Decide whether to (a) document that consumers
must host and point to these files themselves (the standard three.js app
pattern), or (b) bundle copies from `three/examples/jsm/libs/{draco,basis}/`
under this package and default to them.

## `GraphInstancedObject`'s internal octree has a fixed default bounds (Phase 3, Prompt 45)

`GraphInstancedObject`'s internal `Octree` defaults to `±10,000` units on each
axis (`DEFAULT_OCTREE_BOUNDS` in `src/object/GraphInstancedObject.js`),
overridable via `options.octreeBounds`. An instance positioned outside these
bounds may not reliably surface from `pick()`/frustum-culling queries (the
tree's node bounds never geometrically reach it) — not enforced or
validated at `setInstancePosition`/`setInstanceMatrix` time, so this would
fail silently rather than throwing. Revisit once Phase 4's scales establish
what coordinate ranges charts actually produce — the default may need to be
data-driven instead of a fixed guess, or `setInstancePosition` should assert
the position falls within the configured octree bounds (Fail Fast) instead
of silently degrading query accuracy.

## `GraphMesh.material`/`GraphInstancedObject.material` return the raw THREE.Material, not GraphObjectMaterial (Phase 3, Prompt 46) — RESOLVED, permanently, not as originally framed

Prompt 46 asked for these lazy getters to return a `GraphObjectMaterial`
wrapper (Phase 6, `src/material/`). Since `object/` (Phase 3) cannot import
from `material/` (Phase 6) without violating the layering rule in
`CLAUDE.md` §1.4 (a lower layer must not depend on a higher one), both
getters currently return the raw `THREE.Material`/`THREE.Material[]`
instead.

**Resolved during Phase 6 (Prompt 100), but not the way this note originally
assumed:** `src/material/GraphObjectMaterial.js` now exists, and it does wrap
a `GraphMesh`/`GraphInstancedObject` — but the wrapping happens by
*constructing* `new GraphObjectMaterial(mesh)` from the caller's side
(`material/` importing `object/`, the allowed direction), not by changing
what `mesh.material`/`object.material` themselves return. Those two getters
will **never** return a `GraphObjectMaterial` — that direction of import
(`object/` → `material/`) is permanently forbidden, not a temporary gap
waiting on Phase 6. See `skipping_list.md`'s Phase 3 section for the
corresponding entry.

## Missing bundled Roboto MSDF text atlas (Phase 6, Prompt 108)

`src/material/text/SDFText.js`'s `SDFText.create()` lazy-loads
`src/material/text/assets/roboto-msdf.png` (the multi-channel signed-distance
atlas image) and `roboto-msdf.json` (BMFont-style glyph metrics) — neither
file exists in this repo. Same category of gap as the missing HDR assets
above: generating a real MSDF atlas needs an actual font-to-MSDF tool (e.g.
`msdf-bmfont-xml`) run against a Roboto TTF, neither of which is available in
this environment. `SDFText.create()` rejects with a clear, actionable error
identifying exactly what's missing and where it's expected — it does not
silently render blank/broken text. The rendering/layout engine itself
(atlas loading + caching, per-glyph quad layout with kerning/letterSpacing/
align, an MSDF shader with outline/glow support) is fully built and unit
tested against a mock atlas; only the real binary asset is missing. Add the
two files under `src/material/text/assets/` to make real text rendering
work.

Downstream consequence: Prompt 109 ("wire SDF text into Phase 4 Axis
labels") could not be completed as literally specified — `Axis.render()` and
`annotation.label()` are both synchronous today, and `SDFText.create()` is
necessarily async (loading a texture + JSON is inherently asynchronous), so
wiring them together would require either (a) an API-breaking `Axis.render()`
becoming async (touching every existing sync call site, test, and example
across Phases 4/5), or (b) a "render sync now, upgrade to real SDF text
asynchronously when ready" two-phase design. Given the atlas is missing
regardless of which design is picked — text can't actually render either way
right now — the stub (`{type:'label', text, position, style}`) was left in
place rather than taking on either risk for a feature that can't be visually
confirmed yet. Revisit once the atlas assets above are added and a concrete
decision is made on sync vs. async `Axis`/`annotation.label` semantics.
