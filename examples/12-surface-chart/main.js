import { Graph3D, SurfaceChart } from '../../src/index.js';

// Phase 8 example (Prompt 135): SurfaceChart renders a heightfield mesh via
// generator.surface(), with an optional marching-squares contour overlay
// (compose/generator/contour.js) — each traced isoline path becomes its own
// GraphLine (the same wrapper LineChart, Prompt 133, already built).

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

const contourStateEl = document.getElementById('contourState');
const toggleEl = document.getElementById('toggle');

const CONTOUR_LEVELS = [-0.8, -0.4, 0, 0.4, 0.8];

const chart = new SurfaceChart(scene.three)
  .values((x, z) => Math.sin(x) * Math.cos(z))
  .xDomain([-4, 4])
  .zDomain([-4, 4])
  .resolution(48)
  .material('standard', { color: '#3b82f6' });

let contoursOn = true;
chart.contours(CONTOUR_LEVELS);
chart.render();

function refreshPanel() {
  contourStateEl.textContent = contoursOn ? `on (${CONTOUR_LEVELS.length} levels)` : 'off';
}
refreshPanel();

toggleEl.addEventListener('click', () => {
  contoursOn = !contoursOn;
  chart.contours(contoursOn ? CONTOUR_LEVELS : null);
  chart.update();
  refreshPanel();
});

// ── Camera ───────────────────────────────────────────────────────────────

scene.camera.three.position.set(0, 6, 12);
scene.camera.lookAt(0, 0, 0);
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
