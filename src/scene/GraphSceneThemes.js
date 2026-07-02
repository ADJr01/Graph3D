import { GraphSceneLight } from './GraphSceneLight.js';
import { GraphSceneEnvironment } from './GraphSceneEnvironment.js';
import { GraphSceneShadows } from './GraphSceneShadows.js';

/**
 * @typedef {object} ThemeConfig
 * @property {string} cameraPreset - A `GraphSceneCamera` preset name.
 * @property {string} lightPreset - A `GraphSceneLight` preset name.
 * @property {string|null} hdr - Built-in `GraphSceneEnvironment` HDR preset name, or `null`.
 * @property {boolean} hdrAsBackground - Whether the HDR is also used as `scene.background`.
 * @property {number|null} background - Solid background colour, applied when `hdr` is
 *   `null` or `hdrAsBackground` is `false`. `null` leaves the background untouched.
 * @property {string|null} fog - A `GraphSceneEnvironment` fog preset name, or `null`.
 * @property {string} shadowMode - A `GraphSceneShadows` mode.
 * @property {string} shadowQuality - A `GraphSceneShadows` quality level.
 * @property {number[]} palette - Default hex-colour palette for chart materials (Phase 6+).
 */

/** @type {Record<string, ThemeConfig>} */
export const THEMES = {
  'studio-light': {
    cameraPreset: 'orbit',
    lightPreset: 'studio',
    hdr: 'studio-1k',
    hdrAsBackground: true,
    background: null,
    fog: null,
    shadowMode: 'pcf-soft',
    shadowQuality: 'high',
    palette: [0x2563eb, 0x16a34a, 0xea580c, 0xdc2626, 0x9333ea],
  },
  'studio-dark': {
    cameraPreset: 'orbit',
    lightPreset: 'studio',
    hdr: 'studio-1k',
    hdrAsBackground: false,
    background: 0x0a0a0f,
    fog: 'exponential',
    shadowMode: 'pcf-soft',
    shadowQuality: 'high',
    palette: [0x60a5fa, 0x4ade80, 0xfb923c, 0xf87171, 0xc084fc],
  },
  'cinema-night': {
    cameraPreset: 'cinematic-low',
    lightPreset: 'cinematic',
    hdr: 'cinema-night',
    hdrAsBackground: true,
    background: null,
    fog: 'volumetric-cinematic',
    shadowMode: 'vsm',
    shadowQuality: 'ultra',
    palette: [0x1e3a8a, 0x7c2d12, 0x581c87, 0x134e4a, 0x78350f],
  },
  'clinical-white': {
    cameraPreset: 'orbit',
    lightPreset: 'flat',
    hdr: null,
    hdrAsBackground: false,
    background: 0xffffff,
    fog: null,
    shadowMode: 'pcf',
    shadowQuality: 'low',
    palette: [0x0ea5e9, 0x64748b, 0x14b8a6, 0x6366f1, 0x94a3b8],
  },
  'terminal-green': {
    cameraPreset: 'top-down',
    lightPreset: 'ambient-only',
    hdr: null,
    hdrAsBackground: false,
    background: 0x001a00,
    fog: null,
    shadowMode: 'pcf',
    shadowQuality: 'low',
    palette: [0x00ff41, 0x00cc33, 0x009926, 0x39ff14, 0x006611],
  },
  editorial: {
    cameraPreset: 'fixed',
    lightPreset: 'three-point',
    hdr: 'daylight',
    hdrAsBackground: false,
    background: 0xf5f5f4,
    fog: 'linear',
    shadowMode: 'pcf-soft',
    shadowQuality: 'medium',
    palette: [0x1f2937, 0xb45309, 0x334155, 0x991b1b, 0x78716c],
  },
  cyberpunk: {
    cameraPreset: 'cinematic-high',
    lightPreset: 'cinematic',
    hdr: 'cinema-night',
    hdrAsBackground: false,
    background: 0x0d0221,
    fog: 'volumetric-low',
    shadowMode: 'vsm',
    shadowQuality: 'high',
    palette: [0xff00ff, 0x00ffff, 0xffff00, 0xff0080, 0x8000ff],
  },
  museum: {
    cameraPreset: 'isometric',
    lightPreset: 'product-shot',
    hdr: 'studio-1k',
    hdrAsBackground: false,
    background: 0xe7e5e4,
    fog: null,
    shadowMode: 'contact',
    shadowQuality: 'high',
    palette: [0xa8a29e, 0x78716c, 0xd6d3d1, 0x57534e, 0xe7e5e4],
  },
};

/** @type {string[]} */
export const VALID_THEMES = Object.keys(THEMES);

/**
 * Build the lights/environment/shadows for a theme against an already-validated
 * `ThemeConfig`. Removes any existing lights from `scene` first, since a theme
 * fully owns scene lighting once applied. Uses only `scene`'s public API
 * (`GraphScene`) plus its `camera` (`GraphSceneCamera`), so this has no need
 * for `GraphScene`'s private fields.
 *
 * The HDR fetch — the only step that can fail on external I/O (a missing or
 * malformed .hdr file) — runs before any scene mutation, so a rejected
 * `setHDR` leaves the camera, lights, and previous theme fully intact instead
 * of applying half of the new theme.
 *
 * @param {import('./GraphScene.js').GraphScene} scene
 * @param {ThemeConfig} config
 * @param {THREE.WebGLRenderer|null} renderer - When `null`, environment/shadows are skipped.
 * @returns {Promise<{ light: GraphSceneLight, environment: GraphSceneEnvironment|null, shadows: GraphSceneShadows|null }>}
 */
export async function buildTheme(scene, config, renderer) {
  let environment = null;
  if (renderer) {
    environment = new GraphSceneEnvironment({ renderer, scene: scene.three });
    if (config.hdr) {
      await environment.setHDR(config.hdr, { asBackground: config.hdrAsBackground });
    }
  }

  // Nothing past this point can fail on external I/O — safe to start mutating.
  const strayLights = [];
  scene.traverse((object) => {
    if (object.isLight) strayLights.push(object);
  });
  if (strayLights.length > 0) scene.remove(...strayLights);

  scene.camera.setPreset(config.cameraPreset);

  const light = new GraphSceneLight({ scene: scene.three });
  light.setPreset(config.lightPreset);

  let shadows = null;
  if (renderer) {
    if (config.background !== null && (!config.hdr || !config.hdrAsBackground)) {
      environment.setBackground(config.background);
    }
    if (config.fog) environment.setFog(config.fog);

    shadows = new GraphSceneShadows({ renderer, scene: scene.three, camera: scene.camera.three });
    await shadows.enable(config.shadowMode);
    shadows.setQuality(config.shadowQuality);
  }

  return { light, environment, shadows };
}
