# Surface from CSV

`SurfaceChart.values()` accepts either an `(x, z) => y` function (sampled
over `xDomain`/`zDomain`/`resolution`, as in the [Chart Types](/chart-types/)
gallery) or a plain `values[row][col]` grid — the shape a parsed CSV
naturally produces once every row has the same column count.

```js
import { Graph3D, SurfaceChart } from 'graph3d.js';

/** Splits CSV text into a numeric grid — no header row, one row of samples per line. */
function parseGridCSV(text) {
  return text
    .trim()
    .split('\n')
    .map((line) => line.split(',').map(Number));
}

const csvText = `0,1,2,1,0
1,2,3,2,1
2,3,4,3,2
1,2,3,2,1
0,1,2,1,0`;

const grid = parseGridCSV(csvText);

const canvas = document.querySelector('canvas');
const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

const chart = new SurfaceChart(scene.three).values(grid).material('standard', { color: '#3b82f6' });
chart.render();

scene.camera.three.position.set(0, 8, 12);
scene.camera.lookAt(0, 1, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement);
```

`xDomain()`/`zDomain()`/`resolution()` are ignored once `.values()` is a
grid — they only apply to the function form, where the chart chooses its
own sample points. `.contours(levels)` (marching-squares isolines, each
traced as its own `LineChart`-backed line) overlays either form the same
way; see `examples/12-surface-chart/` for the toggleable version.
