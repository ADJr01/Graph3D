---
layout: page
aside: false
title: Cheatsheet
---

<style>
.cheatsheet h1 { margin-bottom: 0.3em; }
.cheatsheet .subtitle { color: var(--vp-c-text-2); margin-bottom: 1.2em; }
.cheatsheet .grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 2rem;
}
.cheatsheet .grid > div { min-width: 0; }
.cheatsheet h2 {
  font-size: 0.95em;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--vp-c-divider);
  padding-bottom: 0.25em;
  margin: 1.1em 0 0.4em;
}
.cheatsheet table { font-size: 0.82em; margin: 0.3em 0 0.8em; }
.cheatsheet table th, .cheatsheet table td { padding: 2px 8px; }
.cheatsheet div[class*="language-"] { margin: 0.3em 0 0.8em; font-size: 0.78em; }
.cheatsheet div[class*="language-"] pre { padding: 8px 12px; }
.cheatsheet p { margin: 0.2em 0; font-size: 0.85em; color: var(--vp-c-text-2); }

@media print {
  .VPNav, .VPSidebar, .VPDocFooter, .VPBackToTop, .VPLocalNav { display: none !important; }
  .VPDoc.has-sidebar .container { max-width: 100% !important; padding: 0 !important; }
  .VPDoc .content { max-width: 100% !important; padding: 0 !important; }
  .VPContent { padding-top: 0 !important; }
  body { font-size: 9px; }
  .cheatsheet .grid { gap: 0 1.2rem; }
  a { color: inherit !important; text-decoration: none !important; }
  @page { size: A4 landscape; margin: 10mm; }
}
</style>

<div class="cheatsheet">

# Graph3D.js Cheatsheet

<p class="subtitle">v0.1.0 — one-page reference. Full docs: <a href="/">graph3d docs</a>. Print via your browser's Print dialog (landscape recommended).</p>

<div class="grid">
<div>

## Setup

```js
import { Graph3D } from 'graph3d.js';

const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);
```

## Scenes & themes

```js
await scene.applyTheme('studio-dark'); // camera+light+fog+HDR+shadows+palette
scene.camera.three.position.set(0, 8, 14); // set AFTER applyTheme resolves
scene.camera.lookAt(0, 2, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement);
```

**Themes:** `clinical-white` `terminal-green` (no HDR needed) · `studio-light`
`studio-dark` `cinema-night` `editorial` `cyberpunk` `museum`

## Chart types

| `typeName` | Class | Renders |
|---|---|---|
| `bar` | `BarChart` | value-scaled bars |
| `line` | `LineChart` | one polyline/series |
| `scatter` | `ScatterChart` | instanced points |
| `area` | `AreaChart` | extruded wall to baseline |
| `surface` | `SurfaceChart` | triangulated heightfield |
| `heatmap` | `HeatmapChart` | grid cells / voxels |
| `network` | `NetworkChart` | force-directed graph |
| `tree` | `TreeChart` | radial hierarchy |
| `pack` | `PackChart` | nested spheres |
| `pie` | `PieChart` | proportional sweep |
| `volume` | `VolumeChart` | 3D density field |

```js
const chart = g.chart('bar')             // or: new BarChart(scene.three)
  .x((d) => d.category, xScale)
  .y((d) => d.value, yScale)
  .color((d) => d.value, palette.viridis);
chart.data(rows, (d) => d.id).render();
chart.data(newRows, (d) => d.id).update(); // re-diffs, animates via .transition()
```

## Scales — `scale.*`

```js
scale.linear().domain([0, 100]).range([0, 10]).nice().clamp(true);
scale.band().domain(['a','b','c']).range([0, 30]).paddingInner(0.2);
scale.log(); scale.pow(); scale.sqrt(); scale.point(); scale.ordinal(); scale.time();
```

## Selection & the data join

```js
let sel = new Selection({ type: 'meshes', meshes: [], template: { scene, name, geometry, material } });
// or: scene.selectAll('bars')  — wraps already-registered objects

const joined = sel.data(rows, (d) => d.id);
sel = joined.join(
  (enter)  => enter.attr('position.y', (d) => y(d.value)),
  (update) => update.attr('position.y', (d) => y(d.value)),
  (exit)   => exit.remove(),
);
sel.filter((d) => d.value > 90).attr('color', 'gold').on('click', (d) => {});
```

</div>
<div>

## Color & palettes

```js
color.sequential(palette.viridis, [0, 100]);   // t => color
color.diverging(palette.RdBu, [-1, 0, 1]);
color.categorical(palette.category10);
```

**Sequential (colorblind-safe):** `viridis` `inferno` `magma` `plasma` `cividis`
**Diverging:** `RdBu` `RdYlBu` `BrBG` (safest) `PiYG`
**Categorical:** `category10` `tableau10` `set1` `set2` `dark2` `paired`

## Transitions

```js
selection.transition().duration(400).delay((d,i) => i*40)
  .easing('easeOutCubic').attr('opacity', 0).remove();

chart.transition(800, 'easeOutCubic'); // chart-level default
```

## PostFX

```js
g.postfx.enable('bloom', { strength: 0.8 });
g.postfx.preset('cinematic'); // swaps to exactly this bundle
g.postfx.disable('bloom');
g.postfx.enabled(); // ['bloom', ...]
```

**Passes:** bloom ssao dof motionBlur colorGrading vignette
chromaticAberration filmGrain fxaa smaa outline godRays ssr
**Presets:** cinematic clean dramatic dreamy editorial cyberpunk minimal

## Scaling

```js
chart.enableLOD({ camera, levels: [{ maxDistance: 20, maxPoints: 5000 }] });
gpgpu.attach(sim); // layout.force 'charge' > 5,000 nodes
new OriginShift({ scene: scene.three, camera: scene.camera.three, threshold: 1000 }); // >1km precision
chart.compact(); // merge settled meshes -> one instanced object
```

`INSTANCING_THRESHOLD = 50` — below: `GraphMesh[]`; at/above: one `GraphInstancedObject`.

## Interaction & a11y

```js
// events: hover select deselect enter update exit brushStart/End dragStart/End focus
chart.on('select', (payload) => {});
chart.draggable(true);
chart.setAriaLabel('Quarterly revenue', { container: canvas });
new KeyboardNav({ domElement: canvas }); // Tab/Enter/Escape
```

## Disposal (mandatory)

```js
mesh.dispose();      // one GraphMesh/GraphInstancedObject
chart.destroy();      // one chart
scene.dispose();      // scene + every child object
g.dispose();           // everything — loop tick, workers, renderer
```

Idempotent; every method throws `"...disposed"` after. Verify with
`renderer.info.memory.geometries`/`.textures` across repeated cycles.

</div>
</div>

</div>
