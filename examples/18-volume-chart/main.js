import { Graph3D, VolumeChart, palette } from '../../src/index.js';

// Phase 8 example (Prompt 139): VolumeChart's ray-marched scalar field —
// .values(fn) sampled onto a resolution^3 grid and uploaded as a
// Data3DTexture, ray-marched through a unit cube by material.volumeRaymarch
// (a THREE.ShaderMaterial, GLSL3/WebGL2). This is the prompt's own "opt-in
// heavier shader" — no lighter fallback chart type exists for a reason: it's
// a deliberately expensive, opt-in feature.

const RESOLUTION = 40;
const STEPS_LOW = 32;
const STEPS_HIGH = 96;

const FIELDS = {
  gaussianBlobs: (x, y, z) => {
    const blob = (cx, cy, cz) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) * 2);
    return blob(0.5, 0.3, 0) + blob(-0.5, -0.2, 0.4) + blob(0, -0.4, -0.5);
  },
  torus: (x, y, z) => {
    const majorRadius = 0.6;
    const minorRadius = 0.25;
    const q = Math.hypot(x, z) - majorRadius;
    const d = Math.hypot(q, y);
    return Math.max(0, 1 - d / minorRadius);
  },
};

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

const resolutionValueEl = document.getElementById('resolutionValue');
const stepsValueEl = document.getElementById('stepsValue');
const toggleFieldEl = document.getElementById('toggleField');
const toggleStepsEl = document.getElementById('toggleSteps');

const chart = new VolumeChart(scene.three)
  .xDomain([-1, 1])
  .yDomain([-1, 1])
  .zDomain([-1, 1])
  .resolution(RESOLUTION)
  .steps(STEPS_HIGH)
  .densityScale(1.5)
  .palette(palette.plasma);

let fieldName = 'gaussianBlobs';
let stepsHigh = true;

function refreshPanel() {
  resolutionValueEl.textContent = `${RESOLUTION}³ (${fieldName})`;
  stepsValueEl.textContent = String(stepsHigh ? STEPS_HIGH : STEPS_LOW);
}

chart.values(FIELDS[fieldName]);
chart.render();
refreshPanel();

toggleFieldEl.addEventListener('click', () => {
  fieldName = fieldName === 'gaussianBlobs' ? 'torus' : 'gaussianBlobs';
  chart.values(FIELDS[fieldName]);
  chart.update();
  refreshPanel();
});

toggleStepsEl.addEventListener('click', () => {
  stepsHigh = !stepsHigh;
  chart.steps(stepsHigh ? STEPS_HIGH : STEPS_LOW);
  chart.update();
  refreshPanel();
});

// ── Camera ───────────────────────────────────────────────────────────────

scene.camera.three.position.set(0, 1.5, 3.5);
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
