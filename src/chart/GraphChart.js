import { accessor, Selection, diffData, transform } from '../compose/index.js';
import { material, effects } from '../material/index.js';
import { resolve as resolveEasing } from '../anim/index.js';
import { GraphObjectFactory, GraphInstancedObject } from '../object/index.js';
import { loop } from '../core/Graph3DLoop.js';
import { applyAxisScaleDomain, resolveAxisAccessor } from './axisField.js';
import { resolveChartMaterial } from './materialField.js';
import { applyLegend } from './legendField.js';
import { applyStreamChunk } from './streamField.js';
import { assertLODLevels, pickLODLevel } from './lodField.js';

// Real material factories only — `material` also carries two unrelated
// utilities (addPlanarReflection, setPaletteForAttribute) that aren't presets
// and must not validate as one (CLAUDE.md §1.5 Fail Fast: .material('addPlanarReflection')
// should reject, not silently "succeed" and fail confusingly later in render()).
const NON_PRESET_MATERIAL_KEYS = new Set(['addPlanarReflection', 'setPaletteForAttribute']);

const CHART_EVENTS = new Set(['enter', 'update', 'exit']);

// Prompt 156's "full event surface on charts" — dispatched externally by
// interact/'s PointerRouter/Brush/Lasso/KeyboardNav (which import chart/, the
// allowed direction; chart/ cannot detect a pointer/keyboard event itself)
// via the new dispatch() method below, never by GraphChart itself. Kept in a
// separate set/Map from CHART_EVENTS/#handlers rather than merged into them:
// enter/update/exit are driven internally by update()'s own data-join and
// always called automatically, while these are driven by an external
// interact/-layer event — conflating the two storage/dispatch paths would
// make dispatch() able to accidentally re-fire a lifecycle handler, which
// nothing should ever do outside update() itself.
const INTERACTION_EVENTS = new Set([
  'hover',
  'select',
  'deselect',
  'brushStart',
  'brushEnd',
  'lassoStart',
  'lassoEnd',
  'dragStart',
  'dragEnd',
  'focus',
]);

/** @param {*} accessorOrScale @returns {boolean} */
function isValidAxisInput(accessorOrScale) {
  return typeof accessorOrScale === 'function' || typeof accessorOrScale === 'number' || typeof accessorOrScale === 'string';
}

/**
 * Fluent, chainable base class every chart type (Prompt 132+: `BarChart`,
 * `LineChart`, `ScatterChart`, ...) extends. Owns the configuration state a
 * chart accumulates before it renders anything — data, per-axis accessor/scale
 * pairs, color/size/shape accessors, material choice, filter/sort, `.use()`
 * middleware transforms, transition defaults, and lifecycle handlers — via a
 * D3-flavored setter/getter method
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
  /** @type {((datum:*, index:number) => boolean)|null} */
  #visibleAccessor = null;
  /** @type {{presetName: string, options: object}|null} */
  #materialConfig = null;
  /** @type {((datum:*, index:number) => boolean)|null} */
  #filterFn = null;
  /** @type {((a:*, b:*) => number)|null} */
  #sortFn = null;
  /** @type {((data: Array) => Array)[]} */
  #middlewares = [];
  /** @type {{container: object}|null} */
  #legendConfig = null;
  /** @type {((datum:*, index:number) => *)|null} */
  #tooltipHandler = null;

  #hoverEffectConfig = null;

  #selectEffectConfig = null;
  /** @type {{durationMs: number, easing: (string|((t:number)=>number))}|null} */
  #transitionConfig = null;
  /** @type {{name: string, options: {system: {preset: Function}}}|null} */
  #exitAnimationConfig = null;
  /** @type {{enter: Function[], update: Function[], exit: Function[]}} */
  #handlers = { enter: [], update: [], exit: [] };
  /** @type {Map<string, Function[]>} Prompt 156's interaction-event handlers, keyed by event — separate from `#handlers` (see `INTERACTION_EVENTS`'s own comment). */
  #interactionHandlers = new Map();
  /** @type {boolean} Whether `PointerRouter` (Prompt 154) should let a pointer drag reposition this chart's datums. */
  #draggable = false;
  /** @type {boolean} Whether `Picker` (Prompt 156) hit-tests this chart at all. */
  #pickingEnabled = true;

  /**
   * The `DataStream` currently bound via `stream()`, if any — kept only so
   * `#stopStream()` can `dispose()` it (closes its socket/stops its timer)
   * when replaced by a later `stream()` call or when this chart is
   * `destroy()`ed. `chart/` never imports `stream/` (it sits *above* `chart/`
   * in CLAUDE.md §1.4's layer order) — `dataStream` is accepted duck-typed,
   * same pattern as `exitAnimation()`'s `options.system`.
   * @type {{dispose?: Function}|null}
   */
  #streamDataStream = null;

  /** @type {(() => void)|null} Set by `stream()`; calling it ends that binding's pump loop. */
  #streamStop = null;

  /**
   * The active `enableLOD()` binding, if any: the per-frame `core/
   * Graph3DLoop` callback it registered plus the last applied level's
   * `maxPoints` (so unchanged-level frames skip re-decimating/re-joining).
   * @type {{tick: Function, currentMaxPoints: (number|null)}|null}
   */
  #lod = null;

  /** @type {number|null} FIFO cap set by `window(size)` (Prompt 168). `null` means unbounded. */
  #windowSize = null;

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
   * @param {*} [accessorOrScale] A constant, `(datum, index) => value` accessor, or a scale (scales are callable).
   * @param {object} [scaleObj] A `compose/scale` instance mapping accessor output to world-space range.
   * @returns {{accessor: Function, scale: object|null}|this}
   * @throws {TypeError} If `accessorOrScale` is given and is neither a constant, function, nor string.
   * @example chart.y((d) => d.value, scale.linear().domain([0, 100]).range([0, 10]));
   */
  y(accessorOrScale, scaleObj) {
    return this.#axisField('y', accessorOrScale, scaleObj);
  }

  /**
   * Gets or sets the z-axis accessor and optional scale.
   * @param {*} [accessorOrScale] A constant, `(datum, index) => value` accessor, or a scale (scales are callable).
   * @param {object} [scaleObj] A `compose/scale` instance mapping accessor output to world-space range.
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
   * Gets or sets a constant visibility, or a per-datum predicate, applied
   * via `chart/visibleField.js`'s `applyVisibleField` after every
   * `render()`/`update()` (Prompt 141) — a direct passthrough to
   * `Selection.attr('visible', ...)` (Prompt 75), same shape as `.opacity()`.
   * Unlike `.filter()` (which excludes a datum from `data()`/layout entirely,
   * before `render()` ever runs), `.visible()` only toggles a rendered
   * member's `Object3D.visible`/instance-visibility after the fact — the
   * datum still occupies its computed position/scale, just hidden.
   * @param {boolean|((datum:*, index:number) => boolean)} [valueOrFn]
   * @returns {((datum:*, index:number) => boolean)|null|this}
   * @example chart.visible((d) => d.value > 0);
   */
  visible(valueOrFn) {
    this.#assertNotDisposed('visible');
    if (valueOrFn === undefined) return this.#visibleAccessor;
    this.#visibleAccessor = accessor(valueOrFn);
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
   * Gets or sets an HTML overlay legend synced to `.color()`/`.size()`
   * (Prompt 143) — a gradient bar (or swatch list, for a categorical
   * palette) for `.color()`'s encoding, and three sample dots at the data's
   * min/mid/max `.size()` multiplier, rendered into `options.container` via
   * `chart/legendField.js`'s `applyLegend` (called immediately here, then
   * again on every later `render()`/`update()` by the chart types that
   * consume it — the same per-chart "sync" pattern `.opacity()`/`.visible()`/
   * `.size()` already follow). The chart only ever writes into the container
   * it's given — it never creates or positions DOM elements of its own.
   * Inert on `TreeChart`/`PackChart` (bind a single root datum, not an
   * array — no per-datum domain to fit).
   * @param {{container: object}} [options] `container` must be a DOM element (duck-typed to `.appendChild`).
   * @returns {{container: object}|null|this}
   * @throws {TypeError} If `options` isn't a plain object, or `options.container` isn't a DOM element.
   * @example chart.color((d) => d.value).legend({ container: document.getElementById('legend') });
   */
  legend(options) {
    this.#assertNotDisposed('legend');
    if (options === undefined) return this.#legendConfig;
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError(`GraphChart.legend: options must be a plain object, received ${JSON.stringify(options)}.`);
    }
    if (typeof options.container?.appendChild !== 'function') {
      throw new TypeError(`GraphChart.legend: options.container must be a DOM element, received ${JSON.stringify(options.container)}.`);
    }
    this.#legendConfig = { container: options.container };
    applyLegend(this);
    return this;
  }

  /**
   * Gets or sets the tooltip content handler (Prompt 143).
   * ponytail: config-only, doesn't show anything itself — no hover-detection
   * mechanism exists yet in this phase (Phase 9's `interact/Tooltip.js`,
   * Prompt 151, owns the actual DOM element and pointer wiring); this only
   * stores what to show once that lands. `chart/tooltipField.js`'s `resolveTooltipContent` is the
   * "sensible default on hover when no handler is set" this prompt asks
   * for: it calls `handlerFn(datum, index)` if one is configured, otherwise
   * formats the datum itself.
   * @param {(datum:*, index:number) => *} [handlerFn]
   * @returns {((datum:*, index:number) => *)|null|this}
   * @throws {TypeError} If `handlerFn` is given and isn't a function.
   * @example chart.tooltip((d) => `${d.label}: ${d.value}`);
   */
  tooltip(handlerFn) {
    this.#assertNotDisposed('tooltip');
    if (handlerFn === undefined) return this.#tooltipHandler;
    if (typeof handlerFn !== 'function') {
      throw new TypeError(`GraphChart.tooltip: handlerFn must be a function, received ${JSON.stringify(handlerFn)}.`);
    }
    this.#tooltipHandler = handlerFn;
    return this;
  }

  /**
   * Gets or sets which registered `material.effects` preset (Prompt 150)
   * plays on the hovered datum only — `interact/StateMachine` (via
   * `interact/PointerRouter`'s existing hover detection) reads this back on
   * every hover-enter/leave and applies/removes it through
   * `material.applyEffect`/`removeEffect`, the same way it already applies
   * its own built-in default (a `neonEdge` outline) when this is left
   * unconfigured — config-only, same "doesn't show anything itself" shape
   * as `tooltip()`, since the actual hover-detection lives one layer up.
   * @param {string} [presetName] A registered effect name (`effects.list()`).
   * @param {Object} [options] Merged over the preset's own `defaultOptions`.
   * @returns {{name: string, options: Object}|null|this}
   * @throws {Error} If `presetName` isn't a registered effect (includes a "did you mean" suggestion).
   * @throws {TypeError} If `options` is given and isn't a plain object.
   * @example chart.hoverEffect('fire', { intensity: 1.2 });
   */
  hoverEffect(presetName, options = {}) {
    this.#assertNotDisposed('hoverEffect');
    if (presetName === undefined) return this.#hoverEffectConfig;
    effects.get(presetName); // throws with a suggestion if unregistered (Fail Fast)
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError(`GraphChart.hoverEffect: options must be a plain object, received ${JSON.stringify(options)}.`);
    }
    this.#hoverEffectConfig = { name: presetName, options };
    return this;
  }

  /**
   * Gets or sets which registered `material.effects` preset (Prompt 150)
   * plays on selected datums, cleared on deselect — same config-only shape
   * and `StateMachine` resolution as `hoverEffect`.
   * @param {string} [presetName] A registered effect name (`effects.list()`).
   * @param {Object} [options] Merged over the preset's own `defaultOptions`.
   * @returns {{name: string, options: Object}|null|this}
   * @throws {Error} If `presetName` isn't a registered effect (includes a "did you mean" suggestion).
   * @throws {TypeError} If `options` is given and isn't a plain object.
   * @example chart.selectEffect('glow', { color: '#22ffcc' });
   */
  selectEffect(presetName, options = {}) {
    this.#assertNotDisposed('selectEffect');
    if (presetName === undefined) return this.#selectEffectConfig;
    effects.get(presetName);
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError(`GraphChart.selectEffect: options must be a plain object, received ${JSON.stringify(options)}.`);
    }
    this.#selectEffectConfig = { name: presetName, options };
    return this;
  }

  /**
   * Gets or sets a predicate filtering data before rendering.
   * @param {(datum: *, index: number) => boolean} [predicateFn] Returns `true` to keep a datum.
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
   * @param {(a: *, b: *) => number} [compareFn] Standard `Array.prototype.sort` comparator.
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
   * Registers a data-transform middleware (Prompt 142), run in registration
   * order against the last array passed to `data()` — after `.filter()`,
   * before `.sort()` — every time `render()`/`update()` recomputes buffers.
   * Each middleware is a plain `(data) => data` function; `compose/transform`
   * (`transform.smooth`/`decimate`/`aggregate`/`normalize`/`sort`) provides
   * ready-made ones, but any function of that shape works. Composable — call
   * `.use()` multiple times to chain several transforms.
   * @param {(data: Array) => Array} middlewareFn Transforms the array and returns the replacement.
   * @returns {this}
   * @throws {TypeError} If `middlewareFn` isn't a function.
   * @example chart.data(rawSamples).use(transform.smooth(5)).use(transform.decimate(200));
   */
  use(middlewareFn) {
    this.#assertNotDisposed('use');
    if (typeof middlewareFn !== 'function') {
      throw new TypeError(`GraphChart.use: middlewareFn must be a function, received ${JSON.stringify(middlewareFn)}.`);
    }
    this.#middlewares.push(middlewareFn);
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
   * Gets or sets a default particle exit animation (Prompt 122) for
   * `update()`'s exit-join: departing datums play `options.system.preset(name,
   * ...)` and are removed immediately, instead of the built-in shrink-and-fade
   * dissolve. Only takes effect when no `on('exit', fn)` handler is
   * registered — a registered handler always has full control (it can still
   * call `exited.remove(name, options)` itself). Delegates straight to
   * `Selection.remove(animationName, options)` (CLAUDE.md §1.1 DRY — no
   * second particle-triggering implementation here); `options.system` is a
   * `postfx/particles` `ParticleSystem`, duck-typed rather than imported,
   * since `chart/` has no renderer/camera of its own to build one — the
   * caller constructs and passes it, exactly as a direct
   * `Selection.remove('dissolve', { system })` call already requires.
   * @param {string} [name] A preset name registered on `options.system`. Omit to read the current config.
   * @param {Object} [options={}]
   * @param {{preset: function(string, Object): void}} [options.system] Required when `name` is given.
   * @returns {{name: string, options: Object}|null|this}
   * @throws {TypeError} If `name` is given and isn't a non-empty string, or `options.system` doesn't expose `.preset(name, opts)`.
   * @example chart.exitAnimation('dissolve', { system: particleSystem });
   */
  exitAnimation(name, options = {}) {
    this.#assertNotDisposed('exitAnimation');
    if (name === undefined) return this.#exitAnimationConfig;
    if (typeof name !== 'string' || name.length === 0) {
      throw new TypeError(`GraphChart.exitAnimation: name must be a non-empty string, received ${JSON.stringify(name)}.`);
    }
    if (!options.system || typeof options.system.preset !== 'function') {
      throw new TypeError(
        `GraphChart.exitAnimation('${name}'): options.system must be a particle system exposing .preset(name, opts) (e.g. a postfx ParticleSystem).`,
      );
    }
    this.#exitAnimationConfig = { name, options };
    return this;
  }

  /**
   * Gets or sets whether `PointerRouter` (Prompt 154) lets a pointer drag
   * reposition this chart's datums — config-only, same "doesn't show
   * anything itself" shape as `tooltip()`/`hoverEffect()`, since `chart/`
   * sits below `interact/` and cannot itself detect a pointer drag.
   * `PointerRouter` duck-type-checks this method before starting a drag
   * gesture, so a chart that never calls `draggable(true)` behaves exactly
   * as before this prompt. Default `false`.
   * @param {boolean} [value] Omit to read the current value.
   * @returns {boolean|this}
   * @throws {TypeError} If `value` is given and isn't a boolean.
   * @example chart.draggable(true);
   */
  draggable(value) {
    this.#assertNotDisposed('draggable');
    if (value === undefined) return this.#draggable;
    if (typeof value !== 'boolean') {
      throw new TypeError(`GraphChart.draggable: value must be a boolean, received ${JSON.stringify(value)}.`);
    }
    this.#draggable = value;
    return this;
  }

  /**
   * Gets or sets whether `Picker` (Prompt 147) hit-tests this chart at all —
   * config-only, same shape as `draggable()`/`tooltip()`, since `chart/`
   * cannot itself skip a raycast (`Picker.pickAt()` duck-type-checks this
   * before testing a registered chart, Prompt 156). Lets a large, static
   * "backdrop" chart nobody interacts with opt out of every future pick's
   * cost. Default `true`.
   * @param {boolean} [value] Omit to read the current value.
   * @returns {boolean|this}
   * @throws {TypeError} If `value` is given and isn't a boolean.
   * @example staticBackgroundChart.pickingEnabled(false);
   */
  pickingEnabled(value) {
    this.#assertNotDisposed('pickingEnabled');
    if (value === undefined) return this.#pickingEnabled;
    if (typeof value !== 'boolean') {
      throw new TypeError(`GraphChart.pickingEnabled: value must be a boolean, received ${JSON.stringify(value)}.`);
    }
    this.#pickingEnabled = value;
    return this;
  }

  /**
   * Binds a live `DataStream` (Prompt 160) to this chart: pulls its chunks
   * and, for each, folds `{added, updated, removed}` into the currently
   * bound data (`chart/streamField.js`'s `applyStreamChunk`) and drives it
   * through the exact same `data(nextData, keyFn) + update()` call a manual
   * caller would make — one join, one code path (CLAUDE.md §1.1 DRY), not a
   * second enter/update/exit implementation living here.
   *
   * Backpressure: at most one chunk is ever "pending" — if another arrives
   * while the previous one is still being folded/applied, it overwrites
   * (drops) the one waiting rather than queuing unboundedly. A chart mid-
   * stream shows the *latest* state, not a complete history of every chunk
   * that ever arrived; under sustained overload, some intermediate chunks
   * are never applied at all.
   *
   * Calling `stream()` again replaces the previous binding (disposing its
   * `dataStream` first, if it exposes `.dispose()`); `destroy()` does the same.
   * @param {AsyncIterable<{added: Array, updated: Array, removed: Array}>} dataStream
   *   A `DataStream` instance, or any async iterable of chunks — duck-typed
   *   (`chart/` cannot import `stream/`, which sits above it in the layer order).
   * @returns {this}
   * @throws {TypeError} If `dataStream` isn't async-iterable.
   * @throws {Error} If `render()` hasn't been called yet.
   * @example
   * chart.data(initialRows, (d) => d.id).render();
   * chart.stream(DataStream.fromWebSocket(url, (raw) => [JSON.parse(raw)]));
   */
  stream(dataStream) {
    this.#assertNotDisposed('stream');
    if (!dataStream || typeof dataStream[Symbol.asyncIterator] !== 'function') {
      throw new TypeError(`GraphChart.stream: dataStream must be async-iterable (e.g. a DataStream), received ${JSON.stringify(dataStream)}.`);
    }
    if (!this.#rendered) {
      throw new Error('GraphChart.stream: call render() before stream().');
    }

    this.#stopStream();
    this.#streamDataStream = dataStream;

    let pendingChunk = null;
    let applying = false;
    let stopped = false;

    const applyPending = async () => {
      applying = true;
      while (pendingChunk !== null && !stopped) {
        const chunk = pendingChunk;
        pendingChunk = null;
        const keyFn = this.#pendingKeyFn ?? ((d) => d);
        this.data(applyStreamChunk(this.data(), chunk, keyFn), keyFn);
        this.update();
        // A macrotask yield (not just a microtask) lets an entire burst of
        // already-available chunks drain through the pump loop below first,
        // each overwriting pendingChunk, so only the latest survives to be
        // applied next — a microtask-only yield loses that race, since the
        // pump loop's own `await iterator.next()` continuation is also just
        // one microtask away and tends to resolve after this one resumes.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      applying = false;
    };

    (async () => {
      try {
        for await (const chunk of dataStream) {
          if (stopped) break;
          pendingChunk = chunk; // backpressure: overwrites (drops) whatever chunk was already waiting
          if (!applying) applyPending();
        }
      } catch (error) {
        // CLAUDE.md §1.5: no swallowed promises — the pump loop has no
        // caller to reject back to (it's fire-and-forget from stream()
        // returning `this`), so a broken dataStream (e.g. a WebSocket error)
        // is surfaced here rather than becoming an unhandled rejection.
        console.error('GraphChart.stream: dataStream error, stream stopped.', error);
      }
    })();

    this.#streamStop = () => {
      stopped = true;
    };
    return this;
  }

  /**
   * Enables camera-distance-driven level-of-detail (Prompt 163): every frame
   * (`core/Graph3DLoop`), checks `camera`'s distance to this chart's `scene`
   * and, when it crosses into a different `levels` bucket, re-decimates the
   * dataset bound at the time `enableLOD()` was called down to that bucket's
   * `maxPoints` — via `compose/transform`'s existing `transform.decimate`
   * (the same uniform-stride sampling `.use(transform.decimate(n))` already
   * does, CLAUDE.md §1.1 DRY, no second decimation algorithm here) — and
   * re-binds it through the normal `data() + update()` join (one path, not a
   * second rendering pipeline). Applies the initial level immediately, before
   * the first frame.
   *
   * Self-contained: `chart/` never imports `stream/` (it sits above `chart/`
   * in CLAUDE.md §1.4's layer order) — `camera` is accepted duck-typed (any
   * object exposing `.position.distanceTo`), the same pattern `stream()`
   * uses for its `dataStream` parameter. `stream/LOD.js` exposes the
   * identical distance-bucketing algorithm as a standalone class for driving
   * LOD on non-`GraphChart` targets; the two don't share an implementation
   * for the same reason `stream()` doesn't import `DataStream`.
   *
   * Calling `enableLOD()` again replaces the previous binding (against a
   * freshly re-captured dataset); `disableLOD()`/`destroy()` stop it.
   * @param {{levels: {maxDistance: number, maxPoints: number}[], camera: {position: {distanceTo: (v: object) => number}}}} options
   * @returns {this}
   * @throws {TypeError} If `levels` isn't a non-empty array of `{maxDistance, maxPoints}`, or `camera` doesn't expose `position.distanceTo`.
   * @throws {Error} If `render()` hasn't been called yet.
   * @example
   * chart.data(hugeSeries, (d) => d.id).render();
   * chart.enableLOD({
   *   camera: scene.camera.three,
   *   levels: [
   *     { maxDistance: 20, maxPoints: 5000 },
   *     { maxDistance: 100, maxPoints: 500 },
   *   ],
   * });
   */
  enableLOD({ levels, camera } = {}) {
    this.#assertNotDisposed('enableLOD');
    if (!this.#rendered) {
      throw new Error('GraphChart.enableLOD: call render() before enableLOD().');
    }
    assertLODLevels(levels);
    if (!camera || !camera.position || typeof camera.position.distanceTo !== 'function') {
      throw new TypeError(`GraphChart.enableLOD: camera must expose position.distanceTo, received ${JSON.stringify(camera)}.`);
    }

    this.#stopLOD();
    const sortedLevels = levels.slice().sort((a, b) => a.maxDistance - b.maxDistance);
    const fullData = this.data();
    const keyFn = this.#pendingKeyFn ?? ((d) => d);
    const state = { tick: null, currentMaxPoints: null };

    state.tick = () => {
      const distance = camera.position.distanceTo(this.#scene.position);
      const level = pickLODLevel(sortedLevels, distance);
      if (level.maxPoints === state.currentMaxPoints) return;
      state.currentMaxPoints = level.maxPoints;
      this.data(transform.decimate(level.maxPoints)(fullData), keyFn);
      this.update();
    };
    this.#lod = state;
    loop.add(state.tick);
    state.tick();
    return this;
  }

  /**
   * Disables an `enableLOD()` binding, if any — stops the per-frame distance
   * check. Does not restore the full (pre-decimation) dataset; call
   * `chart.data(originalRows).update()` for that. No-op if LOD isn't active.
   * @returns {this}
   * @example chart.disableLOD();
   */
  disableLOD() {
    this.#assertNotDisposed('disableLOD');
    this.#stopLOD();
    return this;
  }

  /**
   * One-way merge (Prompt 168) of this chart's currently-static,
   * individually-addressable `GraphMesh` instances (the below-
   * `INSTANCING_THRESHOLD` `render()` path) into a single
   * `GraphInstancedObject` — collapsing N draw calls/geometries/materials
   * into one, at the cost of losing per-mesh addressability for the merged
   * set. Reads each mesh's *live* position/scale/color (whatever `.attr()`/
   * `.style()` handlers may have written, not just what `render()`
   * originally computed) so nothing currently visible changes.
   *
   * Meant to be called once a chart's data has settled ("gone static") —
   * e.g. the scrolled-past portion of a `window()`-capped stream, or any
   * large `GraphMesh[]`-backed chart nobody is animating anymore — as a
   * direct response to a `memoryPressure()` reading (`stream/`) crossing a
   * caller-chosen threshold: fewer live `THREE.Mesh`/`Geometry`/`Material`
   * instances means less JS heap and GPU driver overhead. Not automatic —
   * `chart/` never polls memory pressure itself; the caller decides when.
   *
   * **One-way**: irreversible for this chart instance — there is no path
   * back to individually-addressable meshes short of a fresh chart +
   * `render()`. A no-op if the backend is already instanced (nothing left
   * to merge) or if nothing is currently bound. Compacting while a
   * `.transition()`-driven write is still mid-flight against these meshes
   * disposes the meshes it's writing to — call once things have settled.
   * @returns {this}
   * @throws {Error} If `render()` hasn't been called yet.
   * @example
   * chart.data(staleHistoricalRows, (d) => d.id).render();
   * // ...later, once this data has stopped changing:
   * chart.compact();
   */
  compact() {
    this.#assertNotDisposed('compact');
    if (!this.#rendered) {
      throw new Error('GraphChart.compact: call render() before compact().');
    }
    const backend = this.#backendSelection.backend;
    if (backend.type === 'instanced' || backend.meshes.length === 0) {
      return this;
    }

    const meshes = backend.meshes;
    const count = meshes.length;
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count * 3);
    const hasColor = typeof meshes[0].material.color?.r === 'number';
    const colors = hasColor ? new Float32Array(count * 3) : null;
    const data = new Array(count);

    for (let i = 0; i < count; i++) {
      const mesh = meshes[i];
      const o = i * 3;
      positions[o] = mesh.three.position.x;
      positions[o + 1] = mesh.three.position.y;
      positions[o + 2] = mesh.three.position.z;
      scales[o] = mesh.three.scale.x;
      scales[o + 1] = mesh.three.scale.y;
      scales[o + 2] = mesh.three.scale.z;
      if (hasColor) {
        colors[o] = mesh.material.color.r;
        colors[o + 1] = mesh.material.color.g;
        colors[o + 2] = mesh.material.color.b;
      }
      data[i] = mesh.getUserData('datum');
    }

    const merged = new GraphInstancedObject({
      scene: this.#scene,
      name: 'chart',
      geometry: meshes[0].three.geometry.clone(),
      material: this.#resolveMaterial(),
      count,
    });
    merged.setAllPositions(positions).setAllScales(scales);
    if (hasColor) merged.setAllColors(colors);
    merged.commitMatrix();
    for (let i = 0; i < count; i++) merged.setInstanceUserData(i, data[i]);

    for (const mesh of meshes) mesh.dispose();

    this.#backendSelection = new Selection({
      type: 'instanced',
      object: merged,
      indices: Uint32Array.from({ length: count }, (_, i) => i),
    });
    return this;
  }

  /**
   * Gets or sets a FIFO cap (Prompt 168) on how many of the most-recently-
   * bound datums stay visible: once `data()`'s array exceeds `size`, the
   * oldest (frontmost) entries are trimmed before every `render()`/
   * `update()` — `#prepareData()`'s first step, ahead of `.filter()`/
   * `.use()`/`.sort()` — so `update()`'s existing join treats them as exits
   * and dissolves them out exactly like any other departing datum
   * (CLAUDE.md §1.1 DRY: no second exit/removal path lives here — `window()`
   * only shrinks what `update()` sees as "current"; the built-in
   * shrink-and-fade dissolve, or a registered `on('exit', fn)`/
   * `exitAnimation()`, handles the rest exactly as it always does).
   *
   * Meant for `stream()`-driven charts whose `data()` array keeps growing —
   * caps memory/instance count at a fixed ceiling regardless of how long
   * the stream has been running, instead of every chunk making the chart
   * (and its underlying `GraphInstancedObject` capacity) grow forever.
   * @param {number} [size] A positive integer. Omit to read the current cap (`null` if unset).
   * @returns {number|null|this}
   * @throws {TypeError} If `size` is given and isn't a positive integer.
   * @example
   * chart.data(initialRows, (d) => d.id).window(500).render();
   * chart.stream(DataStream.fromWebSocket(url, parse)); // oldest rows dissolve out past 500
   */
  window(size) {
    this.#assertNotDisposed('window');
    if (size === undefined) return this.#windowSize;
    if (!Number.isInteger(size) || size < 1) {
      throw new TypeError(`GraphChart.window: size must be a positive integer, received ${JSON.stringify(size)}.`);
    }
    this.#windowSize = size;
    return this;
  }

  /**
   * Converts a list of this chart's currently-selected datums (e.g. from
   * `PointerRouter.selectedEntries()`/`KeyboardNav`) into portable join keys
   * — the same `keyFn` passed to the last `data(arr, keyFn)` call (or the
   * datum itself, if none was given) — suitable for `JSON.stringify` and
   * later restoring via `importSelection()`. Necessary because interactive
   * selection is tracked by `interact/`'s `PointerRouter`/`KeyboardNav` keyed
   * on datum *object identity*, which `chart/` cannot depend on (CLAUDE.md
   * §1.4) and which breaks across a fresh `data(newRows)` call anyway — even
   * same-content rows become new object instances.
   * @param {Array<*>} selectedData Datums currently marked selected.
   * @returns {Array<*>} Portable keys, in `selectedData`'s order.
   * @throws {TypeError} If `selectedData` isn't an array.
   * @throws {Error} If `data(arr)` hasn't been called yet.
   * @example
   * const keys = chart.exportSelection(router.selectedEntries().map((e) => e.datum));
   * localStorage.setItem('selection', JSON.stringify(keys));
   */
  exportSelection(selectedData) {
    this.#assertNotDisposed('exportSelection');
    if (!Array.isArray(selectedData)) {
      throw new TypeError(`GraphChart.exportSelection: expected an array, received ${JSON.stringify(selectedData)}.`);
    }
    if (this.#pendingData === null) {
      throw new Error('GraphChart.exportSelection: call data(arr) before exportSelection().');
    }
    const keyFn = this.#pendingKeyFn ?? ((d) => d);
    return selectedData.map((d) => keyFn(d, this.#pendingData.indexOf(d)));
  }

  /**
   * The inverse of `exportSelection()`: resolves a previously-exported list
   * of keys back to this chart's *current* live `data()` entries — for a
   * caller to re-apply whatever interactive selected state it manages (e.g.
   * `stateMachineFor(chart).setState(datum, 'selected')` for each) after a
   * fresh `data(newRows)` call has replaced the underlying datum objects.
   * @param {Array<*>} keys Keys previously returned by `exportSelection()`.
   * @returns {Array<*>} The subset of the current `data()` array whose key matches, in `data()` order.
   * @throws {TypeError} If `keys` isn't an array.
   * @throws {Error} If `data(arr)` hasn't been called yet.
   * @example
   * chart.data(reloadedRows, (d) => d.id);
   * for (const datum of chart.importSelection(savedKeys)) stateMachineFor(chart).setState(datum, 'selected');
   */
  importSelection(keys) {
    this.#assertNotDisposed('importSelection');
    if (!Array.isArray(keys)) {
      throw new TypeError(`GraphChart.importSelection: expected an array, received ${JSON.stringify(keys)}.`);
    }
    if (this.#pendingData === null) {
      throw new Error('GraphChart.importSelection: call data(arr) before importSelection().');
    }
    const keyFn = this.#pendingKeyFn ?? ((d) => d);
    const keySet = new Set(keys);
    return this.#pendingData.filter((d, i) => keySet.has(keyFn(d, i)));
  }

  /**
   * Registers a handler for either a lifecycle event (`'enter'`/`'update'`/
   * `'exit'` — fired internally by `update()`, Prompt 130, as datums enter,
   * update, or exit on each `data()` call, `handler(selection)`) or an
   * interaction event (`'hover'`/`'select'`/`'deselect'`/`'brushStart'`/
   * `'brushEnd'`/`'lassoStart'`/`'lassoEnd'`/`'dragStart'`/`'dragEnd'`/
   * `'focus'` — fired externally via `dispatch()`, Prompt 156, by whichever
   * `interact/` class detected it: `PointerRouter` for `hover`/`select`/
   * `deselect`/`dragStart`/`dragEnd`, `Brush`/`Lasso` for their `*Start`/
   * `*End` pairs, `KeyboardNav` for `focus`/`select`/`deselect`,
   * `handler(payload)`). Both share this one entry point (matching D3's own
   * unified `.on()`) but are stored and dispatched separately internally —
   * see `INTERACTION_EVENTS`'s own comment for why.
   * @param {'enter'|'update'|'exit'|'hover'|'select'|'deselect'|'brushStart'|'brushEnd'|'lassoStart'|'lassoEnd'|'dragStart'|'dragEnd'|'focus'} event Event name to listen for.
   * @param {(...args: *) => void} handler Called with the event's payload (a `Selection` for lifecycle events, an interaction payload object otherwise).
   * @returns {this}
   * @throws {TypeError} If `event` isn't recognized, or `handler` isn't a function.
   * @example chart.on('exit', (selection) => selection.transition().duration(400).attr('opacity', 0).remove());
   * @example chart.on('select', ({ datum }) => console.log('selected', datum));
   */
  on(event, handler) {
    this.#assertNotDisposed('on');
    if (!CHART_EVENTS.has(event) && !INTERACTION_EVENTS.has(event)) {
      throw new TypeError(`GraphChart.on: event must be one of ${[...CHART_EVENTS, ...INTERACTION_EVENTS].join(', ')}, received ${JSON.stringify(event)}.`);
    }
    if (typeof handler !== 'function') {
      throw new TypeError(`GraphChart.on: handler must be a function, received ${JSON.stringify(handler)}.`);
    }
    if (CHART_EVENTS.has(event)) {
      this.#handlers[event].push(handler);
    } else {
      if (!this.#interactionHandlers.has(event)) this.#interactionHandlers.set(event, []);
      this.#interactionHandlers.get(event).push(handler);
    }
    return this;
  }

  /**
   * Fires every handler `on(event, handler)` registered for one of the
   * *interaction* events (Prompt 156) — called by `interact/`'s
   * `PointerRouter`/`Brush`/`Lasso`/`KeyboardNav`, which import `chart/` (the
   * allowed direction); `chart/` never calls this on itself, since it cannot
   * detect a pointer/keyboard event. Deliberately rejects `'enter'`/
   * `'update'`/`'exit'` — those are only ever dispatched internally by
   * `update()`'s own data-join, never through this generic path.
   * @param {'hover'|'select'|'deselect'|'brushStart'|'brushEnd'|'lassoStart'|'lassoEnd'|'dragStart'|'dragEnd'|'focus'} event Interaction event name to fire.
   * @param {*} payload Passed as-is to every registered handler.
   * @returns {this}
   * @throws {TypeError} If `event` isn't a recognized interaction event.
   * @example chart.dispatch('select', { chart, datum, mesh, instanceIndex, worldPoint, domEvent });
   */
  dispatch(event, payload) {
    this.#assertNotDisposed('dispatch');
    if (!INTERACTION_EVENTS.has(event)) {
      throw new TypeError(`GraphChart.dispatch: event must be one of ${[...INTERACTION_EVENTS].join(', ')}, received ${JSON.stringify(event)}.`);
    }
    for (const fn of this.#interactionHandlers.get(event) ?? []) fn(payload);
    return this;
  }

  /** @returns {{enter: Function[], update: Function[], exit: Function[]}} Registered *lifecycle* handlers, keyed by event — interaction-event handlers (registered via the same `on()`) live in a separate internal map, not reflected here. */
  handlers() {
    this.#assertNotDisposed('handlers');
    return this.#handlers;
  }

  /**
   * Sugar for `on('enter', fn)`.
   * @param {(selection: Selection) => void} fn Called with the newly entered `Selection`.
   * @returns {this}
   * @example chart.onEnter((entered) => entered.attr('scale.y', 0.01));
   */
  onEnter(fn) {
    return this.on('enter', fn);
  }

  /**
   * Sugar for `on('update', fn)`.
   * @param {(selection: Selection) => void} fn Called with the updated `Selection`.
   * @returns {this}
   * @example chart.onUpdate((updated) => updated.attr('position.y', (d) => d.value));
   */
  onUpdate(fn) {
    return this.on('update', fn);
  }

  /**
   * Sugar for `on('exit', fn)`.
   * @param {(selection: Selection) => void} fn Called with the exiting `Selection`.
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
    } else if (exited.size() > 0 && this.#exitAnimationConfig) {
      // A configured exitAnimation() replaces the built-in dissolve entirely
      // — the particle burst is the visual, so there's nothing left to
      // shrink/fade/transition. Selection.remove() frees the node right away
      // (matches its own documented "no delay" contract).
      exited.remove(this.#exitAnimationConfig.name, this.#exitAnimationConfig.options);
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
   * Applies the `window(size)` FIFO trim, then `filter`, then every `.use()`
   * middleware in registration order, then `sort` (each step skipped if
   * unset) to the last array passed to `data()` — shared by `render()` and
   * `update()` (CLAUDE.md §1.1 DRY two-strike rule). The window trim runs
   * first so it caps membership by raw arrival order (`data()`'s array
   * order — the tail is newest for a `stream()`-driven chart, since
   * `applyStreamChunk` appends), before `.filter()`/`.sort()` reshape what's
   * shown *within* that capped set. Middleware runs between filter and sort
   * so it can both shrink/reshape the filtered set (`decimate`, `aggregate`)
   * and still have its output re-ordered by a separately-configured `.sort()`.
   * @returns {Array}
   */
  #prepareData() {
    let data = this.#pendingData;
    if (this.#windowSize !== null && data.length > this.#windowSize) {
      data = data.slice(-this.#windowSize);
    }
    if (this.#filterFn) data = data.filter(this.#filterFn);
    for (const middlewareFn of this.#middlewares) data = middlewareFn(data);
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
   * `Selection.dispose()`), and drops registered lifecycle *and*
   * interaction-event handlers.
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
    this.#stopStream();
    this.#stopLOD();
    for (const transition of this.#activeTransitions) transition.stop();
    this.#activeTransitions.clear();
    for (const exiting of this.#pendingExits) exiting.dispose();
    this.#pendingExits.clear();
    this.#backendSelection.dispose();
    this.#handlers = { enter: [], update: [], exit: [] };
    this.#interactionHandlers.clear();
    if (this.#legendConfig) {
      const { container } = this.#legendConfig;
      while (container.firstChild) container.removeChild(container.firstChild);
      this.#legendConfig = null;
    }
  }

  /** Ends the active `stream()` binding's pump loop and disposes its `DataStream`, if any. Idempotent. */
  #stopStream() {
    if (this.#streamStop) this.#streamStop();
    this.#streamStop = null;
    this.#streamDataStream?.dispose?.();
    this.#streamDataStream = null;
  }

  /** Unregisters the active `enableLOD()` per-frame check, if any. Idempotent. */
  #stopLOD() {
    if (this.#lod) loop.remove(this.#lod.tick);
    this.#lod = null;
  }

  /** @param {string} method @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#destroyed) {
      throw new Error(`GraphChart.${method}: this chart has been destroyed.`);
    }
  }
}
