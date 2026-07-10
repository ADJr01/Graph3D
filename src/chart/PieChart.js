import { layout, generator, Selection } from '../compose/index.js';
import { GraphChart } from './GraphChart.js';
import { GraphObjectFactory } from '../object/index.js';
import { applyColorField } from './colorField.js';
import { applyOpacityField } from './opacityField.js';
import { applyVisibleField } from './visibleField.js';
import { applySizeField } from './sizeField.js';
import { resolveChartMaterial } from './materialField.js';
import { applyLegend } from './legendField.js';

const DEFAULT_INNER_RADIUS = 0;
const DEFAULT_OUTER_RADIUS = 1;
const DEFAULT_EXTRUDE = 1;
const DEFAULT_EXPLODE_OFFSET = 0.3;

/**
 * `GraphChart` specialized for pie/donut charts (Prompt 139). Slice angles
 * come from `layout.pie()` — a one-shot proportional-sweep layout, not a
 * live simulation and not a per-datum position+scale computation — so, like
 * `NetworkChart`/`TreeChart`/`PackChart`, `PieChart` overrides `data()`/
 * `render()`/`update()`/`destroy()` entirely rather than building on
 * `GraphChart`'s per-datum pipeline. Each slice is extruded into a wedge via
 * `generator.arc()` (CLAUDE.md §1.1 DRY, no reimplemented wedge geometry) —
 * called once per datum (not once for the whole array) since every slice's
 * wedge shape genuinely differs, unlike `BarChart`/`ScatterChart` where every
 * datum shares one base geometry an `InstancedMesh` can batch. Each wedge is
 * therefore its own `GraphMesh` (`GraphObjectFactory.createTriangleMesh`,
 * the same "raw triangulated-mesh buffers into one continuous `GraphMesh`"
 * factory `AreaChart`/`SurfaceChart` already use) — pie charts realistically
 * have a handful to a few dozen slices, not thousands, so this doesn't need
 * (and can't easily use) instancing.
 * ponytail: one GraphMesh per slice, not instanced — fine at pie-chart
 * scale (a handful to a few dozen slices); see skipping_list.md's "PieChart's
 * wedges are one GraphMesh per slice" entry.
 *
 * `GraphChart`'s inherited `x()`/`y()`/`z()`/`shape()`/`filter()`/`sort()`/
 * `on()` are inert here (position/angle come from `layout.pie()`/`.value()`
 * instead); `.color()`/`.opacity()`/`.visible()` still work, via the same
 * `applyColorField`/`applyOpacityField`/`applyVisibleField`/
 * `resolveChartMaterial` helpers every other chart type uses (CLAUDE.md
 * §1.1 DRY) — `.selection()` is overridden to expose a real `Selection`
 * over the per-slice meshes so they have something to write to. `.color()`'s
 * accessor receives each slice's own datum, same as `BarChart`/`ScatterChart`.
 * `.size(fn)` (Prompt 141) multiplies the whole wedge mesh's scale uniformly
 * around its own local origin (the pie's center) — every slice mesh's base
 * scale is always `(1,1,1)` (position/shape are already baked into the
 * wedge's own vertex buffer by `generator.arc()`, not represented via a
 * scale multiplier the way instanced spheres/boxes are), so `.size()` grows
 * or shrinks a slice's radius and thickness together, independent of
 * `.explode()`'s separate position offset.
 *
 * "Explode-on-hover" (the prompt's own wording) isn't wired to real pointer
 * events here — `interact/` (picking, hover state) doesn't exist yet. Instead,
 * `PieChart` exposes the same low-level pieces `ScatterChart.pick()`
 * established: `.pick(raycaster)` returns the hit slice's datum (or `null`),
 * and `.explode(datum, exploded?)` offsets that slice radially outward along
 * its own mid-angle — a caller wires its own `pointermove` handler, raycasts,
 * and calls both (see `examples/17-pie-chart/`).
 * @example
 * new PieChart(scene)
 *   .data(rows)
 *   .value((d) => d.count)
 *   .innerRadius(0.4)
 *   .color((d) => d.label, palette.category10)
 *   .render();
 * canvas.addEventListener('pointermove', (event) => {
 *   const hit = chart.pick(raycasterFromEvent(event));
 *   for (const d of rows) chart.explode(d, d === hit);
 * });
 */
export class PieChart extends GraphChart {
  /** @type {Array|null} The last array passed to `data(arr)` — one entry per slice. */
  #data = null;

  /** @type {(datum: *, index: number) => number} Forwarded to `layout.pie`'s `value` option. */
  #valueAccessor = (d) => d;

  /** @type {((a: *, b: *) => number)|null} Forwarded to `layout.pie`'s `sort` option. */
  #sortCompare = null;

  /** @type {number} Forwarded to `layout.pie`'s `padAngle` option. */
  #padAngle = 0;

  /** @type {number|((d: *, i: number) => number)} Forwarded to `generator.arc`'s `innerRadius` option. */
  #innerRadius = DEFAULT_INNER_RADIUS;

  /** @type {number|((d: *, i: number) => number)} Forwarded to `generator.arc`'s `outerRadius` option. */
  #outerRadius = DEFAULT_OUTER_RADIUS;

  /** @type {number|((d: *, i: number) => number)} Forwarded to `generator.arc`'s `extrude` option. */
  #extrude = DEFAULT_EXTRUDE;

  /** @type {number} World-unit radial offset applied to an exploded slice. */
  #explodeOffset = DEFAULT_EXPLODE_OFFSET;

  /** @type {import('../object/GraphMesh.js').GraphMesh[]} One per slice, in `#data` order. */
  #meshes = [];

  /** @type {number[]} Each slice's mid-angle (radians), parallel to `#meshes` — what `.explode()` offsets along. */
  #midAngles = [];

  /** @type {Set<*>} Datums currently exploded (survives across `update()` by datum identity). */
  #exploded = new Set();

  /** @type {Selection} The live `Selection` over `#meshes` — what `.selection()`/`.color()` write to. */
  #selection = new Selection({ type: 'meshes', meshes: [] });

  /** @type {boolean} Whether `render()` has materialized slices yet. */
  #rendered = false;

  /** @type {boolean} */
  #destroyed = false;

  /**
   * @param {object} scene The raw `THREE.Scene` this chart will attach to.
   * @throws {TypeError} If `scene` is falsy.
   */
  constructor(scene) {
    // No `compose/generator` fits as a constructor-time singleton: each
    // slice needs its own `generator.arc()` compute() call (see class doc),
    // so this stub only satisfies GraphChart's constructor duck-type check
    // (mirrors NetworkChart/TreeChart/PackChart's identical stub).
    super(scene, { compute: () => ({}) });
  }

  /**
   * Gets or sets the slice array — one entry per pie slice. Unlike
   * `GraphChart.data()`, this doesn't join against a per-datum `Selection`
   * backend (mirrors `NetworkChart`/`TreeChart`/`PackChart`'s identical
   * override) — no-arg reads, one-arg writes and chains.
   * @param {Array} [arr]
   * @returns {Array|this}
   * @throws {TypeError} If `arr` is given and isn't an array.
   * @example chart.data(rows).value((d) => d.count).render();
   */
  data(arr) {
    this.#assertNotDestroyed('data');
    if (arr === undefined) return this.#data;
    if (!Array.isArray(arr)) {
      throw new TypeError(`PieChart.data: expected an array, received ${JSON.stringify(arr)}.`);
    }
    this.#data = arr;
    return this;
  }

  /**
   * Gets or sets the per-datum value accessor driving each slice's angular
   * span — forwarded to `layout.pie`'s `value` option (CLAUDE.md §1.1 DRY,
   * no reimplemented proportional-sweep math here).
   * @param {(datum: *, index: number) => number} [fn]
   * @returns {((datum: *, index: number) => number)|this}
   * @throws {TypeError} If `fn` is given and isn't a function.
   * @example chart.value((d) => d.count);
   */
  value(fn) {
    this.#assertNotDestroyed('value');
    if (fn === undefined) return this.#valueAccessor;
    if (typeof fn !== 'function') {
      throw new TypeError(`PieChart.value: expected a function, received ${JSON.stringify(fn)}.`);
    }
    this.#valueAccessor = fn;
    return this;
  }

  /**
   * Gets or sets the comparator ordering slices around the sweep —
   * forwarded to `layout.pie`'s `sort` option. Named distinctly from
   * `GraphChart.sort()` (inert here, per the class doc) since it orders
   * slices around the pie, not this chart's flat data array.
   * @param {((a: *, b: *) => number)|null} [fn]
   * @returns {((a: *, b: *) => number)|null|this}
   * @throws {TypeError} If `fn` is given and isn't a function or `null`.
   * @example chart.sortSlices((a, b) => b.count - a.count);
   */
  sortSlices(fn) {
    this.#assertNotDestroyed('sortSlices');
    if (fn === undefined) return this.#sortCompare;
    if (fn !== null && typeof fn !== 'function') {
      throw new TypeError(`PieChart.sortSlices: expected a function or null, received ${JSON.stringify(fn)}.`);
    }
    this.#sortCompare = fn;
    return this;
  }

  /**
   * Gets or sets the gap angle, in radians, inserted between adjacent
   * slices — forwarded to `layout.pie`'s `padAngle` option.
   * @param {number} [value]
   * @returns {number|this}
   * @throws {TypeError} If `value` is given and isn't a finite number.
   * @example chart.padAngle(0.02);
   */
  padAngle(value) {
    this.#assertNotDestroyed('padAngle');
    if (value === undefined) return this.#padAngle;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`PieChart.padAngle: expected a finite number, received ${JSON.stringify(value)}.`);
    }
    this.#padAngle = value;
    return this;
  }

  /**
   * Gets or sets each wedge's inner radius — forwarded to
   * `generator.arc()`'s own `innerRadius` option. `0` (default) makes a
   * solid pie; a positive value makes a donut.
   * @param {number|((datum: *, index: number) => number)} [value]
   * @returns {number|((datum: *, index: number) => number)|this}
   * @throws {TypeError} If `value` is given and isn't a number or function.
   * @example chart.innerRadius(0.4);
   */
  innerRadius(value) {
    this.#assertNotDestroyed('innerRadius');
    if (value === undefined) return this.#innerRadius;
    if (typeof value !== 'number' && typeof value !== 'function') {
      throw new TypeError(`PieChart.innerRadius: expected a number or function, received ${JSON.stringify(value)}.`);
    }
    this.#innerRadius = value;
    return this;
  }

  /**
   * Gets or sets each wedge's outer radius — forwarded to
   * `generator.arc()`'s own `outerRadius` option.
   * @param {number|((datum: *, index: number) => number)} [value]
   * @returns {number|((datum: *, index: number) => number)|this}
   * @throws {TypeError} If `value` is given and isn't a number or function.
   * @example chart.outerRadius((d) => 1 + d.emphasis);
   */
  outerRadius(value) {
    this.#assertNotDestroyed('outerRadius');
    if (value === undefined) return this.#outerRadius;
    if (typeof value !== 'number' && typeof value !== 'function') {
      throw new TypeError(`PieChart.outerRadius: expected a number or function, received ${JSON.stringify(value)}.`);
    }
    this.#outerRadius = value;
    return this;
  }

  /**
   * Gets or sets each wedge's extrusion height — forwarded to
   * `generator.arc()`'s own `extrude` option.
   * @param {number|((datum: *, index: number) => number)} [value]
   * @returns {number|((datum: *, index: number) => number)|this}
   * @throws {TypeError} If `value` is given and isn't a number or function.
   * @example chart.extrude((d) => d.count);
   */
  extrude(value) {
    this.#assertNotDestroyed('extrude');
    if (value === undefined) return this.#extrude;
    if (typeof value !== 'number' && typeof value !== 'function') {
      throw new TypeError(`PieChart.extrude: expected a number or function, received ${JSON.stringify(value)}.`);
    }
    this.#extrude = value;
    return this;
  }

  /**
   * Gets or sets the world-unit radial offset an exploded slice moves by —
   * see `.explode()`.
   * @param {number} [value]
   * @returns {number|this}
   * @throws {TypeError} If `value` is given and isn't a finite number.
   * @example chart.explodeOffset(0.5);
   */
  explodeOffset(value) {
    this.#assertNotDestroyed('explodeOffset');
    if (value === undefined) return this.#explodeOffset;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`PieChart.explodeOffset: expected a finite number, received ${JSON.stringify(value)}.`);
    }
    this.#explodeOffset = value;
    return this;
  }

  /**
   * Moves `datum`'s slice outward from center (or back to center) along its
   * own mid-angle by `.explodeOffset()` world units — the mechanism behind
   * "explode-on-hover" (see the class doc for the caller-driven pointer
   * wiring this doesn't own itself). A no-op if `datum` isn't a currently
   * rendered slice.
   * @param {*} datum A datum from `data()`.
   * @param {boolean} [exploded] `true` (default) to explode, `false` to restore.
   * @returns {this}
   * @throws {Error} If `render()` hasn't successfully run yet.
   * @example chart.explode(hoveredDatum, true);
   */
  explode(datum, exploded = true) {
    this.#assertNotDestroyed('explode');
    if (!this.#rendered) {
      throw new Error('PieChart.explode: call render() first.');
    }
    const index = this.#data.indexOf(datum);
    if (index === -1) return this;
    if (exploded) this.#exploded.add(datum);
    else this.#exploded.delete(datum);
    this.#applyExplode(index);
    return this;
  }

  /**
   * Ray-picks the frontmost slice under `raycaster` and returns its datum
   * (or `null`) — mirrors `ScatterChart.pick()`'s meshes-backend branch (a
   * plain `THREE.Raycaster.intersectObjects`; pie charts realistically have
   * too few slices for an octree to be worth building).
   * @param {object} raycaster A `THREE.Raycaster`.
   * @returns {*} The hit datum, or `null` if nothing was hit.
   * @throws {Error} If `render()` hasn't successfully run yet.
   * @example const hit = chart.pick(raycaster);
   */
  pick(raycaster) {
    this.#assertNotDestroyed('pick');
    if (!this.#rendered) {
      throw new Error('PieChart.pick: call render() first.');
    }
    const three = this.#meshes.map((m) => m.three);
    const hits = raycaster.intersectObjects(three);
    if (hits.length === 0) return null;
    const hitMesh = this.#meshes.find((m) => m.three === hits[0].object);
    return hitMesh.getUserData('datum');
  }

  /**
   * The live `Selection` over every rendered slice — overrides
   * `GraphChart.selection()` (whose private per-datum backend `PieChart`
   * never populates, since it overrides `render()`/`update()` entirely) so
   * `.color()` has something real to write to.
   * @returns {Selection}
   * @example chart.selection().filter((d) => d.count > 90).attr('color', 'gold');
   */
  selection() {
    this.#assertNotDestroyed('selection');
    return this.#selection;
  }

  /**
   * First call materializes one wedge mesh per slice; every later call
   * routes to `update()`.
   * @returns {this}
   * @throws {Error} If `data(arr)` was never called before this render.
   */
  render() {
    this.#assertNotDestroyed('render');
    if (this.#rendered) return this.update();
    if (this.#data === null) {
      throw new Error('PieChart.render: call data(arr) before render().');
    }
    this.#sync();
    this.#rendered = true;
    return this;
  }

  /**
   * Recomputes the pie layout from the latest `data()`/`value()`/
   * `sortSlices()`/`padAngle()` and rebuilds the slice meshes to match.
   * Previously-exploded datums (by reference) stay exploded.
   * @returns {this}
   * @throws {Error} If `render()` hasn't successfully run yet.
   */
  update() {
    this.#assertNotDestroyed('update');
    if (!this.#rendered) {
      throw new Error('PieChart.update: call render() first.');
    }
    this.#sync();
    return this;
  }

  /**
   * Disposes every slice mesh, then defers to `GraphChart.destroy()`.
   * Idempotent.
   * @returns {void}
   */
  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#selection.dispose();
    this.#meshes = [];
    super.destroy();
  }

  /** Shared by `render()`/`update()` (CLAUDE.md §1.1 DRY two-strike rule). */
  #sync() {
    // layout.pie() is chainable-only (mirrors layout.stack()'s convention),
    // not an options-object constructor like layout.tree()/layout.pack() —
    // configure it via its own setters, not a constructor argument (which
    // it silently ignores, leaving every option at its default).
    const slices = layout
      .pie()
      .value(this.#valueAccessor)
      .sort(this.#sortCompare)
      .padAngle(this.#padAngle)(this.#data);

    for (const mesh of this.#meshes) mesh.dispose();

    const arcGenerator = generator
      .arc()
      .innerRadius(this.#innerRadius)
      .outerRadius(this.#outerRadius)
      .extrude(this.#extrude);

    this.#meshes = slices.map((slice, i) => {
      arcGenerator.startAngle(slice.startAngle).endAngle(slice.endAngle);
      const buffers = arcGenerator.compute([slice.data]);
      // A fresh resolveChartMaterial() call per slice, not one shared
      // instance reused across the loop: createTriangleMesh (unlike
      // GraphObjectFactory's instanced/meshes[] factories) never clones the
      // material it's given, since its only prior callers (AreaChart/
      // SurfaceChart) ever build exactly one mesh. Sharing one material
      // across N independently-colored slices would mean only the last
      // slice's `.color()` write actually shows (every mesh points at the
      // same material.color).
      const mesh = GraphObjectFactory.createTriangleMesh(`pie-slice-${i}`, {
        scene: this.scene,
        ...buffers,
        material: resolveChartMaterial(this.material()),
      });
      mesh.setUserData('datum', slice.data);
      return mesh;
    });
    this.#midAngles = slices.map((slice) => (slice.startAngle + slice.endAngle) / 2);

    const template = { scene: this.scene, name: 'pie-slice', geometry: this.#meshes[0]?.three.geometry, material: resolveChartMaterial(this.material()) };
    this.#selection = new Selection({ type: 'meshes', meshes: this.#meshes, template });

    for (let i = 0; i < this.#data.length; i++) this.#applyExplode(i);
    applyColorField(this, this.#data);
    applyOpacityField(this);
    applyVisibleField(this);
    applySizeField(this); // uniform — scales the whole wedge shape around its own center
    applyLegend(this);
  }

  /**
   * Writes `#meshes[index]`'s world position from its mid-angle and
   * `.explodeOffset()`, snapping back to center when not exploded — shared
   * by `.explode()` and `#sync()` (CLAUDE.md §1.1 DRY two-strike rule).
   * @param {number} index
   */
  #applyExplode(index) {
    const isExploded = this.#exploded.has(this.#data[index]);
    const offset = isExploded ? this.#explodeOffset : 0;
    const angle = this.#midAngles[index];
    this.#meshes[index].setPosition(Math.cos(angle) * offset, 0, Math.sin(angle) * offset);
  }

  /** @param {string} method @throws {Error} */
  #assertNotDestroyed(method) {
    if (this.#destroyed) {
      throw new Error(`PieChart.${method}: this chart has been destroyed.`);
    }
  }
}
