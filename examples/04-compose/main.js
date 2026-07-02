import * as THREE from 'three';
import { Graph3D, loop, scale, palette, color, Selection, Axis, annotation } from '../../src/index.js';

// Phase 4 capstone (Prompt 85): the headline "D3 for 3D" example, built from
// only Layers 1-4 — no chart class exists yet. A bar's position/scale/color
// is computed by hand from `scale.band()`/`scale.linear()`/`color.sequential()`
// and written through `Selection.attr()`/`.style()`; the dataset re-joins on
// an interval via `.data(newData, keyFn).join(...)`, proving enter/update/exit
// materialize (and free) real GraphMesh instances correctly across cycles.

const CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const MAX_VALUE = 100;
const UPDATE_INTERVAL_SEC = 2.5;
const MIN_BAR_SCALE = 0.001; // a zero-scale mesh degenerates its matrix; keep it a hairline instead

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

const statusEl = document.getElementById('status');
const countEl = document.getElementById('count');

function reportError(context, error) {
  console.error(`[04-compose] ${context}:`, error);
  statusEl.textContent = `${context}: ${error.message}`;
}

// ── Scales & palette — Phase 4A/4B ──────────────────────────────────────────

const x = scale.band().domain(CATEGORIES).range([-6, 6]).paddingInner(0.3);
const y = scale.linear().domain([0, MAX_VALUE]).range([0, 6]);
const barColor = color.sequential(palette.viridis, [0, MAX_VALUE]);

/** Writes every bar's transform/color from its bound datum — the "hand-rolled bar layout". */
function layoutBars(selection) {
  selection
    .attr('position.x', (d) => x(d.id) + x.bandwidth() / 2)
    .attr('position.z', 0)
    .attr('position.y', (d) => y(d.value) / 2)
    .attr('scale.x', x.bandwidth())
    .attr('scale.z', x.bandwidth())
    .attr('scale.y', (d) => Math.max(y(d.value), MIN_BAR_SCALE))
    .style('color', (d) => barColor(d.value));
}

// ── The bar "chart", hand-rolled with Selection + join — Phase 4D ──────────

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

function update(dataset) {
  const joined = selection.data(dataset, (d) => d.id);
  selection = joined.join(
    (entered) => layoutBars(entered),
    (updated) => layoutBars(updated),
    (exited) => exited.remove(),
  );
  countEl.textContent = String(selection.size());
}

update(randomDataset());

// ── Axes & a reference line — Phase 4E ──────────────────────────────────────

new Axis().scale(x).orientation('x').tickSize(0.3).render(scene.three, 'xAxis');
new Axis().scale(y).orientation('y').tickCount(5).tickSize(0.3).render(scene.three, 'yAxis');
annotation.referenceLine(y, MAX_VALUE / 2, { scene: scene.three, name: 'midline', orientation: 'y', extent: 13 });

// ── Camera ───────────────────────────────────────────────────────────────

scene.camera.three.position.set(0, 8, 14);
scene.camera.lookAt(0, 2, 0);
scene.camera
  .enableOrbitControls(g.renderer.three.domElement)
  .catch((error) => reportError('enableOrbitControls failed', error));

// ── Periodic re-join — proves this is a live join loop, not a one-shot render ─

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
