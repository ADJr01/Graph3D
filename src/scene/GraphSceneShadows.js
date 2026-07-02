import * as THREE from 'three';
import { loop } from '../core/Graph3DLoop.js';

const VALID_MODES   = ['pcf', 'pcf-soft', 'vsm', 'csm', 'contact'];
const VALID_QUALITY = ['low', 'medium', 'high', 'ultra'];

/** @type {Record<string, number>} Shadow map sizes per quality level */
const SHADOW_MAP_SIZE = { low: 512, medium: 1024, high: 2048, ultra: 4096 };

/**
 * Maps mode names to THREE shadow map type constants.
 * 'contact' uses VSM for the soft penumbra that gives the product-shot look.
 * @type {Record<string, number>}
 */
const SHADOW_MAP_TYPE = {
  'pcf':      THREE.PCFShadowMap,
  'pcf-soft': THREE.PCFSoftShadowMap,
  'vsm':      THREE.VSMShadowMap,
  'contact':  THREE.VSMShadowMap,
};

// 4 cascades balances shadow quality vs. GPU cost for large scenes.
const CSM_CASCADES = 4;

/**
 * Configures the renderer's shadow system for a scene.
 *
 * Supported modes:
 * - `'pcf'` — standard percentage-closer filtering
 * - `'pcf-soft'` — softer PCF (slightly more expensive)
 * - `'vsm'` — variance shadow maps, best for soft shadows
 * - `'csm'` — cascaded shadow maps for large scenes; lazy-loads
 *   `three/examples/jsm/csm/CSM.js` and registers a per-frame update
 * - `'contact'` — VSM tuned for product-shot close-up lighting
 *
 * `setQuality` controls the shadow map resolution and applies retroactively
 * to every shadow-casting light already in the scene.
 *
 * @example
 * const shadows = new GraphSceneShadows({ renderer, scene, camera });
 * await shadows.enable('pcf-soft');
 * shadows.setQuality('high');
 *
 * @example
 * // CSM for large terrains
 * await shadows.enable('csm');
 */
export class GraphSceneShadows {
  /** @type {THREE.WebGLRenderer} */
  #renderer;

  /** @type {THREE.Scene} */
  #scene;

  /** @type {THREE.Camera} */
  #camera;

  /** @type {string|null} */
  #mode = null;

  /** @type {string} */
  #quality = 'medium';

  /** @type {object|null} CSM instance */
  #csm = null;

  /** @type {Function|null} tick registered with the loop while CSM is active */
  #csmTick = null;

  /**
   * Unique token for the current #setupCSM invocation.
   * Set to null by #teardown to invalidate an in-flight load.
   * @type {object|null}
   */
  #csmToken = null;

  /** @type {boolean} */
  #disposed = false;

  /**
   * @param {{ renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera }} options
   * @throws {TypeError} If `renderer`, `scene`, or `camera` are not the expected types.
   * @example
   * const shadows = new GraphSceneShadows({ renderer, scene, camera });
   */
  constructor({ renderer, scene, camera } = {}) {
    if (!renderer || typeof renderer !== 'object' || !renderer.shadowMap) {
      throw new TypeError(
        'GraphSceneShadows: renderer must be a THREE.WebGLRenderer instance.',
      );
    }
    if (!(scene instanceof THREE.Scene)) {
      throw new TypeError(
        'GraphSceneShadows: scene must be a THREE.Scene instance.',
      );
    }
    if (!(camera instanceof THREE.Camera)) {
      throw new TypeError(
        'GraphSceneShadows: camera must be a THREE.Camera instance.',
      );
    }
    this.#renderer = renderer;
    this.#scene    = scene;
    this.#camera   = camera;
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  /** The currently active mode, or `null` when shadows are disabled. @returns {string|null} */
  get mode() { return this.#mode; }

  /** The current quality level. @returns {string} */
  get quality() { return this.#quality; }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Enable shadows with the given mode.
   *
   * Returns a `Promise<this>` so that `csm` mode (which lazy-loads a module)
   * and standard modes share the same calling convention. For non-CSM modes
   * the promise resolves immediately.
   *
   * Calling `enable` while a previous mode is active tears down the previous
   * mode first. Calling `enable('csm')` while a prior CSM load is still in
   * flight cancels that load.
   *
   * @param {'pcf'|'pcf-soft'|'vsm'|'csm'|'contact'} mode
   * @returns {Promise<this>}
   * @throws {TypeError} If `mode` is not recognised.
   * @throws {Error} If called after `dispose()`.
   * @example await shadows.enable('pcf-soft');
   * @example await shadows.enable('csm');
   */
  async enable(mode) {
    this.#assertNotDisposed('enable');
    if (!VALID_MODES.includes(mode)) {
      throw new TypeError(
        `GraphSceneShadows.enable: unknown mode '${mode}'. ` +
          `Expected one of: [${VALID_MODES.join(', ')}].`,
      );
    }
    this.#teardown();
    if (mode === 'csm') {
      await this.#setupCSM();
    } else {
      this.#setupStandard(mode);
    }
    // Guard: dispose() or a second enable() may have fired while awaiting CSM.
    if (this.#disposed || (mode === 'csm' && !this.#csm)) return this;
    this.#mode = mode;
    return this;
  }

  /**
   * Disable shadows and tear down any active CSM instance.
   *
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example shadows.disable();
   */
  disable() {
    this.#assertNotDisposed('disable');
    this.#teardown();
    this.#renderer.shadowMap.enabled = false;
    this.#mode = null;
    return this;
  }

  /**
   * Set the shadow map resolution. Applies immediately to every shadow-casting
   * light in the scene; the new size takes effect on the next rendered frame.
   *
   * Call `setQuality` before `enable('csm')` to control CSM cascade map size;
   * changing quality after CSM is active does not resize the CSM maps (recreate
   * with `disable()` → `setQuality()` → `enable('csm')`).
   *
   * @param {'low'|'medium'|'high'|'ultra'} level
   * @returns {this}
   * @throws {TypeError} If `level` is not recognised.
   * @throws {Error} If called after `dispose()`.
   * @example shadows.setQuality('high');
   */
  setQuality(level) {
    this.#assertNotDisposed('setQuality');
    if (!VALID_QUALITY.includes(level)) {
      throw new TypeError(
        `GraphSceneShadows.setQuality: unknown quality level '${level}'. ` +
          `Expected one of: [${VALID_QUALITY.join(', ')}].`,
      );
    }
    this.#quality = level;
    this.#applyQualityToLights();
    return this;
  }

  /**
   * Remove all shadow resources and loop callbacks.
   * Idempotent — safe to call twice.
   * @example shadows.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#teardown();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /** @param {string} mode */
  #setupStandard(mode) {
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type    = SHADOW_MAP_TYPE[mode];
    this.#applyQualityToLights();
  }

  async #setupCSM() {
    const token = {};
    this.#csmToken = token;

    const { CSM } = await import('three/examples/jsm/csm/CSM.js');

    // Bail if disposed or a second enable() overtook this load.
    if (this.#disposed || this.#csmToken !== token) return;

    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

    this.#csm = new CSM({
      maxFar:         this.#camera.far,
      cascades:       CSM_CASCADES,
      mode:           'practical',
      parent:         this.#scene,
      shadowMapSize:  SHADOW_MAP_SIZE[this.#quality],
      lightDirection: new THREE.Vector3(1, -1, 1).normalize(),
      camera:         this.#camera,
    });

    this.#csmTick = () => this.#csm.update();
    loop.add(this.#csmTick);
  }

  #teardown() {
    this.#csmToken = null; // invalidates any in-flight #setupCSM
    if (this.#csm) {
      if (this.#csmTick) {
        loop.remove(this.#csmTick);
        this.#csmTick = null;
      }
      this.#csm.dispose();
      this.#csm = null;
    }
  }

  #applyQualityToLights() {
    const size = SHADOW_MAP_SIZE[this.#quality];
    this.#scene.traverse((obj) => {
      if (obj.isLight && obj.shadow) {
        obj.shadow.mapSize.setScalar(size);
        // Force THREE to regenerate the shadow map at the new size next frame.
        if (obj.shadow.map) {
          obj.shadow.map.dispose();
          obj.shadow.map = null;
        }
      }
    });
  }

  /** @param {string} method */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`GraphSceneShadows.${method}: instance has been disposed.`);
    }
  }
}
