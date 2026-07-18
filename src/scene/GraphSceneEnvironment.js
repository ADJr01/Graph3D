import * as THREE from 'three';
import { loop } from '../core/Graph3DLoop.js';

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
 * Volumetric presets flag the scene (via `scene.userData.graph3d_fogPreset`)
 * so `postfx/`'s `godRays` pass can react to it, but the fog itself always
 * renders as exponential — a true raymarched volumetric fog volume is a
 * separate, much larger feature this project doesn't implement (Prompt 118
 * only wires the light-shaft look, not in-scattering fog density).
 * `'volumetric-cinematic'` is auto-activated by `PostFX` (Prompt 118) once
 * `graph3d.postfx` has been accessed; `'volumetric-low'` currently isn't
 * wired to anything — see `skipping_list.md`.
 * @type {Record<string, { color: number, near?: number, far?: number, density?: number }>}
 */
const FOG_PRESETS = {
  'linear':               { color: 0xc8d8e8, near: 20,  far: 200              },
  'exponential':          { color: 0x9aaabb,             density: 0.012        },
  'volumetric-low':       { color: 0x7788aa,             density: 0.007        },
  'volumetric-cinematic': { color: 0x1a2a3a,             density: 0.018        },
};

const VOLUMETRIC_PRESETS = new Set(['volumetric-low', 'volumetric-cinematic']);

const HDR_LOADER_CLASS = 'graph3d-hdr-loader';
let hdrLoaderStyleInjected = false;

/**
 * Inject the loading-overlay CSS once per page. No-op outside a browser (SSR).
 */
function _ensureHDRLoaderStyle() {
  if (hdrLoaderStyleInjected || typeof document === 'undefined') return;
  hdrLoaderStyleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .${HDR_LOADER_CLASS} {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: rgba(8, 8, 10, 0.85);
      color: #f5f5f5;
      font: 600 13px/1.4 system-ui, -apple-system, sans-serif;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      z-index: 9999;
    }
    .${HDR_LOADER_CLASS}__spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(255, 255, 255, 0.25);
      border-top-color: rgba(255, 255, 255, 0.9);
      border-radius: 50%;
      animation: graph3d-hdr-spin 0.8s linear infinite;
    }
    @keyframes graph3d-hdr-spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Ref-counted pause on the shared `Graph3DLoop` singleton for the duration of
 * in-flight `setHDR()` calls, across every `GraphSceneEnvironment` instance —
 * there is only one RAF loop for the whole page (CLAUDE.md's single-loop
 * guarantee), so pausing "this scene" means pausing it. The original
 * running state is captured only on the 0→1 transition and restored only on
 * the 1→0 transition, so overlapping `setHDR()` calls (same instance or
 * different scenes) don't have one call's resume clobber another's pause.
 * @type {number}
 */
let hdrLoopPauseCount = 0;

/** @type {boolean} Whether the loop was running before the first pause in the current batch. */
let hdrLoopWasRunning = false;

/** Pause the shared loop for an in-flight HDR load. Ref-counted; see `hdrLoopPauseCount`. */
function _pauseLoopForHDR() {
  if (hdrLoopPauseCount === 0) {
    hdrLoopWasRunning = loop.isRunning;
    if (hdrLoopWasRunning) loop.stop();
  }
  hdrLoopPauseCount++;
}

/** Resume the shared loop once the last in-flight HDR load settles. Ref-counted. */
function _resumeLoopAfterHDR() {
  hdrLoopPauseCount = Math.max(0, hdrLoopPauseCount - 1);
  if (hdrLoopPauseCount === 0 && hdrLoopWasRunning) {
    loop.start();
  }
}

/**
 * Ref-counted HDR texture cache.
 * Each entry holds both the PMREM env texture and the raw equirect background texture.
 * @type {Map<string, { envTexture: THREE.Texture|null, bgTexture: THREE.Texture|null, refCount: number, loadPromise: Promise|null }>}
 */
const hdrCache = new Map();

/**
 * Extract a lowercase file extension for loader dispatch. `blob:` object
 * URLs from an `<input type="file">` picker carry no extension, so a
 * fragment is checked first — a caller can hint the real filename via
 * `URL.createObjectURL(file) + '#' + file.name`. The fragment is never sent
 * over the wire, so this doesn't change what gets fetched.
 * @param {string} url
 * @returns {string}
 */
function _equirectExtension(url) {
  const hint = url.includes('#') ? url.split('#').pop() : url.split('?')[0];
  return hint.toLowerCase().split('.').pop();
}

/**
 * Load an equirectangular image file, selecting the loader by file extension:
 * `.hdr` → `RGBELoader`, `.exr` → `EXRLoader`, anything else → `THREE.TextureLoader`
 * (LDR formats: jpg/png/webp). All three loaders share the same
 * `load(url, onLoad, onProgress, onError)` signature, so callers don't need
 * to branch again once the file is loaded.
 * @param {string} url
 * @returns {Promise<THREE.Texture>}
 */
async function _loadEquirectFile(url) {
  const ext = _equirectExtension(url);
  if (ext === 'hdr') {
    const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
    return new Promise((resolve, reject) => new RGBELoader().load(url, resolve, undefined, reject));
  }
  if (ext === 'exr') {
    const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js');
    return new Promise((resolve, reject) => new EXRLoader().load(url, resolve, undefined, reject));
  }
  return new Promise((resolve, reject) => new THREE.TextureLoader().load(url, resolve, undefined, reject));
}

/**
 * Load an HDR/EXR file, generate a PMREM env texture, and return both textures.
 *
 * `PMREMGenerator.fromEquirectangular()` is a synchronous chain of GPU
 * render-to-texture passes with no async variant — it's the one step in this
 * pipeline that can't be made non-blocking. Yielding one frame beforehand
 * (via `requestAnimationFrame`) lets the browser paint the loading indicator
 * and lets an already-running render loop tick at least once before that
 * synchronous cost lands, instead of both being starved back-to-back with
 * the network fetch above.
 * @param {string} url
 * @param {THREE.WebGLRenderer} renderer
 * @returns {Promise<{ envTexture: THREE.Texture, bgTexture: THREE.Texture }>}
 */
async function _loadHDR(url, renderer) {
  const bgTexture = await _loadEquirectFile(url);
  bgTexture.mapping = THREE.EquirectangularReflectionMapping;

  if (typeof requestAnimationFrame === 'function') {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

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
 * `setHDR`/`setSkybox` accept `.hdr` and `.exr` files — including an object
 * URL from a `<input type="file">` picker, for a developer letting an end
 * user supply their own HDRI.
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

  /** @type {HTMLElement|null} The loading-spinner overlay currently shown over the canvas, if any. */
  #hdrLoaderEl = null;

  /** @type {HTMLElement|null} The overlay's parent, saved so its `position` style can be restored. */
  #hdrLoaderParent = null;

  /** @type {string} The overlay parent's `position` style before it was forced to `relative`. */
  #hdrLoaderParentPrevPosition = '';

  /**
   * Resume-the-shared-loop callbacks for `setHDR()` calls on this instance
   * that have paused the loop but not yet settled. A load that never resolves
   * (hung network, or a caller that never awaits a rejected fetch) would
   * otherwise leave the shared `Graph3DLoop` paused forever — `dispose()`
   * force-runs every entry here so disposing an instance always releases
   * whatever pause it holds, even mid-load. Each callback guards itself so an
   * eventual real settle (for a merely-slow, not literally-hung, load) can't
   * double-resume after `dispose()` already forced it.
   * @type {Set<function(): void>}
   */
  #pendingLoopResumes = new Set();

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
   * Load an HDR or EXR file and apply it as the scene environment map (for PBR
   * reflections) and optionally as the scene background.
   *
   * Accepts a URL string (`.hdr` or `.exr`, own asset or remote) or a
   * built-in preset name (`'studio-1k'`, `'cinema-night'`, `'daylight'`).
   * Textures are ref-counted across instances sharing the same URL — the file
   * is fetched and processed only once.
   *
   * For a user-supplied HDRI (e.g. an `<input type="file">` picker), pass
   * `URL.createObjectURL(file) + '#' + file.name` — object URLs carry no
   * extension on their own, and the `#name.ext` suffix is how the loader is
   * selected (see `_equirectExtension`).
   *
   * The previous HDR's ref is only released once the new one has finished loading,
   * so a rejected load (bad URL, missing file) leaves the previously-applied HDR
   * fully intact rather than disposing it out from under the scene. Calling
   * `setHDR()` again before a prior call resolves supersedes it: the earlier
   * call releases its own ref instead of leaking it or clobbering the newer state
   * (and never touches the loading overlay, which belongs to the newer call).
   *
   * Loading never blocks the calling code — the network fetch is already
   * async, so `await`-ing this call never freezes the tab. What it does
   * pause is the shared `Graph3DLoop` (the one RAF loop for the whole page,
   * per CLAUDE.md's single-loop guarantee): the loop stops for the duration
   * of the load and restarts once the HDR is applied (or the load fails), so
   * nothing animates behind the loader. A full overlay — "loading assets"
   * plus a spinner — covers the renderer's canvas for the same duration.
   * Overlapping `setHDR()` calls (this instance or another scene's) share one
   * ref-counted pause, so the loop only resumes once the last of them settles
   * — and `dispose()` force-releases this instance's share immediately, so a
   * load that never resolves can't leave the shared loop paused forever.
   * For the HDR to be visible in the very *first* rendered frame, `await`
   * this method before calling the chart's `render()` — it's still safe to
   * call at any other time; the environment/background apply the moment
   * loading completes.
   *
   * @param {string} url - URL or built-in preset name.
   * @param {{ asBackground?: boolean }} [options]
   * @param {boolean} [options.asBackground=true] - Also set as scene.background.
   * @returns {Promise<this>}
   * @throws {Error} If the HDR file cannot be loaded.
   * @throws {Error} If called after `dispose()`.
   * @example await env.setHDR('studio-1k'); // call before chart.render() for the first frame to include it
   * @example await env.setHDR('/textures/custom.hdr', { asBackground: false });
   * @example await env.setHDR(URL.createObjectURL(file) + '#' + file.name); // user-picked file
   */
  async setHDR(url, { asBackground = true } = {}) {
    this.#assertNotDisposed('setHDR');
    const resolvedUrl = BUILTIN_HDRS[url] ?? url;
    const token = {};
    this.#hdrToken = token;
    this.#showHDRLoader();
    _pauseLoopForHDR();
    let loopResumed = false;
    const resumeLoop = () => {
      if (loopResumed) return;
      loopResumed = true;
      this.#pendingLoopResumes.delete(resumeLoop);
      _resumeLoopAfterHDR();
    };
    this.#pendingLoopResumes.add(resumeLoop);

    try {
      let entry;
      try {
        entry = await acquireHDR(resolvedUrl, this.#renderer);
      } catch (err) {
        if (this.#hdrToken === token) this.#hideHDRLoader();
        throw err;
      }

      if (this.#disposed || this.#hdrToken !== token) {
        // Disposed, or superseded by a later setHDR() call while this one was
        // still loading — release the ref we just acquired instead of leaking it.
        releaseHDR(resolvedUrl);
        if (this.#hdrToken === token) this.#hideHDRLoader();
        return this;
      }

      // Only release the old HDR once the new one is confirmed loaded, so a
      // failed acquireHDR() above never disposes textures the scene still uses.
      if (this.#activeHDRUrl) releaseHDR(this.#activeHDRUrl);

      this.#activeHDRUrl       = resolvedUrl;
      this.#scene.environment  = entry.envTexture;
      if (asBackground) this.#scene.background = entry.bgTexture;
      this.#hideHDRLoader();
      return this;
    } finally {
      resumeLoop();
    }
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
   * - `'volumetric-low'` — warm atmospheric volumetric haze (renders as exponential fog; not yet wired to a postfx pass)
   * - `'volumetric-cinematic'` — deep-blue night volumetric (renders as exponential fog; auto-activates `postfx`'s `godRays` pass once `graph3d.postfx` is accessed)
   *
   * **Object form** (custom values, existing behavior):
   * - `{ type: 'linear', color?, near?, far? }`
   * - `{ type: 'exponential', color?, density? }`
   *
   * Volumetric presets always render as exponential fog (there is no
   * raymarched fog-volume renderer) and emit a `console.warn` saying so, and
   * store the preset name in `scene.userData.graph3d_fogPreset` so `postfx`'s
   * `godRays` pass can detect it.
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
   * - Single URL string → loaded as an equirectangular texture. Use `.hdr` or
   *   `.exr` for HDR equirects; other extensions are loaded via `THREE.TextureLoader`.
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
    // Force-release any loop pause still held by an in-flight setHDR() call —
    // a hung load would otherwise never reach its own finally block and leave
    // the shared Graph3DLoop paused forever.
    for (const resumeLoop of this.#pendingLoopResumes) resumeLoop();
    this.#hideHDRLoader();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Load an equirectangular texture. See `_loadEquirectFile` for the
   * extension-based loader dispatch (.hdr / .exr / LDR image formats).
   * @param {string} url
   * @returns {Promise<THREE.Texture>}
   */
  async #loadEquirect(url) {
    const texture = await _loadEquirectFile(url);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    return texture;
  }

  /**
   * Show a "loading assets" overlay on the renderer's canvas while an HDR
   * loads. No-op outside a browser (SSR) or if the canvas has no parent to
   * overlay.
   */
  #showHDRLoader() {
    const canvas = this.#renderer.domElement;
    if (typeof document === 'undefined' || !canvas?.parentNode) return;
    _ensureHDRLoaderStyle();

    const parent = canvas.parentNode;
    if (window.getComputedStyle(parent).position === 'static') {
      this.#hdrLoaderParent = parent;
      this.#hdrLoaderParentPrevPosition = parent.style.position;
      parent.style.position = 'relative';
    }

    const el = document.createElement('div');
    el.className = HDR_LOADER_CLASS;

    const spinner = document.createElement('div');
    spinner.className = `${HDR_LOADER_CLASS}__spinner`;
    el.appendChild(spinner);

    const title = document.createElement('div');
    title.className = `${HDR_LOADER_CLASS}__title`;
    title.textContent = 'loading assets';
    el.appendChild(title);

    parent.appendChild(el);
    this.#hdrLoaderEl = el;
  }

  /** Remove the HDR loading overlay, if one is showing. Idempotent. */
  #hideHDRLoader() {
    if (this.#hdrLoaderEl) {
      this.#hdrLoaderEl.remove();
      this.#hdrLoaderEl = null;
    }
    if (this.#hdrLoaderParent) {
      this.#hdrLoaderParent.style.position = this.#hdrLoaderParentPrevPosition;
      this.#hdrLoaderParent = null;
      this.#hdrLoaderParentPrevPosition = '';
    }
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
      // ponytail: no raymarched fog-volume renderer exists; exponential fog is the permanent stand-in.
      console.warn(
        `GraphSceneEnvironment.setFog: '${name}' renders as exponential fog — ` +
          `there is no true volumetric fog-volume renderer. ` +
          `${name === 'volumetric-cinematic' ? "The light-shaft look comes from postfx's 'godRays' pass, auto-activated once graph3d.postfx is accessed." : "It is not yet wired to a postfx pass."}`,
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
