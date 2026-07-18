# Brush + Cross-Filter

Two linked charts sharing one dataset: a `ScatterChart` you drag a
rectangular region over with `Brush`, and a `BarChart` that `link()` keeps
filtered to whatever rows fall inside that region.

```js
import { Graph3D, ScatterChart, BarChart, scale, palette, Brush, link } from 'graph3d.js';

const canvas = document.querySelector('canvas');
const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

const PRODUCTS = Array.from({ length: 20 }, (_, id) => ({
  id,
  price: Math.round(20 + Math.random() * 430),
  rating: Math.round((1 + Math.random() * 4) * 10) / 10,
}));

const priceScale = scale.linear().domain([0, 450]).range([-4, 4]);
const ratingScale = scale.linear().domain([1, 5]).range([0, 4]);

const scatterChart = new ScatterChart(scene.three)
  .x((d) => d.price, priceScale)
  .y((d) => d.rating, ratingScale)
  .z(0)
  .size(0.15)
  .color((d) => d.id, palette.category10);
scatterChart.data(PRODUCTS, (d) => d.id);
scatterChart.render();

const barX = scale.band().domain(PRODUCTS.map((d) => d.id)).range([-4.5, 4.5]).paddingInner(0.3);
const barY = scale.linear().domain([0, 450]).range([0, 4]);

const barChart = new BarChart(scene.three).x((d) => d.id, barX).y((d) => d.price, barY);
barChart.data(PRODUCTS, (d) => d.id);
barChart.render();

const brush = new Brush({ camera: scene.camera.three, domElement: canvas });
brush.register(scatterChart);

// link() re-filters barChart's captured full dataset by reference — since
// barChart shares PRODUCTS' exact row objects with scatterChart, no custom
// transform is needed for the default row-identity filtering.
link(brush, barChart);

scene.camera.three.position.set(0, 6, 14);
scene.camera.lookAt(0, 2, 0);
```

`brush.register(chart)` makes a chart a brush *source* — dragging a
rectangle over it computes which of its datums fall inside. `link(brush,
target)` makes `target` react: every `'select'` event re-filters `target`'s
rendered rows down to the brushed subset, and clearing the brush (or
`brush.reset()`) restores the full set. `link()`'s target must stay a
*subset* of its own captured rows — reshaping into a new aggregate (e.g. a
`PieChart` of category counts) needs a hand-written `brush.on('select', ...)`
handler instead, since that's a genuine reshape, not a filter.

The full three-chart version (scatter + bar + a hand-aggregated pie, plus
click-select/hover tooltips via `Picker`/`PointerRouter`) is
`examples/20-interaction/`.
