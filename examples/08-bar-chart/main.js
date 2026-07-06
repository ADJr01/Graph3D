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

const modeEl = document.getElementById('mode');
const countEl = document.getElementById('count');
const toggleEl = document.getElementById('toggle');

const x = scale.band().domain(CATEGORIES).range([-6, 6]).paddingInner(0.3);
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

toggleEl.addEventListener('click', () => {
  stacked = !stacked;
  if (stacked) chart.stacked((d) => d.series);
  else chart.grouped((d) => d.series);
  refresh(chart.data());
});

// ── Axes ─────────────────────────────────────────────────────────────────

new Axis().scale(x).orientation('x').tickSize(0.3).render(scene.three, 'xAxis');
new Axis().scale(y).orientation('y').tickCount(5).tickSize(0.3).render(scene.three, 'yAxis');

// ── Camera ───────────────────────────────────────────────────────────────

scene.camera.three.position.set(0, 8, 14);
scene.camera.lookAt(0, 2, 0);
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
