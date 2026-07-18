# Chart Types

Every chart type extends `GraphChart` (see [Chart](/concepts/chart) for the
shared base: `data()`, per-datum accessors, `.material()`, `.transition()`,
lifecycle events, `render()`/`update()`/`destroy()`) and is available both as
a direct import and via `g.chart(typeName)` once a scene is active:

```js
import { BarChart } from 'graph3d.js';
new BarChart(scene.three);
// — or —
g.chart('bar');
```

| Type | `typeName` | Renders | Live example |
|---|---|---|---|
| **BarChart** | `'bar'` | Value-scaled bars, grouped/stacked/depth-series layouts, instanced above 50 datums | `examples/08-bar-chart/` |
| **LineChart** | `'line'` | One continuous polyline per series (not per-datum instanced) | `examples/09-line-chart/` |
| **ScatterChart** | `'scatter'` | Instanced points/spheres — a million-point scatter is one draw call | `examples/10-scatter-chart/` |
| **AreaChart** | `'area'` | An extruded vertical "wall" from each point down to a baseline | `examples/11-area-chart/` |
| **SurfaceChart** | `'surface'` | A continuous triangulated heightfield, with optional contour overlays | `examples/12-surface-chart/` |
| **HeatmapChart** | `'heatmap'` | Instanced grid cells — flat 2D tiles (`'plane'` mode) or density cubes (`'voxel'` mode) | `examples/13-heatmap-chart/` |
| **NetworkChart** | `'network'` | A force-directed node-link graph — a live physics simulation, not a static layout | `examples/14-network-chart/` |
| **TreeChart** | `'tree'` | A radial hierarchy fanned by depth, with parent-child edges | `examples/15-tree-chart/` |
| **PackChart** | `'pack'` | A hierarchy nested as value-sized, non-overlapping spheres | `examples/16-pack-chart/` |
| **PieChart** | `'pie'` | A proportional-sweep pie/donut, one mesh per slice | `examples/17-pie-chart/` |
| **VolumeChart** | `'volume'` | A 3D voxel/density field | `examples/18-volume-chart/` |

Each type's full API — every chainable field, what's inherited from
`GraphChart` versus overridden, and what's inert for that particular type
(e.g. `.filter()`/`.sort()` don't apply to `NetworkChart`, since node
position comes from the simulation) — is documented on the
[Chart](/concepts/chart) concept page, one section per type.

Recipes that combine a chart type with real data (CSV, JSON, a live
WebSocket stream) live under [Recipes](/recipes/).
