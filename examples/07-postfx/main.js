import * as THREE from 'three';
import { Graph3D, GraphMesh, material, ParticleSystem, loop } from '../../src/index.js';

// Phase 7 hero example (Prompt 124): a small gallery of glowing/matte objects
// at staggered depths (bloom/dof/ssao all have something to react to), a
// preset toggle bar cycling through Prompt 119's 7 named PostFX bundles
// (`PostFX.preset(name)`), and a "100K-particle rain" button that lazily
// builds a single large-capacity `ParticleSystem` (Prompt 120/121) and bursts
// 100,000 falling particles into the scene on each click.

const OBJECT_COUNT = 7;
const RAIN_CAPACITY = 100_000;
const RAIN_AREA = 24;
const RAIN_HEIGHT = 22;
const RAIN_SPEED = 16;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

const statusEl = document.getElementById('status');
const presetBarEl = document.getElementById('presetBar');
const fpsEl = document.getElementById('fps');
const particleCountEl = document.getElementById('particleCount');

function reportError(context, error) {
  console.error(`[07-postfx] ${context}:`, error);
  statusEl.textContent = `${context}: ${error.message}`;
}

scene.applyTheme('studio-dark').catch((error) => reportError("applyTheme('studio-dark') failed", error));

scene.camera.three.position.set(0, 6, 20);
scene.camera.lookAt(0, 2, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement).catch((error) => reportError('enableOrbitControls failed', error));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x0a0a0e, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ── A small gallery of objects staggered in depth (dof) with a mix of matte
// and >1.0-emissive materials (bloom/dreamy/cyberpunk have something to react to) ──

const GALLERY_MATERIALS = [
  () => material.standard({ color: '#3b82f6', roughness: 0.4, metalness: 0.2 }),
  () => material.neon({ emissive: '#39ff14', emissiveIntensity: 3 }),
  () => material.glow({ color: '#66ccff' }),
];

const galleryGeometry = new THREE.TorusKnotGeometry(0.9, 0.3, 128, 16);
for (let i = 0; i < OBJECT_COUNT; i++) {
  const t = i / (OBJECT_COUNT - 1);
  const mesh = new GraphMesh({
    scene: scene.three,
    name: `gallery-${i}`,
    geometry: galleryGeometry,
    material: GALLERY_MATERIALS[i % GALLERY_MATERIALS.length](),
  });
  mesh.setPosition((t - 0.5) * 16, 2, -(t * 10));
}

// ── PostFX preset toggle bar (Prompt 119 presets, Prompt 123's pipeline()
// escape hatch isn't needed here — the registered order already reads well) ──

const PRESET_NAMES = ['cinematic', 'clean', 'dramatic', 'dreamy', 'editorial', 'cyberpunk', 'minimal'];

function setActivePresetButton(name) {
  for (const button of presetBarEl.querySelectorAll('button')) {
    button.classList.toggle('active', button.dataset.preset === name);
  }
}

function buildPresetButton(name) {
  const button = document.createElement('button');
  button.textContent = name;
  button.dataset.preset = name;
  button.addEventListener('click', () => {
    g.postfx.preset(name);
    setActivePresetButton(name);
    statusEl.textContent = `postfx: ${g.postfx.enabled().join(', ')}`;
  });
  return button;
}

function buildNoneButton() {
  const button = document.createElement('button');
  button.textContent = 'none';
  button.dataset.preset = 'none';
  button.addEventListener('click', () => {
    for (const name of g.postfx.enabled()) g.postfx.disable(name);
    setActivePresetButton('none');
    statusEl.textContent = 'postfx: (none)';
  });
  return button;
}

presetBarEl.appendChild(buildNoneButton());
for (const name of PRESET_NAMES) presetBarEl.appendChild(buildPresetButton(name));
setActivePresetButton('none');

// ── 100K-particle rain button ───────────────────────────────────────────────

/** @type {ParticleSystem|null} */
let rain = null;

function ensureRain() {
  if (rain) return rain;
  rain = new ParticleSystem({
    scene: scene.three,
    camera: scene.camera.three,
    renderer: g.renderer.three,
    capacity: RAIN_CAPACITY,
    capabilities: g.capabilities,
  });
  rain.addBehavior('wind', { strength: 0.4, direction: new THREE.Vector3(1, 0, 0.2) });
  loop.add((deltaSec) => rain.update(deltaSec));
  particleCountEl.textContent = String(rain.capacity);
  return rain;
}

document.getElementById('rainButton').addEventListener('click', () => {
  const system = ensureRain();
  system.emit({
    count: RAIN_CAPACITY,
    position: () => new THREE.Vector3((Math.random() - 0.5) * RAIN_AREA, RAIN_HEIGHT, (Math.random() - 0.5) * RAIN_AREA),
    velocity: () => new THREE.Vector3((Math.random() - 0.5) * 0.5, -(RAIN_SPEED + Math.random() * 4), (Math.random() - 0.5) * 0.5),
    lifetime: () => 1.8 + Math.random() * 0.6,
    size: 0.05,
    color: 0x88aaff,
    blending: THREE.NormalBlending,
  });
  statusEl.textContent = `rain: emitted ${RAIN_CAPACITY.toLocaleString()} particles (sim: ${system.simMode})`;
});

// ── FPS readout (a plain rolling average — FrameBudget's own event only fires
// on sustained slow frames, not a per-frame number, so this is simplest) ─────

let fpsAccumulatorSec = 0;
let fpsFrameCount = 0;
loop.add((deltaSec) => {
  fpsAccumulatorSec += deltaSec;
  fpsFrameCount++;
  if (fpsAccumulatorSec >= 0.5) {
    fpsEl.textContent = (fpsFrameCount / fpsAccumulatorSec).toFixed(0);
    fpsAccumulatorSec = 0;
    fpsFrameCount = 0;
  }
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
