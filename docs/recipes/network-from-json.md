# Network from JSON

`NetworkChart` takes plain `{nodes, links}` data — exactly the shape a JSON
API or file typically already returns — and lays it out with a live force
simulation (`layout.force` under the hood) stepped once per frame.

```js
import { Graph3D, NetworkChart, palette, loop } from 'graph3d.js';

const graphJSON = {
  nodes: [
    { id: 0, group: 'a' },
    { id: 1, group: 'a' },
    { id: 2, group: 'b' },
    { id: 3, group: 'b' },
    { id: 4, group: 'c' },
  ],
  links: [
    { source: 0, target: 1 },
    { source: 1, target: 2 },
    { source: 2, target: 3 },
    { source: 3, target: 4 },
    { source: 4, target: 0 },
  ],
};

const canvas = document.querySelector('canvas');
const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

const chart = new NetworkChart(scene.three)
  .data(graphJSON.nodes)
  .links(graphJSON.links)
  .linkDistance(2)
  .color((d) => d.group, palette.category10)
  .material('standard');
chart.render();

scene.camera.three.position.set(0, 4, 16);
scene.camera.lookAt(0, 0, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement);

// The simulation auto-pauses once it settles — tick() returns false then.
loop.add(() => chart.tick());
```

`.links()` entries reference nodes by the same identity `.data()` was given
(index-position here; pass real node objects/ids and `layout.force`
resolves either). `.cluster((d) => d.group)` adds a grouping force that
pulls same-group nodes together without changing the link topology. For a
JSON payload with a different shape (e.g. `{vertices, edges}`), just map it
to `{nodes, links}` before calling `.data()`/`.links()` — the chart itself
doesn't care where the arrays came from.

The full version, including live node insertion and a cluster-force
toggle, is `examples/14-network-chart/`.
