# Migration Guides

This section is scaffolded but not yet written. The planned guides:

- **`from-d3.md`** (flagship) — maps D3's `selectAll`/`data`/`join`/`attr`/
  `transition` 1:1 onto Graph3D.js's own `Selection` API (see
  [Compose](/concepts/compose) for the underlying join/diff mechanics this
  guide will build on).
- **`from-echarts-gl.md`** — for teams coming from ECharts GL's 3D chart types.
- **`from-raw-three.md`** — for teams with an existing hand-rolled Three.js
  scene who want Graph3D.js's chart/animation/interaction layers without a
  full rewrite, using each layer's documented escape hatches (`.three`,
  `.scene`, `.camera.three`) to adopt incrementally.
