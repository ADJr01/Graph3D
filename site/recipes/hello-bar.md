# Hello Bar

The smallest complete Graph3D.js scene: one `BarChart`, four rows, no
streaming, no interaction. Start here if you're pasting your first snippet
into a fresh project.

```js
import { Graph3D, BarChart, scale, Axis } from 'graph3d.js';

const canvas = document.querySelector('canvas');
const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

const x = scale.band().domain(['A', 'B', 'C', 'D']).range([-6, 6]).paddingInner(0.3);
const y = scale.linear().domain([0, 100]).range([0, 6]);

const chart = new BarChart(scene.three)
  .x((d) => d.category, x)
  .y((d) => d.value, y)
  .color((d) => d.value);

chart.data(
  [
    { category: 'A', value: 42 },
    { category: 'B', value: 88 },
    { category: 'C', value: 15 },
    { category: 'D', value: 67 },
  ],
  (d) => d.category,
);
chart.render();

new Axis().scale(x).orientation('x').tickSize(0.3).render(scene.three, 'xAxis');
new Axis().scale(y).orientation('y').tickCount(5).tickSize(0.3).render(scene.three, 'yAxis');

scene.camera.three.position.set(0, 8, 14);
scene.camera.lookAt(0, 2, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement);
```

Live rows work the same way, any time later:

```js
chart.data(nextRows, (d) => d.category);
chart.update();
```

The full runnable version, with grouped/stacked toggling and a periodic
re-join, is `examples/08-bar-chart/`.
