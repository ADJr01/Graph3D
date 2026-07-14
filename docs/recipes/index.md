# Recipes

End-to-end, runnable walkthroughs that combine several concepts into one
complete example — as opposed to the [Concepts](/concepts/) pages, which
document one layer's API in isolation. Every recipe below has a fuller,
directly-runnable counterpart under the repository's `examples/` directory
(`npx vite examples/<folder> --config vite.config.js`).

- **[Hello Bar](/recipes/hello-bar)** — the smallest complete scene: one chart, four rows.
- **[Live Stream](/recipes/live-stream)** — `DataStream` + `chart.stream()`/`.window()` for a feed that never stops.
- **[Million-Point Scatter](/recipes/million-point-scatter)** — a 1,000,000-row `ScatterChart`, chunked in via `DataStream.fromArray()`, then handed off to `enableLOD()`.
- **[Multi-Chart Dashboard](/recipes/multi-chart-dashboard)** — several independent charts on one scene, positioned with `layout.grid()`.
- **[The Data Join & Selections, Deep-Dive](/recipes/data-join-selections)** — the `Selection` + `.data().join()` mechanism every chart type is built on, with no chart class involved.
- **[Custom GLSL](/recipes/custom-glsl)** — a hand-written `THREE.ShaderMaterial` applied to a chart's rendered objects via `GraphObjectMaterial`.
- **[GLTF Chart Shapes](/recipes/gltf-chart-shapes)** — loading a `.glb` model per data point with `GraphObjectLoader`.
- **[Entry Animation + Camera Tour](/recipes/entry-animation-camera-tour)** — staggered enter/update/exit transitions plus `CameraTour.flyTo()` reframing.
- **[Brush + Cross-Filter](/recipes/brush-cross-filter)** — `Brush` + `link()` filtering one chart from a region dragged over another.
- **[Surface from CSV](/recipes/surface-from-csv)** — `SurfaceChart.values()` fed a parsed grid instead of a sampled function.
- **[Network from JSON](/recipes/network-from-json)** — `NetworkChart` over a plain `{nodes, links}` payload, force-laid-out live.
- **[Theme Swap](/recipes/theme-swap)** — `scene.applyTheme()` swapping camera, lights, HDR, and palette in one call.
- **[PNG Export](/recipes/png-export)** — `chart.exportPNG()` for a one-line snapshot download.
