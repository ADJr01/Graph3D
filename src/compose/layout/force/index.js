import { forceLink, forceCharge, forceCenter, forceCollide, forceRadial, forceCluster } from './forces.js';

const DEFAULT_ALPHA_MIN = 0.001;
// d3-force's convention: alphaDecay is picked so alpha decays from 1 to
// alphaMin over ~300 ticks by default.
const DEFAULT_ALPHA_DECAY = 1 - Math.pow(DEFAULT_ALPHA_MIN, 1 / 300);
const DEFAULT_VELOCITY_DECAY = 0.4;
// New nodes without an initial position are scattered in a small cube
// rather than all stacked at the origin, so the first tick has forces to
// act on (Barnes-Hut charge on coincident points is degenerate).
const INITIAL_SPREAD = 10;

/**
 * Creates a 3D force-directed layout simulation — chainable configuration
 * (`nodes`, `force`, `alpha*`, `velocityDecay`) plus an externally-driven
 * `tick()` (CLAUDE.md §2: no internal `requestAnimationFrame`; the caller —
 * e.g. a chart's `loop.add` callback — steps it once per frame). Integrates
 * with velocity Verlet: each tick predicts positions from the previous
 * acceleration, recomputes forces at the new positions, then reconciles
 * velocity from the average of the old and new acceleration. `alpha` decays
 * toward `alphaTarget` every tick; once it reaches `alphaMin`, `tick()`
 * becomes a no-op (`active()` returns `false`) — the simulation
 * auto-pauses instead of the caller needing to detect convergence itself.
 * @returns {{
 *   nodes: (nodes?: object[]) => (object[]|object),
 *   force: (name: string, forceInstance?: (Function|null)) => (Function|object),
 *   alpha: (value?: number) => (number|object),
 *   alphaMin: (value?: number) => (number|object),
 *   alphaDecay: (value?: number) => (number|object),
 *   alphaTarget: (value?: number) => (number|object),
 *   velocityDecay: (value?: number) => (number|object),
 *   active: () => boolean,
 *   tick: () => boolean,
 *   restart: () => object,
 *   stop: () => object,
 * }}
 * @example
 * const sim = layout.force()
 *   .nodes(nodes)
 *   .force('charge', layout.force.charge(-30))
 *   .force('link', layout.force.link(links))
 *   .force('center', layout.force.center());
 * loop.add(() => { if (sim.active()) sim.tick(); });
 */
export function force() {
  let nodes = [];
  let alpha = 1;
  let alphaMin = DEFAULT_ALPHA_MIN;
  let alphaDecay = DEFAULT_ALPHA_DECAY;
  let alphaTarget = 0;
  let velocityDecay = DEFAULT_VELOCITY_DECAY;
  const forces = new Map();

  const sim = {};

  /**
   * Gets or sets the simulation's node array. Setting seeds missing
   * `x`/`y`/`z` with a small random scatter (`INITIAL_SPREAD`) and zeroes
   * `vx`/`vy`/`vz`/acceleration, so a fresh `nodes()` call is always safe to
   * `tick()` immediately.
   * @param {object[]} [nextNodes]
   * @returns {object[]|object} The current node array if called with no
   *   arguments; `sim` itself (chainable) if called with `nextNodes`.
   * @throws {TypeError} If `nextNodes` is not an array.
   * @example sim.nodes([{ id: 'a' }, { id: 'b' }]);
   */
  sim.nodes = function (nextNodes) {
    if (arguments.length === 0) return nodes;
    if (!Array.isArray(nextNodes)) {
      throw new TypeError(`layout.force().nodes: expected an array of nodes, received ${JSON.stringify(nextNodes)}.`);
    }
    nodes = nextNodes;
    for (const node of nodes) {
      if (typeof node.x !== 'number') node.x = (Math.random() - 0.5) * INITIAL_SPREAD;
      if (typeof node.y !== 'number') node.y = (Math.random() - 0.5) * INITIAL_SPREAD;
      if (typeof node.z !== 'number') node.z = (Math.random() - 0.5) * INITIAL_SPREAD;
      node.vx ??= 0;
      node.vy ??= 0;
      node.vz ??= 0;
      node.__ax = 0;
      node.__ay = 0;
      node.__az = 0;
    }
    return sim;
  };

  /**
   * Gets, sets, or removes a named force. Pass `null` as `forceInstance` to
   * remove a previously-set force.
   * @param {string} name
   * @param {Function|null} [forceInstance]
   * @returns {Function|object} The current force instance if called with only
   *   `name`; `sim` itself (chainable) if `forceInstance` is passed.
   * @example sim.force('charge', layout.force.charge(-30));
   */
  sim.force = function (name, forceInstance) {
    if (arguments.length === 1) return forces.get(name);
    if (forceInstance === null) {
      forces.delete(name);
    } else {
      forces.set(name, forceInstance);
    }
    return sim;
  };

  /**
   * Gets or sets the simulation's current "temperature" — decays toward
   * `alphaTarget` every `tick()`; `active()` returns `false` once it drops
   * to `alphaMin`.
   * @param {number} [value]
   * @returns {number|object} The current value if called with no arguments;
   *   `sim` itself (chainable) if `value` is passed.
   * @example sim.alpha(1);
   */
  sim.alpha = function (value) {
    if (arguments.length === 0) return alpha;
    alpha = value;
    return sim;
  };
  /**
   * Gets or sets the `alpha` threshold below which `tick()` auto-pauses.
   * @param {number} [value]
   * @returns {number|object} The current value if called with no arguments;
   *   `sim` itself (chainable) if `value` is passed.
   * @example sim.alphaMin(0.001);
   */
  sim.alphaMin = function (value) {
    if (arguments.length === 0) return alphaMin;
    alphaMin = value;
    return sim;
  };
  /**
   * Gets or sets the per-tick multiplier `alpha` decays toward `alphaTarget` by.
   * @param {number} [value]
   * @returns {number|object} The current value if called with no arguments;
   *   `sim` itself (chainable) if `value` is passed.
   * @example sim.alphaDecay(0.02);
   */
  sim.alphaDecay = function (value) {
    if (arguments.length === 0) return alphaDecay;
    alphaDecay = value;
    return sim;
  };
  /**
   * Gets or sets the resting `alpha` value the simulation decays toward —
   * a non-zero target keeps the simulation "warm" (e.g. during a drag).
   * @param {number} [value]
   * @returns {number|object} The current value if called with no arguments;
   *   `sim` itself (chainable) if `value` is passed.
   * @example sim.alphaTarget(0.3); // keep warm while dragging
   */
  sim.alphaTarget = function (value) {
    if (arguments.length === 0) return alphaTarget;
    alphaTarget = value;
    return sim;
  };
  /**
   * Gets or sets the fraction of velocity retained each tick (`1 - friction`).
   * @param {number} [value]
   * @returns {number|object} The current value if called with no arguments;
   *   `sim` itself (chainable) if `value` is passed.
   * @example sim.velocityDecay(0.4);
   */
  sim.velocityDecay = function (value) {
    if (arguments.length === 0) return velocityDecay;
    velocityDecay = value;
    return sim;
  };

  /** `true` while `alpha` is still above `alphaMin` — i.e. `tick()` will still move nodes. */
  sim.active = function () {
    return alpha > alphaMin;
  };

  /** Resets `alpha` to `1`, waking an auto-paused simulation back up (e.g. after a drag starts a new node's pin). */
  sim.restart = function () {
    alpha = 1;
    return sim;
  };

  /** Forces `tick()` to auto-pause immediately, regardless of `alphaMin`. */
  sim.stop = function () {
    alpha = 0;
    return sim;
  };

  function computeAccelerations() {
    for (const node of nodes) {
      node.__ax = 0;
      node.__ay = 0;
      node.__az = 0;
    }
    for (const forceInstance of forces.values()) forceInstance(nodes, alpha);
  }

  /**
   * Advances the simulation by one velocity-Verlet step.
   * @returns {boolean} `false` (a no-op) if there are no nodes or the
   *   simulation has auto-paused (`alpha <= alphaMin`); `true` otherwise.
   */
  sim.tick = function () {
    if (nodes.length === 0 || !sim.active()) return false;

    for (const node of nodes) {
      if (node.fx == null) node.x += node.vx + 0.5 * node.__ax;
      if (node.fy == null) node.y += node.vy + 0.5 * node.__ay;
      if (node.fz == null) node.z += node.vz + 0.5 * node.__az;
    }

    const oldAx = nodes.map((node) => node.__ax);
    const oldAy = nodes.map((node) => node.__ay);
    const oldAz = nodes.map((node) => node.__az);
    computeAccelerations();

    const retain = 1 - velocityDecay;
    nodes.forEach((node, i) => {
      if (node.fx == null) node.vx = (node.vx + 0.5 * (oldAx[i] + node.__ax)) * retain;
      else {
        node.x = node.fx;
        node.vx = 0;
      }
      if (node.fy == null) node.vy = (node.vy + 0.5 * (oldAy[i] + node.__ay)) * retain;
      else {
        node.y = node.fy;
        node.vy = 0;
      }
      if (node.fz == null) node.vz = (node.vz + 0.5 * (oldAz[i] + node.__az)) * retain;
      else {
        node.z = node.fz;
        node.vz = 0;
      }
    });

    alpha += (alphaTarget - alpha) * alphaDecay;
    return true;
  };

  return sim;
}

force.link = forceLink;
force.charge = forceCharge;
force.center = forceCenter;
force.collide = forceCollide;
force.radial = forceRadial;
force.cluster = forceCluster;
