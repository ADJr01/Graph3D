import { accessor } from '../generator/index.js';
import { interpolate } from '../interpolate/index.js';
import { GraphAnimTimeline } from '../../anim/GraphAnimTimeline.js';
import { resolve as resolveEasing } from '../../anim/GraphAnimCurve.js';
import { anim } from '../../anim/GraphAnim.js';
import { removeBackend } from './join.js';
import { splitPath, TRANSFORM_BASES, VECTOR_COMPONENTS, TRANSFORM_ACCESSORS, assertFiniteNumber, materialsOf } from './attr.js';

// D3's own default transition duration — mirrors anim/Transition.js (CLAUDE.md
// §1.1 DRY: same convention, not a magic number picked independently here).
const DEFAULT_DURATION_MS = 250;
const VALID_EVENTS = new Set(['start', 'end', 'interrupt']);

/**
 * Cross-transition interrupt bookkeeping (Prompt 93), mirroring `anim/
 * Transition.js`'s own registry but keyed by node identity instead of a
 * single dot-path target: meshes backend keys by the `GraphMesh` instance
 * itself; instanced backend keys by the `GraphInstancedObject` (a per-raw-
 * index+path composite string as the inner key, since one object holds many
 * instances). Two separate `WeakMap`s rather than one keyed on a union type,
 * so each stays a simple `identity -> Map<key, entry>` shape.
 * @type {WeakMap<object, Map<string, {selectionTransition: SelectionTransition, job: object, node: object}>>}
 */
const activeMeshNodeTransitions = new WeakMap();
/** @type {WeakMap<object, Map<string, {selectionTransition: SelectionTransition, job: object, node: object}>>} */
const activeInstancedNodeTransitions = new WeakMap();

/**
 * `Selection.transition()`'s return value (Prompt 91) — an animated
 * counterpart to `Selection.attr()`/`.style()`/`.remove()`: every scheduled
 * write captures each node's *current* value as the tween's start and
 * interpolates toward the target via `compose/interpolate` (Prompt 87's
 * single interpolation authority — no local lerp here either). Configure
 * `.duration()`/`.delay()`/`.easing()` before scheduling writes; each
 * `.attr()`/`.style()` call captures the current configuration for that
 * property only, so different properties can animate on different
 * schedules within one `SelectionTransition` (matches d3).
 *
 * Driven by one internal `GraphAnimTimeline` registered with the shared
 * `anim` engine (Prompt 89) — a single `onUpdate` tick loops every scheduled
 * job and every node within it, then commits each instanced job's buffer
 * exactly once per frame (`commitMatrix`/`commitColor`/`commitAttribute`),
 * never per-instance, per the Prompt 91 requirement.
 *
 * This is a sanctioned exception to CLAUDE.md §1.4's "a layer may only
 * import from layers below it": `compose/selection` importing from `anim/`
 * mirrors the existing `scene/`→`compose/selection` carve-out (`GraphScene.
 * selectAll`) — `anim/` itself stays agnostic (it operates on opaque
 * targets via property paths, never referencing `Selection` or `object/`
 * types), so this crossing doesn't close a cycle; it's `compose/selection`
 * reaching for the one existing timeline/easing engine instead of building
 * a second one (DRY).
 *
 * Not constructed directly — obtained via `Selection.transition()`.
 * @example
 * selection.transition().duration(600).easing('easeOutCubic')
 *   .attr('position.y', (d) => d.value)
 *   .attr('color', (d) => d.color);
 * @example
 * joined.exit().transition().duration(400).attr('opacity', 0).remove();
 */
export class SelectionTransition {
  /** @type {{ type: 'meshes', meshes: object[] }|{ type: 'instanced', object: object, indices: Uint32Array }} */
  #backend;
  /** @type {number} */
  #size;
  /** @type {(index: number) => *} */
  #datumAt;
  /** @type {number} */
  #durationMs = DEFAULT_DURATION_MS;
  /** @type {number|((datum: *, index: number) => number)} */
  #delayMsOrFn = 0;
  /** @type {(t: number) => number} */
  #easingFn = (t) => t;
  /** @type {{start: (() => void)[], end: (() => void)[], interrupt: (() => void)[]}} */
  #handlers = { start: [], end: [], interrupt: [] };
  /** @type {{path: string, durationMs: number, easingFn: (t: number) => number, nodes: {i: number, delayMs: number, interpolatorFn: (t: number) => *}[], writeRaw: (i: number, value: *) => void, commitFn: () => void}[]} */
  #jobs = [];
  /** @type {GraphAnimTimeline|null} */
  #timeline = null;
  /** @type {number} */
  #pendingStartMs = Infinity;
  /** @type {boolean} */
  #started = false;
  /** @type {boolean} */
  #removeScheduled = false;
  /** @type {boolean} whether a later transition superseded at least one of this transition's scheduled nodes */
  #interrupted = false;

  /**
   * @param {{ type: 'meshes', meshes: object[] }|{ type: 'instanced', object: object, indices: Uint32Array }} backend
   * @param {number} size
   * @param {(index: number) => *} datumAt
   */
  constructor(backend, size, datumAt) {
    this.#backend = backend;
    this.#size = size;
    this.#datumAt = datumAt;
  }

  /**
   * @param {number} ms Non-negative duration in milliseconds, applied to properties scheduled from here on.
   * @returns {this}
   * @throws {TypeError} If `ms` is not a non-negative number.
   * @example transition.duration(600);
   */
  duration(ms) {
    if (typeof ms !== 'number' || ms < 0) {
      throw new TypeError(`SelectionTransition.duration: expected a non-negative number of milliseconds, received ${JSON.stringify(ms)}.`);
    }
    this.#durationMs = ms;
    return this;
  }

  /**
   * @param {number|((datum: *, index: number) => number)} msOrFn A non-negative delay in
   *   milliseconds, or a per-datum function (staggering), applied to properties scheduled from here on.
   * @returns {this}
   * @throws {TypeError} If `msOrFn` is neither a number nor a function.
   * @example transition.delay((d, i) => i * 50); // stagger
   */
  delay(msOrFn) {
    if (typeof msOrFn !== 'number' && typeof msOrFn !== 'function') {
      throw new TypeError(`SelectionTransition.delay: expected a number or a function, received ${JSON.stringify(msOrFn)}.`);
    }
    this.#delayMsOrFn = msOrFn;
    return this;
  }

  /**
   * @param {string|((t: number) => number)} nameOrFn A `GraphAnimCurve` curve name, or a raw `(t) => number` function.
   * @returns {this}
   * @throws {TypeError} If `nameOrFn` does not resolve to a valid easing (see `GraphAnimCurve.resolve`).
   * @example transition.easing('easeInOutCubic');
   */
  easing(nameOrFn) {
    this.#easingFn = resolveEasing(nameOrFn);
    return this;
  }

  /**
   * Registers a lifecycle handler. `'start'` fires once, the first time any
   * scheduled node begins animating (accounting for `.delay()`); `'end'`
   * fires once this transition's internal timeline completes; `'interrupt'`
   * fires once (Prompt 93) if a later `selection.transition()` call schedules
   * a write to the same node (mesh, or instanced raw index) and path this
   * transition is still animating — that node's write is removed from this
   * transition (it stops fighting the newer one over the same buffer slot),
   * while any of this transition's other, unrelated nodes/jobs keep animating.
   * @param {'start'|'end'|'interrupt'} event
   * @param {() => void} handler
   * @returns {this}
   * @throws {TypeError} If `event` isn't recognized, or `handler` isn't a function.
   * @example transition.on('interrupt', () => console.log('superseded'));
   */
  on(event, handler) {
    if (!VALID_EVENTS.has(event)) {
      throw new TypeError(`SelectionTransition.on: event must be one of 'start'/'end'/'interrupt', received ${JSON.stringify(event)}.`);
    }
    if (typeof handler !== 'function') {
      throw new TypeError(`SelectionTransition.on: handler must be a function, received ${JSON.stringify(handler)}.`);
    }
    this.#handlers[event].push(handler);
    return this;
  }

  /**
   * Schedules an animated write to `path`, starting from each node's current
   * value (read from the live buffer/material) and interpolating toward
   * `valueOrFn`'s resolved value using this transition's current
   * duration/delay/easing. Same path vocabulary as `Selection.attr` (Prompt
   * 75) except `'visible'`, which is a boolean toggle and has no meaningful
   * tween — use `Selection.attr('visible', ...)` directly for that.
   * @param {string} path
   * @param {*} valueOrFn A constant, or `(datum: *, index: number) => value`.
   * @returns {this}
   * @throws {TypeError} If `path` is malformed, targets `'visible'`, or a
   *   resolved value can't be interpolated against the current one.
   * @throws {Error} If `path` names an undefined custom instanced attribute,
   *   or a mesh material with no `'color'` property when `path === 'color'`.
   * @example selectionTransition.attr('position.y', (d) => d.value * scale);
   */
  attr(path, valueOrFn) {
    if (typeof path !== 'string' || path.length === 0) {
      throw new TypeError(`SelectionTransition.attr: path must be a non-empty string, received ${JSON.stringify(path)}.`);
    }
    const resolveValue = accessor(valueOrFn);
    const [base, component] = splitPath(path);

    if (TRANSFORM_BASES.has(base)) {
      if (!VECTOR_COMPONENTS.has(component)) {
        throw new TypeError(`SelectionTransition.attr: '${path}' is not a valid path — '${base}' takes .x/.y/.z, received '${component}'.`);
      }
      return this.#scheduleTransformComponent(path, base, component, resolveValue);
    }
    if (component !== null) {
      throw new TypeError(`SelectionTransition.attr: unknown path '${path}' — '${base}' does not take a sub-property.`);
    }
    if (base === 'color') return this.#scheduleColor(resolveValue);
    if (base === 'opacity') return this.#scheduleOpacity(resolveValue);
    if (base === 'visible') {
      throw new TypeError(
        "SelectionTransition.attr: 'visible' is a boolean toggle, not an animatable value — use Selection.attr('visible', ...) directly instead.",
      );
    }
    return this.#scheduleCustomAttribute(base, resolveValue);
  }

  /**
   * Schedules an animated write to a material property — the animated
   * counterpart to `Selection.style` (Prompt 77). `'color'`/`'opacity'`
   * behave exactly as `.attr('color'|'opacity', ...)`. On the instanced
   * backend, any other `materialProp` is material-global (shared across all
   * instances): it animates once, toward the value resolved from the first
   * datum, with a `console.warn` — mirrors `Selection.style`'s existing
   * behavior for the same reason (one shared material, no per-instance path
   * for arbitrary props yet).
   * @param {string} materialProp
   * @param {*} valueOrFn A constant, or `(datum: *, index: number) => value`.
   * @returns {this}
   * @throws {TypeError} If `materialProp` is not a non-empty string.
   * @throws {Error} If no material in the selection has `materialProp`.
   * @example selectionTransition.style('roughness', 0.4);
   */
  style(materialProp, valueOrFn) {
    if (typeof materialProp !== 'string' || materialProp.length === 0) {
      throw new TypeError(`SelectionTransition.style: materialProp must be a non-empty string, received ${JSON.stringify(materialProp)}.`);
    }
    if (materialProp === 'color' || materialProp === 'opacity') {
      return this.attr(materialProp, valueOrFn);
    }
    const resolveValue = accessor(valueOrFn);
    const resolveTo = (datum, index) => {
      const value = resolveValue(datum, index);
      assertFiniteNumber(value, materialProp);
      return value;
    };

    if (this.#backend.type === 'meshes') {
      const getFrom = (i) => {
        const material = materialsOf(this.#backend.meshes[i].material).find((m) => materialProp in m);
        if (!material) {
          throw new Error(`SelectionTransition.style('${materialProp}'): no material in this selection has a '${materialProp}' property.`);
        }
        return material[materialProp];
      };
      const writeRaw = (i, value) => {
        for (const m of materialsOf(this.#backend.meshes[i].material)) {
          if (materialProp in m) m[materialProp] = value;
        }
      };
      return this.#schedule(materialProp, resolveTo, getFrom, writeRaw, () => {});
    }

    console.warn(
      `SelectionTransition.style('${materialProp}'): the instanced backend shares one material across all its instances — ` +
        'animating a single value (resolved from the first datum) instead of one per instance.',
    );
    const materials = materialsOf(this.#backend.object.material).filter((m) => materialProp in m);
    if (materials.length === 0) {
      throw new Error(`SelectionTransition.style('${materialProp}'): no material in this selection has a '${materialProp}' property.`);
    }
    return this.#scheduleGlobal(materialProp, resolveTo, () => materials[0][materialProp], (value) => {
      for (const m of materials) m[materialProp] = value;
    });
  }

  /**
   * Schedules removal (Prompt 79's `Selection.remove`) once every scheduled
   * write on this transition completes — disposes each `GraphMesh`, or
   * frees each instance index back to the join system's free-list. Safe to
   * call with no prior `.attr()`/`.style()` calls (removal alone still
   * respects the configured `.duration()`/`.delay()`).
   * @returns {this}
   * @example joined.exit().transition().duration(400).attr('opacity', 0).remove();
   */
  remove() {
    this.#removeScheduled = true;
    this.#ensureTimeline();
    const datum = this.#size > 0 ? this.#datumAt(0) : undefined;
    const delayMs = this.#resolveDelay(datum, 0);
    this.#extendTo(delayMs + this.#durationMs);
    if (delayMs < this.#pendingStartMs) this.#pendingStartMs = delayMs;
    return this;
  }

  // ── per-path job builders ───────────────────────────────────────────────

  #scheduleTransformComponent(path, base, component, resolveValue) {
    const accessors = TRANSFORM_ACCESSORS[base];
    const isInstanced = this.#backend.type === 'instanced';
    const resolveTo = (datum, index) => {
      const value = resolveValue(datum, index);
      assertFiniteNumber(value, path);
      return value;
    };
    const getFrom = (i) => {
      const vector = isInstanced
        ? this.#backend.object[accessors.instanceGet](this.#backend.indices[i])
        : this.#backend.meshes[i][accessors.get]();
      return vector[component];
    };
    const writeRaw = (i, value) => {
      if (isInstanced) {
        const rawIndex = this.#backend.indices[i];
        const vector = this.#backend.object[accessors.instanceGet](rawIndex);
        vector[component] = value;
        if (base === 'rotation') this.#backend.object.setInstanceRotation(rawIndex, vector);
        else this.#backend.object[accessors.instanceSet](rawIndex, vector.x, vector.y, vector.z);
      } else {
        const mesh = this.#backend.meshes[i];
        const vector = mesh[accessors.get]();
        vector[component] = value;
        if (base === 'rotation') mesh.setRotation(vector);
        else mesh[accessors.set](vector.x, vector.y, vector.z);
      }
    };
    const commitFn = isInstanced
      ? () => {
          if (this.#size > 0) this.#backend.object.commitMatrix();
        }
      : () => {};
    return this.#schedule(path, resolveTo, getFrom, writeRaw, commitFn);
  }

  #scheduleColor(resolveValue) {
    const isInstanced = this.#backend.type === 'instanced';
    const getFrom = isInstanced
      ? (i) => this.#backend.object.getInstanceColor(this.#backend.indices[i])
      : (i) => {
          const material = materialsOf(this.#backend.meshes[i].material).find((m) => m.color);
          if (!material) {
            throw new Error("SelectionTransition.attr('color'): the mesh's material has no 'color' property to write to.");
          }
          return material.color.clone();
        };
    const writeRaw = isInstanced
      ? (i, value) => this.#backend.object.setInstanceColor(this.#backend.indices[i], value)
      : (i, value) => {
          for (const m of materialsOf(this.#backend.meshes[i].material)) {
            if (m.color) m.color.set(value);
          }
        };
    const commitFn = isInstanced
      ? () => {
          if (this.#size > 0) this.#backend.object.commitColor();
        }
      : () => {};
    return this.#schedule('color', resolveValue, getFrom, writeRaw, commitFn);
  }

  #scheduleOpacity(resolveValue) {
    const resolveTo = (datum, index) => {
      const value = resolveValue(datum, index);
      assertFiniteNumber(value, 'opacity');
      return value;
    };
    if (this.#backend.type === 'meshes') {
      const getFrom = (i) => materialsOf(this.#backend.meshes[i].material)[0].opacity;
      const writeRaw = (i, value) => {
        for (const m of materialsOf(this.#backend.meshes[i].material)) {
          m.opacity = value;
          m.transparent = true;
        }
      };
      return this.#schedule('opacity', resolveTo, getFrom, writeRaw, () => {});
    }
    const { object, indices } = this.#backend;
    // No material reads this attribute yet (Phase 6 dataDriven material), so
    // an instance with no prior write is visually at opacity 1 — a freshly
    // defined attribute's backing array starts at 0, so that default must be
    // supplied here rather than read back.
    const hadAttribute = object.hasAttribute('opacity');
    if (!hadAttribute) object.defineAttribute('opacity', 1);
    const getFrom = (i) => (hadAttribute ? object.getInstanceAttribute(indices[i], 'opacity') : 1);
    const writeRaw = (i, value) => object.setInstanceAttribute(indices[i], 'opacity', value);
    const commitFn = () => {
      if (this.#size > 0) object.commitAttribute('opacity');
    };
    return this.#schedule('opacity', resolveTo, getFrom, writeRaw, commitFn);
  }

  #scheduleCustomAttribute(name, resolveValue) {
    if (this.#backend.type === 'meshes') {
      throw new Error(`SelectionTransition.attr: custom attribute '${name}' is only supported on the instanced backend — meshes have no per-instance attributes.`);
    }
    const { object, indices } = this.#backend;
    const getFrom = (i) => object.getInstanceAttribute(indices[i], name);
    const writeRaw = (i, value) => object.setInstanceAttribute(indices[i], name, value);
    const commitFn = () => {
      if (this.#size > 0) object.commitAttribute(name);
    };
    return this.#schedule(name, resolveValue, getFrom, writeRaw, commitFn);
  }

  // ── shared scheduling/driving machinery ─────────────────────────────────

  /**
   * Builds one job with a node per selection member, capturing each node's
   * current value via `getFrom` and its target via `resolveTo` right now
   * (Prompt 91: "start values captured per datum from current buffer
   * state"), then registers the job to run every frame until every node
   * reaches `t = 1`.
   */
  #schedule(path, resolveTo, getFrom, writeRaw, commitFn) {
    const durationMs = this.#durationMs;
    const easingFn = this.#easingFn;
    const nodes = new Array(this.#size);
    for (let i = 0; i < this.#size; i++) {
      const datum = this.#datumAt(i);
      const delayMs = this.#resolveDelay(datum, i);
      const from = getFrom(i);
      const to = resolveTo(datum, i);
      nodes[i] = { i, delayMs, interpolatorFn: interpolate(from, to) };
    }
    const job = { path, durationMs, easingFn, nodes, writeRaw, commitFn };
    this.#addJob(job);
    this.#registerInterrupts(path, job);
    return this;
  }

  /** Single-node variant for instanced-backend material-global tweens (no per-datum indices). */
  #scheduleGlobal(path, resolveTo, getFrom, writeSingle) {
    const datum = this.#size > 0 ? this.#datumAt(0) : undefined;
    const delayMs = this.#resolveDelay(datum, 0);
    const interpolatorFn = interpolate(getFrom(), resolveTo(datum, 0));
    const job = {
      path,
      durationMs: this.#durationMs,
      easingFn: this.#easingFn,
      nodes: [{ i: 0, delayMs, interpolatorFn }],
      writeRaw: (_i, value) => writeSingle(value),
      commitFn: () => {},
    };
    this.#addJob(job);
    this.#registerGlobalInterrupt(path, job);
    return this;
  }

  #addJob(job) {
    this.#jobs.push(job);
    this.#ensureTimeline();
    let maxEndMs = 0;
    let minStartMs = Infinity;
    for (const node of job.nodes) {
      maxEndMs = Math.max(maxEndMs, node.delayMs + job.durationMs);
      minStartMs = Math.min(minStartMs, node.delayMs);
    }
    this.#extendTo(maxEndMs);
    if (minStartMs < this.#pendingStartMs) this.#pendingStartMs = minStartMs;
  }

  /** Grows the internal timeline's total duration to at least `targetMs`, if it isn't already that long. */
  #extendTo(targetMs) {
    const currentTotalMs = this.#timeline.duration * 1000;
    if (targetMs > currentTotalMs) this.#timeline.wait((targetMs - currentTotalMs) / 1000);
  }

  /**
   * Cross-transition interrupt bookkeeping (Prompt 93): for every node in
   * `job`, if another still-active `SelectionTransition` already owns that
   * exact node+`path` (same `GraphMesh`, or same `GraphInstancedObject`+raw
   * index), remove just that one node from the prior job — leaving the rest
   * of that prior transition's nodes/jobs untouched — and fire its
   * `'interrupt'` handlers. This transition's own entry then becomes current.
   * @param {string} path
   * @param {object} job
   */
  #registerInterrupts(path, job) {
    const registry = this.#backend.type === 'meshes' ? activeMeshNodeTransitions : activeInstancedNodeTransitions;
    for (const node of job.nodes) {
      const identity = this.#backend.type === 'meshes' ? this.#backend.meshes[node.i] : this.#backend.object;
      const key = this.#backend.type === 'meshes' ? path : `${this.#backend.indices[node.i]}:${path}`;
      let byKey = registry.get(identity);
      if (!byKey) {
        byKey = new Map();
        registry.set(identity, byKey);
      }
      const prior = byKey.get(key);
      if (prior && prior.selectionTransition !== this) {
        prior.selectionTransition.#interruptNode(prior.job, prior.node);
      }
      byKey.set(key, { selectionTransition: this, job, node });
    }
  }

  /**
   * `#registerInterrupts`'s counterpart for `#scheduleGlobal`'s single
   * synthetic node (the shared instanced material) — keyed by the object
   * itself rather than a raw index, since there's no per-datum identity to key on.
   * @param {string} path
   * @param {object} job
   */
  #registerGlobalInterrupt(path, job) {
    const identity = this.#backend.object;
    const key = `global:${path}`;
    let byKey = activeInstancedNodeTransitions.get(identity);
    if (!byKey) {
      byKey = new Map();
      activeInstancedNodeTransitions.set(identity, byKey);
    }
    const prior = byKey.get(key);
    if (prior && prior.selectionTransition !== this) {
      prior.selectionTransition.#interruptNode(prior.job, prior.node);
    }
    byKey.set(key, { selectionTransition: this, job, node: job.nodes[0] });
  }

  /**
   * Called by a *different* `SelectionTransition` instance that just
   * superseded this one on one of its nodes (private fields are accessible
   * across instances of the same class). Removes `node` from `job` so this
   * transition stops writing it, and fires `'interrupt'` at most once even
   * if several of this transition's nodes get superseded.
   * @param {object} job
   * @param {object} node
   */
  #interruptNode(job, node) {
    const idx = job.nodes.indexOf(node);
    if (idx === -1) return; // already removed (finished, or already interrupted)
    job.nodes.splice(idx, 1);
    if (!this.#interrupted) {
      this.#interrupted = true;
      for (const handler of this.#handlers.interrupt) handler();
    }
  }

  #resolveDelay(datum, index) {
    const value = typeof this.#delayMsOrFn === 'function' ? this.#delayMsOrFn(datum, index) : this.#delayMsOrFn;
    if (typeof value !== 'number' || value < 0) {
      throw new TypeError(`SelectionTransition: delay must resolve to a non-negative number, received ${JSON.stringify(value)}.`);
    }
    return value;
  }

  #ensureTimeline() {
    if (this.#timeline) return;
    this.#timeline = new GraphAnimTimeline({});
    this.#timeline.onUpdate((timeSeconds) => this.#tick(timeSeconds));
    this.#timeline.onComplete(() => this.#finish());
    anim.add(this.#timeline);
    this.#timeline.play();
  }

  /**
   * One per-frame pass: for every job, writes every node's interpolated
   * value (holding at the `from` value until its delay elapses, and the
   * `to` value once its duration elapses), then commits that job's backend
   * buffer exactly once — never per node (Prompt 91's explicit requirement).
   * @param {number} timeSeconds
   */
  #tick(timeSeconds) {
    const elapsedMs = timeSeconds * 1000;
    if (!this.#started && elapsedMs >= this.#pendingStartMs) {
      this.#started = true;
      for (const handler of this.#handlers.start) handler();
    }
    for (const job of this.#jobs) {
      for (const node of job.nodes) {
        const localElapsed = elapsedMs - node.delayMs;
        const raw = job.durationMs === 0 ? (localElapsed >= 0 ? 1 : 0) : localElapsed / job.durationMs;
        const t = Math.max(0, Math.min(1, raw));
        job.writeRaw(node.i, node.interpolatorFn(job.easingFn(t)));
      }
      job.commitFn();
    }
  }

  #finish() {
    for (const handler of this.#handlers.end) handler();
    if (this.#removeScheduled) removeBackend(this.#backend);
    // Unregister from the shared engine now that every scheduled write is
    // done — otherwise a long-running app accumulates one dead, permanently-
    // iterated timeline per completed transition (Prompt 91's own headline
    // use case is a data join re-transitioning every 2s, so this matters).
    anim.remove(this.#timeline);
  }
}
