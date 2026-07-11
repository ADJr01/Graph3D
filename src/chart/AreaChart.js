import { generator } from '../compose/index.js';
import { GraphChart } from './GraphChart.js';
import { applyAxisScaleDomain, resolveAxisAccessor } from './axisField.js';
import { resolveChartMaterial } from './materialField.js';
import { GraphObjectFactory } from '../object/index.js';

const MESH_NAME = 'area-wall';

/**
 * `GraphChart` specialized for area charts (Prompt 135). Wraps
 * `generator.area()`, rendering one continuous extruded "wall" mesh
 * (`GraphObjectFactory.createTriangleMesh`) from each data point's value
 * down to a constant `baseline` — like `LineChart`, this isn't a per-datum
 * position+scale buffer `GraphChart.render()`/`update()` can materialize via
 * `GraphObjectFactory.createBars`/`createPoints`, so `AreaChart` overrides
 * both rather than building on them. It still reuses `GraphChart`'s
 * `x()`/`y()`/`z()`/`material()` field storage and the shared axis
 * scale-fitting / material-resolution helpers (`chart/axisField.js`,
 * `chart/materialField.js`) as-is.
 *
 * Unlike `LineChart`'s same-count-mutates-in-place `GraphLine`, every
 * `update()` here disposes the previous wall and builds a fresh one — no
 * current requirement calls for in-place vertex mutation on a triangulated
 * wall mesh, and profiling first before optimizing is CLAUDE.md §1.3 YAGNI.
 * @example
 * new AreaChart(scene)
 *   .x((d) => d.t, scale.linear().domain([0, 10]).range([-6, 6]))
 *   .y((d) => d.value, scale.linear().domain([0, 100]).range([0, 6]))
 *   .baseline(0)
 *   .curve('catmullRom')
 *   .render();
 */
export class AreaChart extends GraphChart {
  /** @type {{compute: Function, x: Function, y: Function, z: Function, baseline: Function, curve: Function, tension: Function}} */
  #areaGenerator;

  /** @type {import('../object/GraphMesh.js').GraphMesh|null} */
  #mesh = null;

  /** @type {Array|null} The last array passed to `data(arr)`. */
  #data = null;

  /** @type {boolean} Whether `render()` has materialized the wall yet. */
  #rendered = false;

  /** @type {boolean} */
  #destroyed = false;

  /**
   * @param {object} scene The raw `THREE.Scene` this chart will attach to.
   * @throws {TypeError} If `scene` is falsy.
   */
  constructor(scene) {
    const wall = generator.area();
    super(scene, wall);
    this.#areaGenerator = wall;
  }

  /**
   * Gets or sets the raw datum array this chart renders. Unlike
   * `GraphChart.data()`, this doesn't join against a per-datum `Selection`
   * backend — a continuous wall has no such backend (mirrors `LineChart`'s
   * identical `data()` override and its rationale).
   * @param {Array} [arr]
   * @returns {Array|this}
   * @throws {TypeError} If `arr` is given and isn't an array.
   * @example chart.data(rows).baseline(0).render();
   */
  data(arr) {
    this.#assertNotDestroyed('data');
    if (arr === undefined) return this.#data;
    if (!Array.isArray(arr)) {
      throw new TypeError(`AreaChart.data: expected an array, received ${JSON.stringify(arr)}.`);
    }
    this.#data = arr;
    return this;
  }

  /**
   * Gets or sets the wall's bottom edge — passes straight through to
   * `generator.area().baseline()`.
   * @param {number} [value]
   * @returns {number|this}
   * @throws {TypeError} If `value` isn't a finite number.
   * @example chart.baseline(-2);
   */
  baseline(value) {
    this.#assertNotDestroyed('baseline');
    if (value === undefined) return this.#areaGenerator.baseline();
    this.#areaGenerator.baseline(value);
    return this;
  }

  /**
   * Gets or sets the top edge's interpolation curve — passes straight
   * through to `generator.area().curve()` (CLAUDE.md §1.1 DRY: no second
   * curve table lives here).
   * @param {'linear'|'monotone'|'catmullRom'|'bezier'} [type]
   * @returns {string|this}
   * @throws {TypeError} If `type` isn't one of the supported curve names.
   * @example chart.curve('catmullRom');
   */
  curve(type) {
    this.#assertNotDestroyed('curve');
    if (type === undefined) return this.#areaGenerator.curve();
    this.#areaGenerator.curve(type);
    return this;
  }

  /**
   * First call materializes the wall; every later call routes to `update()`.
   * @returns {this}
   * @throws {Error} If `data(arr)` was never called before this render.
   * @see GraphChart#render
   */
  render() {
    this.#assertNotDestroyed('render');
    if (this.#rendered) return this.update();
    if (this.#data === null) {
      throw new Error('AreaChart.render: call data(arr) before render().');
    }
    this.#sync();
    this.#rendered = true;
    return this;
  }

  /**
   * Recomputes the wall from the latest `data()` and replaces the live mesh.
   * @returns {this}
   * @throws {Error} If `render()` hasn't successfully run yet.
   * @see GraphChart#update
   */
  update() {
    this.#assertNotDestroyed('update');
    if (!this.#rendered) {
      throw new Error('AreaChart.update: call render() first.');
    }
    this.#sync();
    return this;
  }

  /**
   * Disposes the live wall mesh, then defers to `GraphChart.destroy()` for
   * handler-clearing and marking the shared inherited setters as destroyed.
   * Idempotent.
   * @returns {void}
   * @see GraphChart#destroy
   */
  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    if (this.#mesh) this.#mesh.dispose();
    this.#mesh = null;
    super.destroy();
  }

  /** Shared by `render()`/`update()` (CLAUDE.md §1.1 DRY two-strike rule). */
  #sync() {
    const data = this.#data;
    applyAxisScaleDomain(this.x(), data);
    applyAxisScaleDomain(this.y(), data);
    applyAxisScaleDomain(this.z(), data);
    this.#areaGenerator.x(resolveAxisAccessor(this.x()));
    this.#areaGenerator.y(resolveAxisAccessor(this.y()));
    this.#areaGenerator.z(resolveAxisAccessor(this.z()));

    const buffers = this.#areaGenerator.compute(data);
    if (this.#mesh) this.#mesh.dispose();
    this.#mesh = GraphObjectFactory.createTriangleMesh(MESH_NAME, {
      scene: this.scene,
      ...buffers,
      material: resolveChartMaterial(this.material()),
    });
  }

  /** @param {string} method @throws {Error} */
  #assertNotDestroyed(method) {
    if (this.#destroyed) {
      throw new Error(`AreaChart.${method}: this chart has been destroyed.`);
    }
  }
}
