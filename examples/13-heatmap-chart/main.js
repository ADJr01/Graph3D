import { Graph3D, HeatmapChart, scale, loop } from '../../src/index.js';

// Phase 8 example (Prompt 136): HeatmapChart's two render modes —
// 'plane' (default): a flat 2D grid of tiles, color-only.
// 'voxel': a full 3D grid of cubes, color + .opacity() for density.
// Both dispatch through the same GraphChart per-datum render path, so a
// million-cell grid renders as one GraphInstancedObject for free, same as
// BarChart/ScatterChart.

const GRID_SIZE = 24;
const UPDATE_INTERVAL_SEC = 2;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

const modeStateEl = document.getElementById('modeState');
const cellCountEl = document.getElementById('cellCount');
const toggleEl = document.getElementById('toggle');

const x = scale.linear().domain([0, GRID_SIZE - 1]).range([-6, 6]);
const z = scale.linear().domain([0, GRID_SIZE - 1]).range([-6, 6]);

let phase = 0;
function grid2D() {
  const rows = [];
  for (let col = 0; col < GRID_SIZE; col++) {
    for (let row = 0; row < GRID_SIZE; row++) {
      const value = Math.sin(col / 3 + phase) * Math.cos(row / 3 + phase) * 0.5 + 0.5;
      rows.push({ id: `${col}_${row}`, col, row, value });
    }
  }
  return rows;
}

const chart = new HeatmapChart(scene.three)
  .x((d) => d.col, x)
  .z((d) => d.row, z)
  .color((d) => d.value)
  .material('standard');

let mode = 'plane';

function refreshPanel() {
  modeStateEl.textContent = mode;
  cellCountEl.textContent = String(chart.data().length);
}

function renderCurrent() {
  chart.data(grid2D(), (d) => d.id);
  chart.render();
  refreshPanel();
}

renderCurrent();

toggleEl.addEventListener('click', () => {
  mode = mode === 'plane' ? 'voxel' : 'plane';
  chart.mode(mode).opacity(mode === 'voxel' ? (d) => 0.3 + 0.7 * d.value : 1);
  chart.data(grid2D(), (d) => d.id);
  chart.update();
  refreshPanel();
});

// ── Camera ───────────────────────────────────────────────────────────────

scene.camera.three.position.set(0, 8, 14);
scene.camera.lookAt(0, 0, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement).catch((error) => console.error('enableOrbitControls failed:', error));

// ── Periodic re-join — animates the heat pattern ─────────────────────────

let elapsedSinceUpdate = 0;
loop.add((deltaSec) => {
  elapsedSinceUpdate += deltaSec;
  if (elapsedSinceUpdate >= UPDATE_INTERVAL_SEC) {
    elapsedSinceUpdate = 0;
    phase += 0.4;
    chart.data(grid2D(), (d) => d.id);
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
