// interact/ sits above material/ (via postfx/) in CLAUDE.md §1.4's layering
// table — an ordinary downward import, not a sanctioned exception. This is
// what lets StateMachine apply Prompt 150's default hover/select visuals
// (outline effect + hover scale) itself, using only `chart.selection()`'s
// already-public `.backend` getter — no dependency on PointerRouter's own
// pointer-event plumbing, so `setState(datum, 'hovered')` called directly
// (not through a pointer at all) gets the same defaults.
import { applyEffect, removeEffect } from '../material/index.js';

// The fixed interaction-state vocabulary (the prompt's own wording). A datum
// not explicitly set is implicitly 'default' — never stored, so a chart with
// no active interaction carries zero StateMachine bookkeeping.
const STATES = new Set(['default', 'hovered', 'focused', 'selected', 'dragging']);

/**
 * Prompt 150's out-of-the-box hover/select appearance — applied by
 * `setState` itself (see below), entirely independent of the `style()`
 * custom-response map (so a fresh `StateMachine`'s `style('hovered')` still
 * reads back `null`, matching the pre-150 contract; existing tests rely on
 * this). Both use the same `neonEdge` preset (a glowing silhouette edge —
 * the closest built-in analogue to "outline pass") with a different color,
 * which is what "selected → outline variant" means here — select has no
 * `scale` bump (the prompt only calls for one on hover).
 */
const DEFAULT_HOVER_STYLE = { effect: { name: 'neonEdge', options: { color: '#66ccff', intensity: 1.3 } }, scale: 1.05 };
const DEFAULT_SELECT_STYLE = { effect: { name: 'neonEdge', options: { color: '#ffcc00', intensity: 1.6 } }, scale: 1 };

/**
 * Per-chart datum interaction state (`default`/`hovered`/`focused`/
 * `selected`/`dragging`) with a configurable visual response per state.
 * Wraps one chart — duck-typed to its `selection()` method, the same escape
 * hatch `Picker` (Prompt 147) uses — rather than being owned by `GraphChart`
 * itself: `chart/` sits below `interact/` in CLAUDE.md §1.4's layering
 * table, so a chart importing `StateMachine` would close a real dependency
 * cycle. A caller wanting `chart.stateOf(datum)`-style access constructs
 * `new StateMachine(chart)` alongside the chart and calls `stateOf(datum)`
 * on that.
 *
 * `style(state, responseFn)` registers what a state *looks like*: `setState`
 * calls it with `(selection, datum)` — `selection` already filtered down to
 * just that datum's node — whenever a datum transitions into that state. No
 * separate "leave" hook exists here: leaving a state is just entering
 * another one (typically `'default'`), and that state's own `responseFn` (if
 * any) is responsible for whatever appearance it wants — declarative, same
 * as `chart.color(fn)`/`chart.opacity(fn)`'s absolute (never relative)
 * writes. Detecting *when* a datum should transition (pointer hover-enter/
 * leave, click-to-select, drag-start/end) is Prompt 149's job, not this
 * one's — `StateMachine` only stores state and applies its configured
 * response; it has no pointer/event wiring of its own.
 *
 * @example
 * const stateMachine = new StateMachine(chart);
 * stateMachine.style('hovered', (selection) => selection.attr('scale.x', 1.1));
 * stateMachine.setState(datum, 'hovered');
 * stateMachine.stateOf(datum); // 'hovered'
 */
export class StateMachine {
  /** @type {{selection: () => import('../compose/index.js').Selection}} */
  #chart;

  /** @type {Map<*, string>} datum → state, only for non-'default' entries */
  #stateByDatum = new Map();

  /** @type {Map<string, (selection: import('../compose/index.js').Selection, datum: *) => void>} */
  #styles = new Map();

  /** @type {{effect: {name: string, options: Object}, scale: number}} */
  #hoverStyleConfig = { ...DEFAULT_HOVER_STYLE, effect: { ...DEFAULT_HOVER_STYLE.effect } };

  /** @type {{effect: {name: string, options: Object}, scale: number}} */
  #selectStyleConfig = { ...DEFAULT_SELECT_STYLE, effect: { ...DEFAULT_SELECT_STYLE.effect } };

  /** @type {WeakMap<*, {x: number, y: number, z: number}>} datum → its scale just before the default hover bump, so leaving 'hovered' restores exactly instead of dividing (safe regardless of which state was entered next). */
  #baseScale = new WeakMap();

  /**
   * @param {{selection: () => import('../compose/index.js').Selection}} chart Any `GraphChart` — duck-typed to its `selection()` method.
   * @throws {TypeError} If `chart` doesn't expose a `selection()` method.
   * @example new StateMachine(barChart);
   */
  constructor(chart) {
    if (!chart || typeof chart.selection !== 'function') {
      throw new TypeError('StateMachine: chart must expose a selection() method.');
    }
    this.#chart = chart;
  }

  /**
   * The chart this state machine wraps.
   * @returns {{selection: () => import('../compose/index.js').Selection}}
   * @example stateMachine.chart.selection();
   */
  get chart() {
    return this.#chart;
  }

  /**
   * Gets or sets the visual response for `state` — called with
   * `(selection, datum)` (`selection` filtered to just that one datum's
   * node) every time a datum transitions into `state` via `setState`. A
   * state with no configured response is a no-op transition (state
   * bookkeeping still updates; nothing visual happens).
   * @param {'default'|'hovered'|'focused'|'selected'|'dragging'} state
   * @param {(selection: import('../compose/index.js').Selection, datum: *) => void} [responseFn]
   * @returns {((selection: import('../compose/index.js').Selection, datum: *) => void)|null|this}
   * @throws {TypeError} If `state` isn't one of the fixed vocabulary, or `responseFn` is given and isn't a function.
   * @example stateMachine.style('selected', (selection) => selection.attr('color', 'gold'));
   */
  style(state, responseFn) {
    this.#assertValidState('style', state);
    if (responseFn === undefined) return this.#styles.get(state) ?? null;
    if (typeof responseFn !== 'function') {
      throw new TypeError(`StateMachine.style: responseFn must be a function, received ${JSON.stringify(responseFn)}.`);
    }
    this.#styles.set(state, responseFn);
    return this;
  }

  /**
   * Gets or sets Prompt 150's default hover appearance: a shader effect
   * (`material.effects`' registered presets — defaults to `neonEdge`, an
   * outline-style glow) plus a uniform scale bump (default `1.05`, i.e.
   * +5%). Applied automatically by `setState` on every 'default'↔'hovered'
   * transition — resolves `chart.hoverEffect()`'s config first if the chart
   * exposes one and has actually configured it (Prompt 150's other named
   * entry point), falling back to this config otherwise. Pass `{ scale: 1 }`
   * to disable the scale bump entirely while keeping the effect (or vice
   * versa via `{ effect: null }`).
   * @param {{effect?: {name: string, options?: Object}|null, scale?: number}} [options]
   * @returns {{effect: {name: string, options: Object}|null, scale: number}|this}
   * @throws {TypeError} If `options` is given and isn't a plain object, or `scale` isn't a positive finite number.
   * @example stateMachine.hoverStyle({ effect: { name: 'glow', options: { intensity: 2 } }, scale: 1.1 });
   */
  hoverStyle(options) {
    if (options === undefined) return this.#hoverStyleConfig;
    this.#hoverStyleConfig = this.#mergeStyleConfig('hoverStyle', this.#hoverStyleConfig, options);
    return this;
  }

  /**
   * Gets or sets Prompt 150's default select appearance — same shape and
   * defaulting rules as `hoverStyle`, but with no scale bump by default
   * ("selected → outline variant" carries no scale change per the prompt's
   * own wording), applied on every 'default'↔'selected' transition.
   * @param {{effect?: {name: string, options?: Object}|null, scale?: number}} [options]
   * @returns {{effect: {name: string, options: Object}|null, scale: number}|this}
   * @throws {TypeError} If `options` is given and isn't a plain object, or `scale` isn't a positive finite number.
   * @example stateMachine.selectStyle({ effect: { name: 'glow', options: { color: 'gold' } } });
   */
  selectStyle(options) {
    if (options === undefined) return this.#selectStyleConfig;
    this.#selectStyleConfig = this.#mergeStyleConfig('selectStyle', this.#selectStyleConfig, options);
    return this;
  }

  /**
   * The current state of `datum` — `'default'` if never set (or last set to
   * `'default'`).
   * @param {*} datum
   * @returns {'default'|'hovered'|'focused'|'selected'|'dragging'}
   * @example stateMachine.stateOf(datum); // 'default'
   */
  stateOf(datum) {
    return this.#stateByDatum.get(datum) ?? 'default';
  }

  /**
   * Transitions `datum` to `state` and applies that state's configured
   * `style()` response (if any) to the datum's current node in this
   * chart's live selection — a no-op visually (bookkeeping still updates)
   * if `datum` isn't currently bound/rendered, or no response is configured
   * for `state`. A no-op entirely (bookkeeping *and* visuals) if `datum` is
   * already in `state`.
   * @param {*} datum
   * @param {'default'|'hovered'|'focused'|'selected'|'dragging'} state
   * @returns {this}
   * @throws {TypeError} If `state` isn't one of the fixed vocabulary.
   * @example stateMachine.setState(datum, 'hovered');
   */
  setState(datum, state) {
    this.#assertValidState('setState', state);
    const previousState = this.stateOf(datum);
    if (previousState === state) return this;

    if (state === 'default') this.#stateByDatum.delete(datum);
    else this.#stateByDatum.set(datum, state);

    const responseFn = this.#styles.get(state);
    if (responseFn || state === 'hovered' || previousState === 'hovered' || state === 'selected' || previousState === 'selected') {
      const selection = this.#chart.selection().filter((d) => d === datum);
      if (!selection.empty()) {
        this.#applyDefaultVisual(selection, datum, previousState, state);
        if (responseFn) responseFn(selection, datum);
      }
    }
    return this;
  }

  /**
   * Applies Prompt 150's default hover/select visuals whenever `datum`
   * enters or leaves `'hovered'`/`'selected'` — entirely independent of the
   * `style()` map (see `DEFAULT_HOVER_STYLE`'s doc comment for why).
   * @param {import('../compose/index.js').Selection} selection Filtered to just `datum`'s one node.
   * @param {*} datum
   * @param {string} previousState
   * @param {string} nextState
   */
  #applyDefaultVisual(selection, datum, previousState, nextState) {
    const backend = selection.backend;
    if (nextState === 'hovered') this.#applyStyle(backend, datum, this.#hoverStyleConfig, 'hover', true);
    else if (previousState === 'hovered') this.#applyStyle(backend, datum, this.#hoverStyleConfig, 'hover', false);

    if (nextState === 'selected') this.#applyStyle(backend, datum, this.#selectStyleConfig, 'select', true);
    else if (previousState === 'selected') this.#applyStyle(backend, datum, this.#selectStyleConfig, 'select', false);
  }

  /**
   * @param {{type: string}} backend A single-datum-filtered selection's backend.
   * @param {*} datum
   * @param {{effect: {name: string, options: Object}|null, scale: number}} styleConfig
   * @param {'hover'|'select'} slot
   * @param {boolean} entering
   */
  #applyStyle(backend, datum, styleConfig, slot, entering) {
    const effectConfig = this.#resolveEffectConfig(slot, styleConfig);
    if (effectConfig) {
      if (entering) applyEffect(backend, 0, slot, effectConfig.name, effectConfig.options);
      else removeEffect(backend, 0, slot);
    }
    if (slot === 'hover' && styleConfig.scale !== 1) {
      this.#applyHoverScale(backend, datum, styleConfig.scale, entering);
    }
  }

  /**
   * `chart.hoverEffect()`/`selectEffect()` (Prompt 150's other named entry
   * point, `GraphChart`-level) wins over this state machine's own
   * `hoverStyle`/`selectStyle` default when the chart actually exposes and
   * has configured one — `this.#chart` is only duck-typed to `selection()`
   * (see the constructor), so both checks guard against a chart that isn't
   * a real `GraphChart`.
   * @param {'hover'|'select'} slot
   * @param {{effect: {name: string, options: Object}|null}} styleConfig
   * @returns {{name: string, options: Object}|null}
   */
  #resolveEffectConfig(slot, styleConfig) {
    const chartMethodName = slot === 'hover' ? 'hoverEffect' : 'selectEffect';
    if (typeof this.#chart[chartMethodName] === 'function') {
      const chartConfig = this.#chart[chartMethodName]();
      if (chartConfig) return chartConfig;
    }
    return styleConfig.effect;
  }

  /**
   * @param {{type: string}} backend
   * @param {*} datum
   * @param {number} factor
   * @param {boolean} entering
   */
  #applyHoverScale(backend, datum, factor, entering) {
    const isInstanced = backend.type === 'instanced';
    const rawIndex = isInstanced ? backend.indices[0] : null;
    const readScale = () => (isInstanced ? backend.object.getInstanceScale(rawIndex) : backend.meshes[0].getScale());
    const writeScale = (x, y, z) => {
      if (isInstanced) {
        backend.object.setInstanceScale(rawIndex, x, y, z);
        backend.object.commitMatrix();
      } else {
        backend.meshes[0].setScale(x, y, z);
      }
    };

    if (entering) {
      const current = readScale();
      this.#baseScale.set(datum, { x: current.x, y: current.y, z: current.z });
      writeScale(current.x * factor, current.y * factor, current.z * factor);
    } else {
      const base = this.#baseScale.get(datum);
      if (!base) return;
      writeScale(base.x, base.y, base.z);
      this.#baseScale.delete(datum);
    }
  }

  /**
   * @param {string} method
   * @param {{effect: {name: string, options: Object}|null, scale: number}} current
   * @param {*} options
   * @returns {{effect: {name: string, options: Object}|null, scale: number}}
   * @throws {TypeError}
   */
  #mergeStyleConfig(method, current, options) {
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError(`StateMachine.${method}: options must be a plain object, received ${JSON.stringify(options)}.`);
    }
    const next = { ...current, ...options };
    if (typeof next.scale !== 'number' || !Number.isFinite(next.scale) || next.scale <= 0) {
      throw new TypeError(`StateMachine.${method}: scale must be a positive finite number, received ${JSON.stringify(next.scale)}.`);
    }
    if (next.effect !== null && (typeof next.effect !== 'object' || typeof next.effect.name !== 'string')) {
      throw new TypeError(`StateMachine.${method}: effect must be null or { name, options? }, received ${JSON.stringify(next.effect)}.`);
    }
    if (next.effect) next.effect = { options: {}, ...next.effect };
    return next;
  }

  /** @param {string} method @param {*} state @throws {TypeError} */
  #assertValidState(method, state) {
    if (!STATES.has(state)) {
      throw new TypeError(
        `StateMachine.${method}: state must be one of ${[...STATES].join(', ')}, received ${JSON.stringify(state)}.`,
      );
    }
  }
}
