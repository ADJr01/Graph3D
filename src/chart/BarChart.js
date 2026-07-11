import { generator, layout } from '../compose/index.js';
import { GraphChart } from './GraphChart.js';
import { applyColorField } from './colorField.js';
import { applyOpacityField } from './opacityField.js';
import { applyVisibleField } from './visibleField.js';
import { applySizeField } from './sizeField.js';
import { applyLegend } from './legendField.js';

const DEFAULT_TRANSITION_MS = 800;

/**
 * Swaps the x/y components of every position/scale triple in `buffers`, in
 * place — turns a vertical bar (grows along y, category along x) into a
 * horizontal one (grows along x, category along y). `z` (depth) is untouched.
 * @param {{positions: Float32Array, scales: Float32Array}} buffers
 * @returns {{positions: Float32Array, scales: Float32Array}} `buffers`, mutated.
 */
function swapXY(buffers) {
  for (const buf of [buffers.positions, buffers.scales]) {
    for (let i = 0; i < buf.length; i += 3) {
      const tmp = buf[i];
      buf[i] = buf[i + 1];
      buf[i + 1] = tmp;
    }
  }
  return buffers;
}

/**
 * `GraphChart` specialized for bar charts (Prompt 132). Defaults to
 * `generator.bar()`, `material('standard')`, and an 800ms transition — every
 * other `GraphChart` default (instanced-over-50-datums via `GraphObjectFactory`,
 * `material.standard()` fallback) already applies unchanged. Adds bar-specific
 * layout: `.grouped(keyFn)`/`.stacked(keyFn)` place multiple series per
 * category side-by-side or y-stacked (via `layout.stack`, CLAUDE.md §1.1 DRY —
 * no re-implemented stacking math), `.horizontal()`/`.vertical()` swap growth
 * axis, and `.depthSeries()` moves series along `z` instead of `x` when
 * combined with `.grouped()`. `.color(fn)` (Prompt 127) without an explicit
 * palette falls back to `palette.viridis` here — `GraphChart` itself never
 * consumes `#colorField` (no chart type existed for it to serve until now).
 * `.opacity(fn)`/`.visible(fn)`/`.size(fn)` (Prompt 141) are likewise applied
 * per-datum after every render/update — `.size(fn)` multiplies the bar's
 * footprint only (see `#applyStyleFields`), never the value-encoding axis.
 * @example
 * new BarChart(scene)
 *   .data(rows, (d) => d.id)
 *   .x((d) => d.category, scale.band().domain(categories).range([-6, 6]))
 *   .y((d) => d.value, scale.linear().domain([0, 100]).range([0, 6]))
 *   .color((d) => d.value)
 *   .render();
 */
export class BarChart extends GraphChart {
  /** @type {{compute: Function, x: Function, y: Function, width: Function, depth: Function, baseline: Function}} The real `generator.bar()` instance this chart's `compute` wraps. */
  #barGenerator;

  /** @type {{mode: 'grouped'|'stacked', keyFn: (datum:*, index:number) => *}|null} */
  #seriesMode = null;

  /** @type {boolean} Whether `.grouped()`'s series offset runs along `z` (depth) instead of `x`. */
  #depthSeriesEnabled = false;

  /** @type {'vertical'|'horizontal'} */
  #orientation = 'vertical';

  /**
   * @param {object} scene The raw `THREE.Scene` this chart will attach to.
   * @throws {TypeError} If `scene` is falsy.
   */
  constructor(scene) {
    const bar = generator.bar();
    super(scene, bar);
    this.#barGenerator = bar;
    // Reassigned after super() so `#compute` can close over `this` — GraphChart
    // only stores the reference, it doesn't invoke compute() during construction.
    // `rawCompute` is captured now, before overwriting `bar.compute`, since the
    // wrapper below would otherwise recursively call itself.
    const rawCompute = bar.compute.bind(bar);
    bar.compute = (data) => this.#compute(data, rawCompute);
    this.material('standard');
    this.transition(DEFAULT_TRANSITION_MS);
  }

  /**
   * Lays out multiple series per category side-by-side, narrowing each
   * series' bar to `originalWidth / seriesCount` — the classic grouped-bar
   * layout. Offsets along `x` by default, or `z` if `.depthSeries()` is
   * active. Overwrites any previously configured `.stacked()`.
   * @param {(datum:*, index:number) => *} keyFn Resolves each datum's series identity.
   * @returns {this}
   * @throws {TypeError} If `keyFn` isn't a function.
   * @example chart.grouped((d) => d.series);
   */
  grouped(keyFn) {
    if (typeof keyFn !== 'function') {
      throw new TypeError(`BarChart.grouped: keyFn must be a function, received ${JSON.stringify(keyFn)}.`);
    }
    this.#seriesMode = { mode: 'grouped', keyFn };
    return this;
  }

  /**
   * Lays out multiple series per category as a single stacked column, via
   * `layout.stack()` (CLAUDE.md §1.1 DRY — the same stacking math
   * `layout.stack` already implements, not reimplemented here). Stacks
   * datums sharing the same resolved `x` value, ordered by first-seen series.
   * `.depthSeries()` has no combined effect with `.stacked()` — it only
   * changes `.grouped()`'s offset axis. Overwrites any previously configured
   * `.grouped()`.
   * @param {(datum:*, index:number) => *} keyFn Resolves each datum's series identity.
   * @returns {this}
   * @throws {TypeError} If `keyFn` isn't a function.
   * @example chart.stacked((d) => d.series);
   */
  stacked(keyFn) {
    if (typeof keyFn !== 'function') {
      throw new TypeError(`BarChart.stacked: keyFn must be a function, received ${JSON.stringify(keyFn)}.`);
    }
    this.#seriesMode = { mode: 'stacked', keyFn };
    return this;
  }

  /**
   * Bars grow along `x` (value axis horizontal), category laid out along `y`.
   * @returns {this}
   * @example chart.horizontal();
   */
  horizontal() {
    this.#orientation = 'horizontal';
    return this;
  }

  /**
   * Bars grow along `y` (value axis vertical), category laid out along `x`.
   * This is the default orientation.
   * @returns {this}
   * @example chart.vertical();
   */
  vertical() {
    this.#orientation = 'vertical';
    return this;
  }

  /**
   * Moves `.grouped()`'s series offset from `x` to `z` — each series occupies
   * its own depth lane instead of being clustered side-by-side, turning a 2D
   * grouped bar layout into a 3D one. No effect until `.grouped()` is also
   * configured; no combined effect with `.stacked()` (see `.stacked()`'s own note).
   * @returns {this}
   * @example chart.grouped((d) => d.series).depthSeries();
   */
  depthSeries() {
    this.#depthSeriesEnabled = true;
    return this;
  }

  /**
   * First call materializes via `GraphChart.render()`; every later call
   * routes to this class's own `update()` override (same "first render vs.
   * update" dispatch `GraphChart.render()` already implements). Applies
   * `.color()`'s palette fallback, `.opacity()`, `.visible()`, and `.size()`
   * (Prompt 141) afterward either way.
   * @returns {this}
   * @throws {Error} If `data(arr)` was never called before this render.
   * @see GraphChart#render
   */
  render() {
    super.render();
    this.#applyStyleFields();
    return this;
  }

  /**
   * Diffs and rewrites bound data via `GraphChart.update()`, then re-applies
   * every Prompt 127/141 style field across the (possibly changed) live selection.
   * @returns {this}
   * @throws {Error} If `render()` hasn't successfully run yet.
   * @see GraphChart#update
   */
  update() {
    super.update();
    this.#applyStyleFields();
    return this;
  }

  /**
   * Shared by `render()`/`update()` (CLAUDE.md §1.1 DRY two-strike rule).
   * `.size()` multiplies the bar's *footprint* only (`x`/`z` normally, `y`/`z`
   * when `.horizontal()` is active — whichever two axes aren't the value
   * axis `.horizontal()`/`.vertical()` controls), never the axis that
   * encodes `.y(fn)`'s (or `.x(fn)`'s, if horizontal) real value.
   */
  #applyStyleFields() {
    applyColorField(this, this.data());
    applyOpacityField(this);
    applyVisibleField(this);
    applySizeField(this, this.#orientation === 'horizontal' ? ['y', 'z'] : ['x', 'z']);
    applyLegend(this);
  }

  /**
   * The generator's own `compute(data)`, wrapped: applies grouped/stacked
   * series layout (if configured), then swaps x/y for `.horizontal()`.
   * @param {Array} data
   * @param {(data: Array) => object} rawCompute The real, unwrapped `generator.bar().compute`.
   * @returns {{positions: Float32Array, scales: Float32Array, colors: (Float32Array|null), attributes: object}}
   */
  #compute(data, rawCompute) {
    let buffers;
    if (this.#seriesMode?.mode === 'grouped') {
      buffers = this.#computeGrouped(data, rawCompute);
    } else if (this.#seriesMode?.mode === 'stacked') {
      buffers = this.#computeStacked(data, rawCompute);
    } else {
      buffers = rawCompute(data);
    }
    return this.#orientation === 'horizontal' ? swapXY(buffers) : buffers;
  }

  /**
   * Narrows and offsets each datum's bar along the offset axis (`x`, or `z`
   * if `.depthSeries()` is active) so datums sharing a category cluster
   * side-by-side instead of overlapping.
   * @param {Array} data
   * @param {(data: Array) => object} rawCompute
   * @returns {object} Buffers, mutated in place.
   */
  #computeGrouped(data, rawCompute) {
    const buffers = rawCompute(data);
    const { keyFn } = this.#seriesMode;
    const seriesKeys = [...new Set(data.map((d, i) => keyFn(d, i)))];
    const seriesCount = seriesKeys.length;
    if (seriesCount <= 1) return buffers;

    const seriesIndexOf = new Map(seriesKeys.map((key, index) => [key, index]));
    const axis = this.#depthSeriesEnabled ? 2 : 0;
    for (let i = 0; i < data.length; i++) {
      const seriesIndex = seriesIndexOf.get(keyFn(data[i], i));
      const o = i * 3 + axis;
      const originalExtent = buffers.scales[o];
      const narrowed = originalExtent / seriesCount;
      buffers.positions[o] += narrowed * (seriesIndex + 0.5) - originalExtent / 2;
      buffers.scales[o] = narrowed;
    }
    return buffers;
  }

  /**
   * Pivots `data` into per-category series bands via `layout.stack()`
   * (keyed on each datum's resolved `x` value), then overrides the bar
   * generator's `y`/`baseline` per datum to the resulting `[y0, y1]` band
   * before delegating to `rawCompute` — `x`/`width`/`depth` stay whatever
   * `GraphChart` already resolved onto the generator. Stacks using the
   * chart's already-scaled `y` values (whatever `.y(fn, scale)` resolves to),
   * so stacking composes correctly with a configured y-scale.
   * @param {Array} data
   * @param {(data: Array) => object} rawCompute
   * @returns {object}
   */
  #computeStacked(data, rawCompute) {
    const bar = this.#barGenerator;
    const { keyFn } = this.#seriesMode;
    const categoryOf = bar.x();
    const prevY = bar.y();
    const prevBaseline = bar.baseline();
    const valueOf = prevY;

    const rowByCategory = new Map();
    const orderedCategories = [];
    data.forEach((d, i) => {
      const category = categoryOf(d, i);
      if (!rowByCategory.has(category)) {
        rowByCategory.set(category, {});
        orderedCategories.push(category);
      }
      rowByCategory.get(category)[keyFn(d, i)] = valueOf(d, i);
    });

    const seriesKeys = [...new Set(data.map((d, i) => keyFn(d, i)))];
    const wideRows = orderedCategories.map((category) => rowByCategory.get(category));
    const stackedSeries = layout
      .stack()
      .keys(seriesKeys)
      .value((row, key) => row[key] ?? 0)(wideRows);
    const seriesByKey = new Map(stackedSeries.map((s) => [s.key, s]));
    const rowIndexOf = new Map(orderedCategories.map((category, index) => [category, index]));

    const yByIndex = new Array(data.length);
    const baselineByIndex = new Array(data.length);
    data.forEach((d, i) => {
      const rowIndex = rowIndexOf.get(categoryOf(d, i));
      const [y0, y1] = seriesByKey.get(keyFn(d, i))[rowIndex];
      baselineByIndex[i] = y0;
      yByIndex[i] = y1;
    });

    bar.y((d, i) => yByIndex[i]);
    bar.baseline((d, i) => baselineByIndex[i]);
    const buffers = rawCompute(data);
    bar.y(prevY);
    bar.baseline(prevBaseline);
    return buffers;
  }
}
