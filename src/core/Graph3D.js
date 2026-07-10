import { CapabilityProbe } from './CapabilityProbe.js';
import { Graph3DRenderer } from './Graph3DRenderer.js';
import { loop } from './Graph3DLoop.js';
import { registry } from './Graph3DRegistry.js';
import { FrameBudget } from './FrameBudget.js';
import { WorkerPool } from './WorkerPool.js';
import { createWorkerFactory } from './worker/workerBlob.js';
// Cross-layer import: Graph3D is the composition root and owns scene lifecycle.
import { GraphScene } from '../scene/index.js';
// Cross-layer import: same composition-root exception as GraphScene above (CLAUDE.md §1.4).
import { PostFX } from '../postfx/index.js';
// Cross-layer import: a third instance of the same composition-root exception
// (Prompt 140) — Graph3D.chart(typeName) is the one place that legitimately
// wires every registered chart type to a live instance; chart/ itself never
// imports back into core/ (only into core/Graph3DLoop.js/GraphDisposal.js,
// two leaf utility modules), so this doesn't close a cycle.
import { BarChart, LineChart, ScatterChart, AreaChart, SurfaceChart, HeatmapChart, NetworkChart, TreeChart, PackChart, PieChart, VolumeChart } from '../chart/index.js';

// A suggestion beyond this edit distance is more likely to be noise than a
// genuine typo (e.g. 'volume' vs 'network' — both valid names, unrelated) —
// Graph3D.chart() falls back to listing every registered type instead.
const MAX_SUGGESTION_DISTANCE = 3;

/**
 * Classic Wagner–Fischer edit distance between two strings — the minimum
 * number of single-character insertions/deletions/substitutions to turn `a`
 * into `b`. Used only for `Graph3D.chart()`'s "did you mean" suggestion; not
 * exported, since chart-type-name typo correction is its only consumer.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshteinDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) distances[i][0] = i;
  for (let j = 0; j < cols; j++) distances[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      distances[i][j] = Math.min(
        distances[i - 1][j] + 1, // deletion
        distances[i][j - 1] + 1, // insertion
        distances[i - 1][j - 1] + substitutionCost, // substitution
      );
    }
  }
  return distances[rows - 1][cols - 1];
}

/**
 * The registered chart type name closest to `typeName` by edit distance, or
 * `null` if nothing is within `MAX_SUGGESTION_DISTANCE`.
 * @param {string} typeName
 * @param {string[]} candidates
 * @returns {string|null}
 */
function closestChartTypeName(typeName, candidates) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = levenshteinDistance(typeName, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return bestDistance <= MAX_SUGGESTION_DISTANCE ? best : null;
}

/**
 * @typedef {Object} Graph3DOptions
 * @property {HTMLCanvasElement} canvas - Target canvas. Required.
 * @property {string} [hdr] - URL of an HDR environment map applied when a scene is created (Phase 2).
 * @property {boolean} [antialias=true]
 * @property {number} [pixelRatio] - Defaults to `window.devicePixelRatio`.
 * @property {boolean} [autoResize=true] - Attach a ResizeObserver to keep the canvas filling its parent.
 * @property {string} [theme] - Named visual theme applied by the material layer (Phase 6).
 * @property {boolean} [respectReducedMotion=true] - Suppresses transitions when the OS prefers reduced motion.
 */

/**
 * Top-level Graph3D entry point. Composes all Layer-1 core primitives:
 * capability detection, WebGL renderer, animation loop, instance registry,
 * frame budget, and a lazily-created worker pool.
 *
 * @example
 * const g = new Graph3D({ canvas: document.getElementById('canvas') });
 * console.log(g.capabilities.webgl2);
 * g.dispose();
 *
 * @example
 * const g = new Graph3D({ canvas, pixelRatio: 2, hdr: '/env/studio.hdr', theme: 'studio-dark' });
 * g.setActiveScene(g.createScene('main'));
 * g.chart('bar').data(values, (d) => d.id).render();
 */
export class Graph3D {
  /** @type {CapabilityProbe} */
  #probe;

  /** @type {Graph3DRenderer} */
  #renderer;

  /** @type {FrameBudget} */
  #frameBudget;

  /** @type {WorkerPool|null} */
  #workerPool = null;

  /** @type {PostFX|null} */
  #postfx = null;

  /** @type {Map<string, *>} */
  #scenes = new Map();

  /** @type {*|null} — set by createScene/setActiveScene (Prompt 22) */
  #activeScene = null;

  /** @type {boolean} */
  #disposed = false;

  /** @type {boolean} */
  #paused = false;

  /** @type {function(number, number): void} — stored reference for loop.remove() */
  #tick;

  /** @type {ResizeObserver|null} */
  #resizeObserver = null;

  /**
   * Chart type registry (Prompt 140) — every concrete `chart/` class,
   * keyed by the fluent-API name `.chart(typeName)` dispatches on.
   * @type {Map<string, function(new:*, object): *>}
   */
  static #chartTypes = new Map([
    ['bar', BarChart],
    ['line', LineChart],
    ['scatter', ScatterChart],
    ['area', AreaChart],
    ['surface', SurfaceChart],
    ['heatmap', HeatmapChart],
    ['network', NetworkChart],
    ['tree', TreeChart],
    ['pack', PackChart],
    ['pie', PieChart],
    ['volume', VolumeChart],
  ]);

  // Stored for higher layers: hdr → GraphSceneEnvironment (Phase 2), theme → material presets (Phase 6).
  /** @type {string|undefined} */
  hdr;

  /** @type {string|undefined} */
  theme;

  /** @type {boolean} */
  autoResize;

  /** @type {boolean} */
  respectReducedMotion;

  /** Library version string, matching `package.json#version`. */
  static version = '0.1.0';

  /**
   * @param {Graph3DOptions} options
   * @throws {TypeError} If `canvas` is missing.
   */
  constructor({
    canvas,
    hdr,
    antialias = true,
    pixelRatio,
    autoResize = true,
    theme,
    respectReducedMotion = true,
  } = {}) {
    if (!canvas) {
      throw new TypeError(
        'Graph3D: canvas is required. Pass an HTMLCanvasElement.',
      );
    }

    this.hdr = hdr;
    this.theme = theme;
    this.autoResize = autoResize;
    this.respectReducedMotion = respectReducedMotion;

    // Renderer first — CapabilityProbe reuses the same GL context rather than opening a second one.
    this.#renderer = new Graph3DRenderer({ canvas, antialias, pixelRatio });
    this.#probe = new CapabilityProbe(canvas);
    this.#frameBudget = new FrameBudget();

    registry.register(this);

    this.#tick = (deltaSec) => {
      this.#frameBudget.record(deltaSec * 1000);

      if (!this.#activeScene) return;

      const threeRenderer = this.#renderer.three;
      const el = threeRenderer.domElement;
      const W = el.width;
      const H = el.height;
      const threeScene = this.#activeScene.three;
      const threeCamera = this.#activeScene.camera.three;
      const viewports = this.#activeScene.viewports;

      // PostFX composites the whole canvas through a single EffectComposer
      // pass chain, which doesn't reconcile with scissored multi-viewport
      // rendering — it only applies to the common single-viewport case.
      if (this.#postfx && viewports.length === 1 && this.#postfx.enabled().length > 0) {
        this.#postfx.setSceneCamera(threeScene, threeCamera);
        threeRenderer.setViewport(0, 0, W, H);
        threeRenderer.setScissorTest(false);
        this.#postfx.render(deltaSec);
        return;
      }

      for (const vp of viewports) {
        threeRenderer.setViewport(
          Math.round(vp.x * W),
          Math.round(vp.y * H),
          Math.round(vp.width * W),
          Math.round(vp.height * H),
        );
        threeRenderer.setScissor(
          Math.round(vp.x * W),
          Math.round(vp.y * H),
          Math.round(vp.width * W),
          Math.round(vp.height * H),
        );
        threeRenderer.setScissorTest(true);
        threeRenderer.render(threeScene, threeCamera);
      }

      threeRenderer.setScissorTest(false);
    };
    loop.add(this.#tick);

    if (autoResize && typeof ResizeObserver !== 'undefined') {
      const parent = canvas.parentElement;
      if (parent) {
        this.#resizeObserver = new ResizeObserver((entries) => {
          const { width, height } = entries[0].contentRect;
          this.setSize(Math.round(width), Math.round(height));
        });
        this.#resizeObserver.observe(parent);
      }
    }
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  /**
   * The underlying `Graph3DRenderer` instance.
   * @returns {Graph3DRenderer}
   */
  get renderer() {
    return this.#renderer;
  }

  /**
   * Frozen capabilities snapshot from `CapabilityProbe`.
   * @returns {import('./CapabilityProbe.js').Capabilities}
   */
  get capabilities() {
    return this.#probe.capabilities;
  }

  /**
   * The shared `FrameBudget` watchdog for this instance.
   * @returns {FrameBudget}
   */
  get frameBudget() {
    return this.#frameBudget;
  }

  /**
   * The `WorkerPool` for off-thread data tasks, created on first access.
   * Uses the base64-inlined worker bootstrap (no separate worker file needed).
   *
   * @returns {WorkerPool}
   * @throws {Error} If called after `dispose()`.
   * @example const sorted = await g.workers.exec('sort', { data: myArray });
   */
  get workers() {
    this.#assertNotDisposed('workers');
    if (!this.#workerPool) {
      this.#workerPool = new WorkerPool({ workerFactory: createWorkerFactory() });
    }
    return this.#workerPool;
  }

  /**
   * The `PostFX` pipeline bound to this instance's active scene, created
   * lazily on first access. Requires an active scene (`setActiveScene()`)
   * to exist first — the underlying `EffectComposer` needs a concrete scene
   * and camera to render.
   *
   * @returns {PostFX}
   * @throws {Error} If called after `dispose()`, or before any scene is active.
   * @example
   * g.setActiveScene('main');
   * g.postfx.enable('bloom', { strength: 1.2 });
   */
  get postfx() {
    this.#assertNotDisposed('postfx');
    if (!this.#postfx) {
      if (!this.#activeScene) {
        throw new Error(
          'Graph3D.postfx: no active scene. Call setActiveScene() before accessing postfx.',
        );
      }
      this.#postfx = new PostFX({
        renderer: this.#renderer.three,
        scene: this.#activeScene.three,
        camera: this.#activeScene.camera.three,
        capabilities: this.capabilities,
      });
    }
    return this.#postfx;
  }

  /**
   * Map of all scenes keyed by name. Populated by `createScene()` (Prompt 22).
   * @returns {Map<string, *>}
   */
  get scenes() {
    return this.#scenes;
  }

  /**
   * The currently active scene, or `null` before any scene is created.
   * Updated by `setActiveScene()` (Prompt 22).
   * @returns {*|null}
   */
  get activeScene() {
    return this.#activeScene;
  }

  // ── Instance methods ───────────────────────────────────────────────────────

  /**
   * Resize the canvas drawing buffer and notify the active scene's camera.
   *
   * @param {number} width - Target width in CSS pixels (rounded to integers by ResizeObserver).
   * @param {number} height - Target height in CSS pixels.
   * @throws {Error} If called after `dispose()`.
   * @example g.setSize(window.innerWidth, window.innerHeight);
   */
  setSize(width, height) {
    this.#assertNotDisposed('setSize');
    this.#renderer.setSize(width, height);
    this.#postfx?.setSize(width, height);
  }

  /**
   * Pause this instance: unsubscribes the loop tick so this graph stops rendering.
   * No-op if already paused or disposed. The registry's `pauseAll()` calls this.
   *
   * @example g.pause(); // e.g. when the UI panel containing the graph is hidden
   */
  pause() {
    if (this.#disposed || this.#paused) return;
    this.#paused = true;
    loop.remove(this.#tick);
  }

  /**
   * Resume this instance after a `pause()` call. Re-subscribes the loop tick.
   * No-op if not paused or disposed. The registry's `resumeAll()` calls this.
   *
   * @example g.resume();
   */
  resume() {
    if (this.#disposed || !this.#paused) return;
    this.#paused = false;
    loop.add(this.#tick);
  }

  /**
   * Create a named scene and register it with this instance.
   * The first scene created does not automatically become active —
   * call `setActiveScene()` to begin rendering it.
   *
   * @param {string} name - Unique scene identifier.
   * @returns {GraphScene}
   * @throws {TypeError} If `name` is not a non-empty string.
   * @throws {Error} If a scene with this name already exists.
   * @throws {Error} If called after `dispose()`.
   * @example
   * const scene = g.createScene('main');
   * g.setActiveScene('main');
   */
  createScene(name) {
    this.#assertNotDisposed('createScene');
    if (typeof name !== 'string' || name.length === 0) {
      throw new TypeError(
        `Graph3D.createScene: name must be a non-empty string, received ${JSON.stringify(name)}.`,
      );
    }
    if (this.#scenes.has(name)) {
      throw new Error(`Graph3D.createScene: scene '${name}' already exists.`);
    }
    const scene = new GraphScene({ graph3d: this, name });
    this.#scenes.set(name, scene);
    return scene;
  }

  /**
   * Set the scene rendered each frame. Accepts either a scene name
   * (previously passed to `createScene`) or the `GraphScene` instance itself.
   *
   * @param {string|GraphScene} nameOrScene
   * @throws {TypeError} If `nameOrScene` is neither a string nor a GraphScene.
   * @throws {Error} If the named scene does not exist in this instance.
   * @throws {Error} If the GraphScene instance was not created by this instance.
   * @throws {Error} If called after `dispose()`.
   * @example
   * g.setActiveScene('main');
   * // or
   * g.setActiveScene(scene);
   */
  setActiveScene(nameOrScene) {
    this.#assertNotDisposed('setActiveScene');
    let scene;
    if (typeof nameOrScene === 'string') {
      scene = this.#scenes.get(nameOrScene);
      if (!scene) {
        const available = [...this.#scenes.keys()];
        throw new Error(
          `Graph3D.setActiveScene: scene '${nameOrScene}' not found. ` +
            `Available: [${available.length ? available.join(', ') : 'none'}].`,
        );
      }
    } else if (nameOrScene instanceof GraphScene) {
      if (![...this.#scenes.values()].includes(nameOrScene)) {
        throw new Error(
          'Graph3D.setActiveScene: the provided GraphScene is not owned by this Graph3D instance.',
        );
      }
      scene = nameOrScene;
    } else {
      throw new TypeError(
        `Graph3D.setActiveScene: expected a scene name (string) or GraphScene instance, received ${typeof nameOrScene}.`,
      );
    }
    this.#activeScene = scene;
  }

  /**
   * Entry point to the fluent chart API (Prompt 140). Looks up a registered
   * chart type and returns a new chart instance bound to the active scene's
   * raw `THREE.Scene` (`setActiveScene()` must be called first — the same
   * requirement `postfx` already has, for the same reason: there's no scene
   * to attach anything to otherwise).
   *
   * @param {'bar'|'line'|'scatter'|'area'|'surface'|'heatmap'|'network'|'tree'|'pack'|'pie'|'volume'} typeName
   * @returns {import('../chart/index.js').GraphChart} A new, unconfigured chart instance — call its own `.data(...)`/`.render()`, etc.
   * @throws {TypeError} If `typeName` is not a non-empty string.
   * @throws {Error} If no active scene exists (call `setActiveScene()` first).
   * @throws {Error} If `typeName` is not a registered chart type — the message
   *   suggests the closest registered name (Levenshtein distance ≤ 3) when one exists.
   * @throws {Error} If called after `dispose()`.
   * @example
   * g.setActiveScene(g.createScene('main'));
   * g.chart('bar').data(values, (d) => d.id).x((d) => d.label).y((d) => d.value).render();
   */
  chart(typeName) {
    this.#assertNotDisposed('chart');
    if (typeof typeName !== 'string' || typeName.length === 0) {
      throw new TypeError(
        `Graph3D.chart: typeName must be a non-empty string, received ${JSON.stringify(typeName)}.`,
      );
    }
    if (!this.#activeScene) {
      throw new Error(
        'Graph3D.chart: no active scene. Call setActiveScene() before creating a chart.',
      );
    }
    const ChartClass = Graph3D.#chartTypes.get(typeName);
    if (!ChartClass) {
      const registered = [...Graph3D.#chartTypes.keys()];
      const suggestion = closestChartTypeName(typeName, registered);
      const hint = suggestion
        ? `Did you mean '${suggestion}'?`
        : `Expected one of: ${registered.join(', ')}.`;
      throw new Error(`Graph3D.chart: unknown chart type '${typeName}'. ${hint}`);
    }
    return new ChartClass(this.#activeScene.three);
  }

  // ── Static methods ─────────────────────────────────────────────────────────

  /**
   * Dispose all currently registered `Graph3D` instances.
   * Delegates to the page-level `registry.disposeAll()`.
   *
   * @throws {Error} Re-throws the first disposal error after attempting all disposals.
   * @example Graph3D.disposeAll(); // e.g. before a full page teardown
   */
  static disposeAll() {
    registry.disposeAll();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Release all resources: disconnects ResizeObserver, stops the loop tick,
   * disposes the frame budget, disposes the worker pool (if ever created),
   * disposes the renderer, and unregisters from the page-level registry.
   * Idempotent — safe to call twice.
   *
   * @example g.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;

    this.#resizeObserver?.disconnect();
    loop.remove(this.#tick);
    this.#frameBudget.dispose();
    this.#workerPool?.dispose();
    this.#postfx?.dispose();

    // Dispose scenes before the renderer — scene disposal releases GPU resources first.
    for (const scene of this.#scenes.values()) {
      scene.dispose();
    }
    this.#scenes.clear();
    this.#activeScene = null;

    this.#renderer.dispose();
    registry.unregister(this);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * @param {string} method - Caller name for the error message.
   * @throws {Error}
   */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`Graph3D.${method}: instance has been disposed.`);
    }
  }
}
