import { layout, Selection } from '../compose/index.js';
import { GraphChart } from './GraphChart.js';
import { GraphObjectFactory, GraphLine } from '../object/index.js';
import { applyColorField } from './colorField.js';
import { applyOpacityField } from './opacityField.js';
import { applyVisibleField } from './visibleField.js';
import { applySizeField } from './sizeField.js';
import { resolveChartMaterial } from './materialField.js';
import { applyLegend } from './legendField.js';

/** Number of `[x, y, z]` numbers a link's two endpoints need — a `GraphLine` segment. */
const EDGE_POINT_COUNT = 6;

/**
 * `GraphChart` specialized for node-link network graphs (Prompt 137). Node
 * positions come from `layout.force()` — a live physics simulation, not an
 * accessor+scale computation — so, like `LineChart`/`SurfaceChart`,
 * `NetworkChart` overrides `data()`/`render()`/`update()`/`destroy()`
 * entirely rather than building on `GraphChart`'s per-datum pipeline.
 * `GraphChart`'s inherited `x()`/`y()`/`z()`/`shape()`/`filter()`/`sort()`/
 * `on()` are inert here (positions/membership are driven by the simulation
 * and `.links()`, not those accessors); `.color()`/`.opacity()`/`.visible()`
 * still work, via the same `applyColorField`/`applyOpacityField`/
 * `applyVisibleField`/`resolveChartMaterial` helpers every other chart type
 * uses (CLAUDE.md §1.1 DRY) — `.selection()` is overridden to expose a real
 * `Selection` over the node backend so they have something to write to.
 * `.size(fn)` (Prompt 141) multiplies each node's rendered radius by a
 * per-datum factor — nodes have no other source of scale (`#buildBackend`
 * never calls `setScale`/`setInstanceScale` itself), so the base scale
 * `applySizeField` reads and multiplies is always the sphere's own default.
 *
 * Nodes render as spheres (`GraphObjectFactory.createNodes`, instanced
 * above `INSTANCING_THRESHOLD`); edges render as one `GraphLine` (a `Line2`,
 * `object/GraphLine.js`) per link, reused as-is rather than built through
 * the instanced N-datum path — same reasoning `LineChart`/`SurfaceChart`'s
 * contour overlay already established for continuous paths.
 *
 * The simulation doesn't run itself (CLAUDE.md §2: no internal
 * `requestAnimationFrame`) — call `.tick()` once per frame from your own
 * `loop.add(cb)` callback; it auto-pauses (becomes a no-op) once
 * `layout.force()`'s own `alpha` decays below `alphaMin`, per Prompt 137's
 * "auto-pause on stability".
 * @example
 * new NetworkChart(scene)
 *   .data(nodes)
 *   .links(links)
 *   .linkDistance(2)
 *   .color((d) => d.group, palette.category10)
 *   .render();
 * loop.add(() => chart.tick());
 */
export class NetworkChart extends GraphChart {
  /** @type {ReturnType<layout.force>} */
  #simulation = layout.force();

  /** @type {Array|null} The last array passed to `data(arr)` — one entry per node. */
  #nodesData = null;

  /** @type {Array<{source: (number|object), target: (number|object)}>} */
  #linksData = [];

  /** @type {number|((link: object) => number)|undefined} Forwarded to `layout.force.link`'s `distance` option. */
  #linkDistance = undefined;

  /** @type {((node: object) => *)|null} */
  #clusterKeyFn = null;

  /** @type {number|undefined} */
  #clusterStrength = undefined;

  /** @type {import('../object/GraphMesh.js').GraphMesh[]|import('../object/GraphInstancedObject.js').GraphInstancedObject|null} */
  #nodeBackend = null;

  /** @type {Selection} The live `Selection` over `#nodeBackend` — what `.selection()`/`.color()` write to. */
  #nodeSelection = new Selection({ type: 'meshes', meshes: [] });

  /** @type {Float32Array} Reused every `tick()` — avoids reallocating a positions buffer every animation frame. */
  #positionScratch = new Float32Array(0);

  /** @type {Array<{source: object, target: object}>} `#linksData`, with `source`/`target` resolved to node objects. */
  #resolvedLinks = [];

  /** @type {GraphLine[]} One per `#resolvedLinks` entry, in the same order. */
  #edgeLines = [];

  /** @type {Float32Array} Reused every `tick()` for each edge's 2-point position write. */
  #edgeScratch = new Float32Array(EDGE_POINT_COUNT);

  /** @type {boolean} Whether `render()` has materialized nodes/edges yet. */
  #rendered = false;

  /** @type {boolean} */
  #destroyed = false;

  /**
   * @param {object} scene The raw `THREE.Scene` this chart will attach to.
   * @throws {TypeError} If `scene` is falsy.
   */
  constructor(scene) {
    // No `compose/generator` fits: node positions are simulation state
    // (layout.force), never computed from an accessor+scale pipeline, so
    // there's nothing for a generator to compute — this stub only satisfies
    // GraphChart's constructor duck-type check and is never invoked.
    super(scene, { compute: () => ({}) });
  }

  /**
   * Gets or sets the node array — one entry per simulated node. Unlike
   * `GraphChart.data()`, this doesn't join against a per-datum `Selection`
   * backend (see the class doc) — no-arg reads, one-arg writes and chains.
   * Node identity is by object reference: passing the same node objects
   * across calls preserves their simulated `x`/`y`/`z`/velocity
   * (`layout.force().nodes()` only seeds missing fields); passing new
   * objects scatters them fresh.
   * @param {Array} [arr]
   * @returns {Array|this}
   * @throws {TypeError} If `arr` is given and isn't an array.
   * @example chart.data(nodes).links(links).render();
   */
  data(arr) {
    this.#assertNotDestroyed('data');
    if (arr === undefined) return this.#nodesData;
    if (!Array.isArray(arr)) {
      throw new TypeError(`NetworkChart.data: expected an array, received ${JSON.stringify(arr)}.`);
    }
    this.#nodesData = arr;
    return this;
  }

  /**
   * Gets or sets the link array — `{source, target}` pairs, each either an
   * index into `data()` or a direct node-object reference (same convention
   * as `layout.force.link`, which this passes straight through to).
   * @param {Array<{source: (number|object), target: (number|object)}>} [arr]
   * @returns {Array|this}
   * @throws {TypeError} If `arr` is given and isn't an array.
   * @example chart.links([{ source: 0, target: 1 }, { source: 1, target: 2 }]);
   */
  links(arr) {
    this.#assertNotDestroyed('links');
    if (arr === undefined) return this.#linksData;
    if (!Array.isArray(arr)) {
      throw new TypeError(`NetworkChart.links: expected an array, received ${JSON.stringify(arr)}.`);
    }
    this.#linksData = arr;
    return this;
  }

  /**
   * Gets or sets each link's rest length — forwarded to `layout.force.link`'s
   * `distance` option (CLAUDE.md §1.1 DRY, no reimplemented spring math here).
   * @param {number|((link: object) => number)} [value]
   * @returns {number|((link: object) => number)|undefined|this}
   * @throws {TypeError} If `value` is given and isn't a number or function.
   * @example chart.linkDistance(2);
   */
  linkDistance(value) {
    this.#assertNotDestroyed('linkDistance');
    if (value === undefined) return this.#linkDistance;
    if (typeof value !== 'number' && typeof value !== 'function') {
      throw new TypeError(`NetworkChart.linkDistance: expected a number or (link) => number function, received ${JSON.stringify(value)}.`);
    }
    this.#linkDistance = value;
    return this;
  }

  /**
   * Gets or sets the node grouping key pulling same-group nodes toward a
   * shared centroid (`layout.force.cluster`, CLAUDE.md §1.1 DRY). Pass
   * `null` to remove clustering.
   * @param {((node: object) => *)|null} [keyFn]
   * @param {number} [strength] Forwarded to `layout.force.cluster`. Default `0.3`.
   * @returns {((node: object) => *)|null|this}
   * @throws {TypeError} If `keyFn` is given and isn't a function or `null`.
   * @example chart.cluster((d) => d.group);
   */
  cluster(keyFn, strength) {
    this.#assertNotDestroyed('cluster');
    if (keyFn === undefined) return this.#clusterKeyFn;
    if (keyFn !== null && typeof keyFn !== 'function') {
      throw new TypeError(`NetworkChart.cluster: expected a function or null, received ${JSON.stringify(keyFn)}.`);
    }
    this.#clusterKeyFn = keyFn;
    this.#clusterStrength = strength;
    return this;
  }

  /**
   * Fixes `node` in place — sets `fx`/`fy`/`fz` to `position` (default: the
   * node's current `x`/`y`/`z`), which `layout.force()`'s own `tick()`
   * already special-cases (a pinned node's simulated position snaps to
   * `fx`/`fy`/`fz` every tick, ignoring forces on that axis — CLAUDE.md
   * §1.1 DRY, no second pinning mechanism here). Wakes an auto-paused
   * simulation back up, since pinning changes the layout.
   * @param {object} node A node from `data()`.
   * @param {{x?: number, y?: number, z?: number}} [position]
   * @returns {this}
   * @throws {TypeError} If `node` isn't an object.
   * @example chart.pin(draggedNode, { x: 3, y: 0, z: -2 });
   */
  pin(node, position) {
    this.#assertNotDestroyed('pin');
    if (!node || typeof node !== 'object') {
      throw new TypeError(`NetworkChart.pin: expected a node object, received ${JSON.stringify(node)}.`);
    }
    node.fx = position?.x ?? node.x;
    node.fy = position?.y ?? node.y;
    node.fz = position?.z ?? node.z;
    this.#simulation.restart();
    return this;
  }

  /**
   * Releases a node previously fixed via `.pin()`, letting forces move it
   * again. Wakes an auto-paused simulation back up.
   * @param {object} node A node from `data()`.
   * @returns {this}
   * @throws {TypeError} If `node` isn't an object.
   * @example chart.unpin(draggedNode);
   */
  unpin(node) {
    this.#assertNotDestroyed('unpin');
    if (!node || typeof node !== 'object') {
      throw new TypeError(`NetworkChart.unpin: expected a node object, received ${JSON.stringify(node)}.`);
    }
    delete node.fx;
    delete node.fy;
    delete node.fz;
    this.#simulation.restart();
    return this;
  }

  /**
   * The live `Selection` over every rendered node — overrides
   * `GraphChart.selection()` (whose private per-datum backend `NetworkChart`
   * never populates, since it overrides `render()`/`update()` entirely) so
   * `.color()` has something real to write to.
   * @returns {Selection}
   * @example chart.selection().filter((d) => d.flagged).attr('color', 'crimson');
   */
  selection() {
    this.#assertNotDestroyed('selection');
    return this.#nodeSelection;
  }

  /**
   * First call materializes node spheres and edge lines and starts the
   * simulation; every later call routes to `update()`.
   * @returns {this}
   * @throws {Error} If `data(arr)` was never called before this render.
   * @see GraphChart#render
   */
  render() {
    this.#assertNotDestroyed('render');
    if (this.#rendered) return this.update();
    if (this.#nodesData === null) {
      throw new Error('NetworkChart.render: call data(nodes) before render().');
    }
    this.#sync();
    this.#rendered = true;
    return this;
  }

  /**
   * Re-seeds the simulation from the latest `data()`/`links()` (preserving
   * existing nodes' simulated position/velocity — see `.data()`'s note) and
   * rebuilds the node/edge render backend to match the current counts.
   * @returns {this}
   * @throws {Error} If `render()` hasn't successfully run yet.
   * @see GraphChart#update
   */
  update() {
    this.#assertNotDestroyed('update');
    if (!this.#rendered) {
      throw new Error('NetworkChart.update: call render() first.');
    }
    this.#sync();
    return this;
  }

  /**
   * Advances the simulation by one step and writes the result into the
   * node/edge render backend — call once per frame (e.g. from `loop.add`).
   * A no-op once the simulation has auto-paused (Prompt 137's "auto-pause on
   * stability", `layout.force()`'s own `active()`/`alpha` mechanism —
   * CLAUDE.md §1.1 DRY, not reimplemented here).
   * @returns {boolean} Whether the simulation actually advanced.
   * @throws {Error} If `render()` hasn't successfully run yet.
   * @example loop.add(() => chart.tick());
   */
  tick() {
    this.#assertNotDestroyed('tick');
    if (!this.#rendered) {
      throw new Error('NetworkChart.tick: call render() first.');
    }
    if (!this.#simulation.active()) return false;
    this.#simulation.tick();
    this.#syncPositions();
    return true;
  }

  /**
   * Disposes every node/edge render object, then defers to
   * `GraphChart.destroy()`. Idempotent.
   * @returns {void}
   * @see GraphChart#destroy
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
    this.#simulation.nodes(this.#nodesData);
    this.#buildForces();
    this.#buildBackend();
    this.#syncPositions();
    applyColorField(this, this.data());
    applyOpacityField(this);
    applyVisibleField(this);
    applySizeField(this); // uniform — nodes are spheres, all 3 axes
    applyLegend(this);
    this.#simulation.restart();
  }

  /** Registers this chart's forces on `#simulation`, reflecting the current `.linkDistance()`/`.cluster()` config. */
  #buildForces() {
    this.#simulation.force('charge', layout.force.charge());
    this.#simulation.force('center', layout.force.center());
    this.#simulation.force('link', layout.force.link(this.#linksData, { distance: this.#linkDistance }));
    this.#simulation.force('cluster', this.#clusterKeyFn ? layout.force.cluster(this.#clusterKeyFn, this.#clusterStrength) : null);
  }

  /**
   * Disposes the previous node backend/edge lines (if any) and creates fresh
   * ones sized to the current `data()`/`links()` — mirrors `SurfaceChart`'s
   * full-rebuild-per-update approach (a fixed-capacity `GraphInstancedObject`
   * can't grow/shrink in place).
   * ponytail: full teardown+rebuild every update(), not incremental — a
   * streaming graph calling update() often would feel this; see
   * skipping_list.md's "NetworkChart.update() fully tears down..." entry.
   * ponytail: one GraphLine (Line2) per edge, not instanced — nodes scale to
   * INSTANCING_THRESHOLD+ via GraphInstancedObject, edges don't; fine for a
   * few thousand links, not a real "millions of edges" primitive yet — see
   * skipping_list.md's "NetworkChart's edges are one Line2 per link" entry.
   */
  #buildBackend() {
    this.#nodeSelection.dispose();
    for (const line of this.#edgeLines) line.dispose();

    const nodes = this.#nodesData;
    const resolvedMaterial = resolveChartMaterial(this.material());
    this.#nodeBackend = GraphObjectFactory.createNodes(nodes.length, { scene: this.scene, name: 'network-node', material: resolvedMaterial });

    if (Array.isArray(this.#nodeBackend)) {
      nodes.forEach((node, i) => this.#nodeBackend[i].setPosition(node.x, node.y, node.z).setUserData('datum', node));
      const template = { scene: this.scene, name: 'network-node', geometry: this.#nodeBackend[0].three.geometry, material: this.#nodeBackend[0].material };
      this.#nodeSelection = new Selection({ type: 'meshes', meshes: this.#nodeBackend, template });
    } else {
      nodes.forEach((node, i) => this.#nodeBackend.setInstancePosition(i, node.x, node.y, node.z));
      this.#nodeBackend.commitMatrix();
      nodes.forEach((node, i) => this.#nodeBackend.setInstanceUserData(i, node));
      this.#nodeSelection = new Selection({
        type: 'instanced',
        object: this.#nodeBackend,
        indices: Uint32Array.from({ length: nodes.length }, (_, i) => i),
      });
    }
    this.#positionScratch = new Float32Array(nodes.length * 3);

    const resolve = (ref) => (typeof ref === 'number' ? nodes[ref] : ref);
    this.#resolvedLinks = this.#linksData.map((link) => ({ source: resolve(link.source), target: resolve(link.target) }));
    this.#edgeLines = this.#resolvedLinks.map((_, i) => new GraphLine({ scene: this.scene, name: `network-edge-${i}` }));
  }

  /** Writes the simulation's current node positions and edge endpoints into the render backend — shared by `#sync()` and `tick()`. */
  #syncPositions() {
    const nodes = this.#nodesData;
    if (Array.isArray(this.#nodeBackend)) {
      nodes.forEach((node, i) => this.#nodeBackend[i].setPosition(node.x, node.y, node.z));
    } else {
      nodes.forEach((node, i) => {
        const o = i * 3;
        this.#positionScratch[o] = node.x;
        this.#positionScratch[o + 1] = node.y;
        this.#positionScratch[o + 2] = node.z;
      });
      this.#nodeBackend.setAllPositions(this.#positionScratch).commitMatrix();
    }

    this.#resolvedLinks.forEach(({ source, target }, i) => {
      this.#edgeScratch[0] = source.x;
      this.#edgeScratch[1] = source.y;
      this.#edgeScratch[2] = source.z;
      this.#edgeScratch[3] = target.x;
      this.#edgeScratch[4] = target.y;
      this.#edgeScratch[5] = target.z;
      this.#edgeLines[i].setPositions(this.#edgeScratch);
    });
  }

  /** @param {string} method @throws {Error} */
  #assertNotDestroyed(method) {
    if (this.#destroyed) {
      throw new Error(`NetworkChart.${method}: this chart has been destroyed.`);
    }
  }
}
