import * as THREE from 'three';
import { Graph3D, ScatterChart, BarChart, PieChart, scale, palette, Picker, PointerRouter, Brush, link } from '../../src/index.js';

// Phase 9 capstone example (Prompt 157): three linked charts sharing one
// product dataset — a ScatterChart (price vs rating, the brush source), a
// per-product BarChart (`link()`'s target, Prompt 153), and a
// category-aggregated PieChart (re-aggregated by hand on every brush,
// since `link()`'s row-identity filtering can't reshape rows into a new
// aggregate — see `refreshPie(rows)` below). One shared `Picker`/`PointerRouter`
// (Prompt 147/149) drives click-select and hover across all three; the
// default gold-outline/scale-bump hover/select visuals (Prompt 150) are
// used as-is, with zero extra styling. Tooltips are wired by hand off
// `chart.on('hover', ...)` (Prompt 156) + each chart's own `chart.tooltip()`
// config (Prompt 143) — `interact/Tooltip.js` doesn't exist yet (deferred
// past Phase 9, see `prompts.md`'s own numbering gap around Prompt 151).
// The live "selected data" panel reads `PointerRouter.selectedEntries()`
// (Prompt 155) on every `chart.on('select'|'deselect', ...)`.

const CATEGORIES = ['Electronics', 'Apparel', 'Home', 'Sports', 'Books'];
const PRODUCTS_PER_CATEGORY = 5;
const GROUP_SPACING = 9;

function randomProducts() {
  const products = [];
  let nextId = 0;
  for (const category of CATEGORIES) {
    for (let i = 0; i < PRODUCTS_PER_CATEGORY; i++) {
      products.push({
        id: nextId++,
        category,
        price: Math.round(20 + Math.random() * 430),
        rating: Math.round((1 + Math.random() * 4) * 10) / 10,
      });
    }
  }
  return products;
}

function aggregateByCategory(rows) {
  const counts = new Map();
  for (const category of CATEGORIES) counts.set(category, 0);
  for (const row of rows) counts.set(row.category, counts.get(row.category) + 1);
  return CATEGORIES.map((category) => ({ category, count: counts.get(category) }));
}

const PRODUCTS = randomProducts();

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

const selectedPanelEl = document.getElementById('selectedPanel');
const brushedCountEl = document.getElementById('brushedCount');
const tooltipEl = document.getElementById('tooltip');
const brushRectEl = document.getElementById('brushRect');
const resetButtonEl = document.getElementById('resetFilter');

/**
 * Runs `buildFn` (which constructs+renders one chart against `scene.three`),
 * then reparents every object it just added into a `THREE.Group` positioned
 * at `offsetX` — the same "build against the real scene, reparent after"
 * technique `examples/19-gallery/main.js` established, minus its auto-fit
 * rescaling (each chart's own scale ranges below are already sized to match).
 * @param {number} offsetX
 * @param {() => void} buildFn
 */
function placeAt(offsetX, buildFn) {
  const before = new Set(scene.three.children);
  buildFn();
  const group = new THREE.Group();
  group.position.set(offsetX, 0, 0);
  scene.three.add(group);
  for (const child of [...scene.three.children]) {
    if (!before.has(child) && child !== group) group.add(child);
  }
}

// ── Scatter (brush source) ──────────────────────────────────────────────

const priceScale = scale.linear().domain([0, 450]).range([-3.5, 3.5]);
const ratingScale = scale.linear().domain([1, 5]).range([0, 4]);

let scatterChart;
placeAt(-GROUP_SPACING, () => {
  scatterChart = new ScatterChart(scene.three)
    .x((d) => d.price, priceScale)
    .y((d) => d.rating, ratingScale)
    .z(0)
    .size(0.15)
    .color((d) => d.category, palette.category10)
    .tooltip((d) => `${d.category}\n$${d.price} · ${d.rating}★`);
  scatterChart.data(PRODUCTS, (d) => d.id);
  scatterChart.render();
});

// ── Bar (link() target — per-product, same row identity as the scatter) ──

const barX = scale.band().domain(PRODUCTS.map((d) => d.id)).range([-4.5, 4.5]).paddingInner(0.3);
const barY = scale.linear().domain([0, 450]).range([0, 4]);

let barChart;
placeAt(0, () => {
  barChart = new BarChart(scene.three)
    .x((d) => d.id, barX)
    .y((d) => d.price, barY)
    .color((d) => d.category, palette.category10)
    .tooltip((d) => `${d.category}\n$${d.price}`);
  barChart.data(PRODUCTS, (d) => d.id);
  barChart.render();
});

// ── Pie (category counts — re-aggregated by hand, see refreshPie) ────────

let pieChart;
placeAt(GROUP_SPACING, () => {
  pieChart = new PieChart(scene.three)
    .value((d) => d.count)
    .padAngle(0.02)
    .color((d) => d.category, palette.category10)
    .tooltip((d) => `${d.category}: ${d.count}`);
  // The first render (only) must happen inside placeAt's buildFn — its
  // reparenting snapshot only catches scene.three children added while this
  // callback runs; refreshPie(rows)'s later re-renders update these same
  // already-positioned meshes in place, so they don't need that.
  pieChart.data(aggregateByCategory(PRODUCTS)).render();
});

// ── Brush-to-filter ──────────────────────────────────────────────────────

const brush = new Brush({ camera: scene.camera.three, domElement: canvas });
brush.register(scatterChart);

// link() re-filters barChart's captured full dataset by reference membership
// (Prompt 153's default transform) — barChart shares PRODUCTS' exact row
// objects with scatterChart, so no custom transform is needed.
link(brush, barChart);

// PieChart aggregates counts, so a per-row filter can't drive it directly
// (link()'s target must stay a *subset* of its captured rows, never
// reshaped) — re-aggregate by hand off the same 'select' event instead.
function refreshPie(rows) {
  pieChart.data(aggregateByCategory(rows)).render();
}

brush.on('select', (selection) => {
  refreshPie(selection.data());
  brushedCountEl.textContent = String(selection.size());
});

resetButtonEl.addEventListener('click', () => {
  barChart.data(PRODUCTS, (d) => d.id);
  barChart.render();
  refreshPie(PRODUCTS);
  brushedCountEl.textContent = String(PRODUCTS.length);
});

brush.on('brushStart', () => {
  brushRectEl.style.display = 'block';
});
brush.on('brush', (rect) => {
  brushRectEl.style.left = `${rect.x}px`;
  brushRectEl.style.top = `${rect.y}px`;
  brushRectEl.style.width = `${rect.width}px`;
  brushRectEl.style.height = `${rect.height}px`;
});
brush.on('brushEnd', () => {
  brushRectEl.style.display = 'none';
});

brushedCountEl.textContent = String(PRODUCTS.length);

// ── Click-select + hover tooltips ─────────────────────────────────────────

const picker = new Picker({ camera: scene.camera.three, domElement: canvas });
picker.register(scatterChart).register(barChart).register(pieChart);
const router = new PointerRouter({ picker, domElement: canvas });
// Default gold-outline + hover-scale visuals (Prompt 150) apply automatically
// — no per-chart StateMachine styling configured here on purpose.

const CHART_LABELS = new Map([[scatterChart, 'Scatter'], [barChart, 'Bar'], [pieChart, 'Pie']]);

function describeEntry({ chart, datum }) {
  const label = CHART_LABELS.get(chart);
  return datum.count !== undefined ? `${label}: ${datum.category} (${datum.count})` : `${label}: ${datum.category} — $${datum.price}`;
}

function refreshSelectedPanel() {
  const entries = router.selectedEntries();
  selectedPanelEl.innerHTML = entries.length === 0
    ? '<li class="empty">Nothing selected — click a point, bar, or slice.</li>'
    : entries.map((entry) => `<li>${describeEntry(entry)}</li>`).join('');
}

for (const chart of [scatterChart, barChart, pieChart]) {
  chart.on('select', refreshSelectedPanel);
  chart.on('deselect', refreshSelectedPanel);
}
refreshSelectedPanel();

// Sticky-until-replaced tooltip: shows the last-hovered datum's content
// (chart.tooltip()'s configured handler), hidden only on leaving the canvas
// entirely — simpler than per-chart hover-leave wiring, and avoids the
// gotcha where a chart.selection()-scoped handler (Prompt 149) would
// silently stop firing after link()/reset re-renders barChart/pieChart
// (chart.on('hover', ...), Prompt 156, doesn't have that problem, but has
// no paired "un-hover" event to hide on).
function showTooltip(chart, { datum, domEvent }) {
  const handler = chart.tooltip();
  tooltipEl.textContent = handler ? handler(datum) : String(datum);
  tooltipEl.style.left = `${domEvent.clientX + 16}px`;
  tooltipEl.style.top = `${domEvent.clientY + 16}px`;
  tooltipEl.style.display = 'block';
}
for (const chart of [scatterChart, barChart, pieChart]) {
  chart.on('hover', (hit) => showTooltip(chart, hit));
}
canvas.addEventListener('pointerleave', () => {
  tooltipEl.style.display = 'none';
});

// ── Camera ───────────────────────────────────────────────────────────────

scene.camera.three.position.set(0, 14, 20);
scene.camera.lookAt(0, 1, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement).catch((error) => console.error('enableOrbitControls failed:', error));

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
