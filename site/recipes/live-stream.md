# Live Stream

Feed a chart from an async producer with `DataStream.fromInterval` +
`chart.stream()`, and cap memory with `.window()` so a feed that never
stops doesn't grow the chart forever.

```js
import { Graph3D, ScatterChart, DataStream, scale } from 'graph3d.js';

const canvas = document.querySelector('canvas');
const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

let nextId = 0;
function pollSensor() {
  // One "chunk" per tick — an array of new rows, even if it's just one row.
  return [{ id: nextId++, t: nextId, value: 50 + Math.random() * 50 }];
}

const chart = new ScatterChart(scene.three)
  .x((d) => d.t, scale.linear().domain([0, 500]).range([-6, 6]))
  .y((d) => d.value, scale.linear().domain([0, 100]).range([0, 6]))
  .color((d) => d.value);

// render() must run once, on some initial data, before stream() attaches.
chart.window(200);
chart.data([], (d) => d.id);
chart.render();
chart.stream(DataStream.fromInterval(pollSensor, 100));

scene.camera.three.position.set(0, 6, 14);
scene.camera.lookAt(0, 3, 0);
```

`window(200)` keeps only the most recent 200 rows visible — every chunk
past that dissolves the oldest points out through the same enter/update/exit
path an ordinary `.update()` uses, so there's no second removal codepath to
reason about.

`DataStream` also has `.fromArray()` (chunked replay of an existing array,
used for the million-point recipe) and `.fromWebSocket()` (parses each
incoming message into a chunk). The full windowed dual-chart trading-floor
version is `examples/23-live-trading/`.
