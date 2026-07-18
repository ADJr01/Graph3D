# Migration Guides

- **[From D3](/migration/from-d3)** (flagship) — maps D3's `selectAll`/`data`/
  `join`/`attr`/`transition` 1:1 onto Graph3D.js's own `Selection` API (see
  [Compose](/concepts/compose) for the underlying join/diff mechanics this
  guide builds on).
- **[From ECharts GL](/migration/from-echarts-gl)** — for teams coming from
  ECharts GL's declarative `option`/`series` config and 3D chart types.
- **[From raw Three.js](/migration/from-raw-three)** — for teams with an
  existing hand-rolled Three.js scene who want Graph3D.js's chart/animation/
  interaction layers without a full rewrite, using each layer's documented
  escape hatches (`.three`, `.scene`, `.camera.three`) to adopt incrementally.
