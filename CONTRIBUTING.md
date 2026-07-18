# Contributing to Graph3D.js

Graph3D.js is a D3-flavored, GPU-instanced, cinematically-rendered 3D data
visualization framework built on Three.js. It's early (`v0.1.0`, pre-1.0) —
see `site/comparison.md`'s "honest table" for exactly where it stands today
(build the docs site with `npm run docs:dev` to read it rendered). Contributions are welcome; this document
covers how the codebase is organized, how to add the two most common kinds
of new code (a chart type, a material preset), and what every contribution
is expected to satisfy before it's mergeable.

## Development setup

```sh
npm install
npm test              # vitest, watch mode off
npm run lint           # eslint src
npm run typecheck      # tsc --noEmit against types/index.d.ts
npm run test:types     # tsd — types/index.d.ts checked against real usage
npm run build           # rollup — ESM/UMD + minified variants
npm run docs:dev        # local docs site at http://localhost:5173
```

`npm run dev` boots the playground example (`examples/playground/`) for
interactive, hot-reloading manual testing against a real scene.

## The layered architecture

The codebase is organized into ten strictly-ordered layers — a layer may
only import from layers **below** it, never sideways (except through a
documented, narrow exception) or above. This is enforced by
`madge --circular src/` and explained in full in `CLAUDE.md` §1.4; the short
version:

`core` → `scene` → `object` → `compose` → `anim` → `material` → `postfx` →
`chart` → `interact` → `stream`

If you're not sure which layer a change belongs in, look at what it needs to
import — that determines the floor, not the ceiling, of where it can live.

## Adding a new chart type

1. Create `src/chart/<Name>Chart.js`, extending `GraphChart`
   (`src/chart/GraphChart.js`) — the shared base providing `data()`, the
   per-datum accessor fields (`x()`/`y()`/`z()`/`color()`/`size()`/...),
   `.material()`, `.transition()`, lifecycle events, and disposal.
2. Compose your rendering logic from what already exists one layer down:
   `compose/scale` for domain-to-range mapping, `compose/generator` for
   buffer computation, `compose/layout` for positioning algorithms. Don't
   re-implement scale/color/layout math inline — every existing chart type
   composes these instead of hand-rolling them (CLAUDE.md §1.1 DRY).
3. Default to instanced rendering. `GraphObjectFactory` (`src/object/`)
   already dispatches on datum count against `INSTANCING_THRESHOLD`
   (default 50) to choose a `GraphMesh[]` or one `GraphInstancedObject` —
   reuse it rather than writing a second instancing decision.
4. Implement `render()` (first-call materialization — builds the backend
   from scratch), `update()` (subsequent calls — diffs against the
   previously-bound data via the same `Selection.data().join()`/`diffData`
   machinery every other chart type uses), and `destroy()` (disposes
   everything this chart created). See `src/chart/BarChart.js` for the
   shortest real example of all three.
5. Register the type in `Graph3D`'s chart-type dispatch: add the import and
   a `['typeName', YourChart]` entry to the `#chartTypes` map at the top of
   `src/core/Graph3D.js`, so `g.chart('typeName')` resolves to it.
6. Add unit tests (`tests/chart/<Name>Chart.test.js`), an integration test
   exercising both backends (`tests/integration/<Name>Chart.test.js`), a
   live example under `examples/`, and a section on `site/concepts/chart.md`
   documenting what's inherited from `GraphChart` versus overridden, and
   what (if anything) is inert for this particular type.

## Adding a new material preset

1. Create `src/material/presets/<name>.js`, exporting a factory function
   that returns a configured `THREE.Material`.
2. Import and add it to the `material` namespace object in
   `src/material/index.js` (a plain object literal — no separate registry to
   update).
3. Add a gallery entry to `examples/06-materials/` so the preset is visually
   verifiable, not just unit-tested.
4. Add a disposal/leak test — repeated construct-and-dispose cycles should
   leave `renderer.info.memory.geometries`/`.textures` at baseline. See any
   existing `tests/integration/*-disposal.test.js` file for the pattern.

## The disposal contract

Any class that creates GPU resources, DOM resources, RAF callbacks,
observers, or event listeners **must**:

1. Implement `dispose()` releasing every resource it created.
2. Be idempotent — calling `dispose()` twice must not throw.
3. Make every public method either throw `"...has been disposed"` or become
   a documented no-op after `dispose()`.
4. Have a leak test that constructs and disposes the class many times (the
   convention in this repo is 1000 iterations) and asserts
   `renderer.info.memory.geometries`/`.textures` return to their baseline.
5. Be disposed by its parent's own `dispose()` — a chart's `destroy()` calls
   into its backend's disposal; `GraphScene.dispose()` disposes every child
   object it owns; `Graph3D.dispose()` disposes every scene.

"I'll add disposal later" doesn't ship — see `CLAUDE.md` §3 for the full
contract and rationale (Three.js resources aren't garbage-collected the way
plain JS objects are; an undisposed `GraphInstancedObject` or texture leaks
real GPU memory for the life of the page).

## Before opening a pull request

- `npm test`, `npm run lint`, `npm run typecheck`, and `npm run test:types`
  all pass.
- New public methods have complete JSDoc (`@param`, `@returns`, `@throws`,
  and at least one `@example` for anything non-trivial) — this is checked
  against `types/index.d.ts` in CI, not just a style preference.
- New public exports appear in `types/index.d.ts` and in the appropriate
  layer's `src/<layer>/index.js`.
- Coverage thresholds aren't regressed (`npm run test:coverage`: ≥85% lines,
  ≥80% branches, ≥85% functions).
- No `console.log`, no swallowed errors (`.catch(() => {})` / empty `catch`
  blocks), no new hardcoded magic numbers without a named constant.
- If you touched a public-facing concept, the relevant page under `site/`
  is updated alongside the code — a change is not done until the docs agree
  with it.

Keep pull requests scoped to one concern. A bug fix doesn't need a
drive-by refactor of the file it's in; a new chart type doesn't need to also
"clean up" an unrelated one. If you notice something else worth fixing while
you're in there, mention it in the PR description rather than folding it in.

## License

Graph3D.js is MIT-licensed (see `package.json`). By contributing, you agree
your contribution is provided under the same license.
