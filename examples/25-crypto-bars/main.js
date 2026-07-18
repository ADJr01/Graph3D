import * as THREE from 'three';
import { Graph3D, BarChart, scale, Axis, loop, graphIcon } from '../../src/index.js';
import { COINS, nextTick, coinIconDataUri } from './data.js';

// graphIcon showcase (user request, not a numbered prompts.md entry — same
// "example gallery" precedent 21-bar-race/24-GraphHTML-test document): five
// coins' prices, animated via BarChart's own keyed update()/.transition(),
// with one graphIcon(...) built ONCE per bar and left running with
// `follow: true` — unlike examples/24-GraphHTML-test's graphHTML labels
// (which must be disposed and rebuilt every tick, since graphHTML has no
// update() and no position-tracking), the icon here rides the bar's live
// top continuously through the whole transition, no rebuild needed.

const TICK_INTERVAL_SEC = 1.8;
const WORLD_HEIGHT = 6;
const X_RANGE = [0, 10];
const ICON_MARGIN = 0.3;
const ICON_SIZE = 0.55;

const COLOR_BY_TICKER = Object.fromEntries(COINS.map((c) => [c.ticker, c.color]));
// `.categorical = true` is the exact discriminator chart/colorField.js's
// applyColorField checks for — without it a plain key->color function gets
// routed through color.sequential's numeric domain-fitting instead of being
// called directly, silently collapsing every bar to white for ticker keys.
const brandColor = (ticker) => COLOR_BY_TICKER[ticker];
brandColor.categorical = true;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

// ── Visual polish — midnight-blue backdrop, ground plane, shadows ──────────
// No HDR is ever loaded here (see examples/08-bar-chart's identical note) —
// lighting/background are composed by hand instead.

scene.environment.setBackground(0x0a1330);
scene.environment.setFog({ type: 'exponential', color: 0x0a1330, density: 0.015 });
scene.light.setKeyIntensity(3.5).setRimIntensity(2.2);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(16, 8),
  new THREE.MeshStandardMaterial({ color: 0x111d3d, roughness: 0.85, metalness: 0.1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(5, -0.6, 0);
ground.receiveShadow = true;
scene.add(ground);

await scene.shadows.enable('pcf-soft');
scene.shadows.setQuality('high');

const priceListEl = document.getElementById('priceList');

// ── Scales ───────────────────────────────────────────────────────────────
// Prices span BTC's ~62 000 down to DOGE's ~0.14 — a plain linear scale
// would render every coin but BTC as an invisible sliver, so price uses a
// fixed-domain scale.log() instead (log scales make sense for genuinely
// multi-order-of-magnitude data like this). Fixed, not data-driven: passing
// a bare accessor (not the scale itself) to chart.y() means BarChart never
// refits this domain to the current tick's [min, max] (chart/axisField.js's
// applyAxisScaleDomain only refits a *directly attached* scale), so bar
// height stays comparable across the whole animation instead of the ceiling
// silently moving every tick.
const x = scale.band().domain(COINS.map((c) => c.ticker)).range(X_RANGE).paddingInner(0.4).paddingOuter(0.6);
const xCenter = (ticker) => x(ticker) + x.bandwidth() / 2;
const y = scale.log().domain([0.05, 100000]).range([0, WORLD_HEIGHT]);

// ── Chart ────────────────────────────────────────────────────────────────

const chart = new BarChart(scene.three)
  .x((d) => xCenter(d.ticker))
  .y((d) => y(d.price))
  .color((d) => d.ticker, brandColor)
  .transition(1200, 'easeInOutCubic');
chart.generator.width(x.bandwidth() * 0.85);
chart.generator.depth(1.2);

chart.data(nextTick(), (d) => d.ticker);
chart.render();

// scene.selectByName('chart') matches nothing: GraphObjectFactory names each
// individual GraphMesh 'chart_<i>' (GraphChart.js), not 'chart' — that
// grouped name is only ever used whole for the GraphInstancedObject backend
// (5 coins stays under INSTANCING_THRESHOLD=50, so BarChart never switches
// to it here). Look each bar up by its own registered name instead.
const barMeshes = COINS.map((_, i) => scene.selectByName(`chart_${i}`)[0]);
for (const bar of barMeshes) {
  bar.three.castShadow = true;
  bar.three.receiveShadow = true;
}

// ── graphIcon — one per bar, built once, rides every future transition ───
// barMeshes[i] lines up with COINS[i]: chart.data() was joined in that same
// order for the initial render, and the keyed join (ticker) never
// reorders/recreates these meshes on later updates (same 5 keys every tick).
COINS.forEach((coin, i) => {
  graphIcon(barMeshes[i], {
    src: coinIconDataUri(coin),
    camera: scene.camera.three,
    width: ICON_SIZE,
    height: ICON_SIZE,
    // A bar's local origin is its CENTER (compose/generator/bar.js), so
    // "top" is center + half its own current height — re-read every frame
    // (follow: true, the default) so the icon tracks the bar smoothly
    // through BarChart's 1200ms transition instead of snapping at each end.
    offset: () => ({ y: barMeshes[i].three.scale.y / 2 + ICON_MARGIN }),
  });
});

// ── Axes ─────────────────────────────────────────────────────────────────

const axisLabelStyle = { fontSize: 0.36, color: '#ffffff', outline: { color: '#000000', width: 0.22 } };

new Axis().scale(x).orientation('x').tickSize(0.3).labelStyle(axisLabelStyle).render(scene.three, 'xAxis', { camera: scene.camera.three });
new Axis().scale(y).orientation('y').tickCount(5).tickSize(0.3).labelStyle(axisLabelStyle).render(scene.three, 'yAxis', { camera: scene.camera.three });

// ── Price panel ──────────────────────────────────────────────────────────

function formatPrice(price) {
  return price >= 1 ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${price.toFixed(3)}`;
}

function refreshPanel(rows) {
  priceListEl.innerHTML = rows
    .map((d) => `<li><span class="swatch" style="background:${d.color}"></span><span class="ticker">${d.ticker}</span><span class="price">${formatPrice(d.price)}</span></li>`)
    .join('');
}

refreshPanel(chart.data());

// ── Playback — live price updates, bars transition, icons ride along ─────

let elapsedSec = 0;
loop.add((deltaSec) => {
  elapsedSec += deltaSec;
  if (elapsedSec >= TICK_INTERVAL_SEC) {
    elapsedSec = 0;
    const rows = nextTick();
    chart.data(rows, (d) => d.ticker);
    chart.update();
    refreshPanel(rows);
  }
});

// ── Camera ───────────────────────────────────────────────────────────────

scene.camera.three.position.set(5, 8, 18);
scene.camera.lookAt(5, 3, 0);
scene.camera.setMaxZoomIn(3);
scene.camera.setMaxZoomOut(26);
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
