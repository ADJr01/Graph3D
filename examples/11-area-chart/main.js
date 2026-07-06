import { Graph3D, AreaChart, scale, Axis, loop } from '../../src/index.js';

// Phase 8 example (Prompt 135): AreaChart renders one extruded wall via
// generator.area() — update() disposes and rebuilds the wall mesh from
// fresh values each time (no in-place mutation; see AreaChart's own doc
// on why that optimization isn't warranted here yet).

const POINT_COUNT = 20;
const UPDATE_INTERVAL_SEC = 2.5;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

const curveNameEl = document.getElementById('curveName');
const toggleEl = document.getElementById('toggle');

const x = scale.linear().domain([0, POINT_COUNT - 1]).range([-6, 6]);
const y = scale.linear().domain([0, 1]).range([0, 5]);

const chart = new AreaChart(scene.three)
  .x((d) => d.t, x)
  .y((d) => d.value, y)
  .baseline(0)
  .curve('linear')
  .material('standard', { color: '#3b82f6' });

let curveIsCatmullRom = false;

function randomRows() {
  const phase = Math.random() * Math.PI * 2;
  return Array.from({ length: POINT_COUNT }, (_, t) => ({
    t,
    value: 0.5 + 0.4 * Math.sin(t / 3 + phase),
  }));
}

function refresh(rows) {
  chart.data(rows);
  chart.render();
  curveNameEl.textContent = chart.curve();
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

scene.camera.three.position.set(0, 4, 12);
scene.camera.lookAt(0, 2, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement).catch((error) => console.error('enableOrbitControls failed:', error));

// ── Periodic re-join — proves update() rebuilds the wall from fresh values ──

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
  const camera = scene.camera.three;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', handleResize);
handleResize();
