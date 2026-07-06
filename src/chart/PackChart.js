import { layout, Selection } from '../compose/index.js';
import { GraphChart } from './GraphChart.js';
import { GraphObjectFactory } from '../object/index.js';
import { applyColorField } from './colorField.js';
import { resolveChartMaterial } from './materialField.js';
import { flattenHierarchyNodes, nodeScaleForRadius } from './hierarchyField.js';

/**
 * `GraphChart` specialized for nested-sphere hierarchies (Prompt 138). Node
 * positions come from `layout.pack()` — a one-shot sphere-packing layout, not
 * a live simulation and not an accessor+scale computation — so, like
 * `TreeChart`/`NetworkChart`, `PackChart` overrides `data()`/`render()`/
 * `update()`/`destroy()` entirely rather than building on `GraphChart`'s
 * per-datum pipeline. `GraphChart`'s inherited `x()`/`y()`/`z()`/`size()`/
 * `shape()`/`opacity()`/`filter()`/`sort()`/`on()` are inert here
 * (position/membership come from `layout.pack()` and `.children()` instead);
 * `.color()` and `.material()` still work, via the same `applyColorField`/
 * `resolveChartMaterial` helpers every other chart type uses (CLAUDE.md
 * §1.1 DRY) — `.selection()` is overridden to expose a real `Selection` over
 * the node backend so they have something to write to. `.color()`'s
 * accessor receives each hierarchy node itself (not the raw datum), so
 * `(d) => d.depth`/`(d) => d.value`/`(d) => d.data.someField` all work.
 * ponytail: `.material()` defaults to the same opaque `material.standard()`
 * every other chart uses — but an opaque root sphere fully hides every
 * nested child from any outside view. Pass `.material('standard', {
 * transparent: true, opacity: <0.5ish> })` for a legible pack; see
 * skipping_list.md's "PackChart's default material is opaque" entry.
 *
 * Every node (root, internal, and leaf) renders as a sphere
 * (`GraphObjectFactory.createNodes`, instanced above `INSTANCING_THRESHOLD`),
 * sized and positioned by `.r`/`.x`/`.y`/`.z` (`layout.pack()`'s own
 * collision-free nesting — see `chart/hierarchyField.js`'s
 * `nodeScaleForRadius`, which converts a node's world-unit `.r` into the
 * exact scale factor that renders it at that radius, matching the space
 * `layout.pack()` actually reserved for it). Unlike `TreeChart`, there are no
 * edges — nesting itself conveys parent-child structure, the 3D analogue of
 * d3.pack's nested circles.
 *
 * There is no simulation to step — `layout.pack()` is deterministic (it runs
 * its own internal force-relaxation synchronously inside `.compute()`), so
 * there's no `.tick()` here.
 * @example
 * new PackChart(scene)
 *   .data({ name: 'root', children: [{ name: 'a', value: 3 }, { name: 'b', value: 5 }] })
 *   .padding(0.1)
 *   .color((d) => d.depth, palette.viridis)
 *   .render();
 */
export class PackChart extends GraphChart {
  /** @type {object|null} The last root datum passed to `data(datum)`. */
  #rootDatum = null;

  /** @type {((datum: *, node: object) => (*[]|undefined))|undefined} Forwarded to `layout.pack`'s `children` option. */
  #childrenAccessor = undefined;

  /** @type {((datum: *, node: object) => number)|undefined} Forwarded to `layout.pack`'s `value` option. */
  #valueAccessor = undefined;

  /** @type {((a: object, b: object) => number)|undefined} Forwarded to `layout.pack`'s `sort` option. */
  #sortCompare = undefined;

  /** @type {number|undefined} Forwarded to `layout.pack`'s `padding` option. */
  #padding = undefined;

  /** @type {object[]} Every hierarchy node, flattened, in the order rendered. */
  #nodes = [];

  /** @type {import('../object/GraphMesh.js').GraphMesh[]|import('../object/GraphInstancedObject.js').GraphInstancedObject|null} */
  #nodeBackend = null;

  /** @type {Selection} The live `Selection` over `#nodeBackend` — what `.selection()`/`.color()` write to. */
  #nodeSelection = new Selection({ type: 'meshes', meshes: [] });

  /** @type {boolean} Whether `render()` has materialized nodes yet. */
  #rendered = false;

  /** @type {boolean} */
  #destroyed = false;

  /**
   * @param {object} scene The raw `THREE.Scene` this chart will attach to.
   * @throws {TypeError} If `scene` is falsy.
   */
  constructor(scene) {
    // No `compose/generator` fits: node positions come from layout.pack()'s
    // one-shot hierarchy layout, never an accessor+scale pipeline — this stub
    // only satisfies GraphChart's constructor duck-type check (mirrors
    // NetworkChart/TreeChart's identical stub).
    super(scene, { compute: () => ({}) });
  }

  /**
   * Gets or sets the root datum this chart renders as a hierarchy. Unlike
   * `GraphChart.data()`, this is a single object (a tree root), not an array
   * — no-arg reads, one-arg writes and chains.
   * @param {object} [datum]
   * @returns {object|this}
   * @throws {TypeError} If `datum` is given and isn't a non-null object.
   * @example chart.data({ name: 'root', children: [{ name: 'leaf', value: 1 }] });
   */
  data(datum) {
    this.#assertNotDestroyed('data');
    if (datum === undefined) return this.#rootDatum;
    if (datum === null || typeof datum !== 'object') {
      throw new TypeError(`PackChart.data: expected a root datum object, received ${JSON.stringify(datum)}.`);
    }
    this.#rootDatum = datum;
    return this;
  }

  /**
   * Gets or sets the accessor resolving a datum's child data — forwarded to
   * `layout.pack`'s `children` option (CLAUDE.md §1.1 DRY, no second
   * hierarchy-walk here). Defaults to `layout.pack`'s own default (`(d) => d.children`).
   * @param {(datum: *, node: object) => (*[]|undefined)} [fn]
   * @returns {((datum: *, node: object) => (*[]|undefined))|undefined|this}
   * @throws {TypeError} If `fn` is given and isn't a function.
   * @example chart.children((d) => d.kids);
   */
  children(fn) {
    this.#assertNotDestroyed('children');
    if (fn === undefined) return this.#childrenAccessor;
    if (typeof fn !== 'function') {
      throw new TypeError(`PackChart.children: expected a function, received ${JSON.stringify(fn)}.`);
    }
    this.#childrenAccessor = fn;
    return this;
  }

  /**
   * Gets or sets the accessor summed bottom-up into each node's `.value`
   * (and, via `radiusFromValue`, its sphere radius) — forwarded to
   * `layout.pack`'s `value` option. Defaults to `layout.pack`'s own default
   * (`(d) => d.value`).
   * @param {(datum: *, node: object) => number} [fn]
   * @returns {((datum: *, node: object) => number)|undefined|this}
   * @throws {TypeError} If `fn` is given and isn't a function.
   * @example chart.value((d) => d.size);
   */
  value(fn) {
    this.#assertNotDestroyed('value');
    if (fn === undefined) return this.#valueAccessor;
    if (typeof fn !== 'function') {
      throw new TypeError(`PackChart.value: expected a function, received ${JSON.stringify(fn)}.`);
    }
    this.#valueAccessor = fn;
    return this;
  }

  /**
   * Gets or sets the comparator ordering each node's children — forwarded to
   * `layout.pack`'s `sort` option. Named distinctly from `GraphChart.sort()`
   * (inert here, per the class doc) since it orders sibling nodes within the
   * hierarchy, not this chart's flat data array.
   * @param {(a: object, b: object) => number} [fn]
   * @returns {((a: object, b: object) => number)|undefined|this}
   * @throws {TypeError} If `fn` is given and isn't a function.
   * @example chart.sortChildren((a, b) => b.value - a.value);
   */
  sortChildren(fn) {
    this.#assertNotDestroyed('sortChildren');
    if (fn === undefined) return this.#sortCompare;
    if (typeof fn !== 'function') {
      throw new TypeError(`PackChart.sortChildren: expected a function, received ${JSON.stringify(fn)}.`);
    }
    this.#sortCompare = fn;
    return this;
  }

  /**
   * Gets or sets the extra world-unit gap enforced between sibling spheres
   * and between a child and its parent's enclosing surface — forwarded to
   * `layout.pack`'s `padding` option.
   * @param {number} [value]
   * @returns {number|undefined|this}
   * @throws {TypeError} If `value` is given and isn't a finite number.
   * @example chart.padding(0.2);
   */
  padding(value) {
    this.#assertNotDestroyed('padding');
    if (value === undefined) return this.#padding;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`PackChart.padding: expected a finite number, received ${JSON.stringify(value)}.`);
    }
    this.#padding = value;
    return this;
  }

  /**
   * The live `Selection` over every rendered node — overrides
   * `GraphChart.selection()` (whose private per-datum backend `PackChart`
   * never populates, since it overrides `render()`/`update()` entirely) so
   * `.color()` has something real to write to.
   * @returns {Selection}
   * @example chart.selection().filter((d) => d.depth === 0).attr('color', 'gold');
   */
  selection() {
    this.#assertNotDestroyed('selection');
    return this.#nodeSelection;
  }

  /**
   * First call materializes node spheres; every later call routes to
   * `update()`.
   * @returns {this}
   * @throws {Error} If `data(datum)` was never called before this render.
   */
  render() {
    this.#assertNotDestroyed('render');
    if (this.#rendered) return this.update();
    if (this.#rootDatum === null) {
      throw new Error('PackChart.render: call data(rootDatum) before render().');
    }
    this.#sync();
    this.#rendered = true;
    return this;
  }

  /**
   * Recomputes the hierarchy layout from the latest `data()`/`children()`/
   * `value()`/`sortChildren()`/`padding()` and rebuilds the node render
   * backend to match the current node count.
   * @returns {this}
   * @throws {Error} If `render()` hasn't successfully run yet.
   */
  update() {
    this.#assertNotDestroyed('update');
    if (!this.#rendered) {
      throw new Error('PackChart.update: call render() first.');
    }
    this.#sync();
    return this;
  }

  /**
   * Disposes every node render object, then defers to `GraphChart.destroy()`.
   * Idempotent.
   * @returns {void}
   */
  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#nodeSelection.dispose();
    super.destroy();
  }

  /** Shared by `render()`/`update()` (CLAUDE.md §1.1 DRY two-strike rule). */
  #sync() {
    const root = layout.pack({
      children: this.#childrenAccessor,
      value: this.#valueAccessor,
      sort: this.#sortCompare,
      padding: this.#padding,
    })(this.#rootDatum);
    this.#nodes = flattenHierarchyNodes(root);
    this.#buildBackend();
    applyColorField(this, this.#nodes);
  }

  /**
   * Disposes the previous node backend (if any) and creates a fresh one
   * sized to the current hierarchy — mirrors `NetworkChart`/`TreeChart`'s
   * full-rebuild-per-update approach (a fixed-capacity `GraphInstancedObject`
   * can't grow/shrink in place).
   * ponytail: full teardown+rebuild every update(), not incremental — see
   * skipping_list.md's "NetworkChart.update() fully tears down..." entry,
   * same tradeoff here.
   */
  #buildBackend() {
    this.#nodeSelection.dispose();

    const nodes = this.#nodes;
    const resolvedMaterial = resolveChartMaterial(this.material());
    this.#nodeBackend = GraphObjectFactory.createNodes(nodes.length, { scene: this.scene, name: 'pack-node', material: resolvedMaterial });

    if (Array.isArray(this.#nodeBackend)) {
      nodes.forEach((node, i) => {
        const s = nodeScaleForRadius(node.r);
        this.#nodeBackend[i].setPosition(node.x, node.y, node.z).setScale(s, s, s).setUserData('datum', node);
      });
      const template = { scene: this.scene, name: 'pack-node', geometry: this.#nodeBackend[0].three.geometry, material: this.#nodeBackend[0].material };
      this.#nodeSelection = new Selection({ type: 'meshes', meshes: this.#nodeBackend, template });
    } else {
      const positions = new Float32Array(nodes.length * 3);
      const scales = new Float32Array(nodes.length * 3);
      nodes.forEach((node, i) => {
        const o = i * 3;
        positions[o] = node.x;
        positions[o + 1] = node.y;
        positions[o + 2] = node.z;
        const s = nodeScaleForRadius(node.r);
        scales[o] = s;
        scales[o + 1] = s;
        scales[o + 2] = s;
      });
      this.#nodeBackend.setAllPositions(positions).setAllScales(scales).commitMatrix();
      nodes.forEach((node, i) => this.#nodeBackend.setInstanceUserData(i, node));
      this.#nodeSelection = new Selection({
        type: 'instanced',
        object: this.#nodeBackend,
        indices: Uint32Array.from({ length: nodes.length }, (_, i) => i),
      });
    }
  }

  /** @param {string} method @throws {Error} */
  #assertNotDestroyed(method) {
    if (this.#destroyed) {
      throw new Error(`PackChart.${method}: this chart has been destroyed.`);
    }
  }
}
