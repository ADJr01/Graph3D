import { GraphScene } from './GraphScene.js';
import { GraphSceneLight } from './GraphSceneLight.js';
import { GraphSceneEnvironment } from './GraphSceneEnvironment.js';
import { GraphSceneShadows } from './GraphSceneShadows.js';

const DEFAULT_LIGHT_PRESET = 'three-point';
const DEFAULT_SHADOW_MODE = 'pcf-soft';

/**
 * Orchestrates the sub-managers a chart needs to render into a `GraphScene`
 * with sensible defaults, so chart types (Phase 8) don't each reimplement
 * "does this scene already have lights / shadows?" checks.
 *
 * @example
 * const { light, shadows } = await GraphSceneSetup.ensureDefaults(scene, {
 *   renderer: graph3d.renderer.three,
 * });
 */
export class GraphSceneSetup {
  /**
   * Ensure `scene` has a camera, lights, and (when a renderer is supplied)
   * an environment manager and shadows — filling in sensible defaults for
   * whichever piece is missing. Existing setup is left untouched, so this is
   * idempotent to call once per scene.
   *
   * - **camera** — `GraphScene` always constructs one; returned as-is.
   * - **lights** — added via `GraphSceneLight` only if the scene has no light yet.
   * - **environment** — constructed via `GraphSceneEnvironment` only if `renderer`
   *   is supplied; no HDR/fog/background is forced, so this is `null` without a renderer.
   * - **shadows** — enabled via `GraphSceneShadows` only if `renderer` is supplied
   *   and its shadow map isn't already enabled.
   *
   * @param {GraphScene} scene
   * @param {{ renderer?: object, lightPreset?: string, shadowMode?: string }} [options]
   * @returns {Promise<{ camera: import('./GraphSceneCamera.js').GraphSceneCamera, light: GraphSceneLight|null, environment: GraphSceneEnvironment|null, shadows: GraphSceneShadows|null }>}
   * @throws {TypeError} If `scene` is not a `GraphScene`.
   * @example
   * const setup = await GraphSceneSetup.ensureDefaults(scene);
   * @example
   * // With a renderer, also gets an environment manager and default shadows
   * const setup = await GraphSceneSetup.ensureDefaults(scene, { renderer: graph3d.renderer.three });
   */
  static async ensureDefaults(scene, options = {}) {
    if (!(scene instanceof GraphScene)) {
      throw new TypeError('GraphSceneSetup.ensureDefaults: scene must be a GraphScene instance.');
    }
    const {
      renderer = null,
      lightPreset = DEFAULT_LIGHT_PRESET,
      shadowMode = DEFAULT_SHADOW_MODE,
    } = options;

    const camera = scene.camera;

    let light = null;
    let hasLight = false;
    scene.traverse((object) => {
      if (object.isLight) hasLight = true;
    });
    if (!hasLight) {
      light = new GraphSceneLight({ scene: scene.three });
      light.setPreset(lightPreset);
    }

    let environment = null;
    if (renderer) {
      environment = new GraphSceneEnvironment({ renderer, scene: scene.three });
    }

    let shadows = null;
    if (renderer && !renderer.shadowMap.enabled) {
      shadows = new GraphSceneShadows({ renderer, scene: scene.three, camera: camera.three });
      await shadows.enable(shadowMode);
    }

    return { camera, light, environment, shadows };
  }
}
