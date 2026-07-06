import { Graph3D, LineChart, scale, Axis, loop } from '../../src/index.js';

// Phase 8 example (Prompt 133): LineChart renders one Line2 per series via
// .series(keyFn) — same point count on every re-join, so update() mutates
// each line's vertex buffer in place instead of rebuilding it.

const SERIES = ['Alpha', 'Beta', 'Gamma'];
const POINT_COUNT = 24;
const UPDATE_INTERVAL_SEC = 2.5;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

const curveNameEl = document.getElementById('curveName');
const countEl = document.getElementById('count');
const toggleEl = document.getElementById('toggle');

const x = scale.linear().domain([0, POINT_COUNT - 1]).range([-6, 6]);
const y = scale.linear().domain([0, 1]).range([0, 4]);

const chart = new LineChart(scene.three)
  .x((d) => d.t, x)
  .y((d) => d.value, y)
  .series((d) => d.series)
  .curve('linear');

let curveIsCatmullRom = false;

function randomRows() {
  const rows = [];
  for (const series of SERIES) {
    const phase = Math.random() * Math.PI * 2;
    for (let t = 0; t < POINT_COUNT; t++) {
      rows.push({ t, series, value: 0.5 + 0.45 * Math.sin(t / 3 + phase) });
    }
  }
  return rows;
}

function refresh(rows) {
  chart.data(rows);
  chart.render();
  curveNameEl.textContent = chart.curve();
  countEl.textContent = String(SERIES.length);
}

refresh(randomRows());

toggleEl.addEventListener('click', () => {
  curveIsCatmullRom = !curveIsCatmullRom;
  chart.curve(curveIsCatmullRom ? 'catmullRom' : 'linear');
  refresh(chart.data());
});

// ── Axes ─────────────────────────────────────────────────────────────────

new Axis().scale(x).orientation('x').tickSize(0.3).render(scene.three, 'xAxis');
new Axis().scale(y).orientation('y').tickCount(5).tickSize(0.3).render(scene.three, 'yAxis');

// ── Camera ───────────────────────────────────────────────────────────────

scene.camera.three.position.set(0, 5, 12);
scene.camera.lookAt(0, 2, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement).catch((error) => console.error('enableOrbitControls failed:', error));

// ── Periodic re-join — same point count, proves update() mutates in place ──

let elapsedSinceUpdate = 0;
loop.add((deltaSec) => {
  elapsedSinceUpdate += deltaSec;
  if (elapsedSinceUpdate >= UPDATE_INTERVAL_SEC) {
    elapsedSinceUpdate = 0;
    chart.data(randomRows());
    chart.update();
  }
});

// ── Resize ───────────────────────────────────────────────────────────────

function handleResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  g.setSize(width, height);
  chart.setResolution(width, height);
  const camera = scene.camera.three;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', handleResize);
handleResize();
