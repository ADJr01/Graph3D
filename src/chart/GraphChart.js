import { accessor, Selection, diffData } from '../compose/index.js';
import { material } from '../material/index.js';
import { resolve as resolveEasing } from '../anim/index.js';
import { GraphObjectFactory } from '../object/index.js';
import { applyAxisScaleDomain, resolveAxisAccessor } from './axisField.js';
import { resolveChartMaterial } from './materialField.js';

// Real material factories only — `material` also carries two unrelated
// utilities (addPlanarReflection, setPaletteForAttribute) that aren't presets
// and must not validate as one (CLAUDE.md §1.5 Fail Fast: .material('addPlanarReflection')
// should reject, not silently "succeed" and fail confusingly later in render()).
const NON_PRESET_MATERIAL_KEYS = new Set(['addPlanarReflection', 'setPaletteForAttribute']);

const CHART_EVENTS = new Set(['enter', 'update', 'exit']);

/** @param {*} accessorOrScale @returns {boolean} */
function isValidAxisInput(accessorOrScale) {
  return typeof accessorOrScale === 'function' || typeof accessorOrScale === 'number' || typeof accessorOrScale === 'string';
}

/**
 * Fluent, chainable base class every chart type (Prompt 132+: `BarChart`,
 * `LineChart`, `ScatterChart`, ...) extends. Owns the configuration state a
 * chart accumulates before it renders anything — data, per-axis accessor/scale
 * pairs, color/size/shape accessors, material choice, filter/sort, transition
 * defaults, and lifecycle handlers — via a D3-flavored setter/getter method
 * per field (no-arg call reads, one-or-more-arg call writes and returns `this`
 * for chaining).
 *
 * `data(arr, keyFn)` is join-native (Prompt 128): it delegates straight to an
 * internally-owned `Selection`'s own `.data()` (the Phase 4 join, `compose/
 * selection/join.js`), so it returns a `JoinResult` — the same object a
 * caller gets from `Selection.data()` — with `.enter()/.exit()/.join()`, not
 * `this`. That internal `Selection` starts wrapping an empty `meshes: []`
 * backend (nothing rendered yet); `render()`/`update()` (Prompts 129/130)
 * replace it with a real backend once one exists, so user hooks and the
 * chart's own internal diffing consume the exact same join (CLAUDE.md §1.1
 * DRY) instead of two independent implementations drifting apart.
 *
 * `render()` (Prompt 129) materializes this configuration into a real scene
 * object on its first call; every later call routes to `update()` (Prompt
 * 130) instead, which diffs the latest `data()` array against what's
 * currently bound and writes only what changed. `destroy()` (Prompt 131)
 * permanently tears the chart down — every other public method throws
 * afterward (CLAUDE.md's Disposal Contract).
 * @example
 * class BarChart extends GraphChart {}
 * new BarChart(scene, generator.bar())
 *   .data(rows, (d) => d.id)
 *   .x((d) => d.label)
 *   .y((d) => d.value, scale.linear().domain([0, 100]).range([0, 10]))
 *   .material('standard')
 *   .transition(800);
 */
export class GraphChart {
  /** @type {object} Raw `THREE.Scene` this chart attaches to on `render()`. */
  #scene;
  /** @type {{compute: (data: Array) => object}} */
  #generator;

  /**
   * The live backend `data()`/`selection()` join against. Starts wrapping an
   * empty `meshes: []` backend — valid and zero-cost (no geometry/material
   * needed) since an empty array vacuously satisfies `Selection`'s meshes
   * shape — swapped for a real backend once `render()` (Prompt 129) attaches one.
   * @type {Selection}
   */
  #backendSelection = new Selection({ type: 'meshes', meshes: [] });

  /**
   * The last array passed to `data(arr, keyFn)`, consumed once by the first
   * `render()` call (Prompt 129) — kept separately from `#backendSelection`
   * since a join against the still-empty pre-render backend doesn't retain
   * `arr` anywhere itself (`Selection.data()` returns a fresh `JoinResult`,
   * it doesn't mutate the `Selection` it was called on).
   * @type {Array|null}
   */
  #pendingData = null;

  /** @type {((datum:*, index:number) => *)|undefined} The last `keyFn` passed to `data()`, reused by `update()`'s own join. */
  #pendingKeyFn = undefined;

  /** @type {boolean} Whether `render()` has materialized a real backend yet. */
  #rendered = false;

  /** @type {boolean} Whether `destroy()` has already run. */
  #destroyed = false;

  /**
   * Transitions started by `update()`'s own default (non-handler) writes —
   * stopped by `destroy()` (Prompt 131) so a still-animating tween doesn't
   * keep ticking against a chart that no longer exists.
   * @type {Set<SelectionTransition>}
   */
  #activeTransitions = new Set();

  /**
   * Members currently mid dissolve-out via `update()`'s default exit — these
   * are deliberately excluded from `#backendSelection` (they're departing,
   * not live) once `.exit()` returns them, so `destroy()` (Prompt 131) must
   * dispose them separately or their meshes/instance never get released.
   * @type {Set<Selection>}
   */
  #pendingExits = new Set();

  /** @type {{accessor: (datum:*, index:number) => *, scale: object|null}} */
  #xField = { accessor: accessor((d, i) => i), scale: null };
  /** @type {{accessor: (datum:*, index:number) => *, scale: object|null}} */
  #yField = { accessor: accessor((d) => d), scale: null };
  /** @type {{accessor: (datum:*, index:number) => *, scale: object|null}} */
  #zField = { accessor: accessor(0), scale: null };
  /** @type {{accessor: ((datum:*, index:number) => *)|null, palette: *}} */
  #colorField = { accessor: null, palette: null };
  /** @type {((datum:*, index:number) => *)|null} */
  #sizeAccessor = null;
  /** @type {((datum:*, index:number) => *)|null} */
  #shapeAccessor = null;
  /** @type {((datum:*, index:number) => *)|null} */
  #opacityAccessor = null;
  /** @type {{presetName: string, options: object}|null} */
  #materialConfig = null;
  /** @type {((datum:*, index:number) => boolean)|null} */
  #filterFn = null;
  /** @type {((a:*, b:*) => number)|null} */
  #sortFn = null;
  /** @type {{durationMs: number, easing: (string|((t:number)=>number))}|null} */
  #transitionConfig = null;
  /** @type {{enter: Function[], update: Function[], exit: Function[]}} */
  #handlers = { enter: [], update: [], exit: [] };

  /**
   * @param {object} scene The raw `THREE.Scene` this chart will attach to.
   * @param {{compute: (data: Array) => object}} generator A `compose/generator`
   *   instance (e.g. `generator.bar()`) — duck-typed to a `.compute(data)` function.
   * @throws {TypeError} If `scene` is falsy, or `generator` lacks `.compute`.
   */
  constructor(scene, generator) {
    if (!scene) {
      throw new TypeError('GraphChart: scene is required.');
    }
    if (!generator || typeof generator.compute !== 'function') {
      throw new TypeError(`GraphChart: generator must expose a compute(data) function, received ${JSON.stringify(generator)}.`);
    }
    this.#scene = scene;
    this.#generator = generator;
  }

  /** @returns {object} The raw `THREE.Scene` passed to the constructor. */
  get scene() {
    return this.#scene;
  }

  /** @returns {{compute: (data: Array) => object}} The generator passed to the constructor. */
  get generator() {
    return this.#generator;
  }

  /**
   * Two-in-one, matching `Selection.data()`: no-arg reads every datum
   * currently bound to this chart's live backend (empty until `render()` has
   * materialized real nodes). Given `arr` (and optionally `keyFn`), joins it
   * against that backend and returns the resulting `JoinResult` — `.enter()`/
   * `.exit()`/`.join(enterFn, updateFn, exitFn)` for micro-controlling the
   * entering/updating/departing members directly, in addition to every plain
   * `Selection` method (`attr`, `style`, `filter`, ...) since a `JoinResult`
   * *is* the update selection.
   * @param {Array} [arr] The datum array to join against the current backend. Omit to read the currently bound data.
   * @param {(datum: *, index: number) => *} [keyFn] Join identity. Defaults to a positional (index) join.
   * @returns {Array|Selection} The bound data (no-arg form), or a `JoinResult` (join form).
   * @throws {TypeError} If `arr` isn't an array, or `keyFn` is given and isn't a function.
   * @throws {Error} If `.enter()` is called on the result and this chart hasn't rendered yet
   *   (no mesh template exists to materialize entering members against) — call `render()` first.
   * @example
   * const joined = chart.data(rows, (d) => d.id);
   * joined.join(
   *   (enter) => enter.attr('scale.y', 0.01),
   *   (update) => update.attr('position.y', (d) => d.value),
   * );
   */
  data(arr, keyFn) {
    this.#assertNotDisposed('data');
    if (arr === undefined) return this.#backendSelection.data();
    if (!Array.isArray(arr)) {
      throw new TypeError(`GraphChart.data: expected an array, received ${JSON.stringify(arr)}.`);
    }
    if (keyFn !== undefined && typeof keyFn !== 'function') {
      throw new TypeError(`GraphChart.data: keyFn must be a function, received ${JSON.stringify(keyFn)}.`);
    }
    this.#pendingData = arr;
    this.#pendingKeyFn = keyFn;
    return this.#backendSelection.data(arr, keyFn);
  }

  /**
   * Gets or sets the x-axis accessor and optional scale.
   * @param {*} [accessorOrScale] A constant, `(datum, index) => value` accessor, or a scale (scales are callable).
   * @param {object} [scaleObj] A `compose/scale` instance mapping accessor output to world-space range.
   * @returns {{accessor: Function, scale: object|null}|this}
   * @throws {TypeError} If `accessorOrScale` is given and is neither a constant, function, nor string.
   * @example chart.x((d) => d.label, scale.band().domain(labels).range([0, 10]));
   */
  x(accessorOrScale, scaleObj) {
    return this.#axisField('x', accessorOrScale, scaleObj);
  }

  /**
   * Gets or sets the y-axis accessor and optional scale.
   * @param {*} [accessorOrScale]
   * @param {object} [scaleObj]
   * @returns {{accessor: Function, scale: object|null}|this}
   * @throws {TypeError} If `accessorOrScale` is given and is neither a constant, function, nor string.
   * @example chart.y((d) => d.value, scale.linear().domain([0, 100]).range([0, 10]));
   */
  y(accessorOrScale, scaleObj) {
    return this.#axisField('y', accessorOrScale, scaleObj);
  }

  /**
   * Gets or sets the z-axis accessor and optional scale.
   * @param {*} [accessorOrScale]
   * @param {object} [scaleObj]
   * @returns {{accessor: Function, scale: object|null}|this}
   * @throws {TypeError} If `accessorOrScale` is given and is neither a constant, function, nor string.
   * @example chart.z((d) => d.depth);
   */
  z(accessorOrScale, scaleObj) {
    return this.#axisField('z', accessorOrScale, scaleObj);
  }

  /**
   * @param {'x'|'y'|'z'} axisName
   * @param {*} accessorOrScale
   * @param {object} [scaleObj]
   * @returns {{accessor: Function, scale: object|null}|this}
   */
  #axisField(axisName, accessorOrScale, scaleObj) {
    this.#assertNotDisposed(axisName);
    const field = axisName === 'x' ? this.#xField : axisName === 'y' ? this.#yField : this.#zField;
    if (accessorOrScale === undefined) return field;
    if (!isValidAxisInput(accessorOrScale)) {
      throw new TypeError(`GraphChart.${axisName}: expected a constant, (datum, index) => value function, or scale, received ${JSON.stringify(accessorOrScale)}.`);
    }
    const next = { accessor: accessor(accessorOrScale), scale: scaleObj ?? null };
    if (axisName === 'x') this.#xField = next;
    else if (axisName === 'y') this.#yField = next;
    else this.#zField = next;
    return this;
  }

  /**
   * Gets or sets the per-datum color accessor and optional palette.
   * @param {*} [accessorOrConstant] A constant color, or `(datum, index) => value` accessor
   *   whose output is fed through `palette` (if given) or used directly as a color.
   * @param {*} [palette] A `compose/palette` ramp (`(t) => '#rrggbb'`) or categorical cycler.
   * @returns {{accessor: (Function|null), palette: *}|this}
   * @example chart.color((d) => d.value, palette.viridis);
   */
  color(accessorOrConstant, palette) {
    this.#assertNotDisposed('color');
    if (accessorOrConstant === undefined) return this.#colorField;
    this.#colorField = { accessor: accessor(accessorOrConstant), palette: palette ?? null };
    return this;
  }

  /**
   * Gets or sets the per-datum size accessor.
   * @param {*} [valueOrFn] A constant, or `(datum, index) => value` accessor.
   * @returns {((datum:*, index:number) => *)|null|this}
   * @example chart.size((d) => Math.sqrt(d.population));
   */
  size(valueOrFn) {
    this.#assertNotDisposed('size');
    if (valueOrFn === undefined) return this.#sizeAccessor;
    this.#sizeAccessor = accessor(valueOrFn);
    return this;
  }

  /**
   * Gets or sets the per-datum shape accessor.
   * @param {*} [valueOrFn] A constant shape name, or `(datum, index) => name` accessor.
   * @returns {((datum:*, index:number) => *)|null|this}
   * @example chart.shape('sphere');
   */
  shape(valueOrFn) {
    this.#assertNotDisposed('shape');
    if (valueOrFn === undefined) return this.#shapeAccessor;
    this.#shapeAccessor = accessor(valueOrFn);
    return this;
  }

  /**
   * Gets or sets a constant opacity, or a per-datum accessor, applied via
   * `chart/opacityField.js`'s `applyOpacityField` after every
   * `render()`/`update()` — moved here from `ScatterChart` (Prompt 134's
   * original, sole consumer) once `HeatmapChart` (Prompt 136) needed the
   * identical setter (CLAUDE.md §1.1 DRY two-strike rule).
   * @param {number|((datum:*, index:number) => number)} [valueOrFn]
   * @returns {((datum:*, index:number) => number)|null|this}
   * @example chart.opacity(0.6);
   * @example chart.opacity((d) => d.confidence);
   */
  opacity(valueOrFn) {
    this.#assertNotDisposed('opacity');
    if (valueOrFn === undefined) return this.#opacityAccessor;
    this.#opacityAccessor = accessor(valueOrFn);
    return this;
  }

  /**
   * Gets or sets the material preset used to render this chart's datums.
   * @param {string} [presetName] One of `material`'s preset keys (e.g. `'standard'`, `'neon'`, `'glow'`).
   * @param {object} [options] Options forwarded to the preset factory.
   * @returns {{presetName: string, options: object}|null|this}
   * @throws {TypeError} If `presetName` isn't a valid preset name, or `options` isn't a plain object.
   * @example chart.material('standard', { color: '#3b82f6', roughness: 0.4 });
   */
  material(presetName, options = {}) {
    this.#assertNotDisposed('material');
    if (presetName === undefined) return this.#materialConfig;
    if (typeof presetName !== 'string' || typeof material[presetName] !== 'function' || NON_PRESET_MATERIAL_KEYS.has(presetName)) {
      throw new TypeError(`GraphChart.material: expected one of ${Object.keys(material).filter((k) => !NON_PRESET_MATERIAL_KEYS.has(k)).join(', ')}, received ${JSON.stringify(presetName)}.`);
    }
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError(`GraphChart.material: options must be a plain object, received ${JSON.stringify(options)}.`);
    }
    this.#materialConfig = { presetName, options };
    return this;
  }

  /**
   * Gets or sets a predicate filtering data before rendering.
   * @param {(datum: *, index: number) => boolean} [predicateFn]
   * @returns {((datum:*, index:number) => boolean)|null|this}
   * @throws {TypeError} If `predicateFn` is given and isn't a function.
   * @example chart.filter((d) => d.value > 0);
   */
  filter(predicateFn) {
    this.#assertNotDisposed('filter');
    if (predicateFn === undefined) return this.#filterFn;
    if (typeof predicateFn !== 'function') {
      throw new TypeError(`GraphChart.filter: expected a function, received ${JSON.stringify(predicateFn)}.`);
    }
    this.#filterFn = predicateFn;
    return this;
  }

  /**
   * Gets or sets a comparator ordering data before rendering.
   * @param {(a: *, b: *) => number} [compareFn]
   * @returns {((a:*, b:*) => number)|null|this}
   * @throws {TypeError} If `compareFn` is given and isn't a function.
   * @example chart.sort((a, b) => a.value - b.value);
   */
  sort(compareFn) {
    this.#assertNotDisposed('sort');
    if (compareFn === undefined) return this.#sortFn;
    if (typeof compareFn !== 'function') {
      throw new TypeError(`GraphChart.sort: expected a function, received ${JSON.stringify(compareFn)}.`);
    }
    this.#sortFn = compareFn;
    return this;
  }

  /**
   * Gets or sets the default transition duration/easing `update()` (Prompt
   * 130) will use for enter/update/exit animation. Validates `easingNameOrFn`
   * eagerly against `GraphAnimCurve.resolve` (CLAUDE.md §1.1 DRY — no second
   * easing table lives here), mirroring `Transition.easing()`.
   * @param {number} [durationMs] Non-negative duration in milliseconds. Omit to read the current config.
   * @param {string|((t:number)=>number)} [easingNameOrFn] A `GraphAnimCurve` curve name, or a raw `(t) => number` function. Default `'linear'`.
   * @returns {{durationMs: number, easing: *}|null|this}
   * @throws {TypeError} If `durationMs` isn't a non-negative number, or `easingNameOrFn` doesn't resolve to a valid easing.
   * @example chart.transition(800, 'easeOutCubic');
   */
  transition(durationMs, easingNameOrFn = 'linear') {
    this.#assertNotDisposed('transition');
    if (durationMs === undefined) return this.#transitionConfig;
    if (typeof durationMs !== 'number' || durationMs < 0) {
      throw new TypeError(`GraphChart.transition: duration must be a non-negative number of milliseconds, received ${JSON.stringify(durationMs)}.`);
    }
    resolveEasing(easingNameOrFn);
    this.#transitionConfig = { durationMs, easing: easingNameOrFn };
    return this;
  }

  /**
   * Registers a lifecycle handler, fired by `update()` (Prompt 130) as datums
   * enter, update, or exit on each `data()` call.
   * @param {'enter'|'update'|'exit'} event
   * @param {(...args: *) => void} handler
   * @returns {this}
   * @throws {TypeError} If `event` isn't recognized, or `handler` isn't a function.
   * @example chart.on('exit', (selection) => selection.transition().duration(400).attr('opacity', 0).remove());
   */
  on(event, handler) {
    this.#assertNotDisposed('on');
    if (!CHART_EVENTS.has(event)) {
      throw new TypeError(`GraphChart.on: event must be one of 'enter'/'update'/'exit', received ${JSON.stringify(event)}.`);
    }
    if (typeof handler !== 'function') {
      throw new TypeError(`GraphChart.on: handler must be a function, received ${JSON.stringify(handler)}.`);
    }
    this.#handlers[event].push(handler);
    return this;
  }

  /** @returns {{enter: Function[], update: Function[], exit: Function[]}} Registered lifecycle handlers, keyed by event. */
  handlers() {
    this.#assertNotDisposed('handlers');
    return this.#handlers;
  }

  /**
   * Sugar for `on('enter', fn)`.
   * @param {(selection: Selection) => void} fn
   * @returns {this}
   * @example chart.onEnter((entered) => entered.attr('scale.y', 0.01));
   */
  onEnter(fn) {
    return this.on('enter', fn);
  }

  /**
   * Sugar for `on('update', fn)`.
   * @param {(selection: Selection) => void} fn
   * @returns {this}
   * @example chart.onUpdate((updated) => updated.attr('position.y', (d) => d.value));
   */
  onUpdate(fn) {
    return this.on('update', fn);
  }

  /**
   * Sugar for `on('exit', fn)`.
   * @param {(selection: Selection) => void} fn
   * @returns {this}
   * @example chart.onExit((exited) => exited.transition().duration(400).attr('opacity', 0).remove());
   */
  onExit(fn) {
    return this.on('exit', fn);
  }

  /**
   * The live `Selection` over every datum currently rendered by this chart
   * (Prompt 128) — empty until `render()` (Prompt 129) materializes real
   * nodes, then kept current by `update()` (Prompt 130). Backed by the same
   * internal `Selection` `data()` joins against, so post-render micro-control
   * (`chart.selection().attr(...)`) and the chart's own diffing share one
   * live backend instead of two independent views drifting apart.
   * @returns {Selection}
   * @example chart.selection().filter((d) => d.value > 90).attr('color', 'gold');
   */
  selection() {
    this.#assertNotDisposed('selection');
    return this.#backendSelection;
  }

  /**
   * First call (Prompt 129): applies `filter`/`sort` (if set) to the last
   * array passed to `data()`, fits every scaled `x`/`y`/`z` field's domain to
   * the result (`scale.domain(...)`, via that field's own accessor — see
   * `#applyScaleDomain`), wires the resolved `accessor ∘ scale` functions
   * into the generator's own `x`/`y`/`z` setters (only the ones it exposes —
   * `generator.bar()` has no `z`), computes instance buffers via
   * `generator.compute(data)`, and materializes them into a real backend —
   * `GraphObjectFactory` picks a `GraphInstancedObject` or a `GraphMesh[]`
   * per `INSTANCING_THRESHOLD` (CLAUDE.md §1.1 DRY: that dispatch already
   * lives there, not duplicated here). `#backendSelection` is then replaced
   * with a `Selection` over the real backend, so `data()`/`selection()`
   * reflect it from this point on.
   *
   * Every subsequent call routes to `update()` instead (Prompt 130).
   * @returns {this}
   * @throws {Error} If `data(arr)` was never called before this render.
   * @example
   * chart.data(rows).y((d) => d.value, scale.linear().domain([0, 1]).range([0, 10]));
   * chart.render();
   */
  render() {
    this.#assertNotDisposed('render');
    if (this.#rendered) return this.update();
    if (this.#pendingData === null) {
      throw new Error('GraphChart.render: call data(arr) before render().');
    }

    const data = this.#prepareData();
    const buffers = this.#computeBuffers(data);
    const resolvedMaterial = this.#resolveMaterial();

    // `generator.point()` is the only current generator exposing `.shape()`
    // (Prompt 67) — duck-typed rather than an explicit type tag, since
    // GraphChart's constructor already treats `generator` as a duck-typed
    // `{compute}` (Prompt 127), not a tagged union.
    const usesPointGeometry = typeof this.#generator.shape === 'function';
    const backend = usesPointGeometry
      ? GraphObjectFactory.createPoints(data.length, { scene: this.#scene, name: 'chart', material: resolvedMaterial })
      : GraphObjectFactory.createBars(data.length, { scene: this.#scene, name: 'chart', material: resolvedMaterial });

    if (Array.isArray(backend)) {
      for (let i = 0; i < data.length; i++) {
        const o = i * 3;
        backend[i]
          .setPosition(buffers.positions[o], buffers.positions[o + 1], buffers.positions[o + 2])
          .setScale(buffers.scales[o], buffers.scales[o + 1], buffers.scales[o + 2])
          .setUserData('datum', data[i]);
      }
      // A template ({scene, name, geometry, material}) is required for a
      // *future* update() (Prompt 130) to materialize newly-entering meshes —
      // `backend[0]`'s own (already-cloned) geometry/material are reused
      // rather than re-constructing a second copy of GraphObjectFactory's
      // defaults here (CLAUDE.md §1.1 DRY).
      const template = { scene: this.#scene, name: 'chart', geometry: backend[0].three.geometry, material: backend[0].material };
      this.#backendSelection = new Selection({ type: 'meshes', meshes: backend, template });
    } else {
      backend.setAllPositions(buffers.positions).setAllScales(buffers.scales).commitMatrix();
      for (let i = 0; i < data.length; i++) backend.setInstanceUserData(i, data[i]);
      this.#backendSelection = new Selection({
        type: 'instanced',
        object: backend,
        indices: Uint32Array.from({ length: data.length }, (_, i) => i),
      });
    }

    this.#rendered = true;
    return this;
  }

  /**
   * Every later `render()` call routes here (Prompt 130): joins the last
   * array passed to `data()` against the currently bound data (`diffData` —
   * the single diff authority `compose/selection/diff.js` already anticipated
   * this consumer, CLAUDE.md §1.1 DRY) and, for both the surviving (update)
   * and newly-entering members, either invokes the user's registered
   * `on('enter'|'update', fn)` handlers (if any — the handler owns writing
   * whatever it wants) or, absent any, writes `generator`-recomputed
   * position/scale directly — animated toward those values if `.transition()`
   * is configured, snapped immediately otherwise ("respects active
   * transitions"). Departing members likewise either run the user's
   * `on('exit', fn)` handlers, or fall back to the default: shrink to
   * `scale` 0 and fade `opacity` to 0, then `.remove()` — a "dissolve" that
   * doesn't depend on any particular material (unlike a pure opacity fade,
   * which has no visual effect on the instanced backend without the Phase 6
   * `dataDriven` material — see `attr.js`'s own note on that limitation).
   * @returns {this}
   * @throws {Error} If `render()` hasn't successfully run yet.
   * @example
   * chart.data(nextRows); // same keyFn as the original data(rows, keyFn) call
   * chart.update();
   */
  update() {
    this.#assertNotDisposed('update');
    if (!this.#rendered) {
      throw new Error('GraphChart.update: call render() first.');
    }

    const newData = this.#prepareData();
    const buffers = this.#computeBuffers(newData);

    const oldData = this.#backendSelection.data();
    // Diffed twice (once here for precise newIndex metadata, once more
    // internally by the Selection.data() call below) — an acknowledged,
    // bounded (2x, not 2^n) cost of respecting the layer boundary: chart/
    // only reaches Selection's public join surface for the actual backend
    // materialization/rebinding, never its private backend shape.
    const { enter, update: updateEntries } = diffData(oldData, newData, this.#pendingKeyFn);

    const joined = this.#backendSelection.data(newData, this.#pendingKeyFn);
    const entered = joined.enter();
    const exited = joined.exit();

    if (this.#handlers.update.length > 0) {
      for (const fn of this.#handlers.update) fn(joined);
    } else if (joined.size() > 0) {
      this.#writeComputedTransform(joined, updateEntries.map((e) => e.newIndex), buffers);
    }

    if (this.#handlers.enter.length > 0) {
      for (const fn of this.#handlers.enter) fn(entered);
    } else if (entered.size() > 0) {
      this.#writeComputedTransform(entered, enter.map((e) => e.newIndex), buffers);
    }

    if (this.#handlers.exit.length > 0) {
      for (const fn of this.#handlers.exit) fn(exited);
    } else if (exited.size() > 0) {
      // Guarded by size (not called unconditionally): an empty exit set would
      // still register a live SelectionTransition on the shared anim engine
      // for no reason — harmless, but needless scheduling to leave dangling.
      const exitTarget = exited.transition();
      if (this.#transitionConfig) exitTarget.duration(this.#transitionConfig.durationMs).easing(this.#transitionConfig.easing);
      // Tracked on both counts destroy() (Prompt 131) cares about: exited is
      // excluded from #backendSelection by the merge below, so it needs its
      // own forced disposal if the dissolve never gets to finish naturally.
      this.#pendingExits.add(exited);
      exitTarget.on('end', () => this.#pendingExits.delete(exited));
      this.#trackTransition(exitTarget);
      exitTarget.attr('scale.x', 0).attr('scale.y', 0).attr('scale.z', 0).attr('opacity', 0).remove();
    }

    this.#backendSelection = joined.merge(entered);
    return this;
  }

  /**
   * Applies `filter`/`sort` (if set) to the last array passed to `data()` —
   * shared by `render()` and `update()` (CLAUDE.md §1.1 DRY two-strike rule).
   * @returns {Array}
   */
  #prepareData() {
    let data = this.#pendingData;
    if (this.#filterFn) data = data.filter(this.#filterFn);
    if (this.#sortFn) data = data.slice().sort(this.#sortFn);
    return data;
  }

  /**
   * Fits every scaled `x`/`y`/`z` field's domain to `data` and wires the
   * resolved `accessor ∘ scale` functions into the generator's own `x`/`y`/`z`
   * setters (only the ones it exposes), then computes buffers — shared by
   * `render()` and `update()` (CLAUDE.md §1.1 DRY two-strike rule).
   * @param {Array} data
   * @returns {{positions: Float32Array, scales: Float32Array, colors: (Float32Array|null), attributes: object}}
   */
  #computeBuffers(data) {
    applyAxisScaleDomain(this.#xField, data);
    applyAxisScaleDomain(this.#yField, data);
    applyAxisScaleDomain(this.#zField, data);

    if (typeof this.#generator.x === 'function') this.#generator.x(resolveAxisAccessor(this.#xField));
    if (typeof this.#generator.y === 'function') this.#generator.y(resolveAxisAccessor(this.#yField));
    if (typeof this.#generator.z === 'function') this.#generator.z(resolveAxisAccessor(this.#zField));

    return this.#generator.compute(data);
  }

  /** @returns {THREE.Material} The configured material preset, or `material.standard()` by default. */
  #resolveMaterial() {
    return resolveChartMaterial(this.#materialConfig);
  }

  /**
   * Writes `target`'s members' position/scale from `buffers`, each looked up
   * via `newIndexForLocal` (parallel to `target`'s own member order — the
   * true position within the dataset `buffers` was computed from, since a
   * join's local member order doesn't match it once entries/exits interleave).
   * Animates toward those values through a `SelectionTransition` if
   * `.transition()` is configured ("respects active transitions", Prompt
   * 130); writes immediately (via the plain `Selection`) otherwise.
   * @param {Selection} target
   * @param {number[]} newIndexForLocal
   * @param {{positions: Float32Array, scales: Float32Array}} buffers
   */
  #writeComputedTransform(target, newIndexForLocal, buffers) {
    let writeTarget = target;
    if (this.#transitionConfig) {
      writeTarget = target.transition().duration(this.#transitionConfig.durationMs).easing(this.#transitionConfig.easing);
      this.#trackTransition(writeTarget);
    }
    const componentOf = (buffer, component) => (_datum, localIndex) => buffer[newIndexForLocal[localIndex] * 3 + component];
    writeTarget
      .attr('position.x', componentOf(buffers.positions, 0))
      .attr('position.y', componentOf(buffers.positions, 1))
      .attr('position.z', componentOf(buffers.positions, 2))
      .attr('scale.x', componentOf(buffers.scales, 0))
      .attr('scale.y', componentOf(buffers.scales, 1))
      .attr('scale.z', componentOf(buffers.scales, 2));
  }

  /**
   * Registers `transition` for `destroy()` (Prompt 131) to stop if it's
   * still running when the chart is torn down — otherwise its internal
   * timeline keeps ticking against a chart that no longer exists. Untracks
   * itself once the transition finishes naturally, so long-lived charts
   * don't accumulate one dead entry per completed `update()`.
   * @param {SelectionTransition} transition
   */
  #trackTransition(transition) {
    this.#activeTransitions.add(transition);
    transition.on('end', () => this.#activeTransitions.delete(transition));
  }

  /**
   * Permanently tears down this chart (Prompt 131): stops every transition
   * `update()` started that hasn't finished yet (`SelectionTransition.stop()`
   * — abandons pending writes rather than snapping to their end value, since
   * the chart is going away regardless), force-disposes any members still
   * mid dissolve-out (excluded from `#backendSelection` since they're
   * departing, not live — see `#pendingExits`), disposes the live backend
   * itself (every `GraphMesh`, or the one `GraphInstancedObject`, via
   * `Selection.dispose()`), and drops registered lifecycle handlers.
   * Idempotent — safe to call twice. Every other public method throws
   * afterward (CLAUDE.md's Disposal Contract).
   *
   * Doesn't dispose any axis/annotation, because `GraphChart` doesn't attach
   * one itself yet — no current prompt wires either onto a chart instance,
   * so there is nothing of that kind to release here.
   * @returns {void}
   * @example chart.destroy();
   */
  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const transition of this.#activeTransitions) transition.stop();
    this.#activeTransitions.clear();
    for (const exiting of this.#pendingExits) exiting.dispose();
    this.#pendingExits.clear();
    this.#backendSelection.dispose();
    this.#handlers = { enter: [], update: [], exit: [] };
  }

  /** @param {string} method @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#destroyed) {
      throw new Error(`GraphChart.${method}: this chart has been destroyed.`);
    }
  }
}
