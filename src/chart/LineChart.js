import { generator, palette } from '../compose/index.js';
import { GraphChart } from './GraphChart.js';
import { applyAxisScaleDomain, resolveAxisAccessor } from './axisField.js';
import { GraphLine } from '../object/index.js';

/** Series key used when `.series()` hasn't been configured — a single line over all of `data()`. */
const DEFAULT_SERIES_KEY = Symbol('default-series');

/**
 * `GraphChart` specialized for line charts (Prompt 133). Renders one
 * continuous `GraphLine` (a Three.js `Line2`, `object/GraphLine.js`) per
 * series instead of one mesh/instance per datum — `GraphChart`'s own
 * `render()`/`update()` assume a per-datum position+scale buffer
 * (`GraphObjectFactory.createBars`/`createPoints`), which doesn't fit a
 * continuous path, so `LineChart` overrides both instead of building on
 * them. It still reuses `GraphChart`'s `x()`/`y()`/`z()` field storage and
 * axis scale-fitting (`chart/axisField.js`, shared with `GraphChart` itself
 * — CLAUDE.md §1.1 DRY) as-is.
 *
 * `data()` is overridden too: `GraphChart`'s own version (Prompt 128) joins
 * against a per-datum `Selection` backend so entering/exiting individual
 * bars/points can be micro-controlled — a continuous polyline has no such
 * backend (there's nothing to `.enter()`/`.exit()` one vertex at a time), so
 * `LineChart.data()` is a plain getter/setter instead, like `.filter()` or
 * `.material()`. `selection()`/`on('enter'|'update'|'exit', fn)`, inherited
 * from `GraphChart`, are consequently inert for `LineChart` — there is no
 * per-vertex `Selection` for them to operate on.
 * @example
 * new LineChart(scene)
 *   .data(rows)
 *   .x((d) => d.t, scale.linear().domain([0, 10]).range([-6, 6]))
 *   .y((d) => d.value, scale.linear().domain([0, 100]).range([0, 6]))
 *   .series((d) => d.symbol)
 *   .curve('catmullRom')
 *   .render();
 */
export class LineChart extends GraphChart {
  /** @type {{x: Function, y: Function, z: Function, curve: Function, tension: Function, compute: Function}} */
  #lineGenerator;

  /** @type {((datum:*, index:number) => *)|null} */
  #seriesKeyFn = null;

  /** @type {Array|null} The last array passed to `data(arr)`. */
  #data = null;

  /** @type {Map<*, GraphLine>} Live line objects, keyed by series identity. */
  #lines = new Map();

  /** @type {boolean} Whether `render()` has materialized lines yet. */
  #rendered = false;

  /** @type {boolean} */
  #destroyed = false;

  /**
   * @param {object} scene The raw `THREE.Scene` this chart will attach to.
   * @throws {TypeError} If `scene` is falsy.
   */
  constructor(scene) {
    const path = generator.line();
    super(scene, path);
    this.#lineGenerator = path;
  }

  /**
   * Gets or sets the raw datum array this chart renders. Unlike
   * `GraphChart.data()`, this doesn't join against a per-datum `Selection`
   * backend (see the class doc) — no-arg reads, one-arg writes and chains,
   * like every other plain `GraphChart` setter.
   * @param {Array} [arr]
   * @returns {Array|this}
   * @throws {TypeError} If `arr` is given and isn't an array.
   * @example chart.data(rows).series((d) => d.symbol).render();
   */
  data(arr) {
    this.#assertNotDestroyed('data');
    if (arr === undefined) return this.#data;
    if (!Array.isArray(arr)) {
      throw new TypeError(`LineChart.data: expected an array, received ${JSON.stringify(arr)}.`);
    }
    this.#data = arr;
    return this;
  }

  /**
   * Gets or sets the series-identity accessor splitting `data()` into
   * multiple independent lines, one `GraphLine` per distinct key — drawn in
   * a distinct color from `palette.category10`, auto-assigned per key in
   * first-seen order. Without this, all of `data()` renders as a single line.
   * @param {(datum:*, index:number) => *} [keyFn]
   * @returns {((datum:*, index:number) => *)|null|this}
   * @throws {TypeError} If `keyFn` is given and isn't a function.
   * @example chart.series((d) => d.symbol);
   */
  series(keyFn) {
    this.#assertNotDestroyed('series');
    if (keyFn === undefined) return this.#seriesKeyFn;
    if (typeof keyFn !== 'function') {
      throw new TypeError(`LineChart.series: keyFn must be a function, received ${JSON.stringify(keyFn)}.`);
    }
    this.#seriesKeyFn = keyFn;
    return this;
  }

  /**
   * Gets or sets the interpolation curve — passes straight through to the
   * underlying `generator.line().curve()` (CLAUDE.md §1.1 DRY: the curve
   * table already lives there, not duplicated here).
   * @param {'linear'|'monotone'|'catmullRom'|'bezier'} [type]
   * @returns {string|this}
   * @throws {TypeError} If `type` isn't one of the supported curve names.
   * @example chart.curve('catmullRom');
   */
  curve(type) {
    this.#assertNotDestroyed('curve');
    if (type === undefined) return this.#lineGenerator.curve();
    this.#lineGenerator.curve(type);
    return this;
  }

  /**
   * First call materializes one `GraphLine` per series; every later call
   * routes to `update()`.
   * @returns {this}
   * @throws {Error} If `data(arr)` was never called before this render.
   * @see GraphChart#render
   */
  render() {
    this.#assertNotDestroyed('render');
    if (this.#rendered) return this.update();
    if (this.#data === null) {
      throw new Error('LineChart.render: call data(arr) before render().');
    }
    this.#sync();
    this.#rendered = true;
    return this;
  }

  /**
   * Recomputes every series' vertex stream from the latest `data()` and
   * writes it into that series' `GraphLine` (mutating in place when its
   * point count is unchanged — `GraphLine.setPositions`'s own optimization).
   * Series no longer present are disposed; newly-seen series get a new
   * `GraphLine`.
   * @returns {this}
   * @throws {Error} If `render()` hasn't successfully run yet.
   * @see GraphChart#update
   */
  update() {
    this.#assertNotDestroyed('update');
    if (!this.#rendered) {
      throw new Error('LineChart.update: call render() first.');
    }
    this.#sync();
    return this;
  }

  /**
   * Updates every live line's `LineMaterial` resolution
   * (`GraphLine.setResolution`) — `linewidth` is measured in screen pixels,
   * so `Line2` needs the current canvas size to stay a consistent width
   * after a resize. Call this from your own renderer resize handler.
   * @param {number} width
   * @param {number} height
   * @returns {this}
   * @throws {Error} If this chart has been destroyed.
   * @example window.addEventListener('resize', () => chart.setResolution(innerWidth, innerHeight));
   */
  setResolution(width, height) {
    this.#assertNotDestroyed('setResolution');
    for (const line of this.#lines.values()) line.setResolution(width, height);
    return this;
  }

  /**
   * Disposes every live `GraphLine`, then defers to `GraphChart.destroy()`
   * for handler-clearing and marking the shared inherited setters
   * (`x()`/`y()`/`z()`/`filter()`/...) as destroyed. Idempotent.
   * @returns {void}
   * @see GraphChart#destroy
   */
  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const line of this.#lines.values()) line.dispose();
    this.#lines.clear();
    super.destroy();
  }

  /** @param {Array} data @returns {Array} */
  #applyFilterSort(data) {
    const filterFn = this.filter();
    const sortFn = this.sort();
    let result = data;
    if (filterFn) result = result.filter(filterFn);
    if (sortFn) result = result.slice().sort(sortFn);
    return result;
  }

  /**
   * @param {Array} data
   * @returns {Map<*, Array>} `data`, grouped by `.series()`'s keyFn — or a
   *   single `DEFAULT_SERIES_KEY` group if `.series()` isn't configured.
   */
  #groupBySeries(data) {
    const groups = new Map();
    if (!this.#seriesKeyFn) {
      groups.set(DEFAULT_SERIES_KEY, data);
      return groups;
    }
    data.forEach((d, i) => {
      const key = this.#seriesKeyFn(d, i);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    });
    return groups;
  }

  /** Shared by `render()`/`update()` (CLAUDE.md §1.1 DRY two-strike rule). */
  #sync() {
    const data = this.#applyFilterSort(this.#data);

    applyAxisScaleDomain(this.x(), data);
    applyAxisScaleDomain(this.y(), data);
    applyAxisScaleDomain(this.z(), data);
    this.#lineGenerator.x(resolveAxisAccessor(this.x()));
    this.#lineGenerator.y(resolveAxisAccessor(this.y()));
    this.#lineGenerator.z(resolveAxisAccessor(this.z()));

    const groups = this.#groupBySeries(data);

    for (const key of this.#lines.keys()) {
      if (!groups.has(key)) {
        this.#lines.get(key).dispose();
        this.#lines.delete(key);
      }
    }

    for (const [key, seriesData] of groups) {
      const { positions } = this.#lineGenerator.compute(seriesData);
      let line = this.#lines.get(key);
      if (!line) {
        line = new GraphLine({ scene: this.scene, name: `chart-line-${String(key)}`, color: palette.category10(key) });
        this.#lines.set(key, line);
      }
      line.setPositions(positions);
    }
  }

  /** @param {string} method @throws {Error} */
  #assertNotDestroyed(method) {
    if (this.#destroyed) {
      throw new Error(`LineChart.${method}: this chart has been destroyed.`);
    }
  }
}
