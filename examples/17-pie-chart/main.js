import * as THREE from 'three';
import { Graph3D, PieChart, palette, loop } from '../../src/index.js';

// Phase 8 example (Prompt 139): PieChart's layout.pie proportional sweep —
// one wedge mesh per slice (generator.arc()), colored by category
// (chart/colorField.js, same helper every other chart type uses).
// "Explode-on-hover" isn't owned by the chart itself (no interact/ layer
// yet) — this example wires its own pointermove + raycaster, mirroring
// ScatterChart's example (chart.pick()), then calls chart.explode().

const ROWS = [
  { label: 'Product', count: 42 },
  { label: 'Marketing', count: 28 },
  { label: 'R&D', count: 35 },
  { label: 'Support', count: 15 },
  { label: 'Ops', count: 22 },
];

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

const sliceCountEl = document.getElementById('sliceCount');
const hoveredEl = document.getElementById('hovered');
const toggleDonutEl = document.getElementById('toggleDonut');

const chart = new PieChart(scene.three)
  .data(ROWS)
  .value((d) => d.count)
  .padAngle(0.02)
  .color((d) => d.label, palette.category10)
  .material('standard');

chart.render();
sliceCountEl.textContent = String(ROWS.length);

let donutOn = false;
toggleDonutEl.addEventListener('click', () => {
  donutOn = !donutOn;
  chart.innerRadius(donutOn ? 0.5 : 0);
  chart.update();
});

// ── Camera ───────────────────────────────────────────────────────────────

scene.camera.three.position.set(0, 5, 6);
scene.camera.lookAt(0, 0, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement).catch((error) => console.error('enableOrbitControls failed:', error));

// ── Explode-on-hover ─────────────────────────────────────────────────────

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2(Infinity, Infinity);
let hoveredDatum = null;

canvas.addEventListener('pointermove', (event) => {
  const rect = canvas.getBoundingClientRect();
  pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
});
canvas.addEventListener('pointerleave', () => {
  pointerNdc.set(Infinity, Infinity);
});

function updateHover() {
  const nextHovered = Number.isFinite(pointerNdc.x)
    ? (raycaster.setFromCamera(pointerNdc, scene.camera.three), chart.pick(raycaster))
    : null;
  if (nextHovered === hoveredDatum) return;

  if (hoveredDatum) chart.explode(hoveredDatum, false);
  if (nextHovered) chart.explode(nextHovered, true);
  hoveredDatum = nextHovered;
  hoveredEl.textContent = hoveredDatum ? `${hoveredDatum.label} (${hoveredDatum.count})` : '—';
}

loop.add(updateHover);

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
