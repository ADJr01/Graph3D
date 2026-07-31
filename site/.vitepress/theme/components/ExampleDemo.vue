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
      <div v-else-if="type === 'line'" class="example-canvas-wrap">
        <div class="example-toolbar">
          <button class="example-reload" title="Regenerate" @click="regenerateLine">⟳ Reload</button>
          <select class="example-sort" title="Curve type" v-model="curveType" @change="applyCurve">
            <option v-for="opt in CURVE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <div v-if="lineMeta" class="example-meta">{{ lineMeta.companies.join(' · ') }} — value by {{ lineMeta.unit }}</div>
        <span v-if="statusText" class="example-status">{{ statusText }}</span>
        <canvas ref="canvasEl" class="example-canvas"></canvas>
        <div
          v-if="linePopupInfo"
          class="line-hover-ring"
          :style="{ left: linePopupInfo.x + 'px', top: linePopupInfo.y + 'px', borderColor: linePopupInfo.color, boxShadow: `0 0 0 3px ${linePopupInfo.color}55` }"
        ></div>
        <div v-if="linePopupInfo" class="line-tooltip" :style="{ left: linePopupInfo.x + 'px', top: linePopupInfo.y + 'px' }">
          <span class="line-tooltip-chip" :style="{ background: linePopupInfo.color }"></span>
          <span class="line-tooltip-series">{{ linePopupInfo.series }}</span>
          <div class="line-tooltip-label">{{ linePopupInfo.label }}</div>
          <div class="line-tooltip-value" :style="{ color: linePopupInfo.color }">{{ linePopupInfo.value.toFixed(1) }}</div>
        </div>
      </div>
      <div v-else class="example-placeholder">
        <p>The interactive <strong>{{ currentLabel }}</strong> example is coming soon.</p>
        <p>
          Meanwhile, see the <a href="/chart-types/">Chart Types</a> reference,
          the combined <a href="/gallery">Gallery</a>, or the
          <a :href="`/api/${currentClass}`">{{ currentClass }} API docs</a>.
        </p>
      </div>

      <div v-if="type === 'bar' || type === 'line'" class="example-code">
        <p class="example-code-title">Source</p>
        <div class="language-js"><pre><code>{{ sourceCode }}</code></pre></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import * as THREE from 'three';
import { Graph3D, BarChart, LineChart, Axis, scale, palette, loop, resolve } from '../../../../src/index.js';

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

const LINE_SERIES_COUNT = 3;
const LINE_POINT_COUNT = 10; // matches SERIES_LENGTH, for a consistent look with the bar chart
const LINE_REVEAL_DURATION_SEC = 1.15; // one series' full start-to-end draw duration
const LINE_SERIES_STAGGER_SEC = 0.3; // next series starts drawing this long after the previous one
const LINE_MARKER_PIXEL_SIZE = 17; // point-marker sprite size, in screen pixels (sizeAttenuation off)
// Gap (constant screen pixels) between a point and its tooltip card. The
// tooltip is a plain DOM element (see `linePopupInfo` below), not a WebGL
// mesh — an earlier version rendered it as a billboarded 3D plane, which had
// two compounding problems: (1) sizing/offsetting it in WORLD units made it
// scale unpredictably with camera zoom (the y-scale's range is only 5 world
// units tall — `scale.linear().range([0, 5])` — so even a "reasonable" world
// offset was a large fraction of the chart's whole height), and (2) being a
// WebGL mesh, it only became visible once the renderer drew a NEW frame —
// browsers throttle requestAnimationFrame heavily whenever a window loses OS
// focus (routine when taking a screenshot), so the popup could visibly lag
// or show a stale point even though the hover logic itself (plain DOM
// event handling, RAF-independent) had already updated correctly. A DOM
// tooltip, positioned from the same screen-space projection and updated
// synchronously in the pointermove handler, sidesteps both issues at once.
const LINE_POPUP_PIXEL_GAP = 14;

const props = defineProps({ type: { type: String, required: true } });

const route = computed(() => CHART_TYPES.find((t) => t.key === props.type)?.route ?? props.type);
const currentLabel = computed(() => CHART_TYPES.find((t) => t.key === props.type)?.label ?? props.type);
const currentClass = computed(() => CHART_TYPES.find((t) => t.key === props.type)?.apiClass ?? '');

const canvasEl = ref(null);
const meta = ref(null);
const statusText = ref('');
const sortOrder = ref(''); // '' | 'none' | 'asc' | 'desc' — bound to the Sort dropdown

// Mirrors the names `LineChart.curve()` / `generator.line().curve()` accept
// (src/compose/generator/curve.js's CURVE_TYPES) — not re-imported since
// that's an internal generator path, not part of the compose/ public surface.
const CURVE_OPTIONS = [
  { value: 'catmullRom', label: 'Catmull-Rom (smooth)' },
  { value: 'monotone', label: 'Monotone (no overshoot)' },
  { value: 'bezier', label: 'Bezier (rounded corners)' },
  { value: 'linear', label: 'Linear (straight)' },
];
const curveType = ref(CURVE_OPTIONS[0].value); // bound to the Curve dropdown

// The hover tooltip itself — a plain DOM element (see LINE_POPUP_PIXEL_GAP's
// doc for why), positioned at the hovered point's own screen-space
// projection via CSS (top/left + a translate() in the stylesheet), updated
// synchronously alongside the debug overlay above.
const linePopupInfo = ref(null); // {x, y, series, label, value, color} | null

const barSourceCode = `import { Graph3D, BarChart, Axis, scale, palette } from 'graph3d.js';

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
// Keeps the camera off near-grazing/steep angles combined with a close zoom,
// where an elevated marker's screen position visually drifts away from its
// ground-level axis tick under perspective projection.
scene.camera.setMaxZoomIn(8); // never let the user dolly closer than 8 units
scene.camera.setMaxZoomOut(18); // never let the user dolly past 18 units away
scene.camera.setMinPolarAngle(Math.PI * (65 / 180)); // ~65° from vertical
scene.camera.setMaxPolarAngle(Math.PI * (115 / 180)); // ~115° — symmetric ±25° around eye-level

// Cinematic lighting + shadows + a midnight-blue backdrop — no HDRI is loaded
scene.light.setPreset('studio');
await scene.shadows.enable('pcf-soft');
// 'low' (not 'high') keeps this interactive example responsive on modest
// GPUs — a 2048px soft shadow map every frame was measurably slow enough to
// make the line chart's hover tooltip visibly lag behind the cursor.
scene.shadows.setQuality('low');
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

const lineSourceCode = `import { Graph3D, LineChart, Axis, scale, palette, loop, resolve } from 'graph3d.js';

const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);
// ...camera, cinematic lighting/postfx setup identical to the bar chart above...

const x = scale.band().domain(labels).range([0, 8]).paddingInner(0.35).paddingOuter(0.6);
const y = scale.linear().domain([0, maxValue]).range([0, 5]).nice();

const chart = new LineChart(scene.three)
  .x((d) => d.label, x)
  .y((d) => d.value, y)
  .series((d) => d.series)   // one smooth GraphLine per company
  .curve('catmullRom');       // smooth interpolation between points — no sharp kinks
chart.data(rows);
chart.render();

new Axis().scale(x).orientation('x').tickSize(0.4).labelStyle(labelStyle).render(scene.three, 'xAxis', { camera: scene.camera.three });
new Axis().scale(y).orientation('y').tickCount(5).tickSize(0.4).labelStyle(labelStyle).render(scene.three, 'yAxis', { camera: scene.camera.three });

// ── Smooth ease-in "draw" animation ─────────────────────────────────────
// GraphLine wraps a Three.js Line2/LineMaterial, which supports dashed
// rendering natively. Instead of rebuilding the line's vertex buffer every
// frame (which would rebuild GPU geometry and can visibly glitch), animate
// a single dashSize uniform from 0 up to the line's real total length —
// purely GPU-side, so the reveal is glitch-free at any frame rate.
seriesNames.forEach((name, i) => {
  const line = scene.three.getObjectByName(\`chart-line-\${name}\`);
  line.computeLineDistances();
  const totalLength = line.geometry.attributes.instanceDistanceStart.data.array.at(-1);
  line.material.dashed = true;
  line.material.gapSize = totalLength * 10 + 1; // one giant "off" region past the line's end
  line.material.dashSize = 0;

  const ease = resolve('easeInCubic');
  let elapsed = -i * STAGGER_SEC; // stagger each series' draw-in
  const tick = (deltaSec) => {
    elapsed += deltaSec;
    const t = Math.min(Math.max(elapsed / DURATION_SEC, 0), 1);
    line.material.dashSize = totalLength * ease(t);
    if (t >= 1) { line.material.dashed = false; loop.remove(tick); }
  };
  loop.add(tick);
});

// ── Per-point hover popup ────────────────────────────────────────────────
// Line points aren't separate meshes (one continuous Line2 per series), so
// each series also gets a small THREE.Points marker at its raw data points.
// Hover projects every candidate point to screen pixels and compares
// directly to the cursor — exact regardless of zoom/pan/camera angle.
//
// The tooltip itself is a plain DOM element (a Vue ref bound to CSS
// left/top), NOT a WebGL mesh — a mesh only becomes visible once the
// renderer draws a new frame, and browsers throttle requestAnimationFrame
// heavily once a window loses OS focus, so a mesh-based popup could visibly
// lag behind or show a stale point relative to the (RAF-independent) hover
// logic. Updating a DOM element's position synchronously, right here in the
// event handler, can't lag behind the hover state that computed it.
const scratch = new THREE.Vector3();
canvas.addEventListener('pointermove', (event) => {
  const { x: px, y: py } = pointerToCanvasPixels(event, canvas);
  let nearest = null, nearestDist = 20; // px
  const camera = scene.camera.three;
  // OrbitControls updates camera.position/quaternion synchronously on its own
  // pointermove listener, but camera.matrixWorld — what project() actually
  // reads — is normally only refreshed by the next renderer.render() call.
  // Without this, a hover fired mid-drag can project against a camera
  // orientation that's up to a frame stale.
  camera.updateMatrixWorld();
  for (const point of seriesData) {
    scratch.set(point.x, point.y, point.z).project(camera);
    const sx = (scratch.x * 0.5 + 0.5) * canvas.clientWidth;
    const sy = (-scratch.y * 0.5 + 0.5) * canvas.clientHeight;
    const dist = Math.hypot(sx - px, sy - py);
    if (dist < nearestDist) { nearestDist = dist; nearest = point; }
  }
  tooltip.value = nearest ? { x: nearest.screenX, y: nearest.screenY, ...nearest } : null;
});
// <div v-if="tooltip" class="tooltip" :style="{ left: tooltip.x+'px', top: tooltip.y+'px' }">...</div>`;

const sourceCode = computed(() => (props.type === 'line' ? lineSourceCode : barSourceCode));

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

const lineMeta = ref(null);

let lineChart = null;
let lineXAxis = null;
let lineYAxis = null;
/** THREE.Points per series (seriesName -> Points), visible as soon as the chart is built. */
let linePointMarkers = new Map();
/** Per-series datum list (seriesName -> [{series,label,value,color,position}]), in the exact same order as that series' Points position buffer — a raycast hit's `.index` maps straight back to its datum. */
let linePointData = new Map();
/** Live loop.add() reveal-animation callbacks — tracked so onUnmounted can remove any still in flight. */
let lineRevealTicks = [];
/**
 * Thin vertical guide from the hovered marker straight down to its axis
 * position (world y=0), shown only while hovering. An elevated marker and
 * its ground-level x-axis tick share the same world x/z but different world
 * y — under perspective projection the two diverge in screen-X once the
 * camera tilts off eye-level, and clamping the camera's tilt/zoom range only
 * bounds that drift, it doesn't remove it (a live sweep found combined
 * azimuth+tilt still produces ~45px of screen-X drift for the
 * highest-elevation marker — more than one tick's own spacing — well within
 * the allowed camera range, since only tilt and zoom are clamped, not
 * azimuth). This line is the actual fix: it visually anchors the marker to
 * its true axis position regardless of camera angle, so there's never
 * ambiguity about which tick a hovered point belongs to.
 */
let lineDropGuide = null;
/**
 * Reused across every pointermove. Hovering is resolved by projecting each
 * candidate point straight to screen pixels and comparing to the cursor —
 * exact in screen space regardless of zoom, pan, or camera angle. An earlier
 * version used `THREE.Raycaster`'s `params.Points.threshold` (a WORLD-unit
 * radius) instead, converting it to a target pixel size via the camera's
 * distance/FOV every move; that conversion is only an approximation (it
 * assumes the whole hit region sits at one representative depth), and stayed
 * measurably off — worse the more the camera was panned away from the
 * chart's center while zoomed in — which is exactly the "hovering one point
 * pops up a different point's label" bug reported twice. Comparing real
 * screen pixels sidesteps the approximation entirely: there is no depth or
 * FOV term to get wrong.
 */
// Kept close to the marker's own rendered radius (LINE_MARKER_PIXEL_SIZE / 2
// = 8.5px) rather than a generous 20px: at 20px, two points from different
// series/labels that only happen to project near each other under a rotated
// camera (screen-space proximity isn't real proximity in 3D) could both
// qualify, and the nearer-in-2D one isn't always the one visually under the
// cursor. A tighter radius means an occasional miss (no tooltip) instead of
// a wrong match — much less confusing than a tooltip pointing at the wrong dot.
const LINE_HOVER_PIXEL_RADIUS = 12;
const linePointProjectionScratch = new THREE.Vector3();

/** Lazily-built, memoized once — a soft round radial-gradient sprite so point markers render as glowing dots instead of PointsMaterial's default hard-edged squares. Tinted per-series via material.color. */
let circleSpriteTextureCache = null;
function circleSpriteTexture() {
  if (circleSpriteTextureCache) return circleSpriteTextureCache;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  circleSpriteTextureCache = new THREE.CanvasTexture(canvas);
  return circleSpriteTextureCache;
}

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
  // WebGLRenderer.setSize() writes an inline canvas.style.width/height pixel
  // value (THREE's default updateStyle behavior) — left in place, that
  // overrides this canvas's CSS `width:100%; height:60vh` rule with a fixed
  // px size, permanently pinning it. The ResizeObserver below watches the
  // canvas element itself, so once pinned it stops firing on real container
  // changes (its own box no longer responds to them): resizing the browser
  // window after the first layout would silently stop resizing the chart,
  // and the pinned box could end up wider than its container, throwing off
  // every rect-based hover/tooltip coordinate downstream. Clearing the
  // inline style right back out hands sizing back to CSS so the box stays
  // responsive; the drawing buffer set by setSize() above is untouched.
  el.style.width = '';
  el.style.height = '';
  lineChart?.setResolution(width, height); // Line2's linewidth is screen-pixel-based — must track canvas size
  const camera = scene.camera.three;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

// ── Line chart ───────────────────────────────────────────────────────────

/** One smoothly-wandering series of values — random-walk deltas keep it organic rather than jagged noise. */
function randomWalkSeries(pointCount) {
  let value = 40 + Math.random() * 200;
  const values = [];
  for (let i = 0; i < pointCount; i++) {
    values.push(value);
    value = Math.max(10, Math.min(480, value + (Math.random() - 0.5) * 90));
  }
  return values;
}

/** Random dataset: a handful of companies, each a random-walk value series over the same 10 months/years. */
function generateLineDataset() {
  const byYear = Math.random() < 0.5;
  // The start offset must be picked ONCE, outside the per-index map — picking
  // it per-index (a previous bug here) called Math.random() on every
  // iteration, producing jumbled, non-monotonic labels like "2024, 2020,
  // 2017, ..." which made the band x-axis (and therefore the line itself)
  // zigzag back and forth instead of reading left-to-right.
  const labels = byYear
    ? (() => {
        const startYear = 2015 + Math.floor(Math.random() * 10);
        return Array.from({ length: LINE_POINT_COUNT }, (_, i) => String(startYear + i));
      })()
    : (() => {
        const startMonth = Math.floor(Math.random() * MONTHS.length);
        return Array.from({ length: LINE_POINT_COUNT }, (_, i) => MONTHS[(startMonth + i) % MONTHS.length]);
      })();

  const seriesNames = [...COMPANIES].sort(() => Math.random() - 0.5).slice(0, LINE_SERIES_COUNT);
  const rows = [];
  for (const name of seriesNames) {
    const values = randomWalkSeries(LINE_POINT_COUNT);
    labels.forEach((label, i) => rows.push({ series: name, label, value: values[i] }));
  }
  return { rows, seriesNames, unit: byYear ? 'year' : 'month' };
}

/**
 * One `THREE.Points` per series (cheap GPU point sprites) at each raw data
 * point's world position — also the raycast target `findHoveredLinePoint()`
 * hit-tests against (`linePointData` maps a hit's `.index` back to its
 * datum). Starts invisible; `animateLineReveal()` reveals a series' markers
 * once its line has finished drawing in, so dots never appear ahead of the
 * line reaching them.
 */
function buildLinePointMarkers(rows, seriesNames, x, y) {
  linePointData = new Map();
  for (const name of seriesNames) {
    const seriesRows = rows.filter((d) => d.series === name);
    const color = palette.category10(name); // same first-seen color LineChart itself assigns this series
    const positions = new Float32Array(seriesRows.length * 3);
    const data = [];
    seriesRows.forEach((d, i) => {
      const wx = x(d.label) + x.bandwidth() / 2; // band center — matches resolveAxisAccessor's own offset
      const wy = y(d.value);
      positions[i * 3] = wx;
      positions[i * 3 + 1] = wy;
      positions[i * 3 + 2] = 0;
      data.push({ series: name, label: d.label, value: d.value, color, position: { x: wx, y: wy, z: 0 } });
    });
    linePointData.set(name, data);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    // depthWrite: false avoids depth-buffer flicker against the line's own
    // near-coincident geometry at each vertex (no z-fighting on either). A
    // round radial-gradient sprite (map) replaces PointsMaterial's default
    // hard-edged square so each point reads as a soft glowing dot.
    //
    // depthTest: false is the actual fix for the "hover ring/tooltip lands
    // on empty space" bug: every marker sits exactly on its own series'
    // line (same x/y/z=0 vertex), but Line2's fat-line vertex shader
    // extrudes for screen-space width and computes gl_Position.z through a
    // different code path than PointsMaterial's plain vertex shader — for
    // the same nominal world position the two can round to very slightly
    // different depth-buffer values. With depthTest left on (the default),
    // whichever one the GPU judged marginally "further" for a given pixel
    // silently loses the depth test and never draws — even though the
    // hover math (Vector3.project, identical for both the ring and this
    // sprite) is exactly correct. A live probe confirmed this precisely: an
    // isolated marker rendered pixel-perfect, but a marker sitting where
    // another series' line also passed nearby vanished completely, while
    // the ring/tooltip (unaffected by any of this — it's a DOM element, not
    // depth-tested) still correctly pointed at its true position, making
    // the ring look "wrong" when the marker was actually just invisible.
    // These sprites exist purely as an interactive hover aid, never as
    // real scene geometry another object should occlude, so always
    // rendering on top is the correct semantic, not just a workaround.
    const material = new THREE.PointsMaterial({
      color,
      size: LINE_MARKER_PIXEL_SIZE,
      sizeAttenuation: false,
      map: circleSpriteTexture(),
      transparent: true,
      alphaTest: 0.1,
      depthWrite: false,
      depthTest: false,
    });
    const points = new THREE.Points(geometry, material);
    points.name = `linePoints_${name}`;
    points.renderOrder = 1;
    // Visible immediately, independent of animateLineReveal()'s line-draw
    // timing — gating hover-ability on that animation finishing (a previous
    // version of this code) meant hovering during the first ~1.5s after
    // load/reload silently did nothing, easily mistaken for "hover is
    // broken" rather than "hover isn't ready yet".
    scene.three.add(points);
    linePointMarkers.set(name, points);
  }
}

function clearLineMarkers() {
  for (const points of linePointMarkers.values()) {
    scene.three.remove(points);
    points.geometry.dispose();
    points.material.dispose();
  }
  linePointMarkers = new Map();
  linePointData = new Map();

  if (lineDropGuide) {
    scene.three.remove(lineDropGuide);
    lineDropGuide.geometry.dispose();
    lineDropGuide.material.dispose();
    lineDropGuide = null;
  }
}

/** Builds the (initially hidden) drop-guide line — see `lineDropGuide`'s doc for why it exists. */
function buildLineDropGuide() {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  // depthTest: false for the same reason the hover-point sprites need it
  // (see their material's doc) — this guide starts exactly at a marker
  // that may sit where another series' line also passes, so it must not
  // be able to lose a depth test against that coincident geometry either.
  const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthTest: false });
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 2;
  line.visible = false;
  scene.three.add(line);
  return line;
}

/**
 * Smooth ease-in "draw" reveal, one series at a time (staggered). Rather
 * than rebuilding each line's vertex buffer every frame — which would
 * rebuild GPU geometry every tick and risks visible glitching — this
 * animates a single `dashSize` material uniform from 0 up to the line's own
 * real length (`Line2.computeLineDistances()`), which LineMaterial's dashed
 * mode already renders as "everything before this cumulative distance is
 * visible, everything after is not". Purely GPU-side: no geometry rebuild,
 * no glitching, no z-fighting.
 */
function animateLineReveal(seriesNames) {
  const ease = resolve('easeInCubic');
  seriesNames.forEach((name, seriesIndex) => {
    const line = scene.three.getObjectByName(`chart-line-${name}`);
    if (!line) return;
    line.computeLineDistances();
    const distances = line.geometry.attributes.instanceDistanceStart.data.array;
    const totalLength = distances[distances.length - 1] || 0;
    if (totalLength <= 0) return;

    const material = line.material;
    material.linewidth = 3.2; // bolder than the 2px default, reads better against the midnight backdrop
    material.dashed = true;
    material.dashOffset = 0;
    material.gapSize = totalLength * 10 + 1; // one giant "off" region past the line's own end — never wraps back on
    material.dashSize = 0;

    let elapsed = -seriesIndex * LINE_SERIES_STAGGER_SEC; // negative delay before this series starts drawing
    const tick = (deltaSec) => {
      elapsed += deltaSec;
      if (elapsed < 0) return;
      const t = Math.min(elapsed / LINE_REVEAL_DURATION_SEC, 1);
      material.dashSize = totalLength * ease(t);
      if (t >= 1) {
        material.dashed = false; // back to a plain solid line once fully revealed
        loop.remove(tick);
        lineRevealTicks = lineRevealTicks.filter((fn) => fn !== tick);
      }
    };
    lineRevealTicks.push(tick);
    loop.add(tick);
  });
}

/**
 * Tears down the previous line chart/axes/markers (if any) and builds a
 * fresh one with a staggered, eased draw-in — mirrors buildChart() above.
 */
function buildLineChart(rows, seriesNames) {
  lineChart?.destroy();
  lineXAxis?.dispose();
  lineYAxis?.dispose();
  clearLineMarkers();
  linePopupInfo.value = null;
  for (const tick of lineRevealTicks) loop.remove(tick);
  lineRevealTicks = [];

  let maxValue = 0;
  for (const row of rows) if (row.value > maxValue) maxValue = row.value;

  const labels = [...new Set(rows.map((d) => d.label))]; // shared x domain, first-seen order (same across every series)
  const x = scale.band().domain(labels).range([0, 8]).paddingInner(0.35).paddingOuter(0.6);
  const y = scale.linear().domain([0, maxValue]).range([0, 5]).nice();

  lineChart = new LineChart(scene.three)
    .x((d) => d.label, x)
    .y((d) => d.value, y)
    .series((d) => d.series)
    .curve(curveType.value);
  lineChart.data(rows);
  lineChart.render();
  lineChart.setResolution(canvasEl.value.clientWidth, canvasEl.value.clientHeight);

  lineXAxis = new Axis().scale(x).orientation('x').tickSize(0.4).labelStyle(labelStyle).render(scene.three, 'xAxisLine', { camera: scene.camera.three });
  lineYAxis = new Axis().scale(y).orientation('y').tickCount(5).tickSize(0.4).labelStyle(labelStyle).render(scene.three, 'yAxisLine', { camera: scene.camera.three });
  boostAxisVisibility(scene.three, 'xAxisLine');
  boostAxisVisibility(scene.three, 'yAxisLine');

  buildLinePointMarkers(rows, seriesNames, x, y);
  lineDropGuide = buildLineDropGuide();
  animateLineReveal(seriesNames);
}

function regenerateLine() {
  if (!scene) return;
  const { rows, seriesNames, unit } = generateLineDataset();
  lineMeta.value = { companies: seriesNames, unit };
  buildLineChart(rows, seriesNames);
}

// Curve dropdown: re-interpolates the current data in place (points, axes,
// and hover state are all curve-independent) rather than rebuilding the
// whole chart like Reload does.
function applyCurve() {
  lineChart?.curve(curveType.value).update();
}

/**
 * Globally closest point to canvas-local pixel (px, py), regardless of
 * distance — the shared core `findHoveredLinePoint()` (the real hit-test,
 * radius-gated) and the on-screen diagnostic overlay (which needs the true
 * distance even when it's a miss) both build on. Projects every candidate
 * point to screen pixels (`Vector3.project(camera)`) and compares directly
 * to the cursor.
 * @returns {{point: object, key: string, dist: number}|null}
 */
function findClosestLinePoint(px, py, width, height) {
  const camera = scene.camera.three;
  // OrbitControls writes camera.position/quaternion synchronously from its
  // own pointermove listener on this canvas, but matrixWorld (what
  // Vector3.project() actually reads) is only recomputed by the next
  // renderer.render() call — refresh it here so a hover fired mid-rotate/pan
  // always projects against the camera's current orientation, not a stale
  // one lagging by up to a frame (same fix as src/interact/Picker.js's
  // camera getter).
  camera.updateMatrixWorld();
  // Defensive resync, same spirit as the updateMatrixWorld() call above:
  // camera.aspect is only ever refreshed by handleResize(), which runs
  // asynchronously off a ResizeObserver callback — there's an inherent gap
  // between a real layout change and that callback actually firing. A hover
  // landing in that gap would project against a stale aspect ratio while
  // width/height here are the CURRENT measured rect. This narrows that race
  // but was NOT the cause of the large, reproducible ring/tooltip-vs-marker
  // mismatch reported against this page — that turned out to be a library
  // bug (`Graph3D`'s render loop passing device pixels to
  // `WebGLRenderer.setViewport()`/`setScissor()`, which both expect logical/
  // CSS pixels and multiply by the renderer's own pixel ratio internally —
  // fixed in `src/core/Graph3D.js`'s `#tick`). That bug meant the GPU
  // viewport itself no longer matched the canvas box `Vector3.project()`
  // assumes, so no amount of resyncing camera state here could have fixed
  // it — recomputing aspect from the same width/height this call already
  // received still closes this narrower, genuine race, so it stays.
  if (camera.aspect !== width / height) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  let closest = null;
  let closestDistance = Infinity;
  for (const [name, list] of linePointData) {
    const markerPoints = linePointMarkers.get(name);
    if (!markerPoints || !markerPoints.visible) continue;
    for (const datum of list) {
      linePointProjectionScratch.set(datum.position.x, datum.position.y, datum.position.z).project(camera);
      if (linePointProjectionScratch.z < -1 || linePointProjectionScratch.z > 1) continue; // outside the camera's near/far range
      const sx = (linePointProjectionScratch.x * 0.5 + 0.5) * width;
      const sy = (-linePointProjectionScratch.y * 0.5 + 0.5) * height;
      const dist = Math.hypot(sx - px, sy - py);
      if (dist < closestDistance) {
        closestDistance = dist;
        closest = { point: datum, key: `${name}__${datum.label}`, dist };
      }
    }
  }
  return closest;
}

/** Nearest hover-able point to canvas-local pixel (px, py), or null — `findClosestLinePoint()` gated to `LINE_HOVER_PIXEL_RADIUS`. */
function findHoveredLinePoint(px, py, width, height) {
  const closest = findClosestLinePoint(px, py, width, height);
  if (!closest || closest.dist > LINE_HOVER_PIXEL_RADIUS) return null;
  return { ...closest.point, key: closest.key };
}

/**
 * Positions the tooltip + hover ring at the nearest point within
 * `LINE_HOVER_PIXEL_RADIUS`, or clears both. Two points from different
 * series can legitimately sit only a few pixels apart on screen (near where
 * their lines cross) — `findClosestLinePoint()`'s ranking is exact (verified
 * against the actual GPU vertex buffer), so in that situation this picks
 * whichever point the cursor is truly nearer to; the pulsing hover ring
 * exists specifically so that's never ambiguous to the user — it's drawn
 * exactly on whichever point actually got picked, so a slightly-off cursor
 * position is immediately visible and easy to correct.
 */
function handleLinePointerMove(event) {
  if (!scene || linePointMarkers.size === 0) return;
  const rect = canvasEl.value.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  const closest = findClosestLinePoint(px, py, rect.width, rect.height);
  const isHit = closest && closest.dist <= LINE_HOVER_PIXEL_RADIUS;

  if (isHit) {
    linePointProjectionScratch.set(closest.point.position.x, closest.point.position.y, closest.point.position.z).project(scene.camera.three);
    const sx = (linePointProjectionScratch.x * 0.5 + 0.5) * rect.width;
    const sy = (-linePointProjectionScratch.y * 0.5 + 0.5) * rect.height;
    // Positioned synchronously right here in the event handler (not via a
    // requestAnimationFrame tick) so it can never lag behind or show a
    // stale point — see LINE_POPUP_PIXEL_GAP's doc for why that mattered.
    linePopupInfo.value = { x: sx, y: sy, series: closest.point.series, label: closest.point.label, value: closest.point.value, color: closest.point.color };
    if (lineDropGuide) {
      const { x: wx, y: wy, z: wz } = closest.point.position;
      const positions = lineDropGuide.geometry.attributes.position;
      positions.setXYZ(0, wx, wy, wz);
      positions.setXYZ(1, wx, 0, wz);
      positions.needsUpdate = true;
      lineDropGuide.geometry.computeBoundingSphere();
      lineDropGuide.visible = true;
    }
  } else {
    linePopupInfo.value = null;
    if (lineDropGuide) lineDropGuide.visible = false;
  }
}

function handleLinePointerLeave() {
  linePopupInfo.value = null;
  if (lineDropGuide) lineDropGuide.visible = false;
}

onMounted(async () => {
  if (props.type !== 'bar' && props.type !== 'line') return;

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
  // Elevated data (a tall bar top, a high line-chart marker) sits at the same
  // world X/Z as its ground-level axis tick but a different world Y — under
  // perspective projection, the two diverge in screen X as the camera tilts
  // away from eye-level, and that divergence is amplified sharply the closer
  // the camera sits to its target (worse still combined with azimuthal
  // rotation, not just tilt). A live sweep across every point, every reachable
  // camera angle, measured >250px of worst-case screen-X drift at the old
  // 4-unit zoom-in floor, vs ~50px worst case at an 8-unit floor with these
  // angle bounds — the zoom floor and the tilt range both had to move
  // together, tightening either alone left the other free to reproduce the
  // same drift.
  scene.camera.setMaxZoomIn(8); // never let the user dolly closer than 8 units
  scene.camera.setMaxZoomOut(18); // never let the user dolly past 18 units away
  scene.camera.setMinPolarAngle(Math.PI * (65 / 180)); // ~65° from vertical
  scene.camera.setMaxPolarAngle(Math.PI * (115 / 180)); // ~115° — symmetric ±25° around eye-level

  // Runs before the first regenerate() — now that no HDR fetch blocks it,
  // the background/lighting/postfx are already in place for the first
  // rendered frame instead of flashing default lighting then swapping.
  try {
    scene.light.setPreset('studio');
    await scene.shadows.enable('pcf-soft');
    // 'low' (not 'high') keeps this interactive example responsive on modest
    // GPUs — a 2048px soft shadow map every frame was measurably slow enough
    // to make the line chart's hover tooltip visibly lag behind the cursor.
    scene.shadows.setQuality('low');
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

  if (props.type === 'bar') {
    regenerate();
  } else {
    regenerateLine();
    canvasEl.value.addEventListener('pointermove', handleLinePointerMove);
    canvasEl.value.addEventListener('pointerleave', handleLinePointerLeave);
  }

  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(canvasEl.value);
  handleResize();
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  canvasEl.value?.removeEventListener('pointermove', handleLinePointerMove);
  canvasEl.value?.removeEventListener('pointerleave', handleLinePointerLeave);
  for (const tick of lineRevealTicks) loop.remove(tick);
  lineRevealTicks = [];
  linePopupInfo.value = null;
  clearLineMarkers();
  g?.dispose();
  g = null;
  scene = null;
  chart = null;
  xAxis = null;
  yAxis = null;
  lineChart = null;
  lineXAxis = null;
  lineYAxis = null;
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
.line-tooltip {
  position: absolute;
  z-index: 6;
  transform: translate(-50%, calc(-100% - 14px));
  background: #ffffff;
  border-radius: 16px;
  padding: 10px 18px 12px;
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
  pointer-events: none;
  white-space: nowrap;
}
.line-tooltip::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -8px;
  transform: translateX(-50%);
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 8px solid #ffffff;
}
.line-tooltip-chip {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 7px;
}
.line-tooltip-series {
  font: 700 15px system-ui, -apple-system, sans-serif;
  color: #0f172a;
}
.line-tooltip-label {
  font: 500 12px system-ui, -apple-system, sans-serif;
  color: #64748b;
  margin: 2px 0 2px 17px;
}
.line-tooltip-value {
  font: 800 26px system-ui, -apple-system, sans-serif;
  margin-left: 17px;
}
.line-hover-ring {
  position: absolute;
  z-index: 5;
  width: 26px;
  height: 26px;
  margin-left: -13px;
  margin-top: -13px;
  border-radius: 50%;
  border: 3px solid;
  pointer-events: none;
  box-sizing: border-box;
  animation: line-hover-ring-pulse 1s ease-out infinite;
}
@keyframes line-hover-ring-pulse {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(1.6); opacity: 0; }
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
