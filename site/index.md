---
layout: home

hero:
  name: Graph3D.js
  text: D3-flavored. GPU-instanced. Cinematic by default.
  tagline: A developer-first 3D data visualization framework that treats charts as fully inspectable, fully controllable Three.js scenes — not black-box widgets.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Concepts
      link: /concepts/
    - theme: alt
      text: Examples
      link: /example/barChart

features:
  - title: D3-style joins & selections
    details: enter/update/exit, keyed data joins, and a fluent Selection API (attr/style/filter/transition) — the D3 mental model, built on Three.js instead of the DOM.
  - title: Instanced by default
    details: Charts render through GraphInstancedObject (one InstancedMesh per chart) once past a measured threshold — millions of datums, not thousands.
  - title: Cinematic defaults
    details: ACES tone mapping, PCF-soft shadows, camera presets, curated themes, and postfx passes (bloom, DOF, SSAO, film grain) out of the box.
  - title: Fully inspectable escape hatches
    details: Every layer exposes its raw Three.js objects — .three, .scene, .camera.three — so nothing is ever locked behind the fluent API.
---

## Why Graph3D.js?

Most charting libraries make you choose: the ergonomics of a data-join API
*or* a real, inspectable 3D scene — not both. D3 owns the data-join model but
stops at SVG/Canvas. ECharts GL renders real 3D but hides it behind a
declarative config object with no scene-graph access. Raw Three.js gives you
the whole scene, but no data model, no instancing decision, no chart types —
just primitives.

Graph3D.js's bet is that these four pillars belong together, not traded off
against each other: D3's `enter`/`update`/`exit` join, ported faithfully onto
real `THREE.Object3D`s; automatic GPU instancing once a chart crosses a
measured datum-count threshold, so the same API that draws 12 bars also
draws a million points; cinematic rendering (tone mapping, shadows, curated
themes, post-processing) as a one-line default instead of a week of manual
tuning; and — unlike every black-box charting library — every layer stays
inspectable via `.three`/`.scene`/`.camera.three`, so nothing is ever locked
behind the fluent API.

See the full [comparison](/comparison) for where each alternative is still
the better choice — this project is v0.1.0 and doesn't pretend otherwise.
