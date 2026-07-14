# The Data Join & Selections, Deep-Dive

Every chart type is built on `Selection` + `.data(rows, keyFn).join(enter, update, exit)`
— the same enter/update/exit mental model as D3's own `.data().join()`. This
recipe builds a bar "chart" from nothing but `Selection`, a scale, and a
color ramp, with no `BarChart` involved, so every moving part is visible.

```js
import * as THREE from 'three';
import { Graph3D, scale, color, palette, Selection, Axis } from 'graph3d.js';

const canvas = document.querySelector('canvas');
const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

const CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'F'];
const x = scale.band().domain(CATEGORIES).range([-6, 6]).paddingInner(0.3);
const y = scale.linear().domain([0, 100]).range([0, 6]);
const barColor = color.sequential(palette.viridis, [0, 100]);

/** Writes every bar's transform/color from its bound datum. */
function layoutBars(selection) {
  selection
    .attr('position.x', (d) => x(d.id) + x.bandwidth() / 2)
    .attr('position.z', 0)
    .attr('position.y', (d) => y(d.value) / 2)
    .attr('scale.x', x.bandwidth())
    .attr('scale.z', x.bandwidth())
    .attr('scale.y', (d) => Math.max(y(d.value), 0.001))
    .style('color', (d) => barColor(d.value));
}

// A Selection with no members yet, plus a template mesh .enter() clones from.
let selection = new Selection({
  type: 'meshes',
  meshes: [],
  template: {
    scene: scene.three,
    name: 'bar',
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 }),
  },
});

function update(dataset) {
  const joined = selection.data(dataset, (d) => d.id); // dataset keyed by id — this is the join
  selection = joined.join(
    (entered) => layoutBars(entered), // new rows: mesh just got cloned from the template
    (updated) => layoutBars(updated), // existing rows: same mesh, new datum
    (exited) => exited.remove(), // rows no longer in dataset: dispose the mesh
  );
}

update([
  { id: 'A', value: 42 },
  { id: 'B', value: 88 },
  { id: 'C', value: 15 },
]);

new Axis().scale(x).orientation('x').tickSize(0.3).render(scene.three, 'xAxis');
new Axis().scale(y).orientation('y').tickCount(5).tickSize(0.3).render(scene.three, 'yAxis');
scene.camera.three.position.set(0, 8, 14);
scene.camera.lookAt(0, 2, 0);

// Re-run update() with a different subset of CATEGORIES at any time — bars
// for categories no longer present dissolve via the exit handler, bars for
// new categories clone from the template via the enter handler, and shared
// categories just morph in place via the update handler.
```

`join()`'s three callbacks receive plain `Selection`s over just that subset
— `entered`/`updated`/`exited` are never a mix. Swap `exited.remove()` for
`exited.transition().duration(500).attr('opacity', 0).remove()` to fade
instead of pop; see [Entry Animation + Camera Tour](/recipes/entry-animation-camera-tour)
for the full transitioned version, including staggered enter and interrupt
handling. `Selection` also has an `instanced` backend (one
`GraphInstancedObject` instead of many `GraphMesh`es) for datum counts where
one draw call per bar isn't affordable — same `.data().join()` API either
way. The full runnable version, with a periodic re-join proving enter/exit
free real GPU resources correctly, is `examples/04-compose/`.
