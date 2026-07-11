import { generator } from '../compose/index.js';
import { traceContours } from '../compose/generator/contour.js';
import { GraphChart } from './GraphChart.js';
import { resolveChartMaterial } from './materialField.js';
import { GraphObjectFactory, GraphLine } from '../object/index.js';

const MESH_NAME = 'surface';
const CONTOUR_COLOR = 0x000000;

/**
 * `GraphChart` specialized for surface plots (Prompt 135). Wraps
 * `generator.surface()` and renders one continuous triangulated heightfield
 * mesh (`GraphObjectFactory.createTriangleMesh`) — a surface has no
 * per-datum concept the way a bar/point/line chart does (it's configured via
 * `.values()`/`.xDomain()`/`.zDomain()`/`.resolution()`, mirroring the
 * generator's own chainable API directly), so `GraphChart`'s inherited
 * `x()`/`y()`/`z()`/`data()`/`color()`/`size()`/`shape()`/`filter()`/`sort()`/
 * `on()`/`selection()` are all inert here — only `.material()` (still
 * consumed, via `chart/materialField.js`) and `.transition()`/`destroy()`
 * scaffolding carry over meaningfully.
 *
 * `.contours(levels)` optionally overlays isolines at the given height
 * values, traced via marching squares (`compose/generator/contour.js`) over
 * the same already-computed heightfield grid — each traced path becomes its
 * own `GraphLine` (Prompt 133's `object/GraphLine.js`, reused as-is).
 * @example
 * new SurfaceChart(scene)
 *   .values((x, z) => Math.sin(x) * Math.cos(z))
 *   .xDomain([-3, 3])
 *   .zDomain([-3, 3])
 *   .resolution(64)
 *   .contours([-0.5, 0, 0.5])
 *   .render();
 */
export class SurfaceChart extends GraphChart {
  /** @type {{compute: Function, values: Function, xDomain: Function, zDomain: Function, resolution: Function}} */
  #surfaceGenerator;

  /** @type {number[]|null} */
  #contourLevels = null;

  /** @type {import('../object/GraphMesh.js').GraphMesh|null} */
  #mesh = null;

  /** @type {GraphLine[]} */
  #contourLines = [];

  /** @type {boolean} Whether `render()` has materialized the surface yet. */
  #rendered = false;

  /** @type {boolean} */
  #destroyed = false;

  /**
   * @param {object} scene The raw `THREE.Scene` this chart will attach to.
   * @throws {TypeError} If `scene` is falsy.
   */
  constructor(scene) {
    const heightfield = generator.surface();
    super(scene, heightfield);
    this.#surfaceGenerator = heightfield;
  }

  /**
   * Gets or sets the heightfield source — passes straight through to
   * `generator.surface().values()`.
   * @param {(number[][]|((x: number, z: number) => number))} [source]
   * @returns {Function|this}
   * @example chart.values((x, z) => Math.sin(x) * Math.cos(z));
   */
  values(source) {
    this.#assertNotDestroyed('values');
    if (source === undefined) return this.#surfaceGenerator.values();
    this.#surfaceGenerator.values(source);
    return this;
  }

  /**
   * Gets or sets the x range sampled when `.values()` is a function —
   * passes straight through to `generator.surface().xDomain()`.
   * @param {[number, number]} [domain]
   * @returns {[number, number]|this}
   * @throws {TypeError} If `domain` isn't a `[min, max]` pair of finite numbers.
   * @example chart.xDomain([-3, 3]);
   */
  xDomain(domain) {
    this.#assertNotDestroyed('xDomain');
    if (domain === undefined) return this.#surfaceGenerator.xDomain();
    this.#surfaceGenerator.xDomain(domain);
    return this;
  }

  /**
   * Gets or sets the z range sampled when `.values()` is a function —
   * passes straight through to `generator.surface().zDomain()`.
   * @param {[number, number]} [domain]
   * @returns {[number, number]|this}
   * @throws {TypeError} If `domain` isn't a `[min, max]` pair of finite numbers.
   * @example chart.zDomain([-3, 3]);
   */
  zDomain(domain) {
    this.#assertNotDestroyed('zDomain');
    if (domain === undefined) return this.#surfaceGenerator.zDomain();
    this.#surfaceGenerator.zDomain(domain);
    return this;
  }

  /**
   * Gets or sets the grid segments per axis sampled when `.values()` is a
   * function — passes straight through to `generator.surface().resolution()`.
   * @param {number} [segments]
   * @returns {number|this}
   * @throws {TypeError} If `segments` isn't a positive integer.
   * @example chart.resolution(64);
   */
  resolution(segments) {
    this.#assertNotDestroyed('resolution');
    if (segments === undefined) return this.#surfaceGenerator.resolution();
    this.#surfaceGenerator.resolution(segments);
    return this;
  }

  /**
   * Gets or sets the height levels to overlay as contour lines, traced via
   * marching squares (`compose/generator/contour.js`) over the same
   * heightfield grid. Omit (or pass `null`) for no overlay — the default.
   * @param {number[]|null} [levels]
   * @returns {number[]|null|this}
   * @throws {TypeError} If `levels` is given and isn't `null` or an array of finite numbers.
   * @example chart.contours([-0.5, 0, 0.5]);
   */
  contours(levels) {
    this.#assertNotDestroyed('contours');
    if (levels === undefined) return this.#contourLevels;
    if (levels !== null && (!Array.isArray(levels) || levels.some((v) => typeof v !== 'number' || !Number.isFinite(v)))) {
      throw new TypeError(`SurfaceChart.contours: expected null or an array of finite numbers, received ${JSON.stringify(levels)}.`);
    }
    this.#contourLevels = levels;
    return this;
  }

  /**
   * First call materializes the heightfield (and any configured contour
   * overlay); every later call routes to `update()`.
   * @returns {this}
   * @throws {TypeError} If `.values()` hasn't been set, or is a grid smaller than 2x2.
   * @see GraphChart#render
   */
  render() {
    this.#assertNotDestroyed('render');
    if (this.#rendered) return this.update();
    this.#sync();
    this.#rendered = true;
    return this;
  }

  /**
   * Recomputes the heightfield (and contour overlay) and replaces the live
   * mesh/lines.
   * @returns {this}
   * @throws {Error} If `render()` hasn't successfully run yet.
   * @see GraphChart#update
   */
  update() {
    this.#assertNotDestroyed('update');
    if (!this.#rendered) {
      throw new Error('SurfaceChart.update: call render() first.');
    }
    this.#sync();
    return this;
  }

  /**
   * Disposes the live surface mesh and any contour lines, then defers to
   * `GraphChart.destroy()`. Idempotent.
   * @returns {void}
   * @see GraphChart#destroy
   */
  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    if (this.#mesh) this.#mesh.dispose();
    this.#mesh = null;
    for (const line of this.#contourLines) line.dispose();
    this.#contourLines = [];
    super.destroy();
  }

  /** Shared by `render()`/`update()` (CLAUDE.md §1.1 DRY two-strike rule). */
  #sync() {
    const { positions, indices, normals, rows, cols } = this.#surfaceGenerator.compute();

    if (this.#mesh) this.#mesh.dispose();
    this.#mesh = GraphObjectFactory.createTriangleMesh(MESH_NAME, {
      scene: this.scene,
      positions,
      indices,
      normals,
      material: resolveChartMaterial(this.material()),
    });

    for (const line of this.#contourLines) line.dispose();
    this.#contourLines = [];
    if (this.#contourLevels) {
      const paths = traceContours(positions, rows, cols, this.#contourLevels);
      paths.forEach((path, i) => {
        this.#contourLines.push(
          new GraphLine({ scene: this.scene, name: `${MESH_NAME}-contour-${i}`, color: CONTOUR_COLOR }).setPositions(path.positions),
        );
      });
    }
  }

  /** @param {string} method @throws {Error} */
  #assertNotDestroyed(method) {
    if (this.#destroyed) {
      throw new Error(`SurfaceChart.${method}: this chart has been destroyed.`);
    }
  }
}
