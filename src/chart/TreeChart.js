import { layout, Selection } from '../compose/index.js';
import { GraphChart } from './GraphChart.js';
import { GraphObjectFactory, GraphLine } from '../object/index.js';
import { applyColorField } from './colorField.js';
import { applyOpacityField } from './opacityField.js';
import { applyVisibleField } from './visibleField.js';
import { applySizeField } from './sizeField.js';
import { resolveChartMaterial } from './materialField.js';
import { flattenHierarchyNodes, nodeScaleForRadius } from './hierarchyField.js';

/** Number of `[x, y, z]` numbers a parent-child edge's two endpoints need — a `GraphLine` segment. */
const EDGE_POINT_COUNT = 6;

/**
 * `GraphChart` specialized for hierarchical node-link trees (Prompt 138).
 * Node positions come from `layout.tree()` — a one-shot radial layout, not a
 * live simulation and not an accessor+scale computation — so, like
 * `LineChart`/`SurfaceChart`/`NetworkChart`, `TreeChart` overrides
 * `data()`/`render()`/`update()`/`destroy()` entirely rather than building on
 * `GraphChart`'s per-datum pipeline. `GraphChart`'s inherited `x()`/`y()`/
 * `z()`/`shape()`/`filter()`/`sort()`/`on()` are inert here (position/
 * membership come from `layout.tree()` and `.children()` instead);
 * `.color()`/`.opacity()`/`.visible()` still work, via the same
 * `applyColorField`/`applyOpacityField`/`applyVisibleField`/
 * `resolveChartMaterial` helpers every other chart type uses (CLAUDE.md
 * §1.1 DRY) — `.selection()` is overridden to expose a real `Selection`
 * over the node backend so they have something to write to. `.size(fn)`
 * (Prompt 141) multiplies each node's rendered radius on top of the
 * `.r`-driven base `nodeScaleForRadius` already computes — a *second*
 * independent per-datum factor, not a replacement of the hierarchy's own
 * value-driven sizing.
 * `.color()`'s accessor receives each hierarchy node itself (not the raw
 * datum), so `(d) => d.depth`/`(d) => d.value`/`(d) => d.data.someField` all
 * work.
 *
 * Every node (root, internal, and leaf) renders as a sphere
 * (`GraphObjectFactory.createNodes`, instanced above `INSTANCING_THRESHOLD`),
 * sized by `.r` (`layout.tree()`'s own `radiusFromValue` sizing — see
 * `chart/hierarchyField.js`'s `nodeScaleForRadius`); each parent-child edge
 * renders as one `GraphLine` (a `Line2`, `object/GraphLine.js`) — the same
 * primitive `NetworkChart`'s edges already established for node-link graphs.
 *
 * Unlike `NetworkChart`, there is no simulation to step — `layout.tree()` is
 * deterministic, so there's no `.tick()` here.
 * @example
 * new TreeChart(scene)
 *   .data({ name: 'root', children: [{ name: 'a', value: 3 }, { name: 'b', value: 5 }] })
 *   .levelHeight(1.5)
 *   .color((d) => d.depth, palette.viridis)
 *   .render();
 */
export class TreeChart extends GraphChart {
  /** @type {object|null} The last root datum passed to `data(datum)`. */
  #rootDatum = null;

  /** @type {((datum: *, node: object) => (*[]|undefined))|undefined} Forwarded to `layout.tree`'s `children` option. */
  #childrenAccessor = undefined;

  /** @type {((datum: *, node: object) => number)|undefined} Forwarded to `layout.tree`'s `value` option. */
  #valueAccessor = undefined;

  /** @type {((a: object, b: object) => number)|undefined} Forwarded to `layout.tree`'s `sort` option. */
  #sortCompare = undefined;

  /** @type {number|undefined} Forwarded to `layout.tree`'s `levelHeight` option. */
  #levelHeight = undefined;

  /** @type {number|undefined} Forwarded to `layout.tree`'s `levelRadius` option. */
  #levelRadius = undefined;

  /** @type {object[]} Every hierarchy node, flattened, in the order rendered. */
  #nodes = [];

  /** @type {Array<{source: object, target: object}>} One entry per parent-child edge. */
  #links = [];

  /** @type {import('../object/GraphMesh.js').GraphMesh[]|import('../object/GraphInstancedObject.js').GraphInstancedObject|null} */
  #nodeBackend = null;

  /** @type {Selection} The live `Selection` over `#nodeBackend` — what `.selection()`/`.color()` write to. */
  #nodeSelection = new Selection({ type: 'meshes', meshes: [] });

  /** @type {GraphLine[]} One per `#links` entry, in the same order. */
  #edgeLines = [];

  /** @type {boolean} Whether `render()` has materialized nodes/edges yet. */
  #rendered = false;

  /** @type {boolean} */
  #destroyed = false;

  /**
   * @param {object} scene The raw `THREE.Scene` this chart will attach to.
   * @throws {TypeError} If `scene` is falsy.
   */
  constructor(scene) {
    // No `compose/generator` fits: node positions come from layout.tree()'s
    // one-shot hierarchy layout, never an accessor+scale pipeline — this stub
    // only satisfies GraphChart's constructor duck-type check (mirrors
    // NetworkChart's identical stub).
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
      throw new TypeError(`TreeChart.data: expected a root datum object, received ${JSON.stringify(datum)}.`);
    }
    this.#rootDatum = datum;
    return this;
  }

  /**
   * Gets or sets the accessor resolving a datum's child data — forwarded to
   * `layout.tree`'s `children` option (CLAUDE.md §1.1 DRY, no second
   * hierarchy-walk here). Defaults to `layout.tree`'s own default (`(d) => d.children`).
   * @param {(datum: *, node: object) => (*[]|undefined)} [fn]
   * @returns {((datum: *, node: object) => (*[]|undefined))|undefined|this}
   * @throws {TypeError} If `fn` is given and isn't a function.
   * @example chart.children((d) => d.kids);
   */
  children(fn) {
    this.#assertNotDestroyed('children');
    if (fn === undefined) return this.#childrenAccessor;
    if (typeof fn !== 'function') {
      throw new TypeError(`TreeChart.children: expected a function, received ${JSON.stringify(fn)}.`);
    }
    this.#childrenAccessor = fn;
    return this;
  }

  /**
   * Gets or sets the accessor summed bottom-up into each node's `.value`
   * (and, via `radiusFromValue`, its sphere radius) — forwarded to
   * `layout.tree`'s `value` option. Defaults to `layout.tree`'s own default
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
      throw new TypeError(`TreeChart.value: expected a function, received ${JSON.stringify(fn)}.`);
    }
    this.#valueAccessor = fn;
    return this;
  }

  /**
   * Gets or sets the comparator ordering each node's children — forwarded to
   * `layout.tree`'s `sort` option. Named distinctly from `GraphChart.sort()`
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
      throw new TypeError(`TreeChart.sortChildren: expected a function, received ${JSON.stringify(fn)}.`);
    }
    this.#sortCompare = fn;
    return this;
  }

  /**
   * Gets or sets the world-unit drop per depth level — forwarded to
   * `layout.tree`'s `levelHeight` option.
   * @param {number} [value]
   * @returns {number|undefined|this}
   * @throws {TypeError} If `value` is given and isn't a finite number.
   * @example chart.levelHeight(2);
   */
  levelHeight(value) {
    this.#assertNotDestroyed('levelHeight');
    if (value === undefined) return this.#levelHeight;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`TreeChart.levelHeight: expected a finite number, received ${JSON.stringify(value)}.`);
    }
    this.#levelHeight = value;
    return this;
  }

  /**
   * Gets or sets the world-unit ring radius per depth level — forwarded to
   * `layout.tree`'s `levelRadius` option.
   * @param {number} [value]
   * @returns {number|undefined|this}
   * @throws {TypeError} If `value` is given and isn't a finite number.
   * @example chart.levelRadius(2);
   */
  levelRadius(value) {
    this.#assertNotDestroyed('levelRadius');
    if (value === undefined) return this.#levelRadius;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`TreeChart.levelRadius: expected a finite number, received ${JSON.stringify(value)}.`);
    }
    this.#levelRadius = value;
    return this;
  }

  /**
   * The live `Selection` over every rendered node — overrides
   * `GraphChart.selection()` (whose private per-datum backend `TreeChart`
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
   * First call materializes node spheres and edge lines; every later call
   * routes to `update()`.
   * @returns {this}
   * @throws {Error} If `data(datum)` was never called before this render.
   */
  render() {
    this.#assertNotDestroyed('render');
    if (this.#rendered) return this.update();
    if (this.#rootDatum === null) {
      throw new Error('TreeChart.render: call data(rootDatum) before render().');
    }
    this.#sync();
    this.#rendered = true;
    return this;
  }

  /**
   * Recomputes the hierarchy layout from the latest `data()`/`children()`/
   * `value()`/`sortChildren()` and rebuilds the node/edge render backend to
   * match the current node/link counts.
   * @returns {this}
   * @throws {Error} If `render()` hasn't successfully run yet.
   */
  update() {
    this.#assertNotDestroyed('update');
    if (!this.#rendered) {
      throw new Error('TreeChart.update: call render() first.');
    }
    this.#sync();
    return this;
  }

  /**
   * Disposes every node/edge render object, then defers to
   * `GraphChart.destroy()`. Idempotent.
   * @returns {void}
   */
  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#nodeSelection.dispose();
    for (const line of this.#edgeLines) line.dispose();
    this.#edgeLines = [];
    super.destroy();
  }

  /** Shared by `render()`/`update()` (CLAUDE.md §1.1 DRY two-strike rule). */
  #sync() {
    const root = layout.tree({
      children: this.#childrenAccessor,
      value: this.#valueAccessor,
      sort: this.#sortCompare,
      levelHeight: this.#levelHeight,
      levelRadius: this.#levelRadius,
    })(this.#rootDatum);
    this.#nodes = flattenHierarchyNodes(root);
    this.#links = this.#flattenLinks(root);
    this.#buildBackend();
    applyColorField(this, this.#nodes);
    applyOpacityField(this);
    applyVisibleField(this);
    applySizeField(this); // uniform — multiplies on top of the .r-driven base radius
  }

  /**
   * Walks `root` into `{source, target}` pairs, one per parent-child edge —
   * this chart's only consumer of the parent-child relationship, unlike
   * `flattenHierarchyNodes` (`chart/hierarchyField.js`), which `PackChart`
   * also needs.
   * @param {object} root
   * @returns {Array<{source: object, target: object}>}
   */
  #flattenLinks(root) {
    const links = [];
    (function visit(node) {
      if (!node.children) return;
      for (const child of node.children) {
        links.push({ source: node, target: child });
        visit(child);
      }
    })(root);
    return links;
  }

  /**
   * Disposes the previous node backend/edge lines (if any) and creates fresh
   * ones sized to the current hierarchy — mirrors `NetworkChart`'s
   * full-rebuild-per-update approach (a fixed-capacity `GraphInstancedObject`
   * can't grow/shrink in place).
   * ponytail: full teardown+rebuild every update(), not incremental — see
   * skipping_list.md's "NetworkChart.update() fully tears down..." entry,
   * same tradeoff here.
   * ponytail: one GraphLine (Line2) per edge, not instanced — see
   * skipping_list.md's "NetworkChart's edges are one Line2 per link" entry,
   * same tradeoff here.
   */
  #buildBackend() {
    this.#nodeSelection.dispose();
    for (const line of this.#edgeLines) line.dispose();

    const nodes = this.#nodes;
    const resolvedMaterial = resolveChartMaterial(this.material());
    this.#nodeBackend = GraphObjectFactory.createNodes(nodes.length, { scene: this.scene, name: 'tree-node', material: resolvedMaterial });

    if (Array.isArray(this.#nodeBackend)) {
      nodes.forEach((node, i) => {
        const s = nodeScaleForRadius(node.r);
        this.#nodeBackend[i].setPosition(node.x, node.y, node.z).setScale(s, s, s).setUserData('datum', node);
      });
      const template = { scene: this.scene, name: 'tree-node', geometry: this.#nodeBackend[0].three.geometry, material: this.#nodeBackend[0].material };
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

    this.#edgeLines = this.#links.map((_, i) => new GraphLine({ scene: this.scene, name: `tree-edge-${i}` }));
    const scratch = new Float32Array(EDGE_POINT_COUNT);
    this.#links.forEach((link, i) => {
      scratch[0] = link.source.x;
      scratch[1] = link.source.y;
      scratch[2] = link.source.z;
      scratch[3] = link.target.x;
      scratch[4] = link.target.y;
      scratch[5] = link.target.z;
      this.#edgeLines[i].setPositions(scratch.slice());
    });
  }

  /** @param {string} method @throws {Error} */
  #assertNotDestroyed(method) {
    if (this.#destroyed) {
      throw new Error(`TreeChart.${method}: this chart has been destroyed.`);
    }
  }
}
