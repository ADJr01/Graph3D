import * as THREE from 'three';
import { Graph3D, GraphMesh, GraphObjectMaterial, material, texture, palette } from '../../src/index.js';

// Phase 6 hero example (Prompt 113): a 4x4 grid of bars, one material preset
// per bar, studio-dark themed. `crystal` (needs an external cube-map image
// we don't have) is left out of the grid; every other custom-shader/PBR
// preset from Prompt 101-106 is represented.
//
// ponytail: `studio-dark`'s HDR (`studio-1k`) isn't bundled in this repo yet
// (a pre-existing gap — see .claude/TODO.md and skipping_list.md's Phase 6
// section). `scene.applyTheme('studio-dark')` is still the primary call —
// once the asset is added, this example picks it up with no changes — but
// the rejection is caught and surfaced in #status instead of crashing.

const GRID_SIZE = 4;
const CELL_SPACING = 3;
const BAR_WIDTH = 1.4;
const BAR_HEIGHT = 3;
const BAR_DEPTH = 1.4;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

const statusEl = document.getElementById('status');
const presetListEl = document.getElementById('presetList');

function reportError(context, error) {
  console.error(`[06-materials] ${context}:`, error);
  statusEl.textContent = `${context}: ${error.message}`;
}

/**
 * A minimal procedural stand-in for `studio-1k.hdr` (missing — see the note
 * above): a soft top-lit gradient turned into a real PMREM environment via
 * `texture.gradient()` (Prompt 110), just so metal/PBR presets have
 * *something* to reflect instead of rendering pure black with no env map at
 * all. Not a substitute for the real studio HDR these presets were tuned
 * against — only applied when `applyTheme('studio-dark')` fails.
 */
function buildFallbackEnvironment(renderer) {
  const gradientTexture = texture.gradient({ type: 'linear', angle: 90, from: '#cbd5e1', to: '#0f172a', size: 256 });
  gradientTexture.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromEquirectangular(gradientTexture).texture;
  pmrem.dispose();
  gradientTexture.dispose();
  return envTexture;
}

scene.applyTheme('studio-dark').catch((error) => {
  reportError("applyTheme('studio-dark') failed", error);
  scene.three.environment = buildFallbackEnvironment(g.renderer.three);
});

scene.camera.three.position.set(9, 8, 12);
scene.camera.lookAt(0, 1, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement).catch((error) => reportError('enableOrbitControls failed', error));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x111116, roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// A procedural radial gradient stands in for a captured matcap sphere image
// (matcap normally samples a real photo/render of a lit sphere).
const matcapTexture = texture.gradient({ type: 'radial', from: '#f4f4f5', to: '#27272a', size: 128 });

/** Adds a per-vertex 'value' attribute (0 at the base, 1 at the top) — dataDriven reads this to drive its palette lookup. */
function withVertexValueAttribute(geometry, height) {
  const cloned = geometry.clone();
  const position = cloned.getAttribute('position');
  const values = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    values[i] = position.getY(i) / height + 0.5;
  }
  cloned.setAttribute('value', new THREE.Float32BufferAttribute(values, 1));
  return cloned;
}

const boxGeometry = new THREE.BoxGeometry(BAR_WIDTH, BAR_HEIGHT, BAR_DEPTH);

const PRESETS = [
  { name: 'standard', build: () => material.standard({ color: '#3b82f6', roughness: 0.5, metalness: 0.1 }) },
  { name: 'phong', build: () => material.phong({ color: '#ef4444', shininess: 80 }) },
  { name: 'toon', build: () => material.toon({ color: '#a855f7' }) },
  { name: 'matcap', build: () => material.matcap({ matcap: matcapTexture }) },
  { name: 'holographic', build: () => material.holographic({}), animateTime: true },
  { name: 'glass', build: () => material.glass({ color: '#dbeafe' }) },
  { name: 'neon', build: () => material.neon({ pulse: true }) },
  { name: 'glow', build: () => material.glow({ color: '#66ccff' }) },
  { name: 'velvet', build: () => material.velvet({}) },
  { name: 'liquidMercury', build: () => material.liquidMercury({}) },
  { name: 'chrome', build: () => material.chrome({}) },
  { name: 'gold', build: () => material.gold({}) },
  { name: 'copper', build: () => material.copper({}) },
  { name: 'pearl', build: () => material.pearl({}) },
  { name: 'obsidian', build: () => material.obsidian({}) },
  {
    name: 'dataDriven',
    geometry: withVertexValueAttribute(boxGeometry, BAR_HEIGHT),
    build: () => material.dataDriven({ palette: palette.viridis }),
  },
];

presetListEl.innerHTML = PRESETS.map((p) => `<li>${p.name}</li>`).join('');

const gridOrigin = -((GRID_SIZE - 1) * CELL_SPACING) / 2;
PRESETS.forEach((preset, i) => {
  const row = Math.floor(i / GRID_SIZE);
  const col = i % GRID_SIZE;

  const mesh = new GraphMesh({
    scene: scene.three,
    name: `bar-${preset.name}`,
    geometry: preset.geometry ?? boxGeometry.clone(),
    material: preset.build(),
  });
  mesh.setPosition(gridOrigin + col * CELL_SPACING, BAR_HEIGHT / 2, gridOrigin + row * CELL_SPACING);

  if (preset.animateTime) {
    new GraphObjectMaterial(mesh).bindUniforms({ time: 'auto' });
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
