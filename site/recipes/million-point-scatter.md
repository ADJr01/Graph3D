# Million-Point Scatter

A 1,000,000-row `ScatterChart`, instanced by default, streamed in over time
via `DataStream.fromArray()` so the first frame doesn't block on generating
and joining a million rows, then handed off to `chart.enableLOD()` once the
stream ends.

```js
import { Graph3D, ScatterChart, DataStream } from 'graph3d.js';

const POINT_COUNT = 1_000_000;
const CHUNK_SIZE = 10_000;

function buildRows() {
  const rows = new Array(POINT_COUNT);
  for (let i = 0; i < POINT_COUNT; i++) {
    rows[i] = {
      id: i,
      x: (Math.random() * 2 - 1) * 40,
      y: (Math.random() * 2 - 1) * 40,
      z: (Math.random() * 2 - 1) * 40,
    };
  }
  return rows;
}
const rows = buildRows();

const canvas = document.querySelector('canvas');
const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

const chart = new ScatterChart(scene.three)
  .x((d) => d.x)
  .y((d) => d.y)
  .z((d) => d.z)
  .size(0.05);

chart.data([], (d) => d.id);
chart.render();

// Consumed directly here (not via chart.stream()) so this loop is the one
// and only place awaiting the stream's chunks — enableLOD() needs to know
// exactly when the last chunk has landed, and a DataStream's async iterator
// only supports one consumer at a time.
const stream = DataStream.fromArray(rows, CHUNK_SIZE, 100);
let loaded = [];
for await (const { added } of stream) {
  loaded = loaded.concat(added);
  chart.data(loaded, (d) => d.id);
  chart.update();
}

// enableLOD() snapshots chart.data() at call time, so it only turns on once
// the stream is fully drained — see chart.stream()'s own backpressure note
// in the Live Stream recipe for why turning it on mid-stream would race.
chart.enableLOD();
```

`enableLOD()` re-decimates the visible subset every time the camera crosses
a distance bucket, so the draw count stays bounded regardless of how far the
full dataset is zoomed out. Pair it with `Brush` for region selection at
this scale — see [Brush + Cross-Filter](/recipes/brush-cross-filter) — since
per-mesh picking isn't viable at a million instances.

The full version — including the exact "stream ended" detection this
snippet simplifies away — is `examples/22-million-points/`.
