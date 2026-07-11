import { Graph3D, ScatterChart, DataStream, Brush, loop } from '../../src/index.js';

// Phase 10 example (Prompt 170): 1,000,000 points streamed in 10,000-point
// chunks every 100ms via DataStream.fromArray + chart.stream() (Prompt 160),
// then chart.enableLOD() (Prompt 163) takes over once the stream ends, and
// Brush (Prompt 152) drives region selection throughout.
//
// enableLOD() snapshots chart.data() once, at call time, and repeatedly
// overwrites it with a decimated subset on every camera-distance-bucket
// crossing — calling it *while* the stream is still growing the dataset
// would race the stream's own data()+update() calls and freeze the visible
// set at whatever partial snapshot LOD captured. So LOD only turns on once
// the stream has ended.
//
// "Loaded" can land under 1,000,000: chart.stream()'s pump keeps at most one
// pending chunk and *drops* (not queues) whatever was still pending when a
// newer one arrives (its own documented backpressure behavior) — at this
// scale, joining/re-instancing a multi-hundred-thousand-point buffer can
// take longer than the 100ms between chunks, so intermediate chunks are
// genuinely lost. The final chunk is never superseded, so it always lands —
// that's the actual "stream ended" signal used below, not a target count.

const POINT_COUNT = 1_000_000;
const CHUNK_SIZE = 10_000;
const STREAM_INTERVAL_MS = 100;
const DOMAIN_RADIUS = 40;

/** Base-`base` Halton sequence value for index `i` — low-discrepancy coverage in [0, 1). */
function halton(i, base) {
  let f = 1;
  let r = 0;
  let n = i;
  while (n > 0) {
    f /= base;
    r += f * (n % base);
    n = Math.floor(n / base);
  }
  return r;
}

/** Pre-generates the full 1M-row dataset once — streaming re-slices this array, it never recomputes positions. */
function buildRows() {
  const rows = new Array(POINT_COUNT);
  for (let i = 0; i < POINT_COUNT; i++) {
    const x = (halton(i + 1, 2) * 2 - 1) * DOMAIN_RADIUS;
    const y = (halton(i + 1, 3) * 2 - 1) * DOMAIN_RADIUS;
    const z = (halton(i + 1, 5) * 2 - 1) * DOMAIN_RADIUS;
    rows[i] = { id: i, x, y, z, value: Math.sqrt(x * x + y * y + z * z) };
  }
  return rows;
}

const rows = buildRows();

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);
scene.shadows?.disable();

const loadedEl = document.getElementById('loaded');
const lodStatusEl = document.getElementById('lodStatus');
const brushedCountEl = document.getElementById('brushedCount');
const fpsEl = document.getElementById('fps');
const brushRectEl = document.getElementById('brushRect');

const chart = new ScatterChart(scene.three)
  .x((d) => d.x)
  .y((d) => d.y)
  .z((d) => d.z)
  .size(0.035)
  .color((d) => d.value)
  .opacity(0.85);

chart.data(rows.slice(0, CHUNK_SIZE), (d) => d.id);
chart.render();
loadedEl.textContent = String(chart.data().length);

// ── Streaming ingestion ─────────────────────────────────────────────────

/**
 * Wraps `dataStream` in a pass-through async iterable that flags `.done`
 * once the wrapped stream is exhausted — reuses `DataStream.fromArray`
 * as-is (CLAUDE.md §1.1 DRY) rather than re-deriving its own chunk timing.
 * @param {DataStream} dataStream
 * @returns {{stream: DataStream, done: boolean}}
 */
function trackCompletion(dataStream) {
  const state = { done: false };
  async function* passthrough() {
    for await (const chunk of dataStream) yield chunk;
    state.done = true;
  }
  return { stream: DataStream.from(passthrough()), state };
}

// Progress is polled from the render loop, not observed via chart.onUpdate():
// registering an 'update' handler makes *that handler* responsible for
// writing the matched bucket's position/scale/color (GraphChart.update()'s
// own documented contract — "the handler owns writing whatever it wants"),
// replacing the chart's default write instead of running alongside it. A
// passive logging handler would silently stop every previously-streamed
// point from being (re)written on each subsequent chunk.
let lodEnabled = false;
const { stream: tailStream, state: tailState } = trackCompletion(DataStream.fromArray(rows.slice(CHUNK_SIZE), CHUNK_SIZE, STREAM_INTERVAL_MS));

chart.stream(tailStream);

loop.add(() => {
  loadedEl.textContent = chart.data().length.toLocaleString();
  if (!lodEnabled && tailState.done) {
    lodEnabled = true;
    enableLOD();
  }
});

function enableLOD() {
  chart.enableLOD({
    camera: scene.camera.three,
    levels: [
      { maxDistance: 60, maxPoints: 250_000 },
      { maxDistance: 120, maxPoints: 50_000 },
      { maxDistance: 300, maxPoints: 5_000 },
    ],
  });
  lodStatusEl.textContent = 'active — zoom out to decimate';
}

// ── Brush-to-select ──────────────────────────────────────────────────────

const brush = new Brush({ camera: scene.camera.three, domElement: canvas });
brush.register(chart);
brush.on('select', (selection) => {
  selection.attr('color', 'gold');
  brushedCountEl.textContent = String(selection.size());
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

// ── Camera ───────────────────────────────────────────────────────────────

scene.camera.three.position.set(0, DOMAIN_RADIUS * 0.7, DOMAIN_RADIUS * 2.2);
scene.camera.lookAt(0, 0, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement).catch((error) => console.error('enableOrbitControls failed:', error));

// ── FPS ──────────────────────────────────────────────────────────────────

let fpsSmoothed = 60;
loop.add((deltaSec) => {
  fpsSmoothed += (1 / Math.max(deltaSec, 1e-6) - fpsSmoothed) * 0.1;
  fpsEl.textContent = fpsSmoothed.toFixed(0);
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
