import * as THREE from 'three';
import { Graph3D, GraphInstancedObject, loop } from '../../src/index.js';

// Phase 3 exit demo: 100,000 instanced bars in a 316×316 grid
// (316 × 316 = 99,856 ≈ 100,000), every one spinning around its own vertical
// axis. The spin is driven entirely on the GPU from a single per-instance
// attribute (`rotationPhase`) plus one shared time uniform — nothing rewrites
// `instanceMatrix` per frame — which is what keeps this at 60fps.

const GRID_SIZE = 316;
const SPACING = 0.6;
const COUNT = GRID_SIZE * GRID_SIZE;
const BASE_HEIGHT = 0.4;
const HEIGHT_RANGE = 1.6;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);
scene.shadows?.disable(); // bars neither cast nor receive — skip the shadow pass entirely

const statusEl = document.getElementById('status');
const fpsEl = document.getElementById('fps');
const countEl = document.getElementById('count');
countEl.textContent = COUNT.toLocaleString();

function reportError(context, error) {
  console.error(`[03-instanced] ${context}:`, error);
  statusEl.textContent = `${context}: ${error.message}`;
}

/**
 * Wire a per-instance Y-axis spin into `material`'s vertex shader. A custom
 * `rotationPhase` attribute (one static value per instance, set once via
 * `defineAttribute`/`setInstanceAttribute`) plus `timeUniform` (mutated once
 * per frame below, not per instance) rotate `transformed`/`objectNormal` in
 * local space — before `instanceMatrix` places the bar at its grid position —
 * so every instance spins on the GPU with zero CPU-side matrix rewrites.
 * @param {THREE.Material} material
 * @param {{ value: number }} timeUniform
 */
function installSpinShader(material, timeUniform) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = `attribute float rotationPhase;\nuniform float uTime;\n${shader.vertexShader}`
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        float graph3dAngle = uTime + rotationPhase;
        float graph3dSin = sin(graph3dAngle);
        float graph3dCos = cos(graph3dAngle);
        objectNormal.xz = mat2(graph3dCos, -graph3dSin, graph3dSin, graph3dCos) * objectNormal.xz;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.xz = mat2(graph3dCos, -graph3dSin, graph3dSin, graph3dCos) * transformed.xz;`,
      );
  };
}

/**
 * Build the 316×316 instanced bar grid: height varies per column/row for a
 * landscape look, colored by height, positioned/scaled via the zero-alloc
 * bulk setters (`setAllPositions`/`setAllScales`/`setAllColors`) in a single
 * pass instead of 100,000 individual calls.
 * @param {import('../../src/scene/GraphScene.js').GraphScene} targetScene
 * @param {{ value: number }} timeUniform
 * @returns {GraphInstancedObject}
 */
function buildBars(targetScene, timeUniform) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 });
  installSpinShader(material, timeUniform);

  const bars = new GraphInstancedObject({
    scene: targetScene.three,
    name: 'bars',
    geometry,
    material,
    count: COUNT,
  });
  bars.defineAttribute('rotationPhase', 1);

  const half = (GRID_SIZE - 1) / 2;
  const positions = new Float32Array(COUNT * 3);
  const scales = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const color = new THREE.Color();

  let i = 0;
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const height = BASE_HEIGHT + HEIGHT_RANGE * (0.5 + 0.5 * Math.sin(col * 0.15) * Math.cos(row * 0.15));
      positions[i * 3] = (col - half) * SPACING;
      positions[i * 3 + 1] = height / 2;
      positions[i * 3 + 2] = (row - half) * SPACING;
      scales[i * 3] = 1;
      scales[i * 3 + 1] = height;
      scales[i * 3 + 2] = 1;
      color.setHSL(0.62 - (0.36 * (height - BASE_HEIGHT)) / HEIGHT_RANGE, 0.65, 0.5);
      color.toArray(colors, i * 3);
      bars.setInstanceAttribute(i, 'rotationPhase', Math.random() * Math.PI * 2);
      i++;
    }
  }

  bars.setAllPositions(positions).setAllScales(scales).setAllColors(colors);
  bars.commitMatrix().commitColor().commitAttribute('rotationPhase');

  return bars;
}

/** Position the camera far enough back to frame the whole grid. */
function frameCamera(targetScene) {
  const extent = (GRID_SIZE - 1) * SPACING;
  targetScene.camera.three.position.set(0, extent * 0.55, extent * 0.85);
  targetScene.camera.lookAt(0, 0, 0);
}

const rotationUniform = { value: 0 };
buildBars(scene, rotationUniform);
frameCamera(scene);
scene.camera
  .enableOrbitControls(g.renderer.three.domElement)
  .catch((error) => reportError('enableOrbitControls failed', error));

// ── Per-frame: advance the shared time uniform, no per-instance CPU work ────

let fpsSmoothed = 60;
loop.add((deltaSec, elapsedSec) => {
  rotationUniform.value = elapsedSec;
  fpsSmoothed += (1 / Math.max(deltaSec, 1e-6) - fpsSmoothed) * 0.1;
  fpsEl.textContent = fpsSmoothed.toFixed(0);
});

// ── Resize ───────────────────────────────────────────────────────────────────

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
