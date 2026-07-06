import { generator } from '../compose/index.js';
import { GraphChart } from './GraphChart.js';
import { applyColorField } from './colorField.js';
import { applyOpacityField } from './opacityField.js';

const PLANE_THICKNESS = 0.1;
const VALID_MODES = new Set(['plane', 'voxel']);

/**
 * `GraphChart` specialized for heatmaps (Prompt 136). Defaults to a new
 * `generator.heatmap()` — a fixed-size grid-cell box, not a baseline-relative
 * growth shape like `generator.bar()` — so every `GraphChart` default
 * (instanced-over-50-datums via `GraphObjectFactory`, `material.standard()`
 * fallback) already applies unchanged: a million-cell heatmap renders as one
 * `GraphInstancedObject` for free, same as `BarChart`/`ScatterChart`.
 *
 * Two render modes, set via `.mode(name)`:
 * - `'plane'` (default): flat tiles in the x/z plane (thin fixed height) —
 *   a classic 2D heatmap. `.y()` defaults to `0` so tiles need no
 *   configuration to lie flat.
 * - `'voxel'`: full cubes, `.y()` becomes a real third grid axis (e.g. depth
 *   or time) — a 3D density grid. `.opacity(fn)` (Prompt 134's setter,
 *   `GraphChart`'s own since this chart became its second consumer) is the
 *   idiomatic way to encode a value as per-cell density on top of `.color()`.
 *
 * `.color(fn)` (Prompt 127) falls back to `palette.viridis` here, same as
 * `BarChart`/`ScatterChart` (`chart/colorField.js`, third consumer).
 * @example
 * new HeatmapChart(scene)
 *   .x((d) => d.col, scale.band().domain(cols).range([-6, 6]))
 *   .z((d) => d.row, scale.band().domain(rows).range([-6, 6]))
 *   .color((d) => d.value)
 *   .render();
 * @example
 * new HeatmapChart(scene)
 *   .mode('voxel')
 *   .x((d) => d.x).y((d) => d.y).z((d) => d.z)
 *   .color((d) => d.density)
 *   .opacity((d) => d.density)
 *   .render();
 */
export class HeatmapChart extends GraphChart {
  /** @type {{compute: Function, x: Function, y: Function, z: Function, width: Function, height: Function, depth: Function}} */
  #heatmapGenerator;

  /** @type {'plane'|'voxel'} */
  #mode = 'plane';

  /**
   * @param {object} scene The raw `THREE.Scene` this chart will attach to.
   * @throws {TypeError} If `scene` is falsy.
   */
  constructor(scene) {
    const heat = generator.heatmap();
    super(scene, heat);
    this.#heatmapGenerator = heat;
    // Reassigned after super() so #compute can close over `this` — mirrors
    // BarChart/ScatterChart's identical "capture the raw fn before
    // overwriting" mechanism (GraphChart only stores the generator by
    // reference, so mutating `heat.compute` after super() still reaches it).
    const rawCompute = heat.compute.bind(heat);
    heat.compute = (data) => this.#compute(data, rawCompute);
    // Sensible default for 'plane' mode: tiles lie flat at y=0 without the
    // caller needing to configure it — GraphChart's own default y accessor
    // ((d) => d, the whole datum) would otherwise produce NaN positions.
    this.y(0);
  }

  /**
   * Gets or sets the render mode: `'plane'` (default, flat 2D tiles) or
   * `'voxel'` (full 3D cubes). Only changes the computed cell height
   * (`generator.heatmap().height()`) — position (`x`/`y`/`z`) is unaffected.
   * @param {'plane'|'voxel'} [name]
   * @returns {'plane'|'voxel'|this}
   * @throws {TypeError} If `name` is given and isn't `'plane'`/`'voxel'`.
   * @example chart.mode('voxel');
   */
  mode(name) {
    if (name === undefined) return this.#mode;
    if (!VALID_MODES.has(name)) {
      throw new TypeError(`HeatmapChart.mode: expected 'plane' or 'voxel', received ${JSON.stringify(name)}.`);
    }
    this.#mode = name;
    return this;
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
   * The generator's own `compute(data)`, wrapped: sets the cell height to a
   * thin constant in `'plane'` mode, or the same value as `width()` (a full
   * cube) in `'voxel'` mode, before delegating.
   * @param {Array} data
   * @param {(data: Array) => object} rawCompute The real, unwrapped `generator.heatmap().compute`.
   * @returns {{positions: Float32Array, scales: Float32Array, colors: (Float32Array|null), attributes: object}}
   */
  #compute(data, rawCompute) {
    this.#heatmapGenerator.height(this.#mode === 'voxel' ? this.#heatmapGenerator.width() : PLANE_THICKNESS);
    return rawCompute(data);
  }

  /** Shared by `render()`/`update()` (CLAUDE.md §1.1 DRY two-strike rule). */
  #applyPostAttributes() {
    applyColorField(this, this.data());
    applyOpacityField(this);
  }
}
