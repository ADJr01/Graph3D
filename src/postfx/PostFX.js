import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';

/**
 * @typedef {Object} PostFXPassContext
 * @property {import('three').Scene} scene - The scene currently being rendered.
 * @property {import('three').Camera} camera - The camera currently being rendered through.
 * @property {import('three').WebGLRenderer} renderer - The underlying Three.js renderer.
 * @property {{width: number, height: number}} size - The renderer's current
 *   drawing-buffer size in physical pixels (`renderer.domElement.width/height`,
 *   already pixel-ratio-scaled) — what passes need to size their own internal
 *   render targets (e.g. `UnrealBloomPass`, `SSAOPass`).
 * @property {import('../core/CapabilityProbe.js').Capabilities|undefined} capabilities -
 *   The frozen `CapabilityProbe` snapshot, when `PostFX` was constructed with
 *   one (`Graph3D`'s `postfx` getter always passes its own `this.capabilities`).
 *   `undefined` for a `PostFX` built without one (e.g. most unit tests) — a
 *   pass's `canEnable` should treat that as "unknown, don't block."
 */

/**
 * @typedef {Object} PostFXPassDefinition
 * @property {number} order - Canonical chain position. Passes are always
 *   re-sorted into ascending `order` regardless of the sequence `enable()`
 *   was called in — this is what "automatic pass ordering" means in practice.
 * @property {function(PostFXPassContext, Object): *} create - Builds the
 *   underlying `Pass` instance for one `enable()` call.
 * @property {function(*, Object): void} [configure] - Applies merged options
 *   to an already-created pass. Defaults to `Object.assign(pass, opts)`.
 * @property {function(PostFXPassContext, Object): boolean} [canEnable] - Gate
 *   checked before `create()`. Returning `false` makes `enable()` a no-op
 *   instead of activating the pass — for capability-driven auto-disable
 *   (CLAUDE.md §1.5: "capability-driven fallbacks... are explicit and emit a
 *   `console.warn`"), the definition's own `canEnable` is responsible for
 *   warning before returning `false`.
 */

/**
 * Shared by every `PostFX` instance on the page — passes are a named
 * vocabulary (like chart types in `Graph3D.chart()`), not per-instance state.
 * @type {Map<string, PostFXPassDefinition>}
 */
const passRegistry = new Map();

/**
 * Named bundles of pass + options combinations, applied atomically by
 * `preset()`. Shared across every `PostFX` instance, same rationale as
 * `passRegistry`.
 * @type {Map<string, Record<string, Object>>}
 */
const presetRegistry = new Map();

/**
 * Thin, chart-agnostic wrapper around Three.js's `EffectComposer`. Owns the
 * base `RenderPass` plus a named set of optional passes, keeping them sorted
 * into a canonical chain order no matter what sequence `enable()` was called
 * in. Chart types (Phase 8) and users request effects through this public
 * API — no chart type is allowed to build its own `EffectComposer`
 * (`CLAUDE.md` §2).
 *
 * Concrete passes ship in later prompts (Prompt 117+) via
 * `PostFX.registerPass()` — this class only owns the composition mechanics:
 * enable/disable/configure, ordering, resizing, and disposal.
 *
 * @example
 * PostFX.registerPass('bloom', {
 *   order: 10,
 *   create: ({ renderer }, opts) => new UnrealBloomPass(undefined, opts.strength),
 * });
 *
 * const fx = graph3d.postfx; // lazily created, bound to the active scene
 * fx.enable('bloom', { strength: 1.2 });
 * fx.configure('bloom', { strength: 0.8 });
 * fx.enabled(); // ['bloom']
 * fx.disable('bloom');
 */
export class PostFX {
  /** @type {EffectComposer} */
  #composer;

  /** @type {RenderPass} */
  #renderPass;

  /** @type {import('three').WebGLRenderer} */
  #renderer;

  /** @type {import('../core/CapabilityProbe.js').Capabilities|undefined} */
  #capabilities;

  /** @type {Map<string, {pass: *, opts: Object}>} */
  #active = new Map();

  /** @type {string[]|null} */
  #manualOrder = null;

  /** @type {boolean} */
  #disposed = false;

  /**
   * @param {Object} options
   * @param {import('three').WebGLRenderer} options.renderer
   * @param {import('three').Scene} options.scene
   * @param {import('three').Camera} options.camera
   * @param {import('../core/CapabilityProbe.js').Capabilities} [options.capabilities] -
   *   Passed through to passes' `canEnable`/`create` as `ctx.capabilities`
   *   (e.g. `ssr`'s weak-GPU auto-disable). Optional — omitting it just means
   *   capability-gated passes can't gate on anything.
   * @throws {TypeError} If `renderer`, `scene`, or `camera` is missing.
   * @example new PostFX({ renderer: g.renderer.three, scene: scene.three, camera: scene.camera.three, capabilities: g.capabilities });
   */
  constructor({ renderer, scene, camera, capabilities } = {}) {
    if (!renderer) {
      throw new TypeError('PostFX: renderer is required.');
    }
    if (!scene) {
      throw new TypeError('PostFX: scene is required.');
    }
    if (!camera) {
      throw new TypeError('PostFX: camera is required.');
    }
    this.#renderer = renderer;
    this.#capabilities = capabilities;
    this.#composer = new EffectComposer(renderer);
    this.#renderPass = new RenderPass(scene, camera);
    this.#composer.addPass(this.#renderPass);
    this.#autoActivateFogPasses(scene);
  }

  /**
   * Register a named pass type so it can be turned on with `enable(name)`.
   * Called once per pass module at import time (Prompt 117+) — the registry
   * is shared by every `PostFX` instance on the page, not per-instance state.
   *
   * @param {string} name
   * @param {PostFXPassDefinition} definition
   * @throws {TypeError} If `name` is not a non-empty string, `definition.create`
   *   is not a function, or `definition.order` is not a finite number.
   * @returns {void}
   * @example PostFX.registerPass('vignette', { order: 90, create: () => new VignettePass() });
   */
  static registerPass(name, definition) {
    if (typeof name !== 'string' || name.length === 0) {
      throw new TypeError(
        `PostFX.registerPass: name must be a non-empty string, received ${JSON.stringify(name)}.`,
      );
    }
    if (!definition || typeof definition.create !== 'function') {
      throw new TypeError(
        `PostFX.registerPass('${name}'): definition.create must be a function.`,
      );
    }
    if (typeof definition.order !== 'number' || !Number.isFinite(definition.order)) {
      throw new TypeError(
        `PostFX.registerPass('${name}'): definition.order must be a finite number.`,
      );
    }
    passRegistry.set(name, definition);
  }

  /**
   * Register a named preset — a bundle of pass+options combinations applied
   * atomically by `preset(name)`. Called once per preset module at import
   * time (`postfx/presets.js`), same rationale as `registerPass`.
   *
   * @param {string} name
   * @param {Record<string, Object>} passOpts - Map of registered pass name to
   *   the options `enable()` should be called with for that pass.
   * @throws {TypeError} If `name` is not a non-empty string, or `passOpts` is
   *   not a plain object.
   * @returns {void}
   * @example PostFX.registerPreset('minimal', { fxaa: {} });
   */
  static registerPreset(name, passOpts) {
    if (typeof name !== 'string' || name.length === 0) {
      throw new TypeError(
        `PostFX.registerPreset: name must be a non-empty string, received ${JSON.stringify(name)}.`,
      );
    }
    if (!passOpts || typeof passOpts !== 'object') {
      throw new TypeError(`PostFX.registerPreset('${name}'): passOpts must be a plain object.`);
    }
    presetRegistry.set(name, passOpts);
  }

  /**
   * Turn on a registered pass. Calling `enable()` again on an
   * already-enabled pass is equivalent to `configure()` with the new options.
   *
   * @param {string} name - A name previously passed to `registerPass()`.
   * @param {Object} [opts={}]
   * @returns {this}
   * @throws {TypeError} If `name` is not a non-empty string.
   * @throws {Error} If `name` is not a registered pass, or if disposed.
   * @example fx.enable('bloom', { strength: 1.2 });
   */
  enable(name, opts = {}) {
    this.#assertNotDisposed('enable');
    if (typeof name !== 'string' || name.length === 0) {
      throw new TypeError(
        `PostFX.enable: name must be a non-empty string, received ${JSON.stringify(name)}.`,
      );
    }
    if (this.#active.has(name)) {
      return this.configure(name, opts);
    }
    const definition = passRegistry.get(name);
    if (!definition) {
      const registered = [...passRegistry.keys()];
      throw new Error(
        `PostFX.enable: unknown pass '${name}'. ` +
          `Expected one of: [${registered.length ? registered.join(', ') : 'none registered yet'}].`,
      );
    }
    const ctx = {
      scene: this.#renderPass.scene,
      camera: this.#renderPass.camera,
      renderer: this.#renderer,
      size: { width: this.#renderer.domElement.width, height: this.#renderer.domElement.height },
      capabilities: this.#capabilities,
    };
    if (definition.canEnable && !definition.canEnable(ctx, opts)) {
      return this;
    }
    const pass = definition.create(ctx, opts);
    this.#active.set(name, { pass, opts });
    this.#reorder();
    return this;
  }

  /**
   * Turn off a pass, disposing its GPU resources. No-op if `name` isn't
   * currently enabled (mirrors `Set`/`Map`-delete semantics used elsewhere
   * in this codebase, e.g. `Graph3DLoop.remove`).
   *
   * @param {string} name
   * @returns {this}
   * @throws {Error} If disposed.
   * @example fx.disable('bloom');
   */
  disable(name) {
    this.#assertNotDisposed('disable');
    const entry = this.#active.get(name);
    if (!entry) return this;
    this.#composer.removePass(entry.pass);
    entry.pass.dispose();
    this.#active.delete(name);
    return this;
  }

  /**
   * Update options on an already-enabled pass.
   *
   * @param {string} name
   * @param {Object} opts - Shallow-merged into the pass's stored options.
   * @returns {this}
   * @throws {Error} If `name` is not currently enabled, or if disposed.
   * @example fx.configure('bloom', { strength: 0.5 });
   */
  configure(name, opts) {
    this.#assertNotDisposed('configure');
    const entry = this.#active.get(name);
    if (!entry) {
      throw new Error(
        `PostFX.configure: pass '${name}' is not enabled. Call enable('${name}', opts) first.`,
      );
    }
    const merged = { ...entry.opts, ...opts };
    const definition = passRegistry.get(name);
    if (definition.configure) {
      definition.configure(entry.pass, merged);
    } else {
      Object.assign(entry.pass, merged);
    }
    entry.opts = merged;
    return this;
  }

  /**
   * Replace whatever passes are currently active with a named, tuned bundle.
   * Disables every currently-enabled pass first, then enables exactly the
   * preset's passes — a deterministic "look" swap, not a merge with
   * whatever was on before. Also clears any `pipeline()` order override, for
   * the same reason: a preset is a fresh, deterministic bundle, not a merge.
   *
   * @param {string} name - A name previously passed to `registerPreset()`.
   * @returns {this}
   * @throws {Error} If `name` is not a registered preset, or if disposed.
   * @example fx.preset('cinematic');
   */
  preset(name) {
    this.#assertNotDisposed('preset');
    const passOpts = presetRegistry.get(name);
    if (!passOpts) {
      const registered = [...presetRegistry.keys()];
      throw new Error(
        `PostFX.preset: unknown preset '${name}'. ` +
          `Expected one of: [${registered.length ? registered.join(', ') : 'none registered yet'}].`,
      );
    }
    for (const activeName of [...this.#active.keys()]) {
      this.disable(activeName);
    }
    this.#manualOrder = null;
    for (const [passName, opts] of Object.entries(passOpts)) {
      this.enable(passName, opts);
    }
    return this;
  }

  /**
   * @returns {string[]} Names of currently-enabled passes, in their actual
   *   chain order (ascending `order`, or `pipeline()`'s override if set —
   *   not `enable()` call order).
   * @throws {Error} If disposed.
   * @example fx.enabled(); // ['ssao', 'bloom', 'fxaa']
   */
  enabled() {
    this.#assertNotDisposed('enabled');
    return this.#sortedNames();
  }

  /**
   * Escape hatch (Prompt 123) for full manual control over the pass chain's
   * render order, overriding the registered `order`-field auto-sort that
   * `enable()`/`disable()` normally maintain. Every registered pass still
   * declares its own `order` (used by presets, by passes enabled after this
   * override is set, and as the automatic sort whenever no override is
   * active) — `pipeline()` doesn't change or remove that, it just lets one
   * call fully override the *current* chain sequence for cases the fixed
   * `order` values can't express (e.g. wanting `bloom` before `ssao` for a
   * specific look).
   *
   * The override is a live filter, not a frozen snapshot: if a pass named in
   * `order` is later `disable()`d, it's simply skipped; if a *new* pass is
   * `enable()`d afterward that wasn't named in `order`, it's appended at the
   * end (sorted among any other such newcomers by their own registered
   * `order`) rather than silently dropped from the chain.
   *
   * @param {string[]|null} order - Every currently-enabled pass name, exactly
   *   once, in the desired render sequence. Pass `null` to clear the
   *   override and return to automatic `order`-based sorting.
   * @returns {this}
   * @throws {TypeError} If `order` is neither `null` nor an array.
   * @throws {Error} If `order` contains a name that isn't currently enabled,
   *   a duplicate name, or omits a currently-enabled pass; or if disposed.
   * @example
   * fx.enable('ssao').enable('bloom').enable('fxaa');
   * fx.pipeline(['bloom', 'ssao', 'fxaa']); // bloom now runs first
   * fx.pipeline(null); // back to automatic order-based sorting
   */
  pipeline(order) {
    this.#assertNotDisposed('pipeline');
    if (order === null) {
      this.#manualOrder = null;
      this.#reorder();
      return this;
    }
    if (!Array.isArray(order)) {
      throw new TypeError(`PostFX.pipeline: order must be an array of pass names or null, received ${JSON.stringify(order)}.`);
    }
    const activeNames = new Set(this.#active.keys());
    const seen = new Set();
    for (const name of order) {
      if (!activeNames.has(name)) {
        throw new Error(`PostFX.pipeline: '${name}' is not a currently-enabled pass. Enabled: [${[...activeNames].join(', ')}].`);
      }
      if (seen.has(name)) {
        throw new Error(`PostFX.pipeline: duplicate pass name '${name}' in order.`);
      }
      seen.add(name);
    }
    if (seen.size !== activeNames.size) {
      const missing = [...activeNames].filter((name) => !seen.has(name));
      throw new Error(`PostFX.pipeline: order is missing currently-enabled pass(es): [${missing.join(', ')}].`);
    }
    this.#manualOrder = order;
    this.#reorder();
    return this;
  }

  /**
   * Point the base render pass at a different scene/camera. `Graph3D` calls
   * this every frame so `postfx` keeps following whichever scene is active.
   *
   * @param {import('three').Scene} scene
   * @param {import('three').Camera} camera
   * @throws {Error} If disposed.
   * @returns {void}
   * @example fx.setSceneCamera(scene.three, scene.camera.three);
   */
  setSceneCamera(scene, camera) {
    this.#assertNotDisposed('setSceneCamera');
    this.#renderPass.scene = scene;
    this.#renderPass.camera = camera;
    this.#autoActivateFogPasses(scene);
  }

  /**
   * Resize the composer's internal render targets and every active pass.
   *
   * @param {number} width
   * @param {number} height
   * @throws {Error} If disposed.
   * @returns {void}
   * @example fx.setSize(window.innerWidth, window.innerHeight);
   */
  setSize(width, height) {
    this.#assertNotDisposed('setSize');
    this.#composer.setSize(width, height);
  }

  /**
   * Render one frame through the full pass chain.
   *
   * @param {number} [deltaSeconds]
   * @throws {Error} If disposed.
   * @returns {void}
   * @example fx.render(deltaSeconds);
   */
  render(deltaSeconds) {
    this.#assertNotDisposed('render');
    this.#composer.render(deltaSeconds);
  }

  /**
   * Release every active pass and the composer's render targets.
   * Idempotent — safe to call twice.
   * @returns {void}
   * @example fx.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    for (const { pass } of this.#active.values()) {
      pass.dispose();
    }
    this.#active.clear();
    this.#composer.dispose();
    this.#disposed = true;
  }

  /**
   * Auto-enables passes a scene's environment configuration implies it
   * wants, without the caller needing to know `postfx` exists. Currently
   * just `godRays` for `GraphSceneEnvironment.setFog('volumetric-cinematic')`,
   * which flags the scene via `scene.userData.graph3d_fogPreset` (see that
   * method's own docs — `scene/` can't import `postfx/` per CLAUDE.md §1.4,
   * so a plain `userData` flag is the wire format between the two layers).
   * Runs once per construction/`setSceneCamera` call, not per frame — this is
   * a scene-switch hook, not a live subscription to `setFog()` calls made
   * after `postfx` already exists (`GraphSceneEnvironment` has no way to
   * notify it either way — see `skipping_list.md`).
   * @param {import('three').Scene} scene
   */
  #autoActivateFogPasses(scene) {
    if (scene.userData?.graph3d_fogPreset === 'volumetric-cinematic' && !this.#active.has('godRays')) {
      this.enable('godRays');
    }
  }

  /** @returns {string[]} */
  #sortedNames() {
    const byRegisteredOrder = (a, b) => passRegistry.get(a).order - passRegistry.get(b).order;
    if (!this.#manualOrder) {
      return [...this.#active.keys()].sort(byRegisteredOrder);
    }
    const ordered = this.#manualOrder.filter((name) => this.#active.has(name));
    const orderedSet = new Set(ordered);
    const newcomers = [...this.#active.keys()].filter((name) => !orderedSet.has(name)).sort(byRegisteredOrder);
    return [...ordered, ...newcomers];
  }

  /** Re-sorts the composer's pass chain to match registered `order` values. RenderPass is never touched, so it stays first. */
  #reorder() {
    for (const { pass } of this.#active.values()) {
      this.#composer.removePass(pass);
    }
    for (const name of this.#sortedNames()) {
      this.#composer.addPass(this.#active.get(name).pass);
    }
  }

  /**
   * @param {string} method
   * @throws {Error}
   */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`PostFX.${method}: instance has been disposed.`);
    }
  }
}
