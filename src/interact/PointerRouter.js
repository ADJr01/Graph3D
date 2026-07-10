import * as THREE from 'three';
import { Picker } from './Picker.js';
import { StateMachine } from './StateMachine.js';
import { localPositionFromWorld, projectToScreen } from './regionSelect.js';
import { dispatchToChart } from './eventEmitter.js';
import { Selection } from '../compose/index.js';

/** Click-to-label hit radius in screen pixels — a comfortable tap/click target around a label's projected position, since a label has no real mesh to raycast against yet (Phase 6's SDF text). */
const LABEL_HIT_RADIUS_PX = 20;

/**
 * Wires real DOM pointer events on `domElement` into `picker`'s hit-testing
 * and a per-chart `StateMachine` (Prompt 148) — the "detect when a datum
 * should transition" half `StateMachine` itself deliberately doesn't own —
 * plus `Selection.dispatch()` (Prompt 149) so a caller's own
 * `chart.selection().filter(...).on('click', fn)` handlers fire too.
 *
 * - **`pointermove`** → hover-enter/leave: `Picker.pickAt()` each move;
 *   comparing against the previous hit fires `Selection.dispatch('hover-leave'|'hover-enter', ...)`
 *   and transitions the datum to/from `'hovered'` via that chart's
 *   `StateMachine` — but only when the datum is currently `'default'`
 *   (entering) or `'hovered'` (leaving): a `'selected'`/`'dragging'` datum
 *   keeps that state while merely hovered over or away from, since a state
 *   machine transition should reflect the *strongest* current interaction,
 *   not the most recent one. `Selection.dispatch('hover-enter'|'hover-leave', ...)`
 *   still always fires regardless (useful for e.g. a tooltip that should
 *   track the pointer independent of selection).
 * - **`click`** → select / shift-multi-select: without a held Shift key, every
 *   previously selected datum (across every chart) is cleared back to
 *   `'default'` first (single-select replaces); the clicked datum (if any)
 *   is then set to `'selected'`. With Shift held, the clear step is skipped
 *   and the clicked datum's selection is *toggled* instead — added if not
 *   already selected, removed if it was (accumulating a multi-selection
 *   across possibly multiple charts, since `picker` itself may be
 *   registered against several). `Selection.dispatch('click', ...)` always
 *   fires for a hit, regardless of the resulting selection state.
 *
 * - **`pointerdown`/`pointermove`/`pointerup`** → drag-and-drop (Prompt 154),
 *   only for a hit chart with `chart.draggable() === true`: `pointerdown` on
 *   a draggable chart's datum transitions it to `'dragging'` (interrupting
 *   whatever state it was in — an explicit drag is the strongest possible
 *   interaction) and remembers whether it was `'selected'` beforehand;
 *   `pointermove` repositions the datum by unprojecting the pointer through
 *   `picker.camera` onto the plane parallel to the screen at the datum's
 *   original depth (so it tracks the cursor exactly, for both perspective and
 *   orthographic cameras), writing through `Selection.attr('position.*', ...)`
 *   like any other micro-control write; `pointerup` fires `Selection.dispatch('dragEnd', ...)`
 *   and restores the pre-drag state (`'selected'` if it was, else `'default'`)
 *   — `Selection.dispatch('dragStart', ...)` fires from `pointerdown` instead.
 *   A drag suppresses this router's own hover tracking for its duration (no
 *   hover-enter/leave noise for datums the cursor merely passes over
 *   mid-drag) and suppresses the `click` that a real browser fires right
 *   after the terminating `pointerup`, so a drag never also re-triggers
 *   click-to-select on the same gesture.
 *
 * Deliberately does not render the dragged datum's position live except via
 * that direct write (no separate "drag ghost"/preview) — the write itself
 * is the visual feedback, the same "detect, don't render more than that"
 * split `Brush`/`Lasso` (Prompt 152) already follow. What a `'dragging'`
 * state *looks like* beyond that position write is `StateMachine.style()`'s
 * job, configured by the caller, same as every other state.
 *
 * - **`registerLabel`/`unregisterLabel`** (Prompt 155) → `click` also
 *   hit-tests every registered `annotation.label()` object by projecting its
 *   `position` to screen space (a label has no real mesh to raycast against
 *   yet — Phase 6's SDF text) and firing `label.emit('click', ...)` for the
 *   closest one within `LABEL_HIT_RADIUS_PX`, independent of any chart-datum
 *   click handling that same click also triggers.
 * - **`selectedEntries()`** (Prompt 155) exposes the `{chart, datum}` pairs
 *   this router currently considers selected — e.g. for
 *   `chart.exportSelection(router.selectedEntries().map((e) => e.datum))`.
 * - Every transition above also calls `chart.dispatch(event, payload)`
 *   (Prompt 156) — `'hover'` on hover-enter, `'select'`/`'deselect'` on
 *   click, `'dragStart'`/`'dragEnd'` on drag — alongside the existing
 *   `Selection.dispatch()` calls, so `barChart.on('select', fn)` works the
 *   same way `barChart.selection().on('click', fn)` already did.
 *
 * @example
 * const picker = new Picker({ camera, domElement: canvas });
 * picker.register(barChart);
 * const router = new PointerRouter({ picker, domElement: canvas });
 * router.stateMachineFor(barChart).style('hovered', (s) => s.attr('scale.x', 1.1));
 * barChart.selection().filter((d) => d.value > 90).on('click', (d) => console.log('clicked', d));
 */
export class PointerRouter {
  /** @type {Picker} */
  #picker;

  /** @type {{addEventListener: Function, removeEventListener: Function}} */
  #domElement;

  /** @type {Map<import('../chart/GraphChart.js').GraphChart, StateMachine>} */
  #stateMachines = new Map();

  /** @type {{chart: *, mesh: *, instanceIndex: number|null, datum: *, worldPoint: *}|null} */
  #hoveredHit = null;

  /** @type {Map<*, import('../chart/GraphChart.js').GraphChart>} selected datum → its chart */
  #selected = new Map();

  /** @type {Set<{type: 'label', position: {x:number,y:number,z:number}, emit: Function}>} `annotation.label()` objects hit-tested on click (Prompt 155). */
  #labels = new Set();

  /**
   * @type {{chart: *, mesh: *, instanceIndex: number|null, datum: *, worldPoint: *,
   *   selection: import('../compose/index.js').Selection, ndcZ: number, wasSelected: boolean}|null}
   *   The in-progress drag gesture, if any — `worldPoint` is a private clone, kept current by
   *   every `pointermove` (unlike `Picker`'s own `hit.worldPoint`, which this class never mutates).
   */
  #dragState = null;

  /** @type {boolean} Set on a drag's `pointerup`; consumed (and cleared) by the very next `click`. */
  #suppressNextClick = false;

  /** @type {THREE.Vector3} Scratch reused across `pointermove` drag updates to avoid a per-frame allocation. */
  #dragTargetScratch = new THREE.Vector3();

  /** @type {(domEvent: *) => void} */
  #onPointerDown;

  /** @type {(domEvent: *) => void} */
  #onPointerMove;

  /** @type {(domEvent: *) => void} */
  #onPointerUp;

  /** @type {(domEvent: *) => void} */
  #onClick;

  /** @type {boolean} */
  #disposed = false;

  /**
   * @param {{ picker: Picker, domElement: {addEventListener: Function, removeEventListener: Function} }} options
   * @throws {TypeError} If `picker` is not a `Picker`, or `domElement` doesn't expose `addEventListener`/`removeEventListener`.
   * @example new PointerRouter({ picker, domElement: canvas });
   */
  constructor({ picker, domElement } = {}) {
    if (!(picker instanceof Picker)) {
      throw new TypeError('PointerRouter: picker must be a Picker instance.');
    }
    if (!domElement || typeof domElement.addEventListener !== 'function' || typeof domElement.removeEventListener !== 'function') {
      throw new TypeError('PointerRouter: domElement must expose addEventListener/removeEventListener.');
    }
    this.#picker = picker;
    this.#domElement = domElement;
    this.#onPointerDown = (domEvent) => this.#handlePointerDown(domEvent);
    this.#onPointerMove = (domEvent) => this.#handlePointerMove(domEvent);
    this.#onPointerUp = (domEvent) => this.#handlePointerUp(domEvent);
    this.#onClick = (domEvent) => this.#handleClick(domEvent);
    domElement.addEventListener('pointerdown', this.#onPointerDown);
    domElement.addEventListener('pointermove', this.#onPointerMove);
    domElement.addEventListener('pointerup', this.#onPointerUp);
    domElement.addEventListener('click', this.#onClick);
  }

  /**
   * The `StateMachine` this router drives for `chart`, creating one (lazily,
   * cached thereafter) on first access — a chart only ever needs to have
   * been `picker.register()`ed for its hits to reach here at all.
   * @param {import('../chart/GraphChart.js').GraphChart} chart
   * @returns {StateMachine}
   * @throws {Error} If called after `dispose()`.
   * @example router.stateMachineFor(barChart).style('selected', (s) => s.attr('color', 'gold'));
   */
  stateMachineFor(chart) {
    this.#assertNotDisposed('stateMachineFor');
    let stateMachine = this.#stateMachines.get(chart);
    if (!stateMachine) {
      stateMachine = new StateMachine(chart);
      this.#stateMachines.set(chart, stateMachine);
    }
    return stateMachine;
  }

  /**
   * Every currently-selected `{chart, datum}` pair, in selection order —
   * exposes this router's own private `#selected` bookkeeping (Prompt 155,
   * resolving the gap `skipping_list.md` flagged after Prompt 154) so a
   * caller can serialize it (e.g. via `chart.exportSelection()`) or drive a
   * `FocusFollower` from whichever entry it cares about.
   * @returns {{chart: import('../chart/GraphChart.js').GraphChart, datum: *}[]}
   * @throws {Error} If called after `dispose()`.
   * @example router.selectedEntries().map((e) => e.datum);
   */
  selectedEntries() {
    this.#assertNotDisposed('selectedEntries');
    return [...this.#selected].map(([datum, chart]) => ({ chart, datum }));
  }

  /**
   * Registers an `annotation.label()` object so a `click` landing within
   * `LABEL_HIT_RADIUS_PX` of its projected screen position fires
   * `label.emit('click', { label, domEvent })` (Prompt 155) — the closest
   * registered label within range wins if several overlap. No-op if already registered.
   * @param {{type: 'label', position: {x:number,y:number,z:number}, emit: Function}} label An `annotation.label()` return value.
   * @returns {this}
   * @throws {TypeError} If `label` isn't an `annotation.label()` object.
   * @throws {Error} If called after `dispose()`.
   * @example router.registerLabel(annotation.label({ text: 'Peak', position: { x: 3, y: 5, z: 0 } }));
   */
  registerLabel(label) {
    this.#assertNotDisposed('registerLabel');
    if (!label || label.type !== 'label' || typeof label.emit !== 'function') {
      throw new TypeError('PointerRouter.registerLabel: expected an annotation.label() object.');
    }
    this.#labels.add(label);
    return this;
  }

  /**
   * Removes a label from the set `click` hit-tests against. No-op if not registered.
   * @param {{type: 'label'}} label
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example router.unregisterLabel(peakLabel);
   */
  unregisterLabel(label) {
    this.#assertNotDisposed('unregisterLabel');
    this.#labels.delete(label);
    return this;
  }

  /**
   * Removes the `pointerdown`/`pointermove`/`pointerup`/`click` listeners
   * from `domElement` and releases this router's `StateMachine`s, selection,
   * registered labels, and in-progress-drag bookkeeping. Idempotent. Does not
   * reset any datum's current state — charts/state machines may still be in
   * use elsewhere after this router is gone.
   * @example router.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#domElement.removeEventListener('pointerdown', this.#onPointerDown);
    this.#domElement.removeEventListener('pointermove', this.#onPointerMove);
    this.#domElement.removeEventListener('pointerup', this.#onPointerUp);
    this.#domElement.removeEventListener('click', this.#onClick);
    this.#stateMachines.clear();
    this.#selected.clear();
    this.#labels.clear();
    this.#hoveredHit = null;
    this.#dragState = null;
    this.#suppressNextClick = false;
  }

  /** @param {*} domEvent */
  #handlePointerDown(domEvent) {
    const hit = this.#picker.pickAt(domEvent.offsetX, domEvent.offsetY);
    if (!hit || typeof hit.chart.draggable !== 'function' || !hit.chart.draggable()) return;

    const stateMachine = this.stateMachineFor(hit.chart);
    const wasSelected = stateMachine.stateOf(hit.datum) === 'selected';
    stateMachine.setState(hit.datum, 'dragging');

    const selection = hit.chart.selection().filter((d) => d === hit.datum);
    const ndcZ = this.#dragTargetScratch.copy(hit.worldPoint).project(this.#picker.camera).z;
    this.#dragState = { ...hit, selection, ndcZ, wasSelected, worldPoint: hit.worldPoint.clone() };
    Selection.dispatch('dragStart', { ...hit, domEvent });
    dispatchToChart(hit.chart, 'dragStart', { ...hit, domEvent });
  }

  /** @param {*} domEvent */
  #handlePointerMove(domEvent) {
    if (this.#dragState) {
      this.#updateDragPosition(domEvent);
      return;
    }

    const hit = this.#picker.pickAt(domEvent.offsetX, domEvent.offsetY);
    const previous = this.#hoveredHit;
    const changed = previous?.chart !== hit?.chart || previous?.datum !== hit?.datum;
    if (!changed) return;

    if (previous) {
      Selection.dispatch('hover-leave', { ...previous, domEvent });
      const stateMachine = this.stateMachineFor(previous.chart);
      if (stateMachine.stateOf(previous.datum) === 'hovered') stateMachine.setState(previous.datum, 'default');
    }
    if (hit) {
      Selection.dispatch('hover-enter', { ...hit, domEvent });
      dispatchToChart(hit.chart, 'hover', { ...hit, domEvent });
      const stateMachine = this.stateMachineFor(hit.chart);
      if (stateMachine.stateOf(hit.datum) === 'default') stateMachine.setState(hit.datum, 'hovered');
    }
    this.#hoveredHit = hit;
  }

  /**
   * Unprojects the pointer's current canvas position through `picker.camera`
   * at the drag's captured NDC depth (`#dragState.ndcZ`) — the plane parallel
   * to the screen passing through the datum's position at drag-start — and
   * writes the result as the dragged datum's new local position.
   * `localPositionFromWorld` (`regionSelect.js`) converts the unprojected
   * *world* point back to the local frame `Selection.attr('position.*', ...)`
   * expects, for the identical reason `Brush`/`Lasso`'s containment query
   * needs the opposite conversion (Prompt 152's local-vs-world bug).
   * @param {*} domEvent
   */
  #updateDragPosition(domEvent) {
    // Reads picker.domElement (not this.#domElement) for width/height: the
    // two are the same real canvas in normal usage, but this router's own
    // domElement is only ever required to expose addEventListener/
    // removeEventListener (it's just where listeners attach) — picker.domElement
    // is the one pickAt() itself already depends on having width/height.
    const { width, height } = this.#picker.domElement;
    const ndcX = (domEvent.offsetX / width) * 2 - 1;
    const ndcY = -(domEvent.offsetY / height) * 2 + 1;
    const worldPoint = this.#dragTargetScratch.set(ndcX, ndcY, this.#dragState.ndcZ).unproject(this.#picker.camera);

    const { selection } = this.#dragState;
    const localPoint = localPositionFromWorld(selection.backend, 0, worldPoint);
    selection.attr('position.x', localPoint.x).attr('position.y', localPoint.y).attr('position.z', localPoint.z);
    this.#dragState.worldPoint.copy(worldPoint);
  }

  /** @param {*} domEvent */
  #handlePointerUp(domEvent) {
    if (!this.#dragState) return;
    const { chart, mesh, instanceIndex, datum, worldPoint, wasSelected } = this.#dragState;
    Selection.dispatch('dragEnd', { chart, mesh, instanceIndex, datum, worldPoint, domEvent });
    dispatchToChart(chart, 'dragEnd', { chart, mesh, instanceIndex, datum, worldPoint, domEvent });
    this.stateMachineFor(chart).setState(datum, wasSelected ? 'selected' : 'default');
    this.#dragState = null;
    this.#suppressNextClick = true;
  }

  /** @param {*} domEvent */
  #handleClick(domEvent) {
    if (this.#suppressNextClick) {
      this.#suppressNextClick = false;
      return;
    }
    this.#dispatchLabelClick(domEvent);
    const hit = this.#picker.pickAt(domEvent.offsetX, domEvent.offsetY);

    if (!domEvent.shiftKey) {
      for (const [datum, chart] of this.#selected) {
        this.stateMachineFor(chart).setState(datum, 'default');
        dispatchToChart(chart, 'deselect', { chart, datum, domEvent });
      }
      this.#selected.clear();
    }
    if (!hit) return;

    if (this.#selected.has(hit.datum)) {
      this.stateMachineFor(hit.chart).setState(hit.datum, 'default');
      this.#selected.delete(hit.datum);
      dispatchToChart(hit.chart, 'deselect', { ...hit, domEvent });
    } else {
      this.stateMachineFor(hit.chart).setState(hit.datum, 'selected');
      this.#selected.set(hit.datum, hit.chart);
      dispatchToChart(hit.chart, 'select', { ...hit, domEvent });
    }
    Selection.dispatch('click', { ...hit, domEvent });
  }

  /**
   * Projects every registered label's `position` to screen space and fires
   * `emit('click', ...)` on the closest one within `LABEL_HIT_RADIUS_PX` of
   * `domEvent`, if any. Independent of the chart-datum click logic below it
   * — a label click doesn't touch `#selected`/`StateMachine` bookkeeping.
   * @param {*} domEvent
   */
  #dispatchLabelClick(domEvent) {
    if (this.#labels.size === 0) return;
    const { camera, domElement } = this.#picker;
    let closest = null;
    for (const label of this.#labels) {
      const screenPoint = projectToScreen(label.position, camera, domElement);
      if (screenPoint === null) continue;
      const distance = Math.hypot(screenPoint.x - domEvent.offsetX, screenPoint.y - domEvent.offsetY);
      if (distance <= LABEL_HIT_RADIUS_PX && (closest === null || distance < closest.distance)) {
        closest = { label, distance };
      }
    }
    if (closest) closest.label.emit('click', { label: closest.label, domEvent });
  }

  /** @param {string} method @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`PointerRouter.${method}: this router has been disposed.`);
    }
  }
}
