import { Graph3D, BarChart, scale, Axis, loop, graphHTML, isHTMLInCanvasSupported } from '../../src/index.js';
import { WEEKS, COINS, MAX_INDEX, rowsForWeek } from './data.js';

// graphHTML showcase (user request, not a numbered prompts.md entry — same
// "example gallery" precedent 21-bar-race documents). Five coins' synthetic
// 10-week "performance index" (data.js), animated via BarChart's own keyed
// update()/.transition(), with one graphHTML(...) label built fresh per bar
// per week — the whole point of this example is exercising graphHTML's two
// render paths (HTML-in-Canvas when available, SDFText fallback otherwise)
// on a real, multi-bar, animated chart rather than a single static label.

const TRANSITION_MS = 1400;
const WEEK_INTERVAL_SEC = 2.3;
const WORLD_HEIGHT = 6;
const X_RANGE = [-4.5, 4.5];
const LABEL_MARGIN = 0.35;
const BAR_DEPTH = 1.3;
const COLOR_BY_TICKER = Object.fromEntries(COINS.map((c) => [c.ticker, c.color]));
const NAME_BY_TICKER = Object.fromEntries(COINS.map((c) => [c.ticker, c.name]));

// `.categorical = true` is the exact discriminator chart/colorField.js's
// applyColorField checks for (see palette/categorical.js) — without it, a
// plain key->color function gets routed through color.sequential's
// [min, max] numeric domain-fitting instead of being called directly,
// which silently collapses every bar to white for non-numeric (ticker
// string) keys like these.
const brandColor = (ticker) => COLOR_BY_TICKER[ticker];
brandColor.categorical = true;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

const weekNumberEl = document.getElementById('weekNumber');
const leaderboardEl = document.getElementById('leaderboard');
const renderBadgeEl = document.getElementById('renderBadge');
const playPauseEl = document.getElementById('playPause');
const restartEl = document.getElementById('restart');

// ── Scales ───────────────────────────────────────────────────────────────
// Band scale over ticker for x, matching the layout the previously-fixed
// docs barChart demo settled on (paddingInner/paddingOuter tuned for a
// clean gap without crowding the y-axis). `chart.x()` is handed the
// already-CENTERED position as a bare accessor (no scale attached) rather
// than the raw band scale — `resolveAxisAccessor` composes `scale(x)`
// unmodified into the generator's position, i.e. the band's *start* edge
// (band.js's own documented contract), while `Axis` internally offsets its
// own tick/label placement by `+bandwidth()/2` to land ticks mid-band
// (src/compose/axis/Axis.js). Passing the raw band scale straight into
// `chart.x()` would therefore silently misalign every bar half a band-width
// left of its own axis tick — the exact `+bandwidth()/2` compensation below
// keeps bars and their axis labels visually lined up.
const x = scale.band()
  .domain(COINS.map((c) => c.ticker))
  .range(X_RANGE)
  .paddingInner(0.35)
  .paddingOuter(0.6);
const xCenter = (ticker) => x(ticker) + x.bandwidth() / 2;

const yDomainMax = Math.ceil(MAX_INDEX / 10) * 10;
const y = scale.linear().domain([0, yDomainMax]).range([0, WORLD_HEIGHT]);

// ── Chart ────────────────────────────────────────────────────────────────
// `.y()` also gets a bare accessor, not the scale itself — same rationale
// 21-bar-race documents: a scale attached to a chart field gets its domain
// silently refit to *this update's* [min, max] on every update() (chart/
// axisField.js's applyAxisScaleDomain), which would renormalize bar height
// to a moving ceiling every week instead of the fixed 10-week ceiling
// `yDomainMax` already accounts for. Pre-resolving via `y(d.index)` keeps
// the value axis meaning stable across the whole animation.
const chart = new BarChart(scene.three)
  .x((d) => xCenter(d.ticker))
  .y((d) => y(d.index))
  .color((d) => d.ticker, brandColor)
  .transition(TRANSITION_MS, 'easeInOutCubic');
chart.generator.width(x.bandwidth() * 0.85);
chart.generator.depth(BAR_DEPTH);

let weekIndex = 0;
chart.data(rowsForWeek(weekIndex), (d) => d.ticker);
chart.render();

// ── graphHTML labels — one per bar, rebuilt each week ───────────────────
// graphHTML has no update(html) (deliberately unbuilt — see
// src/material/text/GraphHTML.js's own TODO note): each week's price/index
// text change is a fresh label, disposing the previous one first. Five
// labels rebuilt every ~2s is a non-issue perf-wise; this is exactly the
// "dispose and recreate" workaround documented for that gap.
/** @type {ReturnType<typeof graphHTML>[]} */
let labelHandles = [];

function rebuildLabels(rows) {
  for (const handle of labelHandles) handle.dispose();
  labelHandles = rows.map((d) => {
    const change = d.index - 100;
    const sign = change >= 0 ? '+' : '';
    const changeColor = change >= 0 ? '#4ade80' : '#f87171';
    const html = `
      <div style="font: 800 22px system-ui, sans-serif; color:${d.color}; text-shadow:0 0 10px rgba(0,0,0,0.75), 0 0 18px ${d.color}55; white-space:nowrap;">
        ${d.ticker}
      </div>
      <div style="font: 700 15px system-ui, sans-serif; color:${changeColor}; text-shadow:0 0 8px rgba(0,0,0,0.8); white-space:nowrap;">
        ${sign}${change.toFixed(1)}%
      </div>`;
    return graphHTML(
      { scene: scene.three, position: { x: xCenter(d.ticker), y: y(d.index) + LABEL_MARGIN, z: BAR_DEPTH / 2 + 0.05 } },
      {
        html,
        text: `${d.ticker} ${sign}${change.toFixed(1)}%`,
        camera: scene.camera.three,
        width: 1.7,
        height: 0.95,
        pixelWidth: 320,
        pixelHeight: 180,
        style: { fontSize: 0.26, color: d.color, outline: { color: '#000000', width: 0.2 } },
      },
    );
  });
}

rebuildLabels(chart.data());

// ── Render-path badge ───────────────────────────────────────────────────

if (isHTMLInCanvasSupported()) {
  renderBadgeEl.textContent = '● Rendering: HTML-in-Canvas (experimental)';
  renderBadgeEl.classList.add('active');
} else {
  renderBadgeEl.textContent = '○ Rendering: SDFText fallback (HTML-in-Canvas unavailable)';
}

// ── Axes — real SDF tick labels (options.camera), lined up with the bars
// via the same +bandwidth()/2 centering Axis applies internally ──────────

new Axis().scale(x).orientation('x').tickSize(0.25).render(scene.three, 'xAxis', { camera: scene.camera.three });
new Axis().scale(y).orientation('y').tickCount(6).tickSize(0.25).render(scene.three, 'yAxis', { camera: scene.camera.three });

// ── Leaderboard panel ────────────────────────────────────────────────────

function refreshPanel(index, rows) {
  weekNumberEl.textContent = String(index + 1);
  const ranked = [...rows].sort((a, b) => b.index - a.index);
  leaderboardEl.innerHTML = ranked
    .map((d, rank) => {
      const change = d.index - 100;
      const sign = change >= 0 ? '+' : '';
      const direction = change >= 0 ? 'up' : 'down';
      return `
        <li>
          <span class="rank">${rank + 1}</span>
          <span class="swatch" style="background:${d.color}; color:${d.color}"></span>
          <span class="name">${NAME_BY_TICKER[d.ticker]}<span class="ticker">${d.ticker}</span></span>
          <span class="value ${direction}">${sign}${change.toFixed(1)}%</span>
        </li>`;
    })
    .join('');
}

refreshPanel(weekIndex, chart.data());

// ── Playback — advances one week at a time, looping ─────────────────────

let playing = true;
let elapsedSec = 0;

function advanceWeek() {
  weekIndex = (weekIndex + 1) % WEEKS.length;
  const rows = rowsForWeek(weekIndex);
  chart.data(rows, (d) => d.ticker);
  chart.update();
  rebuildLabels(rows);
  refreshPanel(weekIndex, rows);
}

loop.add((deltaSec) => {
  if (!playing) return;
  elapsedSec += deltaSec;
  if (elapsedSec >= WEEK_INTERVAL_SEC) {
    elapsedSec = 0;
    advanceWeek();
  }
});

playPauseEl.addEventListener('click', () => {
  playing = !playing;
  playPauseEl.textContent = playing ? '⏸ Pause' : '▶ Play';
});

restartEl.addEventListener('click', () => {
  weekIndex = 0;
  elapsedSec = 0;
  playing = true;
  playPauseEl.textContent = '⏸ Pause';
  const rows = rowsForWeek(weekIndex);
  chart.data(rows, (d) => d.ticker);
  chart.update();
  rebuildLabels(rows);
  refreshPanel(weekIndex, rows);
});

// ── Cinematic postfx — bloom/vignette/chromatic-aberration/film-grain/SMAA,
// deliberately WITHOUT dof: depth-of-field blurring anything outside a
// fixed focus distance is exactly what made an earlier docs bar-chart demo
// look "blurry" against its own axis text (see this repo's commit history /
// session notes on that fix) — skipped here on purpose, not an oversight.
// Values copied from postfx/presets.js's own 'cinematic' preset, minus dof. ─

g.postfx.enable('bloom', { strength: 0.6, radius: 0.5, threshold: 0.9 });
g.postfx.enable('vignette', { offset: 1.0, darkness: 1.1 });
g.postfx.enable('filmGrain', { intensity: 0.3, grayscale: false });
g.postfx.enable('chromaticAberration', { amount: 0.0012 });
g.postfx.enable('smaa');

// ── Camera ───────────────────────────────────────────────────────────────

scene.camera.three.position.set(9, 6.5, 15);
scene.camera.lookAt(0, 3, 0);
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
