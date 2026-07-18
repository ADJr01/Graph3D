<template>
  <div class="gallery-demo">
    <div class="gallery-controls">
      <label>
        Theme
        <select v-model="themeName" @change="handleThemeChange">
          <option v-for="name in THEME_NAMES" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <label>
        PostFX
        <select v-model="postfxName" @change="handlePostfxChange">
          <option value="none">none</option>
          <option v-for="name in POSTFX_PRESET_NAMES" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <span v-if="statusText" class="gallery-status">{{ statusText }}</span>
    </div>
    <canvas ref="canvasEl" class="gallery-canvas"></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
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
} from '../../../../src/index.js';

// Adapted from examples/19-gallery/main.js — one of every chart type on one
// shared scene/camera, laid out on a grid by building each chart against the
// real scene then reparenting its newly-added objects into a positioned,
// bounding-box-rescaled group (GraphObject.js requires a real THREE.Scene,
// so this is how a multi-chart layout is composed without touching library
// code — see the Multi-Chart Dashboard recipe for the same technique).
// This component additionally wires GraphScene.applyTheme() and
// Graph3D.postfx.preset() to live <select> controls (the "× themes ×
// postfx" part of Prompt 188), which the static example doesn't need.

const GRID_COLUMNS = 4;
const SPACING = 8;
const CELL_TARGET_SIZE = 4.5;
const NETWORK_SETTLE_TICKS = 300;

const THEME_NAMES = ['studio-light', 'studio-dark', 'cinema-night', 'clinical-white', 'terminal-green', 'editorial', 'cyberpunk', 'museum'];
const POSTFX_PRESET_NAMES = ['cinematic', 'clean', 'dramatic', 'dreamy', 'editorial', 'cyberpunk', 'minimal'];

const canvasEl = ref(null);
// Defaults to a theme with hdr: null (see src/scene/GraphSceneThemes.js) —
// the other themes' HDR presets (studio-1k/cinema-night/daylight) have no
// bundled binary asset yet (a known, pre-existing gap — see skipping_list.md),
// so applyTheme() would reject and leave the canvas black on first paint.
// Still selectable from the dropdown — switching triggers the same, real,
// surfaced failure the [Theme Swap recipe](/recipes/theme-swap) documents.
const themeName = ref('clinical-white');
// Defaults to no PostFX so the charts themselves are clearly visible on
// first paint — every preset is still one dropdown selection away.
const postfxName = ref('none');
const statusText = ref('');

let g = null;
let scene = null;
let networkChart = null;
let lineChart = null;
let resizeObserver = null;

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

function buildGallery() {
  let cellIndex = 0;

  /** Builds one chart against the real scene, then reparents+rescales its new objects into a grid cell. */
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

  placeCell(() => {
    const barCategories = ['A', 'B', 'C', 'D'];
    const barSeries = ['x', 'y'];
    const barRows = barCategories.flatMap((category) => barSeries.map((series) => ({ category, series, value: 2 + Math.random() * 8 })));
    const barX = scale.band().domain(barCategories).range([-2.2, 2.2]).paddingInner(0.3);
    const barY = scale.linear().domain([0, 10]).range([0, 3]);
    const barChart = new BarChart(scene.three).x((d) => d.category, barX).y((d) => d.value, barY).color((d) => d.value).grouped((d) => d.series);
    barChart.data(barRows, (d) => `${d.category}:${d.series}`);
    barChart.render();
  });

  placeCell(() => {
    const LINE_POINTS = 16;
    const lineSeriesNames = ['s1', 's2'];
    const lineRows = lineSeriesNames.flatMap((series, si) =>
      Array.from({ length: LINE_POINTS }, (_, t) => ({ t, series, value: 0.5 + 0.4 * Math.sin(t / 2 + si * 2) })),
    );
    const lineX = scale.linear().domain([0, LINE_POINTS - 1]).range([-2.2, 2.2]);
    const lineY = scale.linear().domain([0, 1]).range([0, 2.5]);
    lineChart = new LineChart(scene.three).x((d) => d.t, lineX).y((d) => d.value, lineY).series((d) => d.series).curve('catmullRom');
    lineChart.data(lineRows);
    lineChart.render();
  });

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
    const scatterChart = new ScatterChart(scene.three).x((d) => d.x).y((d) => d.y).z((d) => d.z).size((d) => d.size).color((d) => d.value).opacity(0.85);
    scatterChart.data(scatterRows, (d) => d.id);
    scatterChart.render();
  });

  placeCell(() => {
    const AREA_POINTS = 20;
    const areaRows = Array.from({ length: AREA_POINTS }, (_, t) => ({ t, value: 0.5 + 0.4 * Math.sin(t / 3) }));
    const areaX = scale.linear().domain([0, AREA_POINTS - 1]).range([-2.2, 2.2]);
    const areaY = scale.linear().domain([0, 1]).range([0, 2.5]);
    const areaChart = new AreaChart(scene.three).x((d) => d.t, areaX).y((d) => d.value, areaY).baseline(0).curve('catmullRom').material('standard', { color: '#3b82f6' });
    areaChart.data(areaRows);
    areaChart.render();
  });

  placeCell(() => {
    const surfaceChart = new SurfaceChart(scene.three).values((x, z) => Math.sin(x * 1.5) * Math.cos(z * 1.5) * 0.6).xDomain([-2, 2]).zDomain([-2, 2]).resolution(24).material('standard', { color: '#22c55e' });
    surfaceChart.render();
  });

  placeCell(() => {
    const HEATMAP_SIZE = 10;
    const heatmapRows = [];
    for (let row = 0; row < HEATMAP_SIZE; row++) {
      for (let col = 0; col < HEATMAP_SIZE; col++) heatmapRows.push({ id: `${row}-${col}`, row, col, value: Math.random() });
    }
    const heatmapX = scale.linear().domain([0, HEATMAP_SIZE - 1]).range([-2.2, 2.2]);
    const heatmapZ = scale.linear().domain([0, HEATMAP_SIZE - 1]).range([-2.2, 2.2]);
    const heatmapChart = new HeatmapChart(scene.three).x((d) => d.col, heatmapX).z((d) => d.row, heatmapZ).color((d) => d.value);
    heatmapChart.data(heatmapRows, (d) => d.id);
    heatmapChart.render();
  });

  placeCell(
    () => {
      const NETWORK_NODE_COUNT = 14;
      const networkNodes = Array.from({ length: NETWORK_NODE_COUNT }, (_, id) => ({ id, group: id % 3 }));
      const networkLinks = [];
      for (let i = 1; i < NETWORK_NODE_COUNT; i++) networkLinks.push({ source: Math.floor(Math.random() * i), target: i });
      networkChart = new NetworkChart(scene.three).data(networkNodes).links(networkLinks).linkDistance(1).color((d) => d.group, palette.category10);
      networkChart.render();
    },
    () => {
      for (let i = 0; i < NETWORK_SETTLE_TICKS && networkChart.tick(); i++);
    },
  );
  loop.add(() => networkChart.tick());

  placeCell(() => {
    const treeChart = new TreeChart(scene.three).levelHeight(0.7).levelRadius(0.9).color((d) => d.depth, palette.viridis);
    treeChart.data(makeHierarchy(2, 3));
    treeChart.render();
  });

  placeCell(() => {
    const packChart = new PackChart(scene.three).padding(0.12).color((d) => -d.depth, palette.viridis).material('standard', { transparent: true, opacity: 0.5 });
    packChart.data(makeHierarchy(2, 3));
    packChart.render();
  });

  placeCell(() => {
    const pieRows = [
      { label: 'A', count: 12 },
      { label: 'B', count: 22 },
      { label: 'C', count: 9 },
      { label: 'D', count: 17 },
      { label: 'E', count: 14 },
    ];
    const pieChart = new PieChart(scene.three).value((d) => d.count).padAngle(0.02).color((d) => d.label, palette.category10);
    pieChart.data(pieRows);
    pieChart.render();
  });

  placeCell(() => {
    const volumeChart = new VolumeChart(scene.three).xDomain([-1, 1]).yDomain([-1, 1]).zDomain([-1, 1]).resolution(20).steps(40).densityScale(1.5).palette(palette.plasma);
    volumeChart.values((x, y, z) => {
      const blob = (cx, cy, cz) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) * 2);
      return blob(0.4, 0.2, 0) + blob(-0.4, -0.2, 0.3);
    });
    volumeChart.render();
  });
}

async function handleThemeChange() {
  statusText.value = '';
  try {
    await scene.applyTheme(themeName.value);
    frameCamera();
  } catch (error) {
    statusText.value = `applyTheme failed: ${error.message}`;
  }
}

function handlePostfxChange() {
  try {
    // preset() already disables every currently-active pass before enabling
    // its own bundle — only the 'none' case needs a manual clear.
    if (postfxName.value === 'none') {
      for (const name of g.postfx.enabled()) g.postfx.disable(name);
    } else {
      g.postfx.preset(postfxName.value);
    }
  } catch (error) {
    statusText.value = `postfx.preset failed: ${error.message}`;
  }
}

function handleResize() {
  const el = canvasEl.value;
  if (!el || !g) return;
  const width = el.clientWidth;
  const height = el.clientHeight;
  g.setSize(width, height);
  const camera = scene.camera.three;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  lineChart?.setResolution(width, height);
}

/** applyTheme() bundles its own camera preset — re-apply the gallery's fixed overview framing after every theme switch so the grid stays fully in view. */
function frameCamera() {
  scene.camera.three.position.set(0, 34, 22);
  scene.camera.lookAt(0, 0, 0);
}

onMounted(async () => {
  g = new Graph3D({ canvas: canvasEl.value, autoResize: false });
  scene = g.createScene('main');
  g.setActiveScene(scene);

  buildGallery();

  try {
    await scene.applyTheme(themeName.value);
    if (postfxName.value !== 'none') g.postfx.preset(postfxName.value);
  } catch (error) {
    statusText.value = `initial theme/postfx failed: ${error.message}`;
  }
  frameCamera();
  scene.camera.enableOrbitControls(g.renderer.three.domElement).catch((error) => {
    statusText.value = `enableOrbitControls failed: ${error.message}`;
  });

  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(canvasEl.value);
  handleResize();
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  g?.dispose();
  g = null;
  scene = null;
  networkChart = null;
  lineChart = null;
});
</script>

<style scoped>
.gallery-demo {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.gallery-controls {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.gallery-controls label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}
.gallery-status {
  color: var(--vp-c-danger-1);
  font-size: 0.85rem;
}
.gallery-canvas {
  width: 100%;
  height: 70vh;
  min-height: 480px;
  display: block;
  border-radius: 8px;
  background: #000;
}
</style>
