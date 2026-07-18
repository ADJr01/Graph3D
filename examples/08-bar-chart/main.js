import * as THREE from 'three';
import { Graph3D, BarChart, scale, Axis, loop } from '../../src/index.js';

// Phase 8 example (Prompt 132): BarChart replaces the hand-rolled Selection +
// layout function 04-compose used — grouped/stacked series layout, viridis
// coloring, and staggered transitions all come from BarChart's own defaults
// instead of being wired by hand.

const CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'F'];
const SERIES = ['Product A', 'Product B'];
const MAX_VALUE = 100;
const UPDATE_INTERVAL_SEC = 2.5;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

// ── Visual polish — midnight-blue backdrop, ground plane, shadows ──────────
// No HDR is ever loaded here — scene.applyTheme()/setHDR() are never called,
// since the .hdr binaries aren't bundled (see examples/02-scene's ponytail
// note) and would reject on fetch. Lighting/background are composed by hand
// instead: a deep indigo background + matching exponential fog so the ground
// fades into it at a distance rather than showing a seam.

scene.environment.setBackground(0x0a1330);
scene.environment.setFog({ type: 'exponential', color: 0x0a1330, density: 0.015 });
scene.light.setKeyIntensity(3.5).setRimIntensity(2.2);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(16, 8),
  new THREE.MeshStandardMaterial({ color: 0x111d3d, roughness: 0.85, metalness: 0.1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(6, -0.6, 0); // below the x-axis spine/tick-label offset so it doesn't occlude them; x centered under the bar cluster (see x-scale range below)
ground.receiveShadow = true;
scene.add(ground);

await scene.shadows.enable('pcf-soft');
scene.shadows.setQuality('high');

const modeEl = document.getElementById('mode');
const countEl = document.getElementById('count');
const toggleEl = document.getElementById('toggle');

// Axis is always pinned at x=0/z=0 (no offset option) — ranging the category
// band from 0 (not -6) keeps every bar to the right of the y-axis spine
// instead of straddling it, so the y-axis ticks never sit behind a bar.
const x = scale.band().domain(CATEGORIES).range([0, 12]).paddingInner(0.3);
const y = scale.linear().domain([0, MAX_VALUE]).range([0, 6]);

const chart = new BarChart(scene.three)
  .x((d) => d.category, x)
  .y((d) => d.value, y)
  .color((d) => d.value)
  .grouped((d) => d.series);

let stacked = false;

function randomRows() {
  const rows = [];
  for (const category of CATEGORIES) {
    for (const s of SERIES) rows.push({ category, series: s, value: 10 + Math.random() * (MAX_VALUE - 10) });
  }
  return rows;
}

function refresh(rows) {
  chart.data(rows, (d) => `${d.category}:${d.series}`);
  chart.render();
  modeEl.textContent = stacked ? 'stacked' : 'grouped';
  countEl.textContent = String(chart.data().length);
}

refresh(randomRows());

for (const bar of scene.selectByName('chart')) {
  bar.three.castShadow = true;
  bar.three.receiveShadow = true;
}

toggleEl.addEventListener('click', () => {
  stacked = !stacked;
  if (stacked) chart.stacked((d) => d.series);
  else chart.grouped((d) => d.series);
  refresh(chart.data());
});

// ── Axes ─────────────────────────────────────────────────────────────────
// labelStyle brightens/enlarges the tick text and outlines it in black so it
// reads clearly against both the dark backdrop and the bright viridis bars —
// render() needs { camera } too, otherwise it only builds the stub label
// metadata (axis.labels) and never the visible SDFText mesh.

const axisLabelStyle = { fontSize: 0.42, color: '#ffffff', outline: { color: '#000000', width: 0.25 } };

new Axis()
  .scale(x)
  .orientation('x')
  .tickSize(0.3)
  .labelStyle(axisLabelStyle)
  .render(scene.three, 'xAxis', { camera: scene.camera.three });
new Axis()
  .scale(y)
  .orientation('y')
  .tickCount(5)
  .tickSize(0.3)
  .labelStyle(axisLabelStyle)
  .render(scene.three, 'yAxis', { camera: scene.camera.three });

// ── Camera ───────────────────────────────────────────────────────────────

scene.camera.three.position.set(6, 9, 22);
scene.camera.lookAt(6, 3, 0);
scene.camera.setMaxZoomIn(3); // never let the user dolly closer than 3 units
scene.camera.setMaxZoomOut(28); // never let the user dolly past 28 units away
scene.camera.enableOrbitControls(g.renderer.three.domElement).catch((error) => console.error('enableOrbitControls failed:', error));

// ── Periodic re-join — proves update() re-lays-out and re-colors live ───────

let elapsedSinceUpdate = 0;
loop.add((deltaSec) => {
  elapsedSinceUpdate += deltaSec;
  if (elapsedSinceUpdate >= UPDATE_INTERVAL_SEC) {
    elapsedSinceUpdate = 0;
    chart.data(randomRows(), (d) => `${d.category}:${d.series}`);
    chart.update();
    countEl.textContent = String(chart.data().length);
  }
});

// ── Resize ───────────────────────────────────────────────────────────────

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
