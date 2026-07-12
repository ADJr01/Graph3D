import * as THREE from 'three';
import { Graph3D } from '../../src/index.js';

// Phase 2 exit demo: swap themes, camera presets, HDRs, and fog modes live,
// on a plain group of spheres — no chart types exist until Phase 8.
//
// ponytail: the studio-1k/cinema-night/daylight .hdr binaries referenced by
// GraphSceneEnvironment's built-in presets (Prompt 27) were never bundled, so
// any theme/HDR button that loads one will reject. Errors surface in #status
// instead of failing silently — add the .hdr files under src/scene/env/ to
// make every button fully functional.

const THEME_NAMES = [
  'studio-light', 'studio-dark', 'cinema-night', 'clinical-white',
  'terminal-green', 'editorial', 'cyberpunk', 'museum',
];
const CAMERA_PRESETS = ['orbit', 'fixed', 'isometric', 'top-down', 'cinematic-low', 'cinematic-high'];
const HDR_PRESETS = ['studio-1k', 'cinema-night', 'daylight'];
const FOG_PRESETS = ['linear', 'exponential', 'volumetric-low', 'volumetric-cinematic', 'none'];

// clinical-white is the only theme with no HDR dependency, so it's a safe
// default while the .hdr assets above remain unbundled.
const INITIAL_THEME = 'clinical-white';

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

buildDemoContent(scene);

const statusEl = document.getElementById('status');

function setStatus(message) {
  statusEl.textContent = message;
}

function reportError(context, error) {
  console.error(`[02-scene] ${context}:`, error);
  setStatus(`${context}: ${error.message}`);
}

/** Re-attach orbit controls after any operation that rebuilds the camera (setPreset/applyTheme). */
function refreshOrbitControls() {
  scene.camera
    .enableOrbitControls(g.renderer.three.domElement)
    .catch((error) => reportError('enableOrbitControls failed', error));
}

/**
 * A small group of standard-material spheres over a ground plane — enough
 * geometry to show off lighting, shadows, fog, and HDR reflections without
 * depending on any chart type (Phase 8).
 * @param {import('../../src/scene/GraphScene.js').GraphScene} targetScene
 */
function buildDemoContent(targetScene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.9 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  targetScene.add(ground);

  const sphereGeometry = new THREE.SphereGeometry(0.8, 32, 32);
  const sphereCount = 5;
  for (let i = 0; i < sphereCount; i++) {
    const t = i / (sphereCount - 1);
    const sphere = new THREE.Mesh(
      sphereGeometry,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(t, 0.6, 0.5),
        roughness: 1 - t * 0.8,
        metalness: t,
      }),
    );
    sphere.position.set((i - (sphereCount - 1) / 2) * 2.5, 0.8, 0);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    targetScene.add(sphere);
  }
}

// ── Button panel ─────────────────────────────────────────────────────────────

/**
 * Populate a `.row` container with one button per name and wire clicks.
 * @param {string} groupName
 * @param {string[]} names
 * @param {(name: string) => void} onClick
 * @param {(name: string) => boolean} isActive
 * @returns {{ refresh: () => void }}
 */
function buildButtonRow(groupName, names, onClick, isActive) {
  const container = document.querySelector(`[data-group="${groupName}"]`);
  const buttons = new Map();
  for (const name of names) {
    const button = document.createElement('button');
    button.textContent = name;
    button.addEventListener('click', () => onClick(name));
    container.appendChild(button);
    buttons.set(name, button);
  }
  return {
    refresh() {
      for (const [name, button] of buttons) {
        button.classList.toggle('active', isActive(name));
      }
    },
  };
}

const themeButtons = buildButtonRow('theme', THEME_NAMES, handleTheme, (name) => scene.theme === name);
const cameraButtons = buildButtonRow('camera', CAMERA_PRESETS, handleCamera, (name) => scene.camera.preset === name);
buildButtonRow('hdr', HDR_PRESETS, handleHDR, () => false); // no "active" state to track for HDR
const fogButtons = buildButtonRow('fog', FOG_PRESETS, handleFog, (name) =>
  name === 'none' ? scene.three.fog === null : scene.environment?.fogPreset === name,
);

async function handleTheme(name) {
  try {
    setStatus('');
    await scene.applyTheme(name);
    refreshOrbitControls();
  } catch (error) {
    reportError(`applyTheme('${name}') failed`, error);
  }
  themeButtons.refresh();
  cameraButtons.refresh();
  fogButtons.refresh();
}

function handleCamera(name) {
  try {
    setStatus('');
    scene.camera.setPreset(name);
    refreshOrbitControls();
  } catch (error) {
    reportError(`camera.setPreset('${name}') failed`, error);
  }
  cameraButtons.refresh();
}

async function handleHDR(name) {
  if (!scene.environment) {
    reportError('HDR', new Error('No renderer-backed environment manager on this scene.'));
    return;
  }
  try {
    setStatus('');
    await scene.environment.setHDR(name);
  } catch (error) {
    reportError(`environment.setHDR('${name}') failed`, error);
  }
}

document.getElementById('customHdrInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file || !scene.environment) return;
  const objectUrl = URL.createObjectURL(file);
  try {
    setStatus('');
    // Object URLs have no extension — the '#name.ext' suffix is how
    // GraphSceneEnvironment picks RGBELoader vs EXRLoader (see its JSDoc).
    await scene.environment.setHDR(`${objectUrl}#${file.name}`);
  } catch (error) {
    reportError(`setHDR(custom file '${file.name}') failed`, error);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
});

function handleFog(name) {
  if (!scene.environment) return;
  try {
    setStatus('');
    if (name === 'none') {
      // Raw escape hatch — GraphSceneEnvironment.clear() would also drop HDR/background.
      scene.three.fog = null;
    } else {
      scene.environment.setFog(name);
    }
  } catch (error) {
    reportError(`setFog('${name}') failed`, error);
  }
  fogButtons.refresh();
}

// ── Resize ───────────────────────────────────────────────────────────────────

function handleResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  g.setSize(width, height);
  const camera = scene.camera.three;
  if (camera.isPerspectiveCamera) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  // ponytail: orthographic presets (isometric/top-down) keep a fixed frustum —
  // add aspect correction here if wide-viewport distortion becomes an issue.
}
window.addEventListener('resize', handleResize);
handleResize();

// ── Init ─────────────────────────────────────────────────────────────────────

handleTheme(INITIAL_THEME);
