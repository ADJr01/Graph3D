# Deferred work, observed refactors, unreproducible bugs

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

## `GraphMesh.material`/`GraphInstancedObject.material` return the raw THREE.Material, not GraphObjectMaterial (Phase 3, Prompt 46)

Prompt 46 asked for these lazy getters to return a `GraphObjectMaterial`
wrapper (Phase 6, `src/material/`). Since `object/` (Phase 3) cannot import
from `material/` (Phase 6) without violating the layering rule in
`CLAUDE.md` §1.4 (a lower layer must not depend on a higher one), both
getters currently return the raw `THREE.Material`/`THREE.Material[]`
instead. Once `src/material/GraphObjectMaterial.js` exists, update both
getters (`src/object/GraphMesh.js`, `src/object/GraphInstancedObject.js`) to
wrap and return that instead — `material/` importing `object/` types is the
allowed direction, so the actual wiring belongs in Phase 6's own work, not
retrofitted from Phase 3.
