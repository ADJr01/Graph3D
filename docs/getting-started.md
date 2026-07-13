# Getting Started

## Install

Graph3D.js ships as plain ESM with a single peer dependency on `three`:

```bash
npm install graph3d.js three
```

## Your first chart

Every chart lives inside a `Graph3D` instance, which owns the renderer, the
animation loop, and one or more named `GraphScene`s. A scene owns its own
camera and lights; charts attach to a scene's raw `THREE.Scene`.

```js
import { Graph3D, BarChart, scale } from 'graph3d.js';

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

scene.camera.three.position.set(0, 8, 14);
scene.camera.lookAt(0, 2, 0);
```

That's a complete, renderable scene — no build step beyond bundling your own
app, no canvas-2D fallback, no hidden global state. `g.chart('bar')` is a
shorter equivalent once a scene is active (see [Chart](/concepts/chart)):

```js
g.setActiveScene(scene);
const chart = g.chart('bar').x(...).y(...).color(...);
```

## Updating data

Calling `.data(newRows, keyFn)` again and `.update()` re-joins against the
live chart — entering rows animate in, updating rows tween to their new
values, and departing rows dissolve out by default:

```js
chart.data(nextRows, (d) => d.category);
chart.update();
```

This is the same enter/update/exit mental model as D3's own `.data().join()`
— see the [Compose](/concepts/compose) docs for the underlying `Selection`
API this is built on.

## Where to go next

- **[Concepts](/concepts/)** — one page per architectural layer (core, scene,
  object, compose, anim, material, postfx, chart, interact, stream), each
  with runnable snippets.
- **[Chart Types](/chart-types/)** — the eleven built-in chart types and
  which of the above concepts each one leans on.
- **[Recipes](/recipes/)** — end-to-end walkthroughs (live streaming data,
  million-point scatter plots, custom shaders, camera tours, and more).
- **Live examples** — every concept page's snippets have a runnable
  counterpart under the repository's `examples/` directory; clone it and run
  `npm run dev`.
