<!--
Launch blog draft for Graph3D.js v0.1.0 (Prompt 192). Unpublished — not wired
into the docs site nav, no external links assumed (no confirmed npm package
page or repository URL exists yet; fill those in before this goes out). This
is a draft for review, not a page anyone should be able to stumble onto.
-->

# Introducing Graph3D.js: D3-flavored, GPU-instanced, cinematic by default

Every 3D charting library forces the same trade-off. Pick a data-join API
and you get D3 — brilliant ergonomics, stuck on SVG. Pick real WebGL 3D and
you get something like ECharts GL — genuinely 3D, but the scene is a
config object you can configure and never actually touch. Pick raw
Three.js and you get the whole scene, with none of the data model, none of
the instancing, none of the chart types — just primitives, and a blank
page.

Graph3D.js is a bet that you shouldn't have to choose. It's a 3D data
visualization framework built directly on Three.js, with D3's `.data().join()`
model ported faithfully onto real scene objects, automatic GPU instancing
that scales from a dozen bars to a million points without changing your
code, cinematic rendering as a one-line default instead of a week of manual
tuning, and — the part every other option here gives up — full access to
the raw Three.js scene at every layer. Nothing is ever locked behind the
fluent API.

## What that looks like

```js
import { Graph3D, BarChart, scale, color, palette } from 'graph3d.js';

const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);
await scene.applyTheme('studio-dark'); // camera, lighting, HDR, shadows, fog — one call

const chart = new BarChart(scene.three)
  .x((d) => d.category, scale.band().domain(categories).range([-6, 6]))
  .y((d) => d.value, scale.linear().domain([0, 100]).range([0, 6]))
  .color((d) => d.value, palette.viridis);

chart.data(rows, (d) => d.id).render();

// later — the same enter/update/exit join D3 users already know:
chart.data(newRows, (d) => d.id).update();
```

That's a real, lit, shadowed, tone-mapped 3D bar chart, animated on data
changes, in about a dozen lines. Swap `BarChart` for `ScatterChart` and the
same `.data().join()` call handles a million points as one draw call — the
instancing decision is automatic, not something you opt into.

## The four things it's actually built around

- **D3-style joins & selections.** `Selection` isn't "D3-inspired" — it's
  the same `enter`/`update`/`exit` model, the same `attr`/`style`/`filter`/
  `sort`/`transition` vocabulary, applied to `THREE.Object3D`s instead of
  DOM nodes. If you already think in D3, you already know most of this API.
- **Instanced by default.** Every chart type dispatches on datum count
  against a measured threshold and renders through one `GraphInstancedObject`
  above it — one draw call, regardless of whether that's 100 points or
  1,000,000.
- **Cinematic defaults.** ACES tone mapping, soft shadows, 8 curated scene
  themes, and a 12-pass/7-preset post-processing pipeline, all one line to
  enable. Flip to `material.basic` and a flat, unstylized theme when that's
  what the data actually calls for.
- **Fully inspectable escape hatches.** `.three`, `.scene`, `.camera.three`
  at every layer. Nothing about Graph3D.js hides Three.js from you — it's
  scaffolding around it, not a black box in front of it.

## What this is not, yet

This is a `v0.1.0` release, and it's worth being direct about what that
means: no production track record, a couple of real, documented open
performance gaps at extreme data density (see the perf guide's "known
limits" section — we'd rather publish the honest number than hide it), and
no map/globe chart type yet if that's what you're after. The full,
unvarnished comparison against D3, ECharts GL, and raw Three.js — including
where each of them is still the better choice — is in the docs, not just
this post.

## Try it

Clone the repository, `npm install`, then either `npm run dev` for the
interactive playground or `npm run docs:dev` for the full documentation
site — recipes, an API reference, migration guides from D3/ECharts GL/raw
Three.js, and a live in-browser code playground of your own.

<!-- TODO before publishing: add the actual repository URL, npm package
     link (once published), and any social/community links once they exist.
     Do not invent these — leave as literal TODOs until confirmed. -->
