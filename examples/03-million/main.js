import * as THREE from 'three';
import { Graph3D, GraphInstancedObject, loop } from '../../src/index.js';

// Phase 3 exit demo: 1,000,000 instanced point spheres placed by a 3D noise
// domain-warp (a low-discrepancy Halton base grid displaced by fractal value
// noise), hover-picked through GraphInstancedObject's octree-backed pick().
// 30fps is the floor — hover recoloring is resolved at most once per frame
// (never per pointermove event) to keep the one GPU re-upload it costs off
// the input-event rate.

const COUNT = 1_000_000;
const DOMAIN_RADIUS = 45;
const WARP_STRENGTH = 18;
const NOISE_FREQUENCY = 0.05;
const POINT_RADIUS = 0.12;
// Cloud fits entirely inside this — tight enough that the octree's
// depth-8 cap still lands well below maxItemsPerNode per leaf. Left at the
// library default (±10,000), a leaf near our cluster would hold on the order
// of 10^5 points instead of a handful, turning every pick() into a near
// linear scan every frame.
const DOMAIN_EXTENT = DOMAIN_RADIUS + WARP_STRENGTH;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);
scene.shadows?.disable(); // unlit points neither cast nor receive shadows

const statusEl = document.getElementById('status');
const fpsEl = document.getElementById('fps');
const countEl = document.getElementById('count');
const hoverEl = document.getElementById('hover');
countEl.textContent = COUNT.toLocaleString();

function reportError(context, error) {
  console.error(`[03-million] ${context}:`, error);
  statusEl.textContent = `${context}: ${error.message}`;
}

// ── Deterministic 3D value noise (hash → smoothstep-interpolated lattice) ────

/** @param {number} x @param {number} y @param {number} z @returns {number} pseudo-random in [0, 1) */
function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** @param {number} t @returns {number} */
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

/** Trilinear-interpolated value noise over the `hash3` lattice, output in [0, 1). */
function noise3(x, y, z) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = smoothstep(x - x0);
  const fy = smoothstep(y - y0);
  const fz = smoothstep(z - z0);
  const lerp = (a, b, t) => a + (b - a) * t;

  const x00 = lerp(hash3(x0, y0, z0), hash3(x0 + 1, y0, z0), fx);
  const x10 = lerp(hash3(x0, y0 + 1, z0), hash3(x0 + 1, y0 + 1, z0), fx);
  const x01 = lerp(hash3(x0, y0, z0 + 1), hash3(x0 + 1, y0, z0 + 1), fx);
  const x11 = lerp(hash3(x0, y0 + 1, z0 + 1), hash3(x0 + 1, y0 + 1, z0 + 1), fx);
  const y0v = lerp(x00, x10, fy);
  const y1v = lerp(x01, x11, fy);
  return lerp(y0v, y1v, fz);
}

/** 3-octave fractal Brownian motion built on `noise3`, output in [0, 1). */
function fbm3(x, y, z) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < 3; octave++) {
    sum += amplitude * noise3(x * frequency, y * frequency, z * frequency);
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum;
}

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

/**
 * Build the 1,000,000-point cloud: a Halton base grid (even coverage, no
 * clumping/gaps a uniform PRNG would produce) displaced by `fbm3`-driven
 * domain warp, so the noise field is what actually decides each point's
 * final position — not just its color.
 * @param {import('../../src/scene/GraphScene.js').GraphScene} targetScene
 * @returns {{ points: GraphInstancedObject, colors: Float32Array }}
 */
function buildPoints(targetScene) {
  // Minimum valid segment counts — at a few pixels on screen the facets are
  // invisible, and the triangle count difference (6 vs. ~36 for a smoother
  // sphere) is what separates 30fps from ~14fps at a million instances.
  const geometry = new THREE.SphereGeometry(POINT_RADIUS, 3, 2);
  const material = new THREE.MeshBasicMaterial();

  const points = new GraphInstancedObject({
    scene: targetScene.three,
    name: 'points',
    geometry,
    material,
    count: COUNT,
    octreeBounds: new THREE.Box3(
      new THREE.Vector3(-DOMAIN_EXTENT, -DOMAIN_EXTENT, -DOMAIN_EXTENT),
      new THREE.Vector3(DOMAIN_EXTENT, DOMAIN_EXTENT, DOMAIN_EXTENT),
    ),
  });

  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const color = new THREE.Color();

  for (let i = 0; i < COUNT; i++) {
    const bx = (halton(i + 1, 2) * 2 - 1) * DOMAIN_RADIUS;
    const by = (halton(i + 1, 3) * 2 - 1) * DOMAIN_RADIUS;
    const bz = (halton(i + 1, 5) * 2 - 1) * DOMAIN_RADIUS;

    const nx = fbm3(bx * NOISE_FREQUENCY, by * NOISE_FREQUENCY, bz * NOISE_FREQUENCY) - 0.5;
    const ny = fbm3(bx * NOISE_FREQUENCY + 100, by * NOISE_FREQUENCY + 100, bz * NOISE_FREQUENCY + 100) - 0.5;
    const nz = fbm3(bx * NOISE_FREQUENCY + 200, by * NOISE_FREQUENCY + 200, bz * NOISE_FREQUENCY + 200) - 0.5;

    const o = i * 3;
    positions[o] = bx + nx * WARP_STRENGTH;
    positions[o + 1] = by + ny * WARP_STRENGTH;
    positions[o + 2] = bz + nz * WARP_STRENGTH;

    const density = (nx + ny + nz) / 3 + 0.5;
    color.setHSL(0.58 + density * 0.25, 0.75, 0.35 + density * 0.3);
    color.toArray(colors, o);
  }

  points.setAllPositions(positions).setAllColors(colors);
  points.commitMatrix().commitColor();

  return { points, colors };
}

/** Position the camera far enough back to frame the whole warped cloud. */
function frameCamera(targetScene) {
  targetScene.camera.three.position.set(0, DOMAIN_EXTENT * 0.9, DOMAIN_EXTENT * 2.8);
  targetScene.camera.lookAt(0, 0, 0);
}

const { points, colors } = buildPoints(scene);
frameCamera(scene);
scene.camera
  .enableOrbitControls(g.renderer.three.domElement)
  .catch((error) => reportError('enableOrbitControls failed', error));

// ── Hover picking ────────────────────────────────────────────────────────────

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2(Infinity, Infinity);
const restoreColorScratch = new THREE.Color();
const HIGHLIGHT_COLOR = new THREE.Color(0xffffff);
let hoverIndex = null;

canvas.addEventListener('pointermove', (event) => {
  const rect = canvas.getBoundingClientRect();
  pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
});
canvas.addEventListener('pointerleave', () => {
  pointerNdc.set(Infinity, Infinity);
});

/** Resolve the current hover target and recolor at most once per frame. */
function updateHover() {
  const nextIndex = Number.isFinite(pointerNdc.x)
    ? (raycaster.setFromCamera(pointerNdc, scene.camera.three), points.pick(raycaster))
    : null;
  if (nextIndex === hoverIndex) return;

  if (hoverIndex !== null) {
    restoreColorScratch.fromArray(colors, hoverIndex * 3);
    points.setInstanceColor(hoverIndex, restoreColorScratch);
  }
  if (nextIndex !== null) {
    points.setInstanceColor(nextIndex, HIGHLIGHT_COLOR);
  }
  points.commitColor();
  hoverIndex = nextIndex;
  hoverEl.textContent = nextIndex === null ? '—' : `#${nextIndex}`;
}

// ── Per-frame ─────────────────────────────────────────────────────────────────

let fpsSmoothed = 30;
loop.add((deltaSec) => {
  updateHover();
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
