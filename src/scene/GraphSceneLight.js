import * as THREE from 'three';

const VALID_PRESETS = [
  'ambient-only',
  'three-point',
  'studio',
  'flat',
  'cinematic',
  'product-shot',
];

// Shared defaults used across presets
const KEY_INTENSITY_DEFAULT    = 1.5;
const FILL_INTENSITY_DEFAULT   = 0.4;
const RIM_INTENSITY_DEFAULT    = 0.8;
const AMBIENT_INTENSITY_DEFAULT = 0.2;

/**
 * Build a map of role → light for the given preset.
 * @param {string} preset
 * @returns {Map<string, THREE.Light>}
 */
function buildPreset(preset) {
  const lights = new Map();

  if (preset === 'ambient-only') {
    const a = new THREE.AmbientLight(0xffffff, 0.6);
    a.name = '_ambient';
    lights.set('ambient', a);
    return lights;
  }

  if (preset === 'flat') {
    const a = new THREE.AmbientLight(0xffffff, 1.0);
    a.name = '_ambient';
    lights.set('ambient', a);
    return lights;
  }

  if (preset === 'three-point' || preset === 'studio' || preset === 'cinematic') {
    const isCinematic = preset === 'cinematic';
    const isStudio    = preset === 'studio';

    const key = new THREE.DirectionalLight(0xffffff, isCinematic ? 2.5 : KEY_INTENSITY_DEFAULT);
    key.name = '_key';
    key.position.set(5, 10, 7.5);
    key.castShadow = true;
    lights.set('key', key);

    const fill = new THREE.DirectionalLight(
      0xffffff,
      isCinematic ? 0.15 : isStudio ? 0.5 : FILL_INTENSITY_DEFAULT,
    );
    fill.name = '_fill';
    fill.position.set(-5, 5, 5);
    lights.set('fill', fill);

    const rim = new THREE.DirectionalLight(0xffffff, isCinematic ? 2.0 : RIM_INTENSITY_DEFAULT);
    rim.name = '_rim';
    rim.position.set(0, 8, -10);
    lights.set('rim', rim);

    const ambient = new THREE.AmbientLight(
      0xffffff,
      isCinematic ? 0.05 : isStudio ? 0.3 : AMBIENT_INTENSITY_DEFAULT,
    );
    ambient.name = '_ambient';
    lights.set('ambient', ambient);

    if (isStudio) {
      // Soft area key from the front — requires RectAreaLightUniformsLib for accurate rendering.
      const area = new THREE.RectAreaLight(0xffffff, 5.0, 10, 10);
      area.name = '_area_key';
      area.position.set(0, 5, 10);
      area.lookAt(0, 0, 0);
      lights.set('area_key', area);
    }

    return lights;
  }

  if (preset === 'product-shot') {
    // Four soft area lights from cardinal directions + soft ambient.
    // Requires RectAreaLightUniformsLib.init() for physically accurate falloff.
    const sides = [
      ['area_front', [  0, 0,  10], 3.0],
      ['area_back',  [  0, 0, -10], 2.0],
      ['area_left',  [-10, 0,   0], 2.0],
      ['area_right', [ 10, 0,   0], 2.0],
    ];
    for (const [role, pos, intensity] of sides) {
      const area = new THREE.RectAreaLight(0xffffff, intensity, 10, 10);
      area.name = `_${role}`;
      area.position.set(...pos);
      area.lookAt(0, 0, 0);
      lights.set(role, area);
    }
    const ambient = new THREE.AmbientLight(0xffffff, 0.1);
    ambient.name = '_ambient';
    lights.set('ambient', ambient);
    return lights;
  }

  return lights;
}

/**
 * Manages a scene's light rig via named presets, with per-role intensity control
 * and support for user-added custom lights.
 *
 * Preset-managed lights (created by `setPreset`) are tracked separately from
 * user lights (added via `addLight`). Switching presets replaces only the
 * preset lights; user lights survive.
 *
 * **RectAreaLight note:** the `studio` and `product-shot` presets include
 * `THREE.RectAreaLight`. For correct rendering you must call
 * `RectAreaLightUniformsLib.init()` once before rendering.
 *
 * @example
 * const lights = new GraphSceneLight({ scene: graphScene.three });
 * lights.setPreset('cinematic').setKeyIntensity(3).setRimIntensity(2.5);
 */
export class GraphSceneLight {
  /** @type {THREE.Scene} */
  #scene;

  /** @type {string} */
  #preset;

  /** @type {Map<string, THREE.Light>} preset-managed lights, keyed by role */
  #managed = new Map();

  /** @type {Map<string, THREE.Light>} user lights added via addLight() */
  #extra = new Map();

  /** @type {number} counter used to auto-name anonymous user lights */
  #userCounter = 0;

  /** @type {boolean} */
  #disposed = false;

  /**
   * @param {{ scene: THREE.Scene }} options
   * @throws {TypeError} If `scene` is not a `THREE.Scene`.
   * @example
   * const lights = new GraphSceneLight({ scene: graphScene.three });
   */
  constructor({ scene } = {}) {
    if (!(scene instanceof THREE.Scene)) {
      throw new TypeError(
        'GraphSceneLight: scene must be a THREE.Scene instance.',
      );
    }
    this.#scene = scene;
    this.#applyPreset('three-point');
    this.#preset = 'three-point';
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  /**
   * The currently active preset name.
   * @returns {string}
   */
  get preset() {
    return this.#preset;
  }

  // ── Preset ─────────────────────────────────────────────────────────────────

  /**
   * Replace the light rig with the named preset.
   * All current preset-managed lights are removed from the scene; user lights
   * added via `addLight()` are preserved.
   *
   * Valid presets: `ambient-only`, `three-point`, `studio`, `flat`,
   * `cinematic`, `product-shot`.
   *
   * @param {string} name
   * @returns {this}
   * @throws {TypeError} If `name` is not a recognised preset.
   * @throws {Error} If called after `dispose()`.
   * @example lights.setPreset('cinematic');
   */
  setPreset(name) {
    this.#assertNotDisposed('setPreset');
    if (!VALID_PRESETS.includes(name)) {
      throw new TypeError(
        `GraphSceneLight.setPreset: unknown preset '${name}'. ` +
          `Expected one of: [${VALID_PRESETS.join(', ')}].`,
      );
    }
    for (const light of this.#managed.values()) {
      this.#scene.remove(light);
    }
    this.#managed.clear();
    this.#applyPreset(name);
    this.#preset = name;
    return this;
  }

  // ── Intensity control ──────────────────────────────────────────────────────

  /**
   * Set the intensity of the key light. No-op if the current preset has no key light.
   * @param {number} value
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example lights.setKeyIntensity(2.0);
   */
  setKeyIntensity(value) {
    this.#assertNotDisposed('setKeyIntensity');
    const light = this.#managed.get('key');
    if (light) light.intensity = value;
    return this;
  }

  /**
   * Set the intensity of the fill light. No-op if the current preset has no fill light.
   * @param {number} value
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example lights.setFillIntensity(0.3);
   */
  setFillIntensity(value) {
    this.#assertNotDisposed('setFillIntensity');
    const light = this.#managed.get('fill');
    if (light) light.intensity = value;
    return this;
  }

  /**
   * Set the intensity of the rim light. No-op if the current preset has no rim light.
   * @param {number} value
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example lights.setRimIntensity(1.5);
   */
  setRimIntensity(value) {
    this.#assertNotDisposed('setRimIntensity');
    const light = this.#managed.get('rim');
    if (light) light.intensity = value;
    return this;
  }

  /**
   * Set the intensity of the ambient light. No-op if the current preset has no ambient light.
   * @param {number} value
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example lights.setAmbientIntensity(0.1);
   */
  setAmbientIntensity(value) {
    this.#assertNotDisposed('setAmbientIntensity');
    const light = this.#managed.get('ambient');
    if (light) light.intensity = value;
    return this;
  }

  // ── User lights ────────────────────────────────────────────────────────────

  /**
   * Add a custom light to the scene. The light is tracked by `name` so it can
   * be removed later. If `name` is omitted an auto-generated name is used.
   *
   * User lights survive `setPreset()` calls — only preset-managed lights are
   * replaced on a preset switch.
   *
   * @param {THREE.Light} light
   * @param {string} [name] - Optional identifier for later removal.
   * @returns {this}
   * @throws {TypeError} If `light` is not a `THREE.Light`.
   * @throws {Error} If a light with the given `name` already exists.
   * @throws {Error} If called after `dispose()`.
   * @example lights.addLight(new THREE.PointLight(0xff0000, 1), 'accent');
   */
  addLight(light, name) {
    this.#assertNotDisposed('addLight');
    if (!(light instanceof THREE.Light)) {
      throw new TypeError(
        'GraphSceneLight.addLight: light must be a THREE.Light instance.',
      );
    }
    const key =
      typeof name === 'string' && name.length > 0 ? name : `user_${this.#userCounter++}`;
    if (this.#extra.has(key) || this.#managed.has(key)) {
      throw new Error(`GraphSceneLight.addLight: a light named '${key}' already exists.`);
    }
    this.#extra.set(key, light);
    this.#scene.add(light);
    return this;
  }

  /**
   * Remove a light by name or by instance reference.
   *
   * @param {string|THREE.Light} lightOrName
   * @returns {this}
   * @throws {TypeError} If `lightOrName` is neither a string nor a `THREE.Light`.
   * @throws {Error} If no matching light is found.
   * @throws {Error} If called after `dispose()`.
   * @example lights.removeLight('accent');
   * @example lights.removeLight(myPointLight);
   */
  removeLight(lightOrName) {
    this.#assertNotDisposed('removeLight');
    if (typeof lightOrName === 'string') {
      const light = this.#extra.get(lightOrName) ?? this.#managed.get(lightOrName);
      if (!light) {
        throw new Error(
          `GraphSceneLight.removeLight: no light named '${lightOrName}' found.`,
        );
      }
      this.#extra.delete(lightOrName);
      this.#managed.delete(lightOrName);
      this.#scene.remove(light);
      return this;
    }
    if (lightOrName instanceof THREE.Light) {
      for (const [key, l] of this.#managed) {
        if (l === lightOrName) {
          this.#managed.delete(key);
          this.#scene.remove(l);
          return this;
        }
      }
      for (const [key, l] of this.#extra) {
        if (l === lightOrName) {
          this.#extra.delete(key);
          this.#scene.remove(l);
          return this;
        }
      }
      throw new Error(
        'GraphSceneLight.removeLight: the provided light is not managed by this instance.',
      );
    }
    throw new TypeError(
      'GraphSceneLight.removeLight: expected a string name or THREE.Light instance.',
    );
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Remove all managed lights (preset and user) from the scene.
   * Idempotent — safe to call twice.
   *
   * @example lights.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const light of this.#managed.values()) {
      this.#scene.remove(light);
    }
    for (const light of this.#extra.values()) {
      this.#scene.remove(light);
    }
    this.#managed.clear();
    this.#extra.clear();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /** @param {string} name */
  #applyPreset(name) {
    for (const [role, light] of buildPreset(name)) {
      this.#managed.set(role, light);
      this.#scene.add(light);
    }
  }

  /** @param {string} method */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`GraphSceneLight.${method}: instance has been disposed.`);
    }
  }
}
