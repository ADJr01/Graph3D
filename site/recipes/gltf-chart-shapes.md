# GLTF Chart Shapes

`GraphObjectLoader.loadGLTF()` fetches a `.gltf`/`.glb` model once per URL
(ref-counted) and hands every caller its own clone, so calling it once per
datum is the idiomatic way to place a real model at each data point — the
network fetch and parse only happen the first time.

```js
import { Graph3D, scale, GraphObjectLoader } from 'graph3d.js';

const canvas = document.querySelector('canvas');
const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

const rows = [
  { id: 'A', x: 0, value: 30 },
  { id: 'B', x: 1, value: 65 },
  { id: 'C', x: 2, value: 45 },
];

const x = scale.band().domain(rows.map((d) => d.id)).range([-6, 6]).paddingInner(0.4);
const y = scale.linear().domain([0, 100]).range([0, 6]);

const markers = await Promise.all(
  rows.map((d) =>
    GraphObjectLoader.loadGLTF('/models/marker.glb', { scene: scene.three, name: `marker-${d.id}` }),
  ),
);

markers.forEach((marker, i) => {
  const d = rows[i];
  marker.three.position.set(x(d.id) + x.bandwidth() / 2, y(d.value), 0);
  const scaleFactor = 0.3 + (d.value / 100) * 0.7;
  marker.three.scale.setScalar(scaleFactor);
});

scene.camera.three.position.set(0, 8, 14);
scene.camera.lookAt(0, 2, 0);

// Cleanup: each marker's dispose() releases its own clone; the underlying
// parsed root is only fully disposed once every clone has been released.
// markers.forEach((marker) => marker.dispose());
```

`.three` is every `GraphObject` wrapper's escape hatch to the raw
`THREE.Object3D` — position, rotate, and scale it exactly as you would any
other Three.js node. `GraphObjectLoader` also has `.loadOBJ()` (with an
optional companion `.mtl`) and `.loadFBX()`, and `.configureDracoDecoder()`/
`.configureKTX2Transcoder()` for compressed assets — same ref-counted
load/clone/dispose shape for all three formats.

Built-in chart types render every datum as one of three procedural shapes
(`sphere`/`cube`/`cone`, via `.shape()`) — swapping in an arbitrary loaded
mesh per datum isn't wired through `chart.shape()` today, so this recipe
composes `GraphObjectLoader` directly against a scene rather than through a
chart instance.
