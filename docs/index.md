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
      text: Chart Types
      link: /chart-types/

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
