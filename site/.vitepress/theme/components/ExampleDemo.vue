<template>
  <div class="example-demo">
    <aside class="example-nav">
      <p class="example-nav-title">Chart Types</p>
      <a
        v-for="t in CHART_TYPES"
        :key="t.route"
        :href="`/example/${t.route}`"
        class="example-nav-link"
        :class="{ active: t.route === route }"
      >{{ t.label }}</a>
    </aside>

    <div class="example-main">
      <div v-if="type === 'bar'" class="example-canvas-wrap">
        <div class="example-toolbar">
          <button class="example-reload" title="Regenerate" @click="regenerate">⟳ Reload</button>
          <select class="example-sort" title="Sort bars by value" v-model="sortOrder" @change="applySort">
            <option value="" disabled>Sort</option>
            <option value="none">None</option>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
        <div v-if="meta" class="example-meta">{{ meta.company }} — revenue by {{ meta.unit }}</div>
        <span v-if="statusText" class="example-status">{{ statusText }}</span>
        <canvas ref="canvasEl" class="example-canvas"></canvas>
      </div>
      <div v-else class="example-placeholder">
        <p>The interactive <strong>{{ currentLabel }}</strong> example is coming soon.</p>
        <p>
          Meanwhile, see the <a href="/chart-types/">Chart Types</a> reference,
          the combined <a href="/gallery">Gallery</a>, or the
          <a :href="`/api/${currentClass}`">{{ currentClass }} API docs</a>.
        </p>
      </div>

      <div v-if="type === 'bar'" class="example-code">
        <p class="example-code-title">Source</p>
        <div class="language-js"><pre><code>{{ sourceCode }}</code></pre></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Graph3D, BarChart, Axis, scale, palette } from '../../../../src/index.js';

// Prompt (post-192 follow-up): the /example/<route> pages. Each chart-type
// page renders this one component with a different `type` prop — VitePress
// treats each as a distinct static page, so navigating between them already
// unmounts/remounts this component (fresh onMounted → fresh random dataset,
// satisfying "on each landing there should be a random chart" for free).
// Only 'bar' is fully implemented per spec; other types show a placeholder
// until their own instructions land (CLAUDE.md §1.3 YAGNI — no invented
// behavior for the other 10 ahead of a real spec).

const CHART_TYPES = [
  { key: 'bar', route: 'barChart', label: 'Bar Chart', apiClass: 'BarChart' },
  { key: 'line', route: 'lineChart', label: 'Line Chart', apiClass: 'LineChart' },
  { key: 'scatter', route: 'scatterChart', label: 'Scatter Chart', apiClass: 'ScatterChart' },
  { key: 'area', route: 'areaChart', label: 'Area Chart', apiClass: 'AreaChart' },
  { key: 'surface', route: 'surfaceChart', label: 'Surface Chart', apiClass: 'SurfaceChart' },
  { key: 'heatmap', route: 'heatmapChart', label: 'Heatmap Chart', apiClass: 'HeatmapChart' },
  { key: 'network', route: 'networkChart', label: 'Network Chart', apiClass: 'NetworkChart' },
  { key: 'tree', route: 'treeChart', label: 'Tree Chart', apiClass: 'TreeChart' },
  { key: 'pack', route: 'packChart', label: 'Pack Chart', apiClass: 'PackChart' },
  { key: 'pie', route: 'pieChart', label: 'Pie Chart', apiClass: 'PieChart' },
  { key: 'volume', route: 'volumeChart', label: 'Volume Chart', apiClass: 'VolumeChart' },
];

// Brighter than a "plain dark" navy on purpose — the cinematic preset's
// vignette (darkness 1.1) crushes anything much dimmer than this to near-black
// at the frame edges, which would read as black rather than midnight blue.
const MIDNIGHT_COLOR = 0x18246a;
const COMPANIES = ['Acme Corp', 'Globex', 'Initech', 'Umbrella Corp', 'Stark Industries', 'Wayne Enterprises', 'Soylent Corp', 'Hooli', 'Cyberdyne Systems', 'Massive Dynamic'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PALETTE_NAMES = ['viridis', 'inferno', 'magma', 'plasma', 'cividis', 'turbo'];
const SERIES_LENGTH = 10;
const PER_BAR_MS = 260; // one bar's full grow duration — the next bar's delay is i * this, so they run strictly one-after-another

const props = defineProps({ type: { type: String, required: true } });

const route = computed(() => CHART_TYPES.find((t) => t.key === props.type)?.route ?? props.type);
const currentLabel = computed(() => CHART_TYPES.find((t) => t.key === props.type)?.label ?? props.type);
const currentClass = computed(() => CHART_TYPES.find((t) => t.key === props.type)?.apiClass ?? '');

const canvasEl = ref(null);
const meta = ref(null);
const statusText = ref('');
const sortOrder = ref(''); // '' | 'none' | 'asc' | 'desc' — bound to the Sort dropdown

const sourceCode = `import { Graph3D, BarChart, Axis, scale, palette } from 'graph3d.js';

const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

// Bars sit at x in [0, 8], not centered on 0 — Axis always renders at x=0
// (D3-style, the caller positions it), so this keeps the y-axis to the left
// of every bar instead of behind/inside the cluster. Camera x matches the
// lookAt x (zero lateral offset) so the x-axis reads as a straight horizontal
// line on screen and the y-axis a straight vertical one, instead of the two
// collapsing into a single diagonal streak — only y/z are offset, giving a
// gentle elevated 3/4 view with bar depth still visible. Distance is kept
// short (~10.3 units) because this canvas is very wide/short (full content
// width, 60vh tall) — a wide aspect ratio inflates horizontal FOV, so a
// "normal" distance leaves the chart tiny in the middle of the frame.
scene.camera.three.position.set(4, 4.5, 10);
// enableOrbitControls() before lookAt() — OrbitControls' own constructor
// calls its own update(), which targets (0,0,0) by default and would
// otherwise silently override lookAt() and skew the camera diagonally.
await scene.camera.enableOrbitControls(g.renderer.three.domElement);
scene.camera.lookAt(4, 2.2, 0);
scene.camera.setMaxZoomIn(4); // never let the user dolly closer than 4 units
scene.camera.setMaxZoomOut(18); // never let the user dolly past 18 units away

// Cinematic lighting + shadows + a midnight-blue backdrop — no HDRI is loaded
scene.light.setPreset('studio');
await scene.shadows.enable('pcf-soft');
scene.shadows.setQuality('high');
scene.environment.setBackground(0x18246a);
scene.environment.setFog({ type: 'exponential', color: 0x18246a, density: 0.015 });
g.postfx.preset('cinematic');
g.postfx.disable('bloom'); // keeps bar edges crisp without a bright sky to bloom off of
g.postfx.disable('dof'); // preset's focus distance doesn't match this scene
// chromaticAberration RGB-splits and filmGrain speckles fine detail — barely
// visible on bar geometry, but they visibly break up the axis tick labels'
// thin SDFText strokes at this small a font size. Disabled for legible text.
g.postfx.disable('chromaticAberration');
g.postfx.disable('filmGrain');

let chart, xAxis, yAxis, xScale;

// options.camera makes each tick label a real, camera-billboarded SDFText
// mesh rendered natively by Axis itself — not a demo-side trick. A dark
// outline keeps the label legible against the midnight-blue backdrop.
// fontSize is kept below the library default (0.3) on purpose: up to 10
// categories (month or 4-digit year) share the x-axis's 8-unit range, so
// anything bigger overlaps between neighboring tick labels.
const labelStyle = { fontSize: 0.28, color: '#ffffff', outline: { color: '#000000', width: 0.22 } };

// Builds the chart + axes for a genuinely new dataset (Reload) — sorting
// reuses the existing chart via sortBars() below instead, so it animates
// rather than replaying this squash-then-grow entrance.
function buildChart(rows, paletteName) {
  chart?.destroy();
  xAxis?.dispose();
  yAxis?.dispose();

  const x = scale.band().domain(rows.map((d) => d.label)).range([0, 8]).paddingInner(0.35).paddingOuter(0.6);
  const y = scale.linear().domain([0, maxValue(rows)]).range([0, 5]).nice();
  xScale = x;

  chart = new BarChart(scene.three)
    .x((d) => d.label, x)
    .y((d) => d.value, y)
    .color((d) => d.value, palette[paletteName]);
  chart.generator.width(x.bandwidth()); // sync bar width to the band's own gap-aware width, not generator.bar()'s constant 0.8 default
  chart.data(rows, (d) => d.label);
  chart.render();

  xAxis = new Axis().scale(x).orientation('x').tickSize(0.4).labelStyle(labelStyle).render(scene.three, 'xAxis', { camera: scene.camera.three });
  yAxis = new Axis().scale(y).orientation('y').tickCount(5).tickSize(0.4).labelStyle(labelStyle).render(scene.three, 'yAxis', { camera: scene.camera.three });
  // Axis has no public color/thickness API for the tick/spine lines (labels
  // are real SDFText now, but the line geometry is still plain MeshBasicMaterial)
  // — brighten + thicken them directly via the .three escape hatch.
  boostAxisVisibility(scene.three, 'xAxis');
  boostAxisVisibility(scene.three, 'yAxis');

  // Squash every bar flat, then grow them in strictly one after another —
  // delay = index * duration means bar N+1 only starts once bar N finishes.
  chart.selection().attr('scale.y', 0.001).attr('position.y', 0);
  chart.selection()
    .transition()
    .duration(${PER_BAR_MS})
    .delay((d, i) => i * ${PER_BAR_MS})
    .easing('easeOutCubic')
    .attr('scale.y', (d) => Math.max(y(d.value), 0.001))
    .attr('position.y', (d) => y(d.value) / 2);
}

// Random dataset: 10 months or 10 years of one company's revenue
const rows = generateRandomRevenueData();
const paletteName = randomPaletteName(); // viridis/inferno/magma/plasma/cividis/turbo
buildChart(rows, paletteName);

// "Sort" dropdown (none/asc/desc) — re-binds the SAME chart to a re-ordered
// copy of the SAME rows (same keys, just reordered). GraphChart's own diff
// sees every bar as "update" (no enter/exit) and animates position toward
// its new x slot via BarChart's own 800ms transition — no destroy+rebuild,
// no replayed entrance animation. 'none' restores the as-generated order.
function sortBars(order) {
  const sorted = order === 'none'
    ? rows
    : [...rows].sort((a, b) => (order === 'asc' ? a.value - b.value : b.value - a.value));

  chart.data(sorted, (d) => d.label);
  chart.update(); // animates bars to their new position; also re-derives xScale's domain order as a side effect

  // Axis has no update() API — dispose + re-render against the now-reordered
  // xScale is instant (not animated), but only the tick label order changes.
  xAxis.dispose();
  xAxis = new Axis().scale(xScale).orientation('x').tickSize(0.4).labelStyle(labelStyle).render(scene.three, 'xAxis', { camera: scene.camera.three });
  boostAxisVisibility(scene.three, 'xAxis');
}`;

// options.camera makes each tick label a real, camera-billboarded SDFText
// mesh rendered natively by Axis itself — not a demo-side trick. A dark
// outline keeps the label legible against the midnight-blue backdrop and this
// scene's film grain/chromatic aberration, the same way boostAxisVisibility
// (below) brightens the tick/spine lines for the same reason. fontSize is
// kept below the library default (0.3) on purpose: up to 10 categories
// (month or 4-digit year) share the x-axis's 8-unit range, so anything
// bigger overlaps between neighboring tick labels. Shared by buildChart()
// and applySort() so a re-sort's rebuilt axis matches the original exactly.
const labelStyle = { fontSize: 0.28, color: '#ffffff', outline: { color: '#000000', width: 0.22 } };

let g = null;
let scene = null;
let chart = null;
let xAxis = null;
let yAxis = null;
let xScale = null; // the live x-scale instance chart.update() re-derives the domain order of — applySort() reuses it to rebuild just the axis
let resizeObserver = null;
let originalRows = []; // the untouched, as-generated row order — 'None' rebuilds from this

/** Random dataset: one random company, 10 consecutive months or 10 consecutive years, random revenue values. */
function generateDataset() {
  const company = COMPANIES[Math.floor(Math.random() * COMPANIES.length)];
  const byYear = Math.random() < 0.5;
  let rows;
  if (byYear) {
    const startYear = 2015 + Math.floor(Math.random() * 10);
    rows = Array.from({ length: SERIES_LENGTH }, (_, i) => ({ label: String(startYear + i), value: 10 + Math.random() * 490 }));
  } else {
    const startMonth = Math.floor(Math.random() * MONTHS.length);
    rows = Array.from({ length: SERIES_LENGTH }, (_, i) => ({ label: MONTHS[(startMonth + i) % MONTHS.length], value: 10 + Math.random() * 490 }));
  }
  return { company, unit: byYear ? 'year' : 'month', rows };
}

// Axis renders its spine/tick meshes as real THREE.Mesh objects named
// `${name}_line`/`${name}_tick_<i>` (GraphMesh mirrors `name` onto
// `three.name`), but has no public color/thickness API — its 0x333333,
// 0.02-unit-thick default is too low-contrast at this camera distance.
// Rather than add a speculative color/thickness setter to the framework for
// one demo, brighten + thicken the already-rendered meshes directly via the
// `.three` escape hatch. Any geometry dimension under THIN_THRESHOLD is, by construction,
// one of the two AXIS_LINE_THICKNESS sides (the tick-length side is always
// 0.2+ and stays untouched), so this works for both the spine and the ticks
// without duplicating Axis's own orientation logic. Skips `_ticklabel_`
// meshes deliberately — those are real SDFText (a ShaderMaterial with no
// top-level `.color`, only a `color` uniform) and already have their own
// readable default color from Axis itself.
const THIN_THRESHOLD = 0.05;
const THICKNESS_SCALE = 4;
function boostAxisVisibility(scene, name) {
  for (const child of scene.children) {
    if (!child.name.startsWith(`${name}_`) || child.name.includes('ticklabel')) continue;
    child.material.color.set(0xf2f2f2);
    child.geometry.computeBoundingBox();
    const { min, max } = child.geometry.boundingBox;
    child.scale.set(
      max.x - min.x < THIN_THRESHOLD ? THICKNESS_SCALE : 1,
      max.y - min.y < THIN_THRESHOLD ? THICKNESS_SCALE : 1,
      max.z - min.z < THIN_THRESHOLD ? THICKNESS_SCALE : 1,
    );
  }
}

/**
 * Tears down the previous bar chart/axes (if any) and builds a fresh one with
 * a strictly sequential grow-in — only called for a genuinely new dataset
 * (Reload); a sort reuses the existing chart via applySort() instead, so it
 * animates rather than replaying this entrance.
 */
function buildChart(rows, paletteName = PALETTE_NAMES[Math.floor(Math.random() * PALETTE_NAMES.length)]) {
  chart?.destroy();
  xAxis?.dispose();
  yAxis?.dispose();

  let maxValue = 0;
  for (const row of rows) if (row.value > maxValue) maxValue = row.value;

  const x = scale.band().domain(rows.map((d) => d.label)).range([0, 8]).paddingInner(0.35).paddingOuter(0.6);
  const y = scale.linear().domain([0, maxValue]).range([0, 5]).nice();
  xScale = x;

  chart = new BarChart(scene.three)
    .x((d) => d.label, x)
    .y((d) => d.value, y)
    .color((d) => d.value, palette[paletteName]);
  chart.generator.width(x.bandwidth()); // sync bar width to the band's own gap-aware width, not generator.bar()'s constant 0.8 default
  chart.data(rows, (d) => d.label);
  chart.render();

  xAxis = new Axis().scale(x).orientation('x').tickSize(0.4).labelStyle(labelStyle).render(scene.three, 'xAxis', { camera: scene.camera.three });
  yAxis = new Axis().scale(y).orientation('y').tickCount(5).tickSize(0.4).labelStyle(labelStyle).render(scene.three, 'yAxis', { camera: scene.camera.three });
  boostAxisVisibility(scene.three, 'xAxis');
  boostAxisVisibility(scene.three, 'yAxis');

  chart.selection().attr('scale.y', 0.001).attr('position.y', 0);
  chart.selection()
    .transition()
    .duration(PER_BAR_MS)
    .delay((d, i) => i * PER_BAR_MS)
    .easing('easeOutCubic')
    .attr('scale.y', (d) => Math.max(y(d.value), 0.001))
    .attr('position.y', (d) => y(d.value) / 2);
}

function regenerate() {
  if (!scene) return;
  const dataset = generateDataset();
  meta.value = dataset;
  sortOrder.value = ''; // fresh random data has no active sort
  originalRows = dataset.rows;
  buildChart(dataset.rows);
}

/**
 * Re-orders the original rows by value and ANIMATES each bar to its new x
 * slot, instead of buildChart()'s full destroy+rebuild (and its
 * squash-then-grow entrance animation, which would replay on every sort).
 * `chart.data(sorted, keyFn)` + `chart.update()` re-binds the exact same keys
 * in a new order, so GraphChart's own diff sees every bar as "update" (no
 * enter/exit) and transitions position via BarChart's own 800ms transition
 * (set in its constructor) — the same animated-update path `update()` always
 * uses, just driven by a re-order instead of a value change. 'none' restores
 * the as-generated order.
 */
function applySort() {
  if (!scene || !chart || originalRows.length === 0 || !sortOrder.value) return;
  const sorted = sortOrder.value === 'none'
    ? originalRows
    : [...originalRows].sort((a, b) => (sortOrder.value === 'asc' ? a.value - b.value : b.value - a.value));

  chart.data(sorted, (d) => d.label);
  chart.update(); // animates bars to their new position; also re-derives xScale's domain order as a side effect

  // Axis has no update() API — dispose + re-render against the now-reordered
  // xScale is instant (not animated), but only the tick label order changes.
  xAxis?.dispose();
  xAxis = new Axis().scale(xScale).orientation('x').tickSize(0.4).labelStyle(labelStyle).render(scene.three, 'xAxis', { camera: scene.camera.three });
  boostAxisVisibility(scene.three, 'xAxis');
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
}

onMounted(async () => {
  if (props.type !== 'bar') return;

  g = new Graph3D({ canvas: canvasEl.value, autoResize: false });
  scene = g.createScene('main');
  g.setActiveScene(scene);

  // Bars sit at x in [0, 8] (not centered on 0) so the y-axis — which Axis
  // always renders at x=0, D3-style, the caller positions it — lands to the
  // left of every bar instead of behind/inside the cluster. Camera x matches
  // the lookAt x (zero lateral offset) so the x-axis reads as a straight
  // horizontal line on screen and the y-axis a straight vertical one, instead
  // of the two collapsing into a single diagonal streak — only y/z are
  // offset, giving a gentle elevated 3/4 view with bar depth still visible.
  // Distance is kept short (~10.3 units) because this canvas is very
  // wide/short (full content width, 60vh tall) — a wide aspect ratio inflates
  // horizontal FOV, so a "normal" distance leaves the chart tiny in the middle.
  scene.camera.three.position.set(4, 4.5, 10);
  // enableOrbitControls() before lookAt() — OrbitControls' own constructor
  // calls its own update(), which targets (0,0,0) by default and would
  // otherwise silently override lookAt() and skew the camera diagonally.
  try {
    await scene.camera.enableOrbitControls(g.renderer.three.domElement);
  } catch (error) {
    statusText.value = `enableOrbitControls failed: ${error.message}`;
  }
  scene.camera.lookAt(4, 2.2, 0);
  scene.camera.setMaxZoomIn(4); // never let the user dolly closer than 4 units
  scene.camera.setMaxZoomOut(18); // never let the user dolly past 18 units away

  // Runs before the first regenerate() — now that no HDR fetch blocks it,
  // the background/lighting/postfx are already in place for the first
  // rendered frame instead of flashing default lighting then swapping.
  try {
    scene.light.setPreset('studio');
    await scene.shadows.enable('pcf-soft');
    scene.shadows.setQuality('high');
    scene.environment.setBackground(MIDNIGHT_COLOR);
    scene.environment.setFog({ type: 'exponential', color: MIDNIGHT_COLOR, density: 0.015 });
    g.postfx.preset('cinematic');
    g.postfx.disable('bloom'); // keeps bar edges crisp without a bright sky to bloom off of
    g.postfx.disable('dof'); // preset's focus distance doesn't match this scene, blurring most of the bars
    // chromaticAberration RGB-splits and filmGrain speckles fine detail —
    // barely visible on bar geometry, but they visibly break up the axis tick
    // labels' thin SDFText strokes at this small a font size. Disabled for
    // legible text.
    g.postfx.disable('chromaticAberration');
    g.postfx.disable('filmGrain');
  } catch (error) {
    statusText.value = `Cinematic setup failed: ${error.message}`;
  }

  regenerate();

  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(canvasEl.value);
  handleResize();
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  g?.dispose();
  g = null;
  scene = null;
  chart = null;
  xAxis = null;
  yAxis = null;
});
</script>

<style scoped>
.example-demo {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 1.5rem;
  align-items: start;
}
.example-nav {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  position: sticky;
  top: 5rem;
}
.example-nav-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--vp-c-text-3);
  margin: 0 0 0.4rem 0.6rem;
}
.example-nav-link {
  padding: 0.4rem 0.7rem;
  border-radius: 6px;
  font-size: 0.88rem;
  color: var(--vp-c-text-2);
  text-decoration: none;
}
.example-nav-link:hover {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}
.example-nav-link.active {
  background: var(--vp-c-brand-1);
  color: #fff;
  font-weight: 600;
}
.example-main {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-width: 0;
}
.example-canvas-wrap {
  position: relative;
}
.example-canvas {
  width: 100%;
  height: 60vh;
  min-height: 420px;
  display: block;
  border-radius: 8px;
  background: #000;
}
.example-toolbar {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  display: flex;
  gap: 8px;
}
.example-reload,
.example-sort {
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 0.85rem;
  cursor: pointer;
}
.example-reload:hover,
.example-sort:hover {
  background: rgba(0, 0, 0, 0.65);
}
.example-sort option {
  color: #000; /* native dropdown list isn't styled by the dark theme above */
}
.example-meta {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 2;
  padding: 0.3rem 0.7rem;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 0.8rem;
}
.example-status {
  position: absolute;
  bottom: 12px;
  left: 12px;
  z-index: 2;
  padding: 0.3rem 0.7rem;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.6);
  color: #f87171;
  font-size: 0.78rem;
}
.example-placeholder {
  padding: 3rem 1.5rem;
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  text-align: center;
}
.example-code-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--vp-c-text-3);
  margin: 0 0 0.4rem;
}
.example-code pre {
  overflow-x: auto;
  font-size: 0.82rem;
}

@media (max-width: 720px) {
  .example-demo {
    grid-template-columns: 1fr;
  }
  .example-nav {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
