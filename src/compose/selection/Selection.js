import { GraphMesh } from '../../object/GraphMesh.js';
import { GraphInstancedObject } from '../../object/GraphInstancedObject.js';
import { applyAttr } from './attr.js';
import { applyStyle } from './style.js';
import { filterBackend, sortBackend, mergeBackend } from './combinators.js';
import { computeJoin, materializeEnter, removeBackend } from './join.js';
import { SelectionTransition } from './SelectionTransition.js';

/**
 * @param {*} backend
 * @returns {{ type: 'meshes', meshes: GraphMesh[] }|{ type: 'instanced', object: GraphInstancedObject, indices: Uint32Array }}
 * @throws {TypeError} If `backend` doesn't match either shape.
 * @throws {RangeError} If an instanced-backend index exceeds the object's capacity.
 */
function validateBackend(backend) {
  if (backend === null || typeof backend !== 'object') {
    throw new TypeError(`Selection: expected a backend object, received ${JSON.stringify(backend)}.`);
  }
  if (backend.type === 'meshes') {
    if (!Array.isArray(backend.meshes) || backend.meshes.some((m) => !(m instanceof GraphMesh))) {
      throw new TypeError('Selection: a meshes backend requires meshes to be an array of GraphMesh instances.');
    }
    return backend;
  }
  if (backend.type === 'instanced') {
    if (!(backend.object instanceof GraphInstancedObject)) {
      throw new TypeError('Selection: an instanced backend requires object to be a GraphInstancedObject instance.');
    }
    if (!(backend.indices instanceof Uint32Array)) {
      throw new TypeError('Selection: an instanced backend requires indices to be a Uint32Array.');
    }
    for (const index of backend.indices) {
      if (index >= backend.object.capacity) {
        throw new RangeError(`Selection: instanced backend index ${index} is out of bounds for capacity ${backend.object.capacity}.`);
      }
    }
    return backend;
  }
  throw new TypeError(`Selection: backend.type must be 'meshes' or 'instanced', received ${JSON.stringify(backend.type)}.`);
}

/**
 * A per-datum handle to one member of a `Selection` — the uniform stand-in
 * for "the raw node" d3 would hand back from `.node()`/`.nodes()`. Unlike
 * d3, there's no single underlying object for an instanced datum (it's an
 * index into a shared `InstancedMesh`), so this proxy — not a raw backend
 * object — is what `Selection.nodes()` returns for both backends alike.
 */
class SelectionNode {
  /** @type {Selection} */
  #selection;
  /** @type {number} */
  #index;

  /** @param {Selection} selection @param {number} index Position within `selection`. */
  constructor(selection, index) {
    this.#selection = selection;
    this.#index = index;
  }

  /** @returns {number} This node's position within its `Selection`. */
  get index() {
    return this.#index;
  }

  /** @returns {*} The datum bound to this node. */
  get datum() {
    return this.#selection.datum(this.#index);
  }
}

/**
 * A uniform per-datum handle set over either backend a chart renders
 * with — individual `GraphMesh`es (low datum count) or one
 * `GraphInstancedObject` (high datum count) — so micro-control code doesn't
 * need to branch on which rendering path a chart chose (CLAUDE.md's Prompt
 * 74 "D3 for 3D" soul). Charts and scenes construct and hand out `Selection`s
 * (via `GraphScene.selectAll`/`selectInstance`, chart internals, or the
 * Phase-4 data-join) — user code never calls `new Selection(...)` directly.
 *
 * Bound data is read through the same per-object storage the `object/`
 * layer already provides for exactly this purpose — `GraphMesh`'s
 * `getUserData('datum')` and `GraphInstancedObject`'s
 * `getInstanceUserData(i)` — rather than a second, duplicate copy living on
 * the `Selection` itself (CLAUDE.md §1.1 DRY): whatever materialized the
 * mesh/instance is responsible for having bound its datum there first.
 *
 * @example
 * const selection = new Selection({ type: 'instanced', object: bars, indices: Uint32Array.from([0, 1, 2]) });
 * selection.size(); // 3
 * selection.data(); // [datum0, datum1, datum2]
 */
export class Selection {
  /** @type {{ type: 'meshes', meshes: GraphMesh[] }|{ type: 'instanced', object: GraphInstancedObject, indices: Uint32Array }} */
  #backend;

  /**
   * @param {{ type: 'meshes', meshes: GraphMesh[] }|{ type: 'instanced', object: GraphInstancedObject, indices: Uint32Array }} backend
   * @throws {TypeError} If `backend` doesn't match either recognized shape.
   * @throws {RangeError} If an instanced-backend index exceeds the object's capacity.
   */
  constructor(backend) {
    this.#backend = validateBackend(backend);
  }

  /**
   * @returns {number} The number of datums this selection covers.
   * @example selection.size(); // 3
   */
  size() {
    return this.#backend.type === 'meshes' ? this.#backend.meshes.length : this.#backend.indices.length;
  }

  /**
   * @returns {boolean} `true` if this selection covers zero datums.
   * @example selection.empty(); // false
   */
  empty() {
    return this.size() === 0;
  }

  /**
   * The datum bound to the node at position `index` within this selection.
   * @param {number} index
   * @returns {*}
   * @throws {RangeError} If `index` is outside `[0, size())`.
   * @example selection.datum(0); // { category: 'Q1', value: 42 }
   */
  datum(index) {
    this.#assertIndex('datum', index);
    return this.#readDatum(index);
  }

  /**
   * Two-in-one, matching d3's own `.data()`: called with no arguments, reads
   * every bound datum in selection order. Called with `newData` (and
   * optionally `keyFn`), **joins** it against the currently bound data
   * (Prompt 78) — the single diff authority is `diff.js`'s `diffData`,
   * consumed here via `join.js`'s `computeJoin` (CLAUDE.md §1.1 DRY: the
   * future `GraphChartDataBinding` reuses the same `diffData`). Matched
   * members are rebound to their new datum in place (same node, new data);
   * the returned `JoinResult` **is** the update selection, plus `.enter()`/
   * `.exit()`/`.join()` for the members that entered/departed.
   * @param {*[]} [newData]
   * @param {(datum: *, index: number) => *} [keyFn] Defaults to a positional
   *   join (index `i` in both the old and new data is "the same" node).
   * @returns {*[]|JoinResult} The bound data (no-arg form), or a `JoinResult` (join form).
   * @throws {TypeError} If `newData` is provided but is not an array, or
   *   `keyFn` is provided but is not a function.
   * @throws {Error} If `keyFn` produces a duplicate key within `newData`.
   * @example selection.data(); // [{ value: 1 }, { value: 2 }]
   * @example
   * const joined = selection.data(rows, (d) => d.id);
   * joined.enter().attr('color', 'seagreen');
   * joined.exit().remove();
   */
  data(newData, keyFn) {
    if (arguments.length === 0) {
      const result = new Array(this.size());
      for (let i = 0; i < result.length; i++) result[i] = this.#readDatum(i);
      return result;
    }
    const { updateBackend, enterEntries, exitBackend } = computeJoin(
      this.#backend,
      this.size(),
      (index) => this.datum(index),
      newData,
      keyFn,
    );
    return new JoinResult(updateBackend, enterEntries, exitBackend);
  }

  /**
   * A per-datum proxy handle for every member of this selection, uniform
   * across both backends — the analogue of d3's `.nodes()`.
   * @returns {SelectionNode[]}
   * @example selection.nodes()[0].datum;
   */
  nodes() {
    const result = new Array(this.size());
    for (let i = 0; i < result.length; i++) result[i] = new SelectionNode(this, i);
    return result;
  }

  /**
   * Writes an attribute across every node in this selection — the write path
   * for "micro-control that survives instancing" (Prompt 75). `path` is one
   * of the fixed vocabulary entries (`position.x/y/z`, `rotation.x/y/z`,
   * `scale.x/y/z`, `color`, `opacity`, `visible`) or a custom per-instance
   * attribute name previously registered via `GraphInstancedObject`'s
   * `defineAttribute` (Prompt 38, instanced backend only). The routing
   * itself — and the single-commit-per-flush discipline — lives in
   * `attr.js`, not here (CLAUDE.md §1.2 KISS: this class stays a thin,
   * readable dispatch surface).
   * @param {string} path
   * @param {*} valueOrFn A constant, or `(datum: *, index: number) => value`.
   * @returns {this}
   * @throws {TypeError} If `path` is malformed, or a resolved value has the
   *   wrong type for `path` (e.g. a non-boolean for `'visible'`).
   * @throws {Error} If `path` names a custom attribute used on a meshes
   *   backend, or an instanced custom attribute never defined via
   *   `defineAttribute`.
   * @example selection.attr('position.y', (d) => d.value * scale);
   * @example selection.attr('color', 'crimson');
   * @example selection.attr('visible', (d) => d.value > 0);
   */
  attr(path, valueOrFn) {
    applyAttr(this.#backend, this.size(), (index) => this.datum(index), path, valueOrFn);
    return this;
  }

  /**
   * Writes a material property across every node in this selection —
   * material-level micro-control (Prompt 77), as opposed to `attr`'s fixed
   * transform/color/opacity/visible vocabulary. `color`/`opacity` behave
   * exactly as `attr('color'|'opacity', ...)`. On the meshes backend, any
   * `materialProp` writes per-datum since each mesh owns its material. On
   * the instanced backend, only `color`/`opacity`/`emissiveIntensity` are
   * per-instance-capable (routed to instance buffers/attributes); every
   * other `materialProp` is material-global — the instanced backend shares
   * one material across all instances, so a per-datum accessor collapses to
   * a single write (resolved from the first datum) with a `console.warn`.
   * @param {string} materialProp
   * @param {*} valueOrFn A constant, or `(datum: *, index: number) => value`.
   * @returns {this}
   * @throws {TypeError} If `materialProp` is not a non-empty string.
   * @throws {Error} If no material in the selection has `materialProp`.
   * @example selection.style('roughness', 0.4);
   * @example selection.style('emissiveIntensity', (d) => d.highlighted ? 1 : 0);
   */
  style(materialProp, valueOrFn) {
    applyStyle(this.#backend, this.size(), (index) => this.datum(index), materialProp, valueOrFn);
    return this;
  }

  /**
   * A new `Selection`, narrowed to the members for which `predicateFn`
   * returns truthy — shares this selection's backend (the same `GraphMesh`
   * references, or the same `GraphInstancedObject` with a narrowed
   * `indices`), so writes on the result (`attr`, etc.) still land on the
   * real render targets.
   * @param {(datum: *, index: number) => boolean} predicateFn
   * @returns {Selection}
   * @throws {TypeError} If `predicateFn` is not a function.
   * @example selection.filter((d) => d.value > 90).attr('color', 'gold');
   */
  filter(predicateFn) {
    return new Selection(filterBackend(this.#backend, this.size(), (index) => this.datum(index), predicateFn));
  }

  /**
   * Calls `fn(datum, index, handle)` once per node, in selection order.
   * @param {(datum: *, index: number, handle: SelectionNode) => void} fn
   * @returns {this}
   * @throws {TypeError} If `fn` is not a function.
   * @example selection.each((d, i) => console.log(d, i));
   */
  each(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError(`Selection.each: expected a function, received ${JSON.stringify(fn)}.`);
    }
    for (const handle of this.nodes()) fn(handle.datum, handle.index, handle);
    return this;
  }

  /**
   * A new `Selection` with the same members, reordered by `comparator` — a
   * logical reorder of this selection's own datum→index mapping only. It
   * does not rewrite any instance buffer or mesh array in place (see
   * `combinators.js`'s `sortBackend` for why that's the correct, KISS
   * scope for `sort` alone).
   * @param {(a: *, b: *) => number} comparator Same contract as `Array.prototype.sort`.
   * @returns {Selection}
   * @throws {TypeError} If `comparator` is not a function.
   * @example selection.sort((a, b) => a.value - b.value);
   */
  sort(comparator) {
    return new Selection(sortBackend(this.#backend, this.size(), (index) => this.datum(index), comparator));
  }

  /**
   * D3-style reusable-behavior hook: calls `fn(this, ...args)` and returns
   * `this`, so a reusable behavior function can be dropped into a chain
   * without breaking it.
   * @param {(selection: Selection, ...args: *[]) => void} fn
   * @param {...*} args
   * @returns {this}
   * @throws {TypeError} If `fn` is not a function.
   * @example selection.call(highlightAboveThreshold, 90).attr('opacity', 1);
   */
  call(fn, ...args) {
    if (typeof fn !== 'function') {
      throw new TypeError(`Selection.call: expected a function, received ${JSON.stringify(fn)}.`);
    }
    fn(this, ...args);
    return this;
  }

  /**
   * A new `Selection` covering this selection's members followed by
   * `other`'s. Both must share the same backend *type*, and — for the
   * instanced backend — the same `GraphInstancedObject` (a `Uint32Array` of
   * indices is only meaningful relative to one object's instance slots).
   * Does not deduplicate overlapping members.
   * @param {Selection} other
   * @returns {Selection}
   * @throws {TypeError} If `other` is not a `Selection`.
   * @throws {Error} If `other` has a different backend type, or (instanced)
   *   a different `GraphInstancedObject`.
   * @example enterSelection.merge(updateSelection).attr('position.y', (d) => d.value);
   */
  merge(other) {
    if (!(other instanceof Selection)) {
      throw new TypeError(`Selection.merge: expected a Selection, received ${JSON.stringify(other)}.`);
    }
    return new Selection(mergeBackend(this.#backend, other.#backend));
  }

  /**
   * Permanently removes every member of this selection (Prompt 79):
   * disposes each `GraphMesh` (meshes backend), or frees each instance index
   * back to the join system's free-list for a future `enter()` to recycle
   * (instanced backend). Typically called on an `.exit()` result, but works
   * on any selection.
   *
   * Passing `animationName` (Prompt 122, e.g. `'dissolve'`) plays a particle
   * exit effect at each departing node's location first — the node is still
   * freed immediately after, since the burst is a short-lived visual, not a
   * removal delay (there's no chart-level animated-exit lifecycle yet; that
   * lands with `GraphChart.exitAnimation` in Phase 8). `options.system` must
   * be a particle system exposing `.preset(name, opts)` — i.e. a
   * `postfx/particles` `ParticleSystem`, duck-typed rather than imported,
   * since `Selection` (compose/) has no scene/camera/renderer of its own to
   * build one and must not import `postfx/` per CLAUDE.md §1.4. Meshes
   * backend passes each node's raw mesh (`options.system.preset(name, {
   * mesh })`, e.g. `ParticleSystem`'s `'dissolve'` preset surface-samples
   * it); instanced backend passes its local-space position instead.
   * @param {string} [animationName] - A preset name registered on `options.system`.
   * @param {Object} [options={}]
   * @param {{preset: function(string, Object): void}} [options.system] - Required when `animationName` is given.
   * @returns {this}
   * @throws {TypeError} If `animationName` is given without a valid `options.system`.
   * @example joined.exit().remove();
   * @example joined.exit().remove('dissolve', { system: rain });
   */
  remove(animationName, options = {}) {
    if (animationName !== undefined) {
      if (typeof animationName !== 'string' || animationName.length === 0) {
        throw new TypeError(`Selection.remove: animationName must be a non-empty string, received ${JSON.stringify(animationName)}.`);
      }
      const { system, ...presetOpts } = options;
      if (!system || typeof system.preset !== 'function') {
        throw new TypeError(
          `Selection.remove('${animationName}'): options.system must be a particle system exposing .preset(name, opts) (e.g. a postfx ParticleSystem).`,
        );
      }
      this.#playExitAnimation(animationName, system, presetOpts);
    }
    removeBackend(this.#backend);
    return this;
  }

  /**
   * Permanently disposes the underlying rendering resource(s) this
   * selection's backend owns: every `GraphMesh` (meshes backend), or the
   * shared `GraphInstancedObject` itself, once, regardless of how many
   * indices this particular selection covers — the instanced object is a
   * single chart-owned resource, not a per-index one. Unlike `remove()`
   * (which only frees this selection's own members for potential reuse),
   * `dispose()` releases the resource for good — meant for tearing down a
   * chart's entire backend (`GraphChart.destroy()`, Prompt 131), not for
   * narrowed/filtered selections a caller still wants to use.
   * @returns {void}
   * @example chart.selection().dispose();
   */
  dispose() {
    if (this.#backend.type === 'meshes') {
      for (const mesh of this.#backend.meshes) mesh.dispose();
    } else {
      this.#backend.object.dispose();
    }
  }

  /**
   * @param {string} animationName
   * @param {{preset: function(string, Object): void}} system
   * @param {Object} presetOpts
   */
  #playExitAnimation(animationName, system, presetOpts) {
    for (let i = 0; i < this.size(); i++) {
      if (this.#backend.type === 'meshes') {
        system.preset(animationName, { ...presetOpts, mesh: this.#backend.meshes[i].three });
      } else {
        const rawIndex = this.#backend.indices[i];
        system.preset(animationName, { ...presetOpts, position: this.#backend.object.getInstancePosition(rawIndex) });
      }
    }
  }

  /**
   * A `SelectionTransition` (Prompt 91) over this selection's members —
   * `.attr()`/`.style()` on it animate toward the given values (interpolating
   * from each node's current value) instead of snapping, driven by the
   * shared `anim` engine (Phase 5). `.remove()` on it defers removal until
   * every scheduled write completes.
   * @returns {SelectionTransition}
   * @example
   * joined.exit().transition().duration(400).attr('opacity', 0).remove();
   * @example
   * selection.transition().duration(600).delay((d, i) => i * 40).attr('position.y', (d) => d.value);
   */
  transition() {
    return new SelectionTransition(this.#backend, this.size(), (index) => this.datum(index));
  }

  /**
   * Not implemented yet — picking and the interaction state machine land in
   * Phase 9. Throws rather than silently no-op-ing (CLAUDE.md §1.5 Fail
   * Fast); once wired, this will register `handler` for pointer/interaction
   * events on this selection's members.
   * @param {string} _event
   * @param {(event: *) => void} _handler
   * @throws {Error} Always — requires Phase 9.
   */
  on(_event, _handler) {
    throw new Error('Selection.on: requires Phase 9 (picking & the interaction state machine) — not implemented yet.');
  }

  /** @param {number} index @returns {*} */
  #readDatum(index) {
    if (this.#backend.type === 'meshes') {
      return this.#backend.meshes[index].getUserData('datum');
    }
    const { object, indices } = this.#backend;
    return object.getInstanceUserData(indices[index]);
  }

  /** @param {string} method @param {number} index @throws {RangeError} */
  #assertIndex(method, index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.size()) {
      throw new RangeError(`Selection.${method}: index ${index} is out of bounds for a selection of size ${this.size()}.`);
    }
  }
}

/**
 * The result of `Selection.data(newData, keyFn)` (Prompt 78) — **is** the
 * update selection (every `Selection` method — `attr`, `style`, `filter`,
 * ... — operates on the matched, now-rebound members), extended with
 * `.enter()`/`.exit()`/`.join()`. `.enter()`/`.exit()` materialize lazily
 * (Prompt 79: real mesh creation / real instance-slot allocation, cached
 * after the first call) rather than eagerly at `.data()` time, so a caller
 * that only reads `.data()`/`.size()` after a join never pays for allocation
 * it doesn't use.
 * @example
 * const joined = selection.data(rows, (d) => d.id);
 * joined.join(
 *   (enter) => enter.attr('color', 'seagreen'),
 *   (update) => update.attr('position.y', (d) => d.value),
 * ); // exit defaults to .remove()
 */
class JoinResult extends Selection {
  /** @type {*} the update backend — carries `object` (instanced) or `template` (meshes), reused to materialize enter */
  #baseBackend;
  /** @type {{datum:*, newIndex:number}[]} */
  #enterEntries;
  /** @type {*} */
  #exitBackend;
  /** @type {Selection|null} cached after the first enter() call */
  #materializedEnter = null;

  /** @param {*} updateBackend @param {{datum:*, newIndex:number}[]} enterEntries @param {*} exitBackend */
  constructor(updateBackend, enterEntries, exitBackend) {
    super(updateBackend);
    this.#baseBackend = updateBackend;
    this.#enterEntries = enterEntries;
    this.#exitBackend = exitBackend;
  }

  /**
   * The entering members — new datums with no matching prior node —
   * materialized into real `GraphMesh`es or real instance slots on first
   * call (cached thereafter, so repeat calls don't double-allocate).
   * @returns {Selection}
   * @throws {Error} If this is a meshes-backend join with no mesh template
   *   and there is at least one entering datum.
   * @example joined.enter().attr('scale.y', 0.01);
   */
  enter() {
    if (this.#materializedEnter === null) {
      this.#materializedEnter = new Selection(materializeEnter(this.#enterEntries, this.#baseBackend));
    }
    return this.#materializedEnter;
  }

  /**
   * The departing members — previously bound data with no match in the new
   * data — as a plain `Selection` over their still-live nodes (not yet
   * removed; call `.remove()` explicitly, or rely on `.join()`'s default).
   * @returns {Selection}
   * @example joined.exit().attr('opacity', 0); // fade before removing
   */
  exit() {
    return new Selection(this.#exitBackend);
  }

  /**
   * Applies the full enter/update/exit cycle in one call, with d3-style
   * defaults for any callback omitted: entering members appear as-is at
   * their materialized state (no callback needed since there's no animation
   * engine yet, Phase 5), and exiting members are removed immediately
   * (`exit().remove()`).
   * @param {(enterSelection: Selection) => void} [enterFn]
   * @param {(updateSelection: this) => void} [updateFn]
   * @param {(exitSelection: Selection) => void} [exitFn]
   * @returns {Selection} The merge of the entered and updated members.
   * @example joined.join(
   *   (enter) => enter.attr('color', 'seagreen'),
   *   (update) => update.attr('position.y', (d) => d.value),
   *   (exit) => exit.attr('opacity', 0).remove(),
   * );
   */
  join(enterFn, updateFn, exitFn) {
    const entered = this.enter();
    if (enterFn) enterFn(entered);
    if (updateFn) updateFn(this);
    const exited = this.exit();
    if (exitFn) exitFn(exited);
    else exited.remove();
    return this.merge(entered);
  }
}
