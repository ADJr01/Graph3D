# graphHTML Custom Labels

`graphHTML()` attaches a real, camera-billboarded label to any rendered
object — a `GraphMesh`, one instance of a `GraphInstancedObject`, or a bare
`{ scene, position }` pair. It tries Chrome's experimental HTML-in-Canvas API
first (real arbitrary HTML/CSS), and transparently falls back to `SDFText`
(plain text, styled) everywhere that API isn't available — which today is
almost every browser a real user has open, so design for the fallback and
treat the rich-HTML path as a bonus.

```js
import { Graph3D, BarChart, scale, palette, graphHTML } from 'graph3d.js';

const canvas = document.querySelector('canvas');
const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

const x = scale.band().domain(['A', 'B', 'C', 'D']).range([-6, 6]).paddingInner(0.3);
const y = scale.linear().domain([0, 100]).range([0, 6]);
const rows = [
  { id: 'A', value: 42 },
  { id: 'B', value: 88 },
  { id: 'C', value: 15 },
  { id: 'D', value: 67 },
];

const chart = new BarChart(scene.three)
  .x((d) => d.id, x)
  .y((d) => d.value, y)
  .color((d) => d.value, palette.viridis); // domain auto-fit to the data's [min, max]
chart.data(rows, (d) => d.id);
chart.render();

scene.camera.three.position.set(0, 8, 14);
scene.camera.lookAt(0, 2, 0);

// One label per bar. `Selection.nodes()` only exposes `.datum`/`.index` (no
// mesh reference — there's no single underlying object for an instanced
// datum), so resolve each node's real target through `.backend` directly,
// same as the Custom GLSL recipe's `GraphObjectMaterial` target lookup:
const backend = chart.selection().backend;
rows.forEach((row, i) => {
  const target = backend.type === 'instanced' ? { object: backend.object, index: backend.indices[i] } : backend.meshes[i];
  graphHTML(target, {
    html: `<b>${row.value}</b>`,
    camera: scene.camera.three,
    width: 1,
    height: 0.5,
  });
});
```

`graphHTML()` is fire-and-forget — it returns a handle synchronously
(`handle.mesh` is `null` until `handle.ready` resolves a frame or two later,
once the SDF atlas or HTML rasterization finishes). It's safe to call
`handle.dispose()` before `ready` resolves; the in-flight build is discarded
instead of ever being added to the scene.

## Sizing: world units vs. raster resolution

Two independent size knobs. `width`/`height` are the label's footprint **in
the scene** (default `2`×`1` world units). `pixelWidth`/`pixelHeight` are the
**raster resolution** the HTML is captured at (default `512`×`256`) — this
only matters on the experimental HTML-in-Canvas path; `SDFText`'s fallback
glyphs are vector, not rasterized, so these two are ignored there:

```js
graphHTML(bar, {
  html: '<small>42%</small>',
  camera,
  width: 1, height: 0.5,       // small footprint in the scene
  pixelWidth: 256, pixelHeight: 128, // crisper text at that small size
});
```

## Styling the plain-text fallback

`options.style` only affects the `SDFText` fallback path — the experimental
path renders `html`'s own CSS as-is, so `style` has no effect there. Pass
`text` to control the fallback's content directly instead of deriving it
from `html`'s stripped `textContent`:

```js
graphHTML(bar, {
  html: '<span style="color: gold">★ Top performer</span>', // used verbatim if the experimental path is available
  text: 'Top performer',                                     // used instead, plain, if it falls back
  camera,
  style: { fontSize: 0.25, color: '#ffd700', outline: { color: '#000000', width: 0.15 } },
});
```

## Updating or removing a label

`graphHTML()` doesn't have an `.update()` — a label's text/position can't be
changed in place today; dispose and recreate it instead:

```js
let label = graphHTML(bar, { html: `<b>${value}</b>`, camera });

function refresh(newValue) {
  label.dispose();
  label = graphHTML(bar, { html: `<b>${newValue}</b>`, camera });
}
```

Every label you create needs its own tracked handle so you can dispose it —
there's no bulk "dispose every label on this chart" call. For a chart with
many labeled datums, keep a `Map` from datum key to handle alongside your
chart's own data:

```js
const labelByKey = new Map();

function syncLabels(dataset) {
  for (const [key, handle] of labelByKey) {
    if (!dataset.some((d) => d.id === key)) {
      handle.dispose();
      labelByKey.delete(key);
    }
  }
  const backend = chart.selection().backend;
  dataset.forEach((d, i) => {
    if (labelByKey.has(d.id)) return; // already labeled
    const target = backend.type === 'instanced' ? { object: backend.object, index: backend.indices[i] } : backend.meshes[i];
    labelByKey.set(d.id, graphHTML(target, { html: `<b>${d.value}</b>`, camera: scene.camera.three }));
  });
}
```

## Feature-detecting the experimental path

```js
import { isHTMLInCanvasSupported } from 'graph3d.js';

if (isHTMLInCanvasSupported()) {
  console.log('Real HTML/CSS labels available in this browser.');
} else {
  console.log('Falling back to plain SDFText labels — design html for the plain-text case too.');
}
```

`handle.isExperimental` tells you, after the fact, which path actually built
a given label's visible mesh — useful if you want to log or branch on it per
label rather than checking the browser capability once up front.

The full runnable version — a live-updating leaderboard with one label per
bar, driving `<b>rank</b>` text off a periodically re-sorted dataset — is
`examples/24-GraphHTML-test/`.

See [Concepts: Material — graphHTML](/concepts/material#graphhtml-—-experimental-html-in-canvas-labels-user-requested-not-part-of-prompts-md-s-numbered-sequence)
for the full API reference, including exactly how the experimental
HTML-in-Canvas rasterization works under the hood.
