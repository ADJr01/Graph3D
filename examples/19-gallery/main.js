import * as THREE from 'three';
import {
  Graph3D,
  BarChart,
  LineChart,
  ScatterChart,
  AreaChart,
  SurfaceChart,
  HeatmapChart,
  NetworkChart,
  TreeChart,
  PackChart,
  PieChart,
  VolumeChart,
  scale,
  palette,
  loop,
} from '../../src/index.js';

// Prompt 144 — the Phase 8 homepage hero: one of every chart type on one
// page, in one shared scene/camera. Every chart's objects must attach to a
// real THREE.Scene (GraphObject.js validates `instanceof THREE.Scene`), so
// each chart is built against the real scene, then its newly-added objects
// are reparented into a positioned+rescaled THREE.Group — laying out a 4×3
// floor grid without touching any library code. Natural chart footprints
// vary wildly (a hand-tuned domain still leaves PackChart's recursively
// relaxed sphere-packing radius or NetworkChart's charge-repulsion spread
// an order of magnitude bigger than a unit-cube VolumeChart), so each cell's
// content is measured via `THREE.Box3` after building and rescaled to a
// common target size rather than hand-fit per chart type.

const GRID_COLUMNS = 4;
const SPACING = 8;
const CELL_TARGET_SIZE = 4.5;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

let cellIndex = 0;
/**
 * Runs `buildFn` (which constructs+renders one chart against `scene.three`),
 * then `settleFn` if given (e.g. pre-ticking a force simulation so its
 * settled size gets measured, not its freshly-seeded one), then moves every
 * object either just added into a `content` group, rescaled+recentered so
 * its bounding box fits `CELL_TARGET_SIZE`, then positions that inside a
 * `cell` group on the grid.
 */
function placeCell(buildFn, settleFn) {
  const col = cellIndex % GRID_COLUMNS;
  const row = Math.floor(cellIndex / GRID_COLUMNS);
  cellIndex++;

  const before = new Set(scene.three.children);
  buildFn();
  if (settleFn) settleFn();

  const content = new THREE.Group();
  scene.three.add(content);
  for (const child of [...scene.three.children]) {
    if (!before.has(child) && child !== content) content.add(child);
  }

  const box = new THREE.Box3().setFromObject(content);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scaleFactor = CELL_TARGET_SIZE / Math.max(size.x, size.y, size.z, 0.001);
  content.scale.setScalar(scaleFactor);
  content.position.set(-center.x * scaleFactor, -center.y * scaleFactor, -center.z * scaleFactor);

  const cell = new THREE.Group();
  cell.position.set((col - 1.5) * SPACING, 0, (row - 1) * SPACING);
  cell.add(content);
  scene.three.add(cell);
}

/** Small nested-object hierarchy for TreeChart/PackChart — leaves carry `.value`, internal nodes just `.children`. */
function makeHierarchy(depth, breadth) {
  let nextId = 0;
  function build(level) {
    nextId += 1;
    if (level >= depth) return { id: `n${nextId}`, value: 1 + Math.random() * 3 };
    return { id: `n${nextId}`, children: Array.from({ length: breadth }, () => build(level + 1)) };
  }
  return build(0);
}

let lineChart;
let networkChart;

// ── Bar ──────────────────────────────────────────────────────────────────

placeCell(() => {
  const barCategories = ['A', 'B', 'C', 'D'];
  const barSeries = ['x', 'y'];
  const barRows = barCategories.flatMap((category) => barSeries.map((series) => ({ category, series, value: 2 + Math.random() * 8 })));
  const barX = scale.band().domain(barCategories).range([-2.2, 2.2]).paddingInner(0.3);
  const barY = scale.linear().domain([0, 10]).range([0, 3]);
  const barChart = new BarChart(scene.three)
    .x((d) => d.category, barX)
    .y((d) => d.value, barY)
    .color((d) => d.value)
    .grouped((d) => d.series);
  barChart.data(barRows, (d) => `${d.category}:${d.series}`);
  barChart.render();
});

// ── Line ─────────────────────────────────────────────────────────────────

placeCell(() => {
  const LINE_POINTS = 16;
  const lineSeriesNames = ['s1', 's2'];
  const lineRows = lineSeriesNames.flatMap((series, si) =>
    Array.from({ length: LINE_POINTS }, (_, t) => ({ t, series, value: 0.5 + 0.4 * Math.sin(t / 2 + si * 2) })),
  );
  const lineX = scale.linear().domain([0, LINE_POINTS - 1]).range([-2.2, 2.2]);
  const lineY = scale.linear().domain([0, 1]).range([0, 2.5]);
  lineChart = new LineChart(scene.three)
    .x((d) => d.t, lineX)
    .y((d) => d.value, lineY)
    .series((d) => d.series)
    .curve('catmullRom');
  lineChart.data(lineRows);
  lineChart.render();
});

// ── Scatter ──────────────────────────────────────────────────────────────

placeCell(() => {
  const SCATTER_COUNT = 200;
  const scatterRows = Array.from({ length: SCATTER_COUNT }, (_, id) => ({
    id,
    x: (Math.random() - 0.5) * 4,
    y: (Math.random() - 0.5) * 4,
    z: (Math.random() - 0.5) * 4,
    size: 0.04 + Math.random() * 0.12,
    value: Math.random() * 100,
  }));
  const scatterChart = new ScatterChart(scene.three)
    .x((d) => d.x)
    .y((d) => d.y)
    .z((d) => d.z)
    .size((d) => d.size)
    .color((d) => d.value)
    .opacity(0.85);
  scatterChart.data(scatterRows, (d) => d.id);
  scatterChart.render();
});

// ── Area ─────────────────────────────────────────────────────────────────

placeCell(() => {
  const AREA_POINTS = 20;
  const areaRows = Array.from({ length: AREA_POINTS }, (_, t) => ({ t, value: 0.5 + 0.4 * Math.sin(t / 3) }));
  const areaX = scale.linear().domain([0, AREA_POINTS - 1]).range([-2.2, 2.2]);
  const areaY = scale.linear().domain([0, 1]).range([0, 2.5]);
  const areaChart = new AreaChart(scene.three)
    .x((d) => d.t, areaX)
    .y((d) => d.value, areaY)
    .baseline(0)
    .curve('catmullRom')
    .material('standard', { color: '#3b82f6' });
  areaChart.data(areaRows);
  areaChart.render();
});

// ── Surface ──────────────────────────────────────────────────────────────

placeCell(() => {
  const surfaceChart = new SurfaceChart(scene.three)
    .values((x, z) => Math.sin(x * 1.5) * Math.cos(z * 1.5) * 0.6)
    .xDomain([-2, 2])
    .zDomain([-2, 2])
    .resolution(24)
    .material('standard', { color: '#22c55e' });
  surfaceChart.render();
});

// ── Heatmap ──────────────────────────────────────────────────────────────

placeCell(() => {
  const HEATMAP_SIZE = 10;
  const heatmapRows = [];
  for (let row = 0; row < HEATMAP_SIZE; row++) {
    for (let col = 0; col < HEATMAP_SIZE; col++) {
      heatmapRows.push({ id: `${row}-${col}`, row, col, value: Math.random() });
    }
  }
  const heatmapX = scale.linear().domain([0, HEATMAP_SIZE - 1]).range([-2.2, 2.2]);
  const heatmapZ = scale.linear().domain([0, HEATMAP_SIZE - 1]).range([-2.2, 2.2]);
  const heatmapChart = new HeatmapChart(scene.three)
    .x((d) => d.col, heatmapX)
    .z((d) => d.row, heatmapZ)
    .color((d) => d.value);
  heatmapChart.data(heatmapRows, (d) => d.id);
  heatmapChart.render();
});

// ── Network ──────────────────────────────────────────────────────────────

placeCell(() => {
  const NETWORK_NODE_COUNT = 14;
  const networkNodes = Array.from({ length: NETWORK_NODE_COUNT }, (_, id) => ({ id, group: id % 3 }));
  const networkLinks = [];
  for (let i = 1; i < NETWORK_NODE_COUNT; i++) {
    networkLinks.push({ source: Math.floor(Math.random() * i), target: i });
  }
  networkChart = new NetworkChart(scene.three)
    .data(networkNodes)
    .links(networkLinks)
    .linkDistance(1)
    .color((d) => d.group, palette.category10);
  networkChart.render();
}, () => {
  // Pre-settle synchronously so the cell's bounding-box measurement (and
  // resulting scale factor) reflects the simulation's stabilized layout,
  // not its freshly-seeded starting spread.
  for (let i = 0; i < 300 && networkChart.tick(); i++);
});
loop.add(() => networkChart.tick());

// ── Tree ─────────────────────────────────────────────────────────────────

placeCell(() => {
  const treeChart = new TreeChart(scene.three)
    .levelHeight(0.7)
    .levelRadius(0.9)
    .color((d) => d.depth, palette.viridis);
  treeChart.data(makeHierarchy(2, 3));
  treeChart.render();
});

// ── Pack ─────────────────────────────────────────────────────────────────

placeCell(() => {
  const packChart = new PackChart(scene.three)
    .padding(0.12)
    .color((d) => -d.depth, palette.viridis)
    .material('standard', { transparent: true, opacity: 0.5 });
  packChart.data(makeHierarchy(2, 3));
  packChart.render();
});

// ── Pie ──────────────────────────────────────────────────────────────────

placeCell(() => {
  const pieRows = [
    { label: 'A', count: 12 },
    { label: 'B', count: 22 },
    { label: 'C', count: 9 },
    { label: 'D', count: 17 },
    { label: 'E', count: 14 },
  ];
  const pieChart = new PieChart(scene.three)
    .value((d) => d.count)
    .padAngle(0.02)
    .color((d) => d.label, palette.category10);
  pieChart.data(pieRows);
  pieChart.render();
});

// ── Volume ───────────────────────────────────────────────────────────────

placeCell(() => {
  const volumeChart = new VolumeChart(scene.three)
    .xDomain([-1, 1])
    .yDomain([-1, 1])
    .zDomain([-1, 1])
    .resolution(20)
    .steps(40)
    .densityScale(1.5)
    .palette(palette.plasma);
  volumeChart.values((x, y, z) => {
    const blob = (cx, cy, cz) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) * 2);
    return blob(0.4, 0.2, 0) + blob(-0.4, -0.2, 0.3);
  });
  volumeChart.render();
});

// ── Camera ───────────────────────────────────────────────────────────────

scene.camera.three.position.set(0, 34, 22);
scene.camera.lookAt(0, 0, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement).catch((error) => console.error('enableOrbitControls failed:', error));

// ── Resize ───────────────────────────────────────────────────────────────

function handleResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  g.setSize(width, height);
  const camera = scene.camera.three;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  lineChart.setResolution(width, height);
}
window.addEventListener('resize', handleResize);
handleResize();
