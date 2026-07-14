# PNG Export

`chart.exportPNG({ renderer, camera })` renders one frame and returns it as
a `data:image/png;base64,...` URL — no extra render target or canvas setup
needed, since it renders through the same `WebGLRenderer` already driving
the visible canvas.

```js
import { Graph3D, BarChart, scale } from 'graph3d.js';

const canvas = document.querySelector('canvas');
const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

const x = scale.band().domain(['A', 'B', 'C', 'D']).range([-6, 6]).paddingInner(0.3);
const y = scale.linear().domain([0, 100]).range([0, 6]);
const chart = new BarChart(scene.three).x((d) => d.k, x).y((d) => d.v, y).color((d) => d.v);
chart.data([{ k: 'A', v: 42 }, { k: 'B', v: 88 }, { k: 'C', v: 15 }, { k: 'D', v: 67 }], (d) => d.k);
chart.render();

scene.camera.three.position.set(0, 8, 14);
scene.camera.lookAt(0, 2, 0);

const exportButtonEl = document.getElementById('export');
exportButtonEl.addEventListener('click', () => {
  const dataUrl = chart.exportPNG({ renderer: g.renderer.three, camera: scene.camera.three });
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = 'chart.png';
  link.click();
});
```

The capture includes the *whole* scene `renderer`/`camera` render — every
other chart or object sharing that scene, not just this one chart's own
datums, since a chart doesn't own an isolated render target. For a
chart-only image, keep that chart alone on its own scene before exporting.

`chart.exportSVG({ camera, width, height })` is the vector equivalent (via
Three.js's `SVGRenderer` addon, lazy-loaded on first call so it's never
bundled unless used) — pick PNG for a pixel-accurate snapshot of exactly
what's on screen, SVG for a resolution-independent export.
