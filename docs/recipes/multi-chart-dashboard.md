# Multi-Chart Dashboard

Several independent charts sharing one scene and one camera, positioned with
`layout.grid()`. Every chart still attaches to the same real `THREE.Scene`
(`GraphObject` requires it), so each one is built first, then its
newly-added objects are reparented into a positioned `THREE.Group` — a
group per grid cell.

```js
import * as THREE from 'three';
import { Graph3D, BarChart, LineChart, PieChart, scale, layout } from 'graph3d.js';

const canvas = document.querySelector('canvas');
const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

const cell = layout.grid({ rows: 1, cols: 3, cellWidth: 10, cellDepth: 10 });

/** Builds against the real scene, then moves whatever it just added into a positioned group. */
function placeAt(index, buildFn) {
  const before = new Set(scene.three.children);
  buildFn();
  const { x, z } = cell(index);
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.three.add(group);
  for (const child of [...scene.three.children]) {
    if (!before.has(child) && child !== group) group.add(child);
  }
}

placeAt(0, () => {
  const x = scale.band().domain(['A', 'B', 'C']).range([-3, 3]).paddingInner(0.3);
  const y = scale.linear().domain([0, 100]).range([0, 4]);
  const bar = new BarChart(scene.three).x((d) => d.k, x).y((d) => d.v, y).color((d) => d.v);
  bar.data([{ k: 'A', v: 30 }, { k: 'B', v: 80 }, { k: 'C', v: 55 }], (d) => d.k);
  bar.render();
});

placeAt(1, () => {
  const x = scale.linear().domain([0, 9]).range([-3, 3]);
  const y = scale.linear().domain([0, 100]).range([0, 4]);
  const line = new LineChart(scene.three).x((d) => d.t, x).y((d) => d.v, y);
  line.data(Array.from({ length: 10 }, (_, t) => ({ t, v: 50 + Math.sin(t) * 40 })));
  line.render();
});

placeAt(2, () => {
  const pie = new PieChart(scene.three).value((d) => d.count);
  pie.data([{ label: 'A', count: 30 }, { label: 'B', count: 45 }, { label: 'C', count: 25 }], (d) => d.label);
  pie.render();
});

scene.camera.three.position.set(0, 14, 22);
scene.camera.lookAt(0, 0, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement);
```

Each chart keeps its own independent `.data()`/`.update()` cycle — nothing
here couples them. For charts that *should* react to each other's
selections, see [Brush + Cross-Filter](/recipes/brush-cross-filter). The
full "one of every chart type" version of this reparenting technique,
including auto-fit bounding-box scaling per cell, is
`examples/19-gallery/`.
