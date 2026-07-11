import * as THREE from 'three';
import { Graph3D, LineChart, BarChart, DataStream, scale, palette, Picker, PointerRouter } from '../../src/index.js';

// Phase 10 example (Prompt 170): a fintech dashboard driven by one simulated
// high-frequency feed (DataStream.fromInterval, Prompt 160) — a windowed
// LineChart (rolling per-symbol price history) and a live BarChart (current
// price per symbol), cross-filtered by clicking a bar.
//
// LineChart overrides data()/render()/update() with a plain-array, non-keyed
// pipeline (no per-vertex Selection to join against a continuous polyline —
// see LineChart's own class doc) and never calls GraphChart's versions, so
// GraphChart's stream()/window() (which read/write GraphChart's own private
// fields) have no effect on it. The rolling window here is therefore plain
// array bookkeeping in this example, not chart.window() — and the feed is
// pumped by hand (one for-await loop) rather than through chart.stream(),
// which BarChart (an unmodified GraphChart) *would* support, but sharing one
// pump loop for both charts keeps them on the exact same tick.
//
// Cross-filtering the line chart is a live chart.filter()-style re-slice of
// `ticks` on every batch, not interact/CrossFilter's link(): link() captures
// its target's dataset once, at link()-time, and re-filters from that frozen
// snapshot on every 'select' — the wrong shape for a target whose data is
// replaced on every incoming batch.

const SYMBOLS = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX'];
const MICRO_TICKS_PER_SYMBOL = 50;
const BATCH_INTERVAL_MS = 40;
const EVENTS_PER_SEC = (SYMBOLS.length * MICRO_TICKS_PER_SYMBOL * 1000) / BATCH_INTERVAL_MS;
const WINDOW_POINTS_PER_SYMBOL = 80;
const MAX_TICKS = WINDOW_POINTS_PER_SYMBOL * SYMBOLS.length;
const VOLATILITY = 0.0006;
const MIN_PRICE = 1;

// Warms palette.category10 in a fixed order so the line and bar charts (each
// assigning color independently, per-symbol) agree — same technique as
// examples/21-bar-race/main.js.
for (const symbol of SYMBOLS) palette.category10(symbol);

const lastPrice = new Map(SYMBOLS.map((symbol) => [symbol, 50 + Math.random() * 450]));
let batchIndex = 0;

/** One feed batch: every symbol advances MICRO_TICKS_PER_SYMBOL random-walk steps, only the final price is emitted. */
function nextBatch() {
  const t = batchIndex++;
  return SYMBOLS.map((symbol) => {
    let price = lastPrice.get(symbol);
    for (let i = 0; i < MICRO_TICKS_PER_SYMBOL; i++) {
      price = Math.max(MIN_PRICE, price + (Math.random() - 0.5) * price * VOLATILITY);
    }
    lastPrice.set(symbol, price);
    return { symbol, t, price };
  });
}

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

const eventsPerSecEl = document.getElementById('eventsPerSec');
const filterStatusEl = document.getElementById('filterStatus');
eventsPerSecEl.textContent = EVENTS_PER_SEC.toLocaleString();

/** Same "build against the real scene, reparent into an offset group" technique as examples/20-interaction/main.js. */
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

// ── Line chart (rolling window, left) ─────────────────────────────────────

let ticks = [];
let selectedSymbol = null;

let lineChart;
placeAt(-6, () => {
  lineChart = new LineChart(scene.three)
    .x((d) => d.t, scale.linear().domain([0, WINDOW_POINTS_PER_SYMBOL - 1]).range([-5, 5]))
    .y((d) => d.price, scale.linear().domain([0, 500]).range([0, 4]))
    .series((d) => d.symbol);
  // generator.line().compute requires >= 2 points per series, so the first
  // render needs two batches seeded up front — one batch alone renders a
  // single-point line per symbol and throws.
  ticks = [...nextBatch(), ...nextBatch()];
  lineChart.data(ticks).render();
});

function refreshLine() {
  const visible = selectedSymbol === null ? ticks : ticks.filter((d) => d.symbol === selectedSymbol);
  lineChart.data(visible).update();
}

// ── Bar chart (current price, right) ───────────────────────────────────────

const barX = scale.band().domain(SYMBOLS).range([-3.5, 3.5]).paddingInner(0.35);
const barY = scale.linear().domain([0, 500]).range([0, 4]);

let barChart;
placeAt(6, () => {
  barChart = new BarChart(scene.three)
    .x((d) => d.symbol, barX)
    .y((d) => d.price, barY)
    .color((d) => d.symbol, palette.category10);
  // ticks holds two seed batches (one row per symbol each, see the line
  // chart above) — the bar chart wants only the latest price per symbol, so
  // it seeds off the last SYMBOLS.length rows, not the full duplicated-key ticks array.
  barChart.data(ticks.slice(-SYMBOLS.length), (d) => d.symbol);
  barChart.render();
});

// ── Feed pump — one loop drives both charts off the same batch ─────────────

const feed = DataStream.fromInterval(nextBatch, BATCH_INTERVAL_MS);
(async () => {
  for await (const { added } of feed) {
    ticks.push(...added);
    if (ticks.length > MAX_TICKS) ticks.splice(0, ticks.length - MAX_TICKS);
    refreshLine();
    barChart.data(added, (d) => d.symbol);
    barChart.update();
  }
})();

// ── Cross-filter: click a bar to isolate its line, click again to reset ────

const picker = new Picker({ camera: scene.camera.three, domElement: canvas });
picker.register(barChart);
new PointerRouter({ picker, domElement: canvas }); // default gold-highlight select visuals apply automatically

barChart.on('select', ({ datum }) => {
  selectedSymbol = datum.symbol;
  filterStatusEl.textContent = selectedSymbol;
  refreshLine();
});
barChart.on('deselect', () => {
  selectedSymbol = null;
  filterStatusEl.textContent = 'all symbols';
  refreshLine();
});

// ── Camera ───────────────────────────────────────────────────────────────

scene.camera.three.position.set(0, 5, 16);
scene.camera.lookAt(0, 1.5, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement).catch((error) => console.error('enableOrbitControls failed:', error));

// ── Resize ───────────────────────────────────────────────────────────────

function handleResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  g.setSize(width, height);
  lineChart.setResolution(width, height);
  const camera = scene.camera.three;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', handleResize);
handleResize();
