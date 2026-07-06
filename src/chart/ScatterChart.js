import { generator } from '../compose/index.js';
import { GraphChart } from './GraphChart.js';
import { applyColorField } from './colorField.js';
import { applyOpacityField } from './opacityField.js';

/**
 * `GraphChart` specialized for scatter plots (Prompt 134). Defaults to
 * `generator.point()` — every `GraphChart` default (instanced-over-50-datums
 * via `GraphObjectFactory`, `material.standard()` fallback) already applies
 * unchanged, so a scatter plot of a million points renders as one
 * `GraphInstancedObject` for free, same as `BarChart`.
 *
 * `.size(fn)`/`.color(fn, palette)`/`.opacity(valueOrFn)` (Prompt 127) are
 * `GraphChart`'s own setters — `ScatterChart` is the first place `.size()`
 * gets consumed (wired into `generator.point().size(...)` before
 * `compute()`, the same "wrap compute" mechanism `BarChart` established),
 * the second place `.color()` gets consumed (`chart/colorField.js`,
 * extracted out of `BarChart` once this became the second consumer), and
 * the first place `.opacity()` gets consumed (`chart/opacityField.js` —
 * originally a private field/method on this class, moved onto `GraphChart`
 * once `HeatmapChart`, Prompt 136, became the second consumer — CLAUDE.md
 * §1.1 DRY two-strike rule).
 * @example
 * new ScatterChart(scene)
 *   .data(rows, (d) => d.id)
 *   .x((d) => d.x)
 *   .y((d) => d.y)
 *   .z((d) => d.z)
 *   .size((d) => Math.sqrt(d.population))
 *   .color((d) => d.population)
 *   .opacity(0.8)
 *   .render();
 * const hit = chart.pick(raycaster); // the clicked datum, or null
 */
export class ScatterChart extends GraphChart {
  /** @type {{compute: Function, x: Function, y: Function, z: Function, size: Function, shape: Function}} */
  #pointGenerator;

  /**
   * @param {object} scene The raw `THREE.Scene` this chart will attach to.
   * @throws {TypeError} If `scene` is falsy.
   */
  constructor(scene) {
    const point = generator.point();
    super(scene, point);
    this.#pointGenerator = point;
    // Reassigned after super() so #compute can close over `this` — mirrors
    // BarChart's identical "capture the raw fn before overwriting" mechanism
    // (GraphChart only stores the generator by reference, so mutating
    // `point.compute` after super() still reaches it).
    const rawCompute = point.compute.bind(point);
    point.compute = (data) => this.#compute(data, rawCompute);
  }

  /**
   * First call materializes via `GraphChart.render()`; every later call
   * routes to this class's own `update()` override. Applies `.color()`'s
   * palette fallback and `.opacity()` afterward either way.
   * @returns {this}
   * @throws {Error} If `data(arr)` was never called before this render.
   */
  render() {
    super.render();
    this.#applyPostAttributes();
    return this;
  }

  /**
   * Diffs and rewrites bound data via `GraphChart.update()`, then re-applies
   * `.color()`/`.opacity()` across the (possibly changed) live selection.
   * @returns {this}
   * @throws {Error} If `render()` hasn't successfully run yet.
   */
  update() {
    super.update();
    this.#applyPostAttributes();
    return this;
  }

  /**
   * Ray-picks the frontmost rendered point under `raycaster`. Delegates to
   * the instanced backend's own octree-backed `pick()`
   * (`GraphInstancedObject`, Prompt 45) when this chart has grown past
   * `INSTANCING_THRESHOLD`; a plain `THREE.Raycaster.intersectObjects`
   * otherwise (an octree isn't worth the overhead at ≤50 individual meshes).
   * Reaches the live backend via `Selection.backend` (Prompt 134's escape
   * hatch) rather than duplicating a second, redundant spatial index here
   * (CLAUDE.md §1.1 DRY — `GraphInstancedObject` already maintains one).
   * @param {object} raycaster A `THREE.Raycaster`.
   * @returns {*} The hit datum, or `null` if nothing was hit.
   * @throws {Error} If this chart has been destroyed.
   * @example const datum = chart.pick(raycaster);
   */
  pick(raycaster) {
    const backend = this.selection().backend;
    if (backend.type === 'instanced') {
      const hitIndex = backend.object.pick(raycaster);
      return hitIndex === null ? null : backend.object.getInstanceUserData(hitIndex);
    }
    const meshes = backend.meshes.map((m) => m.three);
    const hits = raycaster.intersectObjects(meshes);
    if (hits.length === 0) return null;
    const hitMesh = backend.meshes.find((m) => m.three === hits[0].object);
    return hitMesh.getUserData('datum');
  }

  /**
   * The generator's own `compute(data)`, wrapped: wires `.size()`'s
   * accessor (if configured) into `generator.point().size(...)` before
   * delegating, since `GraphChart.#computeBuffers` only ever wires `x`/`y`/`z`
   * — no chart type existed to consume `.size()` until now.
   * @param {Array} data
   * @param {(data: Array) => object} rawCompute The real, unwrapped `generator.point().compute`.
   * @returns {{positions: Float32Array, scales: Float32Array, colors: (Float32Array|null), attributes: object, shape: string}}
   */
  #compute(data, rawCompute) {
    const sizeAccessor = this.size();
    if (sizeAccessor) this.#pointGenerator.size(sizeAccessor);
    return rawCompute(data);
  }

  /** Shared by `render()`/`update()` (CLAUDE.md §1.1 DRY two-strike rule). */
  #applyPostAttributes() {
    applyColorField(this, this.data());
    applyOpacityField(this);
  }
}
