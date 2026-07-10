import { Graph3D, BarChart, scale, palette, Axis, loop, assignDepthJitter } from '../../src/index.js';
import { YEARS, COMPANIES, rowsForYearIndex } from './data.js';

// "Bar chart race" (Prompt: user request, not a numbered prompts.md entry —
// see BUILD_PLAN.md's example-gallery precedent). Demonstrates that
// Graph3D needs no dedicated "swap" animation primitive: rank-swapping bars
// fall out of three already-shipped pieces working together —
//   1. `.sort(compareFn)` re-ranks the bound data before every render/update
//   2. a `scale.band()` x-field's *domain order* IS each company's row
//      position — `chart/axisField.js`'s `applyAxisScaleDomain` refits a
//      band scale's domain to the (now-sorted) data every call
//   3. `.transition(ms)` + a keyed `data(rows, keyFn)` join — `update()`
//      matches each company by name and animates it from its old computed
//      position to its new one via `SelectionTransition`
// No part of this example reaches into `anim/`, `compose/selection`, or
// `object/` directly — every piece is plain public `BarChart`/`GraphChart` API.

const TRANSITION_MS = 1500;
const YEAR_INTERVAL_SEC = 2.4;
const MAX_VALUE = 3800; // headroom above the dataset's real max (NVIDIA 2024, $3600B)
const WORLD_MAX_LENGTH = 9; // world units the value axis spans
const VALUE_TO_WORLD = MAX_VALUE / WORLD_MAX_LENGTH;
const ROW_RANGE = [5.25, -5.25]; // top → bottom, rank 0 at the top
const ROW_PADDING_INNER = 0.25;

// Warms the shared `palette.category10` singleton in a fixed, deterministic
// order so the 3D bars (`chart.color()`) and the HTML leaderboard swatches
// always agree — it assigns colors by first-seen key (`compose/color/
// categorical.js`), and it's the exact same function object either call
// site reaches (`compose/palette/index.js` exports one instance).
const colorOf = {};
for (const name of COMPANIES) colorOf[name] = palette.category10(name);

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

const yearEl = document.getElementById('year');
const leaderboardEl = document.getElementById('leaderboard');
const playPauseEl = document.getElementById('playPause');
const restartEl = document.getElementById('restart');

// ── Chart ────────────────────────────────────────────────────────────────
// Category field: a band scale over company name. Its *domain order* is
// what actually encodes rank — `.sort()` re-sorts the bound data before
// every render()/update(), and `applyAxisScaleDomain` refits this band
// scale's domain to that sorted order every time, so "rank 0" is always
// domain[0], always the topmost row (see ROW_RANGE's comment above).
//
// Value field: deliberately NO scale object attached to `.y()` — `d.value`
// is pre-divided into world units at the accessor. Attaching a scale here
// would make `applyAxisScaleDomain` refit its domain to *this frame's*
// [min, max] on every single update() (its documented behavior for any
// scale with `.invert`), renormalizing bar length to a moving ceiling every
// year instead of a fixed one — the opposite of the "grow toward a fixed
// ceiling over time" read a market-cap race needs. Passing no scale means
// `field.scale === null`, and `applyAxisScaleDomain` no-ops for it.
const band = scale.band().domain(COMPANIES).range(ROW_RANGE).paddingInner(ROW_PADDING_INNER);
const barThickness = band.bandwidth() * 0.82;

const chart = new BarChart(scene.three)
  .x((d) => d.name, band)
  .y((d) => d.value / VALUE_TO_WORLD)
  .color((d) => d.name, palette.category10)
  .sort((a, b) => b.value - a.value)
  .transition(TRANSITION_MS, 'easeInOutCubic')
  .horizontal();
chart.generator.width(barThickness);
chart.generator.depth(1.1);

let yearIndex = 0;
chart.data(rowsForYearIndex(yearIndex), (d) => d.name);
chart.render();

// Every bar shares the exact same z-depth by default (generator.bar() always
// writes position.z = 0) — harmless while rows stay put, but a rank-swap
// transition drives two bars' y-positions through each other mid-flight,
// and identical z-depth means their faces go perfectly coplanar right where
// they cross: classic z-fighting, visible as a flickering moiré pattern.
// One-time fix — the offset is a stable per-company constant, not something
// `update()`'s later re-joins need to recompute (see src/object/depthOffset.js).
assignDepthJitter(chart.selection(), (d) => d.name);

refreshPanel(yearIndex);

// A separate, fixed-domain scale purely for the visible value axis — never
// touched by the chart's own per-update domain refit (that only ever
// applies to the chart's *own* x/y/z field scales, not to an independent
// scale object handed only to `Axis`). Rendered once: `Axis.render()`
// throws on a second call (no in-place update support yet, see
// skipping_list.md), which is fine here since this scale's domain never
// changes — only the category (band) field reorders, and that has no
// visible axis at all (no SDF text assets exist yet to label rows, so the
// leaderboard panel carries company identity instead — see docs/concepts/
// material.md's SDFText section).
const valueAxisScale = scale.linear().domain([0, MAX_VALUE]).range([0, WORLD_MAX_LENGTH]);
new Axis().scale(valueAxisScale).orientation('x').tickCount(6).tickSize(0.25).render(scene.three, 'valueAxis');

// ── Leaderboard / year panel ────────────────────────────────────────────

function refreshPanel(index) {
  yearEl.textContent = String(YEARS[index]);
  const ranked = rowsForYearIndex(index).sort((a, b) => b.value - a.value);
  leaderboardEl.innerHTML = ranked
    .map(
      (d, rank) => `
        <li>
          <span class="rank">${rank + 1}</span>
          <span class="swatch" style="background:${colorOf[d.name]}"></span>
          <span class="name">${d.name}<span class="ticker">${d.ticker}</span></span>
          <span class="value">$${d.value.toLocaleString('en-US')}B</span>
        </li>`,
    )
    .join('');
}

// ── Playback — advances one year at a time, looping ─────────────────────

let playing = true;
let elapsedSec = 0;

function advanceYear() {
  yearIndex = (yearIndex + 1) % YEARS.length;
  chart.data(rowsForYearIndex(yearIndex), (d) => d.name);
  chart.update();
  refreshPanel(yearIndex);
}

loop.add((deltaSec) => {
  if (!playing) return;
  elapsedSec += deltaSec;
  if (elapsedSec >= YEAR_INTERVAL_SEC) {
    elapsedSec = 0;
    advanceYear();
  }
});

playPauseEl.addEventListener('click', () => {
  playing = !playing;
  playPauseEl.textContent = playing ? '⏸ Pause' : '▶ Play';
});

restartEl.addEventListener('click', () => {
  yearIndex = 0;
  elapsedSec = 0;
  playing = true;
  playPauseEl.textContent = '⏸ Pause';
  chart.data(rowsForYearIndex(yearIndex), (d) => d.name);
  chart.update();
  refreshPanel(yearIndex);
});

// ── Camera ───────────────────────────────────────────────────────────────

scene.camera.three.position.set(WORLD_MAX_LENGTH * 0.55, 1.5, 16);
scene.camera.lookAt(WORLD_MAX_LENGTH * 0.5, 0, 0);
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
