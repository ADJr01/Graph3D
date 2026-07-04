import * as THREE from 'three';
import { Graph3D, loop, scale, palette, color, Selection, Axis, annotation, CameraTour } from '../../src/index.js';

// Phase 5 example (Prompt 97): the Phase 4 capstone's bar layout, now animated
// end-to-end with SelectionTransition (Prompt 91) instead of snapping —
// entering bars grow in staggered, updated bars morph smoothly, exiting bars
// dissolve before their slot is freed, and a CameraTour (Prompt 94) reframes
// on the new tallest bar every cycle. Re-transitioning the same bars faster
// than they can finish (try shortening UPDATE_INTERVAL_SEC) exercises Prompt
// 93's interrupt semantics for real, not just in tests.

const CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const MAX_VALUE = 100;
const UPDATE_INTERVAL_SEC = 2;
const MIN_BAR_SCALE = 0.001; // a zero-scale mesh degenerates its matrix; keep it a hairline instead
const ENTER_DURATION_MS = 700;
const ENTER_STAGGER_MS = 70;
const UPDATE_DURATION_MS = 900;
const EXIT_DURATION_MS = 500;
const CAMERA_TOUR_DURATION_MS = 1400;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

const countEl = document.getElementById('count');
const maxEl = document.getElementById('max');

// ── Scales & palette — same shape as the Phase 4 capstone ───────────────────

const x = scale.band().domain(CATEGORIES).range([-6, 6]).paddingInner(0.3);
const y = scale.linear().domain([0, MAX_VALUE]).range([0, 6]);
const barColor = color.sequential(palette.viridis, [0, MAX_VALUE]);

/** The properties that never change for an existing category across update cycles. */
function layoutStable(selection) {
  selection
    .attr('position.x', (d) => x(d.id) + x.bandwidth() / 2)
    .attr('position.z', 0)
    .attr('scale.x', x.bandwidth())
    .attr('scale.z', x.bandwidth());
}

// ── The bar "chart", hand-rolled with Selection + join + SelectionTransition ─

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

/** A random subset of categories, each with a random value — deliberately churns membership every call. */
function randomDataset() {
  const activeCount = 4 + Math.floor(Math.random() * (CATEGORIES.length - 3));
  const active = [...CATEGORIES].sort(() => Math.random() - 0.5).slice(0, activeCount);
  return active.map((id) => ({ id, value: 10 + Math.random() * (MAX_VALUE - 10) }));
}

/** Entering bars: snap x/z + color instantly, start squashed flat, then grow to height staggered. */
function handleEnter(entered) {
  layoutStable(entered);
  entered.attr('position.y', MIN_BAR_SCALE / 2).attr('scale.y', MIN_BAR_SCALE).style('color', (d) => barColor(d.value));
  entered
    .transition()
    .duration(ENTER_DURATION_MS)
    .delay((d, i) => i * ENTER_STAGGER_MS)
    .easing('easeOutBack')
    .attr('scale.y', (d) => Math.max(y(d.value), MIN_BAR_SCALE))
    .attr('position.y', (d) => y(d.value) / 2);
}

/** Updated bars: morph height/color to the new datum's value — x/z stay put (the band scale doesn't move). */
function handleUpdate(updated) {
  updated
    .transition()
    .duration(UPDATE_DURATION_MS)
    .easing('easeInOutCubic')
    .attr('position.y', (d) => y(d.value) / 2)
    .attr('scale.y', (d) => Math.max(y(d.value), MIN_BAR_SCALE))
    .attr('color', (d) => barColor(d.value));
}

/** Exiting bars: fade out, then free the slot only once the fade completes. */
function handleExit(exited) {
  exited.transition().duration(EXIT_DURATION_MS).attr('opacity', 0).remove();
}

function update(dataset) {
  const joined = selection.data(dataset, (d) => d.id);
  selection = joined.join(handleEnter, handleUpdate, handleExit);
  countEl.textContent = String(selection.size());
  frameOnMax(dataset);
}

// ── Camera: an initial framing, then CameraTour.flyTo() reframes on the new
// tallest bar every update cycle (Prompt 94/97) ─────────────────────────────

scene.camera.three.position.set(0, 8, 14);
scene.camera.lookAt(0, 2, 0);

let activeCameraTour = null;

function frameOnMax(dataset) {
  const tallest = dataset.reduce((a, b) => (b.value > a.value ? b : a));
  const barX = x(tallest.id) + x.bandwidth() / 2;
  const barTop = y(tallest.value);
  maxEl.textContent = `${tallest.id} (${tallest.value.toFixed(1)})`;

  activeCameraTour?.cancel(); // a still-running previous reframe shouldn't fight this one
  activeCameraTour = CameraTour.flyTo(scene.camera.three, {
    at: [barX + 5, barTop + 5, 9],
    lookAt: [barX, barTop / 2, 0],
    fov: 55,
    duration: CAMERA_TOUR_DURATION_MS,
    easing: 'easeInOutCubic',
  });
}

update(randomDataset());

// ── Axes & a reference line ──────────────────────────────────────────────────

new Axis().scale(x).orientation('x').tickSize(0.3).render(scene.three, 'xAxis');
new Axis().scale(y).orientation('y').tickCount(5).tickSize(0.3).render(scene.three, 'yAxis');
annotation.referenceLine(y, MAX_VALUE / 2, { scene: scene.three, name: 'midline', orientation: 'y', extent: 13 });

// ── Periodic re-join — proves this is a live, continuously-transitioning chart ─

let elapsedSinceUpdate = 0;
loop.add((deltaSec) => {
  elapsedSinceUpdate += deltaSec;
  if (elapsedSinceUpdate >= UPDATE_INTERVAL_SEC) {
    elapsedSinceUpdate = 0;
    update(randomDataset());
  }
});

// ── Resize ───────────────────────────────────────────────────────────────────

function handleResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  g.setSize(width, height);
  const camera = scene.camera.three;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', handleResize);
handleResize();
