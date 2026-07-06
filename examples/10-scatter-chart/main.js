import * as THREE from 'three';
import { Graph3D, ScatterChart, loop } from '../../src/index.js';

// Phase 8 example (Prompt 134): ScatterChart renders instanced points
// (million-capable, same INSTANCING_THRESHOLD dispatch every chart type
// gets for free) sized/colored per datum, faded via .opacity(), and picked
// via the octree-backed GraphInstancedObject.pick() through chart.pick().

const POINT_COUNT = 5000;
const BOUNDS = 8;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

const countEl = document.getElementById('count');
const hoveredEl = document.getElementById('hovered');

function randomRows() {
  return Array.from({ length: POINT_COUNT }, (_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * BOUNDS * 2,
    y: (Math.random() - 0.5) * BOUNDS * 2,
    z: (Math.random() - 0.5) * BOUNDS * 2,
    size: 0.03 + Math.random() * 0.08,
    value: Math.random() * 100,
  }));
}

const chart = new ScatterChart(scene.three)
  .x((d) => d.x)
  .y((d) => d.y)
  .z((d) => d.z)
  .size((d) => d.size)
  .color((d) => d.value)
  .opacity(0.85);

chart.data(randomRows(), (d) => d.id);
chart.render();
countEl.textContent = String(chart.data().length);

// ── Camera ───────────────────────────────────────────────────────────────

scene.camera.three.position.set(0, 4, 20);
scene.camera.lookAt(0, 0, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement).catch((error) => console.error('enableOrbitControls failed:', error));

// ── Hover picking ────────────────────────────────────────────────────────

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2(Infinity, Infinity);

canvas.addEventListener('pointermove', (event) => {
  const rect = canvas.getBoundingClientRect();
  pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
});
canvas.addEventListener('pointerleave', () => {
  pointerNdc.set(Infinity, Infinity);
});

function updateHover() {
  if (!Number.isFinite(pointerNdc.x)) {
    hoveredEl.textContent = '—';
    return;
  }
  raycaster.setFromCamera(pointerNdc, scene.camera.three);
  const datum = chart.pick(raycaster);
  hoveredEl.textContent = datum ? `#${datum.id} (value ${datum.value.toFixed(1)})` : 'none';
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
