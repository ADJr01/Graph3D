# Theme Swap

`scene.applyTheme(name)` swaps camera preset, lights, HDR environment, fog,
shadow quality, and the default chart-material palette in one call — a
theme fully owns lighting and atmosphere, so re-applying a different one
tears down and rebuilds all of it, not just whatever changed.

```js
import { Graph3D, BarChart, scale } from 'graph3d.js';

const canvas = document.querySelector('canvas');
const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

await scene.applyTheme('studio-light');

const x = scale.band().domain(['A', 'B', 'C', 'D']).range([-6, 6]).paddingInner(0.3);
const y = scale.linear().domain([0, 100]).range([0, 6]);
const chart = new BarChart(scene.three).x((d) => d.k, x).y((d) => d.v, y).color((d) => d.v);
chart.data([{ k: 'A', v: 42 }, { k: 'B', v: 88 }, { k: 'C', v: 15 }, { k: 'D', v: 67 }], (d) => d.k);
chart.render();

const themeSelectEl = document.getElementById('theme');
themeSelectEl.addEventListener('change', async () => {
  await scene.applyTheme(themeSelectEl.value);
});
```

```html
<select id="theme">
  <option value="studio-light">Studio Light</option>
  <option value="studio-dark">Studio Dark</option>
  <option value="cinema-night">Cinema Night</option>
  <option value="clinical-white">Clinical White</option>
</select>
```

`applyTheme()` is `async` — its only fallible step is the HDR fetch, which
runs *before* anything is mutated, so a rejected promise (a missing `.hdr`
asset) leaves the previous theme fully intact rather than half-swapping.
`scene.theme`/`scene.palette` read back the currently applied theme's name
and default hex-color palette at any time. The full theme list —
`studio-light`, `studio-dark`, `cinema-night`, `clinical-white`,
`terminal-green`, `editorial`, `cyberpunk`, `museum` — is documented on
[Scene Composition](/concepts/scene).
