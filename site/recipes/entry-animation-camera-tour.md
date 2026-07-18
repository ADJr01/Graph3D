# Entry Animation + Camera Tour

The [data join recipe](/recipes/data-join-selections) snapped bars straight
to their final transform. Swap the `enter`/`update`/`exit` callbacks for
`.transition()` calls, and reframe the camera on whatever changed via
`CameraTour.flyTo()`.

```js
import * as THREE from 'three';
import { Graph3D, scale, color, palette, Selection, CameraTour } from 'graph3d.js';

const canvas = document.querySelector('canvas');
const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

const CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'F'];
const x = scale.band().domain(CATEGORIES).range([-6, 6]).paddingInner(0.3);
const y = scale.linear().domain([0, 100]).range([0, 6]);
const barColor = color.sequential(palette.viridis, [0, 100]);
const MIN_SCALE = 0.001; // a zero-scale mesh degenerates its matrix; keep it a hairline instead

function layoutStable(selection) {
  selection.attr('position.x', (d) => x(d.id) + x.bandwidth() / 2).attr('position.z', 0).attr('scale.x', x.bandwidth()).attr('scale.z', x.bandwidth());
}

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

/** Entering bars: snap x/z instantly, start squashed flat, then grow to height. */
function handleEnter(entered) {
  layoutStable(entered);
  entered.attr('position.y', MIN_SCALE / 2).attr('scale.y', MIN_SCALE).style('color', (d) => barColor(d.value));
  entered
    .transition()
    .duration(700)
    .delay((d, i) => i * 70) // stagger — each entering bar starts 70ms after the last
    .easing('easeOutBack')
    .attr('scale.y', (d) => Math.max(y(d.value), MIN_SCALE))
    .attr('position.y', (d) => y(d.value) / 2);
}

/** Updated bars: tween height/color to the new value. */
function handleUpdate(updated) {
  updated
    .transition()
    .duration(900)
    .easing('easeInOutCubic')
    .attr('position.y', (d) => y(d.value) / 2)
    .attr('scale.y', (d) => Math.max(y(d.value), MIN_SCALE))
    .attr('color', (d) => barColor(d.value));
}

/** Exiting bars: fade out, then free the slot only once the fade completes. */
function handleExit(exited) {
  exited.transition().duration(500).attr('opacity', 0).remove();
}

let activeCameraTour = null;

function frameOnTallest(dataset) {
  const tallest = dataset.reduce((a, b) => (b.value > a.value ? b : a));
  const barX = x(tallest.id) + x.bandwidth() / 2;
  const barTop = y(tallest.value);

  activeCameraTour?.cancel(); // a still-running previous reframe shouldn't fight this one
  activeCameraTour = CameraTour.flyTo(scene.camera.three, {
    at: [barX + 5, barTop + 5, 9],
    lookAt: [barX, barTop / 2, 0],
    fov: 55,
    duration: 1400,
    easing: 'easeInOutCubic',
  });
}

function update(dataset) {
  const joined = selection.data(dataset, (d) => d.id);
  selection = joined.join(handleEnter, handleUpdate, handleExit);
  frameOnTallest(dataset);
}

scene.camera.three.position.set(0, 8, 14);
scene.camera.lookAt(0, 2, 0);

update([
  { id: 'A', value: 30 },
  { id: 'B', value: 88 },
  { id: 'C', value: 55 },
]);
// Call update(nextDataset) again at any time — membership can change freely.
```

`CameraTour.flyTo()` returns a handle with `.cancel()`, so a reframe
triggered while a previous one is still mid-flight doesn't fight it —
cancel first, then start the new tour. `.transition()`'s own interrupt
semantics work the same way per-attribute: re-transitioning a selection
that's still animating takes over from its current in-flight value, it
doesn't jump back to the pre-transition state first.

The full version, including a periodic re-join that exercises interrupted
transitions for real, is `examples/05-transitions/`.
