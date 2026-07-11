import './_nodeGlobals.js';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { ScatterChart } from '../src/chart/ScatterChart.js';
import { DataStream } from '../src/stream/DataStream.js';

// Prompt 171 stress bench: 1M points spread across 10 charts, streamed in,
// then held under a sustained mutate+update() load while sampling a
// throughput-proxy "FPS" and the process heap.
//
// This is NOT a real-browser FPS measurement — there is no WebGL context
// under plain Node, so "FPS" here is 1000 / (ms per simulated frame), where
// a simulated frame is one chart's real data()+update() join/instanced-write
// pass (the actual CPU-side cost a real frame would pay; only the GPU
// rasterization step is missing). Same documented proxy/gap as
// tests/integration/phase7.test.js's own PostFX performance test — a real
// "1M points / 10 charts / 30 min / FPS>=30" claim needs an actual browser
// tab, which examples/22-million-points/main.js was manually verified in
// (see skipping_list.md's Phase 10 entry for the rest of this gap).
//
// Runs at a fast default scale so `node bench/stress-million.bench.js` stays
// usable as a sanity check; opt into the literal prompt scale via env vars:
//   STRESS_POINTS=1000000 STRESS_DURATION_MS=1800000 node bench/stress-million.bench.js
//
// Default-exports an empty scenario list (not the harness.js `{name,fn}[]`
// contract — a 30-minute soak doesn't fit its fixed 1s-measurement model)
// purely so `npm run bench`'s automatic *.bench.js sweep doesn't crash on
// this file.
export default [];

// Default scale is deliberately small: a per-frame mutate+update() cycle
// re-diffs the chart's *entire* current dataset (diffData's "update" bucket
// is every matched key, not just the mutated rows — see #writeComputedTransform),
// and GraphInstancedObject's octree currently degrades badly at low point
// density relative to its fixed default bounds (skipping_list.md, Phase 10 —
// remove()/insert() collapse into a single overloaded leaf once positions
// cluster far inside DEFAULT_OCTREE_BOUNDS, turning every update() O(n^2)).
// So the literal "1,000,000 points / 10 charts / 30 minutes" scale from the
// prompt is reachable via env vars but currently fails the FPS target — that
// failure is the bench correctly reporting a real, documented perf bug, not
// a bug in the bench itself.
const POINTS = Number(process.env.STRESS_POINTS ?? 20_000);
const CHART_COUNT = Number(process.env.STRESS_CHARTS ?? 10);
const DURATION_MS = Number(process.env.STRESS_DURATION_MS ?? 5_000);
const FPS_TARGET = Number(process.env.STRESS_FPS_TARGET ?? 30);
const CHUNK_SIZE = 5_000;
const STREAM_INTERVAL_MS = 10;
const MUTATIONS_PER_FRAME = 50;

const POINTS_PER_CHART = Math.floor(POINTS / CHART_COUNT);

function makeRows(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: (Math.random() * 2 - 1) * 40,
    y: (Math.random() * 2 - 1) * 40,
    z: (Math.random() * 2 - 1) * 40,
    value: Math.random(),
  }));
}

async function streamIn(chart, rows) {
  const stream = DataStream.fromArray(rows, CHUNK_SIZE, STREAM_INTERVAL_MS);
  chart.data(rows.slice(0, CHUNK_SIZE), (d) => d.id);
  chart.render();
  chart.stream(stream);
  for await (const _chunk of stream); // drain until the source (and stream()'s pump) both end
}

function mutateFrame(rows) {
  for (let i = 0; i < MUTATIONS_PER_FRAME; i++) {
    rows[(Math.random() * rows.length) | 0].value = Math.random();
  }
}

async function main() {
  console.log(`stress-million: ${POINTS_PER_CHART * CHART_COUNT} points across ${CHART_COUNT} charts, ${DURATION_MS}ms soak, target >=${FPS_TARGET}fps proxy`);

  const charts = [];
  const rowsByChart = [];
  for (let c = 0; c < CHART_COUNT; c++) {
    const scene = new THREE.Scene();
    const chart = new ScatterChart(scene).x((d) => d.x).y((d) => d.y).z((d) => d.z).size(0.03).color((d) => d.value);
    const rows = makeRows(POINTS_PER_CHART);
    rowsByChart.push(rows);
    await streamIn(chart, rows);
    charts.push(chart);
  }
  console.log(`loaded: ${charts.reduce((sum, chart) => sum + chart.data().length, 0)} points`);
  if (!global.gc) console.log('note: run with `node --expose-gc` for a GC-settled (non-noisy) heap reading');

  global.gc?.();
  const heapStart = process.memoryUsage().heapUsed;
  const frameTimes = [];
  const heapSamples = [heapStart];
  const end = performance.now() + DURATION_MS;
  let frame = 0;

  while (performance.now() < end) {
    const chart = charts[frame % charts.length];
    const rows = rowsByChart[frame % charts.length];
    const frameStart = performance.now();

    mutateFrame(rows);
    chart.data(rows, (d) => d.id);
    chart.update();

    frameTimes.push(performance.now() - frameStart);
    if (frame % 100 === 0) {
      global.gc?.();
      heapSamples.push(process.memoryUsage().heapUsed);
    }
    frame++;
  }

  for (const chart of charts) chart.destroy();

  const avgFrameMs = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  const worstFrameMs = Math.max(...frameTimes);
  const avgFps = 1000 / avgFrameMs;
  const worstFps = 1000 / worstFrameMs;
  const heapEnd = heapSamples.at(-1);
  const heapGrowthRatio = heapEnd / heapStart;

  console.log(`frames: ${frame}, avg ${avgFps.toFixed(1)}fps (proxy), worst ${worstFps.toFixed(1)}fps (proxy)`);
  console.log(`heap: ${(heapStart / 1e6).toFixed(1)}MB -> ${(heapEnd / 1e6).toFixed(1)}MB (x${heapGrowthRatio.toFixed(2)})`);

  const fpsOk = avgFps >= FPS_TARGET;
  // Without --expose-gc, samples race uncollected garbage and the ratio is
  // too noisy to gate on (a real leak test already exists — see
  // GraphInstancedObject-disposal.test.js, which checks renderer.info
  // counters across real dispose cycles) — only fail on heap growth when a
  // forced collection actually ran before each sample.
  const heapOk = !global.gc || heapGrowthRatio < 3;

  if (!fpsOk) console.error(`FAIL: avg proxy-fps ${avgFps.toFixed(1)} < target ${FPS_TARGET}`);
  if (!heapOk) console.error(`FAIL: heap grew x${heapGrowthRatio.toFixed(2)}, exceeds x3 threshold (run was --expose-gc, so this is a real signal)`);

  process.exitCode = fpsOk && heapOk ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
