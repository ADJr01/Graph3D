import * as THREE from 'three';

/**
 * Built-in HDR preset names resolved to bundle-relative file URLs.
 * Requires the corresponding .hdr files to be present in `src/scene/env/`.
 * @type {Record<string, string>}
 */
const BUILTIN_HDRS = {
  'studio-1k':    new URL('./env/studio-1k.hdr',    import.meta.url).href,
  'cinema-night': new URL('./env/cinema-night.hdr',  import.meta.url).href,
  'daylight':     new URL('./env/daylight.hdr',      import.meta.url).href,
};

/**
 * Named fog presets with cinematically tuned default values.
 * Volumetric presets flag the scene for a god-rays postfx pass (Phase 7)
 * and fall back to exponential fog in the meantime.
 * @type {Record<string, { color: number, near?: number, far?: number, density?: number }>}
 */
const FOG_PRESETS = {
  'linear':               { color: 0xc8d8e8, near: 20,  far: 200              },
  'exponential':          { color: 0x9aaabb,             density: 0.012        },
  'volumetric-low':       { color: 0x7788aa,             density: 0.007        },
  'volumetric-cinematic': { color: 0x1a2a3a,             density: 0.018        },
};

const VOLUMETRIC_PRESETS = new Set(['volumetric-low', 'volumetric-cinematic']);

/**
 * Ref-counted HDR texture cache.
 * Each entry holds both the PMREM env texture and the raw equirect background texture.
 * @type {Map<string, { envTexture: THREE.Texture|null, bgTexture: THREE.Texture|null, refCount: number, loadPromise: Promise|null }>}
 */
const hdrCache = new Map();

/**
 * Load an HDR file, generate a PMREM env texture, and return both textures.
 * @param {string} url
 * @param {THREE.WebGLRenderer} renderer
 * @returns {Promise<{ envTexture: THREE.Texture, bgTexture: THREE.Texture }>}
 */
async function _loadHDR(url, renderer) {
  const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
  const bgTexture = await new Promise((resolve, reject) => {
    new RGBELoader().load(url, resolve, undefined, reject);
  });
  bgTexture.mapping = THREE.EquirectangularReflectionMapping;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envTexture = pmrem.fromEquirectangular(bgTexture).texture;
  pmrem.dispose();

  return { envTexture, bgTexture };
}

/**
 * Acquire a ref-counted HDR entry, loading it on first access.
 * @param {string} url
 * @param {THREE.WebGLRenderer} renderer
 * @returns {Promise<{ envTexture: THREE.Texture, bgTexture: THREE.Texture }>}
 */
async function acquireHDR(url, renderer) {
  let entry = hdrCache.get(url);
  if (entry) {
    entry.refCount++;
    return entry.loadPromise ?? entry;
  }
  entry = { envTexture: null, bgTexture: null, refCount: 1, loadPromise: null };
  hdrCache.set(url, entry);
  entry.loadPromise = _loadHDR(url, renderer)
    .then(({ envTexture, bgTexture }) => {
      entry.envTexture  = envTexture;
      entry.bgTexture   = bgTexture;
      entry.loadPromise = null;
      return entry;
    })
    .catch((err) => {
      hdrCache.delete(url);
      throw err;
    });
  return entry.loadPromise;
}

/**
 * Release one reference to a cached HDR entry, disposing textures when the last
 * reference is dropped.
 * @param {string} url
 */
function releaseHDR(url) {
  const entry = hdrCache.get(url);
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount <= 0) {
    entry.envTexture?.dispose();
    entry.bgTexture?.dispose();
    hdrCache.delete(url);
  }
}

// ─── Class ────────────────────────────────────────────────────────────────────

/**
 * Manages the environment (HDR lighting, background, fog) of a THREE.Scene.
 *
 * HDR textures loaded via `setHDR` are ref-counted across all instances:
 * the same URL loads once and the textures are disposed only when the last
 * instance that holds a reference calls `dispose()` or loads a different HDR.
 *
 * **Built-in presets** — pass a preset name instead of a URL to `setHDR`:
 * - `'studio-1k'`
 * - `'cinema-night'`
 * - `'daylight'`
 *
 * @example
 * const env = new GraphSceneEnvironment({ renderer, scene });
 * await env.setHDR('studio-1k');
 * env.setFog('volumetric-cinematic');
 * // or with custom params:
 * env.setFog({ type: 'exponential', color: 0x112244, density: 0.02 });
 */
export class GraphSceneEnvironment {
  /** @type {THREE.WebGLRenderer} */
  #renderer;

  /** @type {THREE.Scene} */
  #scene;

  /** @type {string|null} URL currently held in the cache by this instance */
  #activeHDRUrl = null;

  /**
   * Identity token for the most recent `setHDR()` call. Lets a superseded call
   * (one that loses a race against a later `setHDR()` on the same instance)
   * recognise itself and release its own acquired ref instead of leaking it.
   * @type {object|null}
   */
  #hdrToken = null;

  /**
   * The active named fog preset, or `null` when fog was set via the object form
   * or not set at all.
   * @type {string|null}
   */
  #fogPreset = null;

  /** @type {boolean} */
  #disposed = false;

  /**
   * @param {{ renderer: THREE.WebGLRenderer, scene: THREE.Scene }} options
   * @throws {TypeError} If `renderer` or `scene` are not the expected types.
   * @example
   * const env = new GraphSceneEnvironment({ renderer, scene });
   */
  constructor({ renderer, scene } = {}) {
    if (!renderer || typeof renderer !== 'object' || !renderer.domElement) {
      throw new TypeError(
        'GraphSceneEnvironment: renderer must be a THREE.WebGLRenderer instance.',
      );
    }
    if (!(scene instanceof THREE.Scene)) {
      throw new TypeError(
        'GraphSceneEnvironment: scene must be a THREE.Scene instance.',
      );
    }
    this.#renderer = renderer;
    this.#scene    = scene;
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  /**
   * The active named fog preset, or `null` when no preset is active.
   * Volumetric preset names are also stored in `scene.userData.graph3d_fogPreset`
   * so that future postfx passes can detect them.
   * @returns {string|null}
   */
  get fogPreset() { return this.#fogPreset; }

  // ── HDR ────────────────────────────────────────────────────────────────────

  /**
   * Load an HDR file and apply it as the scene environment map (for PBR reflections)
   * and optionally as the scene background.
   *
   * Accepts a URL string or a built-in preset name (`'studio-1k'`, `'cinema-night'`,
   * `'daylight'`). Textures are ref-counted across instances sharing the same URL —
   * the file is fetched and processed only once.
   *
   * The previous HDR's ref is only released once the new one has finished loading,
   * so a rejected load (bad URL, missing file) leaves the previously-applied HDR
   * fully intact rather than disposing it out from under the scene. Calling
   * `setHDR()` again before a prior call resolves supersedes it: the earlier
   * call releases its own ref instead of leaking it or clobbering the newer state.
   *
   * @param {string} url - URL or built-in preset name.
   * @param {{ asBackground?: boolean }} [options]
   * @param {boolean} [options.asBackground=true] - Also set as scene.background.
   * @returns {Promise<this>}
   * @throws {Error} If the HDR file cannot be loaded.
   * @throws {Error} If called after `dispose()`.
   * @example await env.setHDR('studio-1k');
   * @example await env.setHDR('/textures/custom.hdr', { asBackground: false });
   */
  async setHDR(url, { asBackground = true } = {}) {
    this.#assertNotDisposed('setHDR');
    const resolvedUrl = BUILTIN_HDRS[url] ?? url;
    const token = {};
    this.#hdrToken = token;

    const entry = await acquireHDR(resolvedUrl, this.#renderer);

    if (this.#disposed || this.#hdrToken !== token) {
      // Disposed, or superseded by a later setHDR() call while this one was
      // still loading — release the ref we just acquired instead of leaking it.
      releaseHDR(resolvedUrl);
      return this;
    }

    // Only release the old HDR once the new one is confirmed loaded, so a
    // failed acquireHDR() above never disposes textures the scene still uses.
    if (this.#activeHDRUrl) releaseHDR(this.#activeHDRUrl);

    this.#activeHDRUrl       = resolvedUrl;
    this.#scene.environment  = entry.envTexture;
    if (asBackground) this.#scene.background = entry.bgTexture;
    return this;
  }

  // ── Background ─────────────────────────────────────────────────────────────

  /**
   * Set the scene background.
   *
   * - `null` / `undefined` — clear the background.
   * - `number` or `string` — parsed as a hex colour (`0xff0000`, `'#ff0000'`).
   * - `THREE.Color` — used directly.
   * - `THREE.Texture` / `THREE.CubeTexture` — set directly; caller owns lifecycle.
   *
   * @param {null|number|string|THREE.Color|THREE.Texture|THREE.CubeTexture} value
   * @returns {this}
   * @throws {TypeError} If `value` is none of the accepted types.
   * @throws {Error} If called after `dispose()`.
   * @example env.setBackground(0x112233);
   * @example env.setBackground(new THREE.Color('skyblue'));
   * @example env.setBackground(null); // transparent / no background
   */
  setBackground(value) {
    this.#assertNotDisposed('setBackground');
    if (value === null || value === undefined) {
      this.#scene.background = null;
      return this;
    }
    if (typeof value === 'number' || typeof value === 'string') {
      this.#scene.background = new THREE.Color(value);
      return this;
    }
    if (value instanceof THREE.Color) {
      this.#scene.background = value;
      return this;
    }
    if (value instanceof THREE.Texture) {
      this.#scene.background = value;
      return this;
    }
    throw new TypeError(
      'GraphSceneEnvironment.setBackground: expected null, a number/string colour, ' +
        'THREE.Color, or THREE.Texture. Gradient backgrounds require a postfx pass.',
    );
  }

  // ── Fog ────────────────────────────────────────────────────────────────────

  /**
   * Configure scene fog using a named preset or a custom options object.
   *
   * **String presets** (recommended — good defaults included):
   * - `'linear'` — cool grey-blue linear fog
   * - `'exponential'` — muted blue-grey exponential haze
   * - `'volumetric-low'` — warm atmospheric volumetric haze (requires Phase 7 postfx; falls back to exponential)
   * - `'volumetric-cinematic'` — deep-blue night volumetric (requires Phase 7 postfx; falls back to exponential)
   *
   * **Object form** (custom values, existing behavior):
   * - `{ type: 'linear', color?, near?, far? }`
   * - `{ type: 'exponential', color?, density? }`
   *
   * Volumetric presets emit a `console.warn` until Phase 7 postfx is wired in,
   * and store the preset name in `scene.userData.graph3d_fogPreset` so the future
   * god-rays pass can detect them.
   *
   * @param {string|{ type: 'linear'|'exponential', color?: number, near?: number, far?: number, density?: number }} input
   * @returns {this}
   * @throws {TypeError} If the preset name or fog type is not recognised.
   * @throws {Error} If called after `dispose()`.
   * @example env.setFog('volumetric-cinematic');
   * @example env.setFog({ type: 'linear', color: 0xcccccc, near: 10, far: 100 });
   */
  setFog(input) {
    this.#assertNotDisposed('setFog');
    if (typeof input === 'string') return this.#applyFogPreset(input);

    const { type, color = 0xffffff, near = 1, far = 100, density = 0.02 } = input ?? {};
    if (type === 'linear') {
      this.#fogPreset = null;
      this.#scene.fog = new THREE.Fog(color, near, far);
      return this;
    }
    if (type === 'exponential') {
      this.#fogPreset = null;
      this.#scene.fog = new THREE.FogExp2(color, density);
      return this;
    }
    throw new TypeError(
      `GraphSceneEnvironment.setFog: unknown fog type '${type}'. ` +
        `Expected 'linear' or 'exponential'. For presets pass a string: ` +
        `[${Object.keys(FOG_PRESETS).join(', ')}].`,
    );
  }

  // ── Skybox ─────────────────────────────────────────────────────────────────

  /**
   * Set the scene background to a cube skybox or an equirectangular image.
   *
   * - Array of 6 URL strings → loaded as a `THREE.CubeTexture` (±X, ±Y, ±Z order).
   * - Single URL string → loaded as an equirectangular texture. Use `.hdr` for
   *   HDR equirects; other extensions are loaded via `THREE.TextureLoader`.
   *
   * The textures set here are **not** ref-counted; the caller is responsible for
   * disposing them if needed. Does not affect `scene.environment`.
   *
   * @param {string[]|string} input
   * @returns {Promise<this>}
   * @throws {TypeError} If `input` is not a 6-element array or a string.
   * @throws {Error} If called after `dispose()`.
   * @example await env.setSkybox(['+x.png', '-x.png', '+y.png', '-y.png', '+z.png', '-z.png']);
   * @example await env.setSkybox('/textures/sky.hdr');
   */
  async setSkybox(input) {
    this.#assertNotDisposed('setSkybox');

    if (Array.isArray(input)) {
      if (input.length !== 6) {
        throw new TypeError(
          'GraphSceneEnvironment.setSkybox: cube skybox requires exactly 6 URLs.',
        );
      }
      const texture = await new Promise((resolve, reject) => {
        new THREE.CubeTextureLoader().load(input, resolve, undefined, reject);
      });
      if (this.#disposed) { texture.dispose(); return this; }
      this.#scene.background = texture;
      return this;
    }

    if (typeof input === 'string') {
      const texture = await this.#loadEquirect(input);
      if (this.#disposed) { texture.dispose(); return this; }
      this.#scene.background = texture;
      return this;
    }

    throw new TypeError(
      'GraphSceneEnvironment.setSkybox: expected a 6-element URL array or a single URL string.',
    );
  }

  // ── Clear ──────────────────────────────────────────────────────────────────

  /**
   * Remove the environment map, background, and fog from the scene.
   * Releases the ref-counted HDR texture if one was set via `setHDR`.
   *
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example env.clear();
   */
  clear() {
    this.#assertNotDisposed('clear');
    if (this.#activeHDRUrl) {
      releaseHDR(this.#activeHDRUrl);
      this.#activeHDRUrl = null;
    }
    this.#fogPreset = null;
    delete this.#scene.userData.graph3d_fogPreset;
    this.#scene.environment = null;
    this.#scene.background  = null;
    this.#scene.fog         = null;
    return this;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Release held HDR texture references.
   * Idempotent — safe to call twice.
   * Does NOT null `scene.environment`/`scene.background` — call `clear()` first
   * if you need the scene reset.
   *
   * @example env.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#activeHDRUrl) {
      releaseHDR(this.#activeHDRUrl);
      this.#activeHDRUrl = null;
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Load an equirectangular texture, using RGBELoader for .hdr files and
   * TextureLoader for everything else.
   * @param {string} url
   * @returns {Promise<THREE.Texture>}
   */
  async #loadEquirect(url) {
    if (url.toLowerCase().endsWith('.hdr')) {
      const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
      const texture = await new Promise((resolve, reject) => {
        new RGBELoader().load(url, resolve, undefined, reject);
      });
      texture.mapping = THREE.EquirectangularReflectionMapping;
      return texture;
    }
    const texture = await new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(url, resolve, undefined, reject);
    });
    texture.mapping = THREE.EquirectangularReflectionMapping;
    return texture;
  }

  /** @param {string} name */
  #applyFogPreset(name) {
    const preset = FOG_PRESETS[name];
    if (!preset) {
      throw new TypeError(
        `GraphSceneEnvironment.setFog: unknown fog preset '${name}'. ` +
          `Expected one of: [${Object.keys(FOG_PRESETS).join(', ')}].`,
      );
    }
    this.#fogPreset = name;
    if (VOLUMETRIC_PRESETS.has(name)) {
      this.#scene.userData.graph3d_fogPreset = name;
      // ponytail: full volumetric god-rays land in Phase 7; exponential fog is the fallback.
      console.warn(
        `GraphSceneEnvironment.setFog: '${name}' requires the god-rays postfx pass ` +
          `(Phase 7). Applying exponential fog as a fallback.`,
      );
      this.#scene.fog = new THREE.FogExp2(preset.color, preset.density);
    } else {
      delete this.#scene.userData.graph3d_fogPreset;
      if (name === 'linear') {
        this.#scene.fog = new THREE.Fog(preset.color, preset.near, preset.far);
      } else {
        this.#scene.fog = new THREE.FogExp2(preset.color, preset.density);
      }
    }
    return this;
  }

  /** @param {string} method */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`GraphSceneEnvironment.${method}: instance has been disposed.`);
    }
  }
}
