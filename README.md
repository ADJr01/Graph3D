# Graph3D.js

[![CI](https://github.com/ADJr01/Graph3D/actions/workflows/ci.yml/badge.svg)](https://github.com/ADJr01/Graph3D/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status: pre-release](https://img.shields.io/badge/status-pre--release%20(v0.1.0)-orange.svg)](#project-status)

**D3-flavored. GPU-instanced. Cinematic by default.**

Graph3D.js is a developer-first 3D data visualization framework that treats
charts as fully inspectable, fully controllable [Three.js](https://threejs.org)
scenes — not black-box widgets. It ports D3's `enter`/`update`/`exit` data-join
model onto real `THREE.Object3D`s, renders through automatic GPU instancing
once a chart crosses a measured datum-count threshold (millions of points,
not thousands), and ships cinematic defaults (ACES tone mapping, PCF-soft
shadows, camera presets, postfx passes) as a one-line default instead of a
week of manual tuning. Every layer stays inspectable via `.three`, `.scene`,
`.camera.three` — nothing is ever locked behind the fluent API.

```js
import { Graph3D, BarChart, scale } from 'graph3d.js';

const g = new Graph3D({ canvas: document.querySelector('canvas') });
const scene = g.createScene('main');
g.setActiveScene(scene);

const x = scale.band().domain(['A', 'B', 'C', 'D']).range([-6, 6]).paddingInner(0.3);
const y = scale.linear().domain([0, 100]).range([0, 6]);

new BarChart(scene.three)
  .x((d) => d.category, x)
  .y((d) => d.value, y)
  .color((d) => d.value)
  .data(
    [
      { category: 'A', value: 42 },
      { category: 'B', value: 88 },
      { category: 'C', value: 15 },
      { category: 'D', value: 67 },
    ],
    (d) => d.category,
  )
  .render();
```

That's a complete, renderable scene — no build step beyond bundling your own
app, no canvas-2D fallback, no hidden global state.

## Why Graph3D.js?

Most charting libraries make you choose: the ergonomics of a data-join API
*or* a real, inspectable 3D scene — not both. D3 owns the data-join model but
stops at SVG/Canvas. ECharts GL renders real 3D but hides it behind a
declarative config object with no scene-graph access. Raw Three.js gives you
the whole scene, but no data model, no instancing decision, no chart types —
just primitives.

Graph3D.js's bet is that four pillars belong together, not traded off against
each other:

- **D3-style joins & selections** — `enter`/`update`/`exit`, keyed data joins,
  and a fluent `Selection` API (`attr`/`style`/`filter`/`transition`) — the D3
  mental model, built on Three.js instead of the DOM.
- **Instanced by default** — charts render through `GraphInstancedObject`
  (one `InstancedMesh` per chart) once past a measured threshold (50 datums)
  — millions of datums, not thousands.
- **Cinematic defaults** — ACES tone mapping, PCF-soft shadows, camera
  presets, curated themes, and postfx passes (bloom, DOF, SSAO, film grain)
  out of the box.
- **Fully inspectable escape hatches** — every layer exposes its raw
  Three.js objects (`.three`, `.scene`, `.camera.three`) so nothing is ever
  locked behind the fluent API.

See `site/comparison.md` (build the docs to read it rendered — see
[Documentation](#documentation)) for an honest table of where each
alternative is still the better choice. This project is `v0.1.0` and doesn't
pretend otherwise — see [Project status](#project-status).

## Install

Graph3D.js has a single peer dependency on `three` and is not yet published
to npm (see [Project status](#project-status)). Until it is, install directly
from this repository:

```bash
npm install github:ADJr01/Graph3D three
```

```js
import { Graph3D, BarChart, scale } from 'graph3d.js';
```

This resolves to `src/index.js` — plain, tree-shakeable ESM, exactly what a
bundler-based project (Vite, webpack, Rollup, esbuild, Next.js, …) wants.
TypeScript users get full types automatically from `types/index.d.ts`.

### Using the prebuilt release bundle (no bundler)

The [`dist/`](dist/) directory is a committed, tested release build — usable
with no build step and no npm install. `three` (r150+) only ships native ES
module builds, no global/UMD build, so the no-bundler path uses an
[import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap)
with the **ESM** bundle rather than the UMD one:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.185.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.185.0/examples/jsm/",
    "three/examples/jsm/": "https://unpkg.com/three@0.185.0/examples/jsm/"
  }
}
</script>
<script type="module">
  import { Graph3D, BarChart, scale } from './dist/graph3d.esm.min.js';

  const g = new Graph3D({ canvas: document.querySelector('canvas') });
  // ...
</script>
```

The `three/addons/` and `three/examples/jsm/` entries are both required, not
just `three` itself — the postfx layer (bloom, DOF, SSAO, …) and thick-line
rendering import Three.js's optional addons directly (e.g.
`three/addons/postprocessing/EffectComposer.js`), and `three`'s own
package.json only aliases `addons/*` to `examples/jsm/*` for tools that
understand Node's `exports` field (bundlers) — a raw static host like unpkg
has no physical `addons/` directory, so the import map has to redirect it
itself.

| File | Format | Use case |
|---|---|---|
| `dist/graph3d.esm.js` | ESM, unminified | Debugging a bundler or import-map integration |
| `dist/graph3d.esm.min.js` | ESM, minified | Bundlers, or the plain `<script type="module">` + import-map path above |
| `dist/graph3d.umd.js` | UMD, unminified | Legacy toolchains that already provide a global `THREE` |
| `dist/graph3d.umd.min.js` | UMD, minified | Same, minified — exposes the `Graph3D` global |

`three` stays an external peer dependency in every artifact (it is never
bundled in) — provide it yourself, matching the `peerDependencies` range in
[`package.json`](package.json). The UMD build exists for legacy non-module
toolchains that supply their own `window.THREE`; for anything running in a
modern browser or bundler, prefer the ESM build.

The bundle is regenerated and re-verified by `npm run release` (see
[Development](#development)) — see `dist/stats.html` (gitignored, generated
locally by `npm run build`) for a treemap of what's inside.

## Updating data

Calling `.data(newRows, keyFn)` again and `.update()` re-joins against the
live chart — entering rows animate in, updating rows tween to their new
values, and departing rows dissolve out by default:

```js
chart.data(nextRows, (d) => d.category);
chart.update();
```

This is the same enter/update/exit mental model as D3's own `.data().join()`.

## Architecture

The codebase is organized into ten strictly-ordered layers — a layer may
only import from layers **below** it, never sideways or above (enforced by
`madge`/`dpdm` circular-dependency checks in CI):

| Layer | Owns |
|---|---|
| `core` | Renderer, animation loop, registry, capability detection, workers, frame budget |
| `scene` | Scene composition: cameras, lights, environment, shadows, clip planes |
| `object` | Object/mesh wrappers, GPU instancing, octree picking, loaders |
| `compose` | Scales, generators, layouts, palettes, axes, annotations, D3-style selections |
| `anim` | Animation engine, timelines, transitions, easing |
| `material` | Material presets, SDF text, HTML/icon billboards, procedural textures |
| `postfx` | Post-processing passes (bloom, DOF, SSAO, film grain), particle systems |
| `chart` | The 11 chart types, data binding |
| `interact` | Picking, state machine, tooltips, brush, lasso, keyboard nav |
| `stream` | Live data streams, workers, LOD, GPGPU, aggregation |

Full rules for this layering (and everything else about how this codebase is
built) live in [`CLAUDE.md`](CLAUDE.md).

### Chart types

`BarChart`, `LineChart`, `ScatterChart`, `AreaChart`, `SurfaceChart`,
`HeatmapChart`, `NetworkChart`, `TreeChart`, `PackChart`, `PieChart`,
`VolumeChart` — each extends the shared `GraphChart` base and defaults to
instanced rendering above the 50-datum threshold.

## Documentation

The full documentation site is built from `site/` with VitePress:

```bash
npm run docs:dev      # local docs site at http://localhost:5173
npm run docs:build    # static production build
```

- **Getting Started** (`site/getting-started.md`) — install, first chart, updating data
- **Concepts** (`site/concepts/`) — one page per architectural layer, each with runnable snippets
- **API Reference** (`site/api/`) — auto-generated from JSDoc, one page per public class (`npm run docs:api` regenerates it)
- **Chart Types** (`site/chart-types/`) — all 11 chart types and which concepts they lean on
- **Recipes** (`site/recipes/`) — end-to-end walkthroughs (live streaming data, million-point scatter plots, custom shaders, camera tours)
- **Comparison** (`site/comparison.md`) — an honest table of where D3/ECharts GL/raw Three.js are still the better choice
- **Migration** (`site/migration/`), **Performance** (`site/perf.md`), **Accessibility** (`site/accessibility.md`), **Troubleshooting** (`site/troubleshooting.md`), **Cheatsheet** (`site/cheatsheet.md`)

## Examples

Every concept page's snippets have a runnable counterpart under
[`examples/`](examples/) — 25 numbered examples covering every chart type
plus scenes, instancing, materials, postfx, transitions, interaction, live
streaming data, and icon/HTML billboards, plus an interactive `playground`.
Run any of them directly:

```bash
npx vite examples/08-bar-chart --config vite.config.js
npm run dev   # shortcut for examples/playground specifically
```

## Development

```bash
git clone git@github.com:ADJr01/Graph3D.git
cd Graph3D
npm install

npm test              # vitest — 215 files, 3352 tests
npm run test:watch    # vitest, watch mode
npm run test:coverage # vitest with coverage (thresholds: lines ≥85%, branches ≥80%, functions ≥85%)
npm run lint           # eslint src
npm run lint:circular   # dpdm — fails on any circular import in src/
npm run typecheck       # tsc --noEmit — checks types/index.d.ts against src/ for drift
npm run test:types      # tsd — types/index.d.ts checked against real usage (test-d/)
npm run build            # rollup — ESM + UMD, unminified and minified
npm run bundle:budget    # asserts the full bundle and a tree-shaken bar-chart-only bundle stay under budget
npm run verify:dist      # smoke-tests the built dist/ artifacts (export surface + minified functional checks)
npm run release          # the full gate above, in order — lint → typecheck → test:types → test → build → bundle:budget → verify:dist
```

`npm run release` is the single command that reproduces everything CI checks
before a `dist/` rebuild is committed — run it before committing any change
to `dist/`.

### Testing discipline

- **Unit + integration**: 215 test files, 3352 tests, run under `vitest` with `jsdom`.
- **Disposal contract**: every class holding GPU/DOM resources has a dedicated leak test under `tests/integration/*-disposal.test.js` (1,000 create/dispose cycles, structural assertions — not `renderer.info.memory` polling, which isn't meaningfully populated under `jsdom`'s stubbed WebGL context).
- **Type tests**: `tsd` checks `types/index.d.ts` against real call sites in `test-d/`; `typecheck` separately catches drift between `src/`'s JSDoc types and the hand-written `.d.ts`.
- **Bundle budget**: CI fails if the full library (minified + gzipped, `three` excluded as a peer dep) exceeds 200 KB, or if a tree-shaken bar-chart-only entry point exceeds 50 KB or still contains any of the other ten chart classes.
- **Dist verification**: `verify:dist` imports the actual built `dist/graph3d.esm(.min).js` artifacts (not `src/`) and asserts their export surface matches `src/index.js` exactly and a handful of representative functions (`scale.linear`, `color.categorical`, `resolve('linear')`, …) still behave correctly after minification.

See [`CLAUDE.md`](CLAUDE.md) for the complete engineering rules this project
holds itself to (DRY/KISS/YAGNI, the disposal contract, the layered
architecture, fail-fast error handling).

## Project status

`v0.1.0` — pre-release. Every feature documented above is real, shipped code
with tests and docs; `site/comparison.md` is deliberately honest about what's
*not* here yet. The library is developed and tested in this repository and
committed to git (including the `dist/` release build, so it can be reviewed
and consumed without a build step) — it is **not yet published to npm**.
Publishing will happen once the maintainer is satisfied with the release
build under real use. See [`CHANGELOG.md`](CHANGELOG.md) for what shipped in
`v0.1.0`.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the development setup, the
layered architecture rules, and the checklist for adding a new chart type or
material preset.

## License

[MIT](LICENSE)
