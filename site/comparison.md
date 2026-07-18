# Comparison

An honest table, not a marketing one — every row below names something the
alternative genuinely does better, not just what Graph3D.js does. If you're
choosing between these, the [migration guides](/migration/) go deeper on
each: [D3](/migration/from-d3), [ECharts GL](/migration/from-echarts-gl),
[raw Three.js](/migration/from-raw-three).

| | D3 | ECharts GL | Raw Three.js | Graph3D.js |
|---|---|---|---|---|
| **Renders via** | SVG/Canvas 2D — no real 3D | WebGL, its own renderer | WebGL, whatever you build | WebGL via Three.js |
| **Data model** | Native `enter`/`update`/`exit` joins — the original | Declarative `setOption(option)`, re-diffed internally | None — you own the whole data→scene pipeline | `Selection.data().join()` — the same enter/update/exit model, ported to 3D |
| **Scaling to large datasets** | DOM node per element — thousands is realistic, millions is not | Has its own GL-accelerated series types for real scale | Entirely manual — `InstancedMesh` is yours to wire up | Automatic: `GraphInstancedObject` above 50 datums, one draw call regardless of count |
| **Escape hatch to raw primitives** | Full DOM access, always — it's what you're already using | None — configuration-only, no scene graph exposed | It *is* the primitive — nothing to escape to | `.three`/`.scene`/`.camera.three` at every layer — see [Core](/concepts/core) |
| **Built-in cinematic rendering** | None — SVG has no lighting, shadows, or post-processing | Some lighting/shading modes; no full post-processing pipeline | None — you assemble `EffectComposer` yourself | ACES tone mapping, PCF-soft shadows, 8 curated themes, 12 postfx passes / 7 presets, out of the box |
| **Built-in chart types** | None — the ecosystem is primitives + plugins | ~8 3D series types (`bar3D`, `scatter3D`, `surface`, `line3D`, `lines3D`, `graphGL`, `map3D`/`globe`, `flowGL`) | None | 11 (see [Chart Types](/chart-types/)) — no map/globe type yet |
| **Accessibility** | Manual, but straightforward — it's real DOM/ARIA already | Some built-in ARIA decoration | Entirely manual | `setAriaLabel`/`setLongDescription`, `KeyboardNav` — see [Accessibility](/accessibility) |
| **TypeScript** | Mature, widely-used `@types/d3` | Ships its own types | Mature `@types/three` | `types/index.d.ts`, `tsd`-tested against real usage — see [Core](/concepts/core) |
| **Bundle size** | Small and modular by design — import only the d3-* packages you use | A general-purpose charting library covering 2D and 3D alike — larger than a 3D-only library by scope, not by inefficiency | Core plus whichever addons you import | 200 KB full library / 50 KB single-chart-type, minified+gzipped, CI-enforced |
| **Maturity** | 10+ years, enormous community, the reference implementation of the data-join idea | Apache-backed, widely deployed, large community | The standard 3D web library — the biggest ecosystem here by far | **v0.1.0 — pre-1.0, no production track record yet** |

## The four pillars, honestly

**D3-style joins & selections.** Graph3D.js's `Selection` is a deliberate,
close port of D3's `.data().join()` — not "D3-inspired," but the same
enter/update/exit mental model, the same `attr`/`filter`/`sort`/`merge`
vocabulary, applied to `THREE.Object3D`s and instance slots instead of DOM
nodes. What D3 keeps that Graph3D.js doesn't: D3 selects *any* existing DOM
node via CSS selectors; Graph3D.js only selects objects it already knows the
name of (`scene.selectAll(name)`) — there's no query language, because a 3D
scene has no DOM to query. See [migrating from D3](/migration/from-d3).

**Instanced by default, to real scale.** Every chart type dispatches on
datum count against a measured threshold (`INSTANCING_THRESHOLD`, default
50) and renders through one `GraphInstancedObject` — one draw call — above
it. This is genuinely where Graph3D.js separates from D3 (SVG has no
instancing concept at all) and from raw Three.js (nothing forces you to
write the instancing code correctly, or at all). It is **not** unconditional:
see [Performance](/perf)'s "Known limits at extreme scale" for a real,
currently-open octree scaling gap at very large, densely-clustered datasets
— this isn't a solved problem at every scale yet, and the docs say so
directly rather than only in the source comments.

**Cinematic defaults.** ACES filmic tone mapping, PCF-soft shadows, 8
curated scene themes (camera + lighting + fog + HDR + shadow quality bundled
as one call), and a 12-pass/7-preset PostFX pipeline are all one line to
enable (`scene.applyTheme(name)`, `g.postfx.preset(name)`). Neither D3 nor
ECharts GL has an equivalent — this is closest to "what a raw Three.js scene
looks like after a graphics engineer spends a week tuning it," made a
one-line default instead. The honest caveat: cinematic defaults are opinions,
not universal good taste — a scientific/dashboard context often wants the
flattest, least stylized rendering possible, which is exactly what
`material.basic` and `scene.applyTheme('clinical-white')` are for.

**Fully inspectable escape hatches.** Every layer — scene, camera, object,
material, chart — exposes its real underlying Three.js object
(`.three`/`.scene`/`.camera.three`). This is the sharpest contrast with
ECharts GL specifically, whose 3D charts render into a canvas you can
configure but never directly touch. It does **not** make Graph3D.js as
flexible as raw Three.js itself — you're still working within chart types
and a scene composition model that has opinions about what a "scene" is;
see [migrating from raw Three.js](/migration/from-raw-three) for exactly
where that model's seams are.

## When to pick something else

- **You need SVG/Canvas 2D, not 3D** — accessibility, print output, or a
  design system built around DOM-based charts. D3 (or a D3-based 2D library)
  is the right tool; Graph3D.js requires WebGL.
- **You want a declarative, config-driven dashboard tool with a huge
  pre-built series library** (maps, globes, Sankey, treemaps, and more,
  alongside its 3D types), and don't need direct scene-graph access. ECharts
  (2D or GL) covers far more chart types out of the box.
- **You need something battle-tested in production today.** Graph3D.js is
  v0.1.0. D3, ECharts, and Three.js all have years of production usage at
  scale behind them; Graph3D.js does not yet.
- **You're already deep in a hand-rolled Three.js scene** and only need a
  data-join/animation/interaction layer, not opinionated chart types or
  scene composition — see [migrating from raw Three.js](/migration/from-raw-three)
  for the incremental-adoption path either way.
