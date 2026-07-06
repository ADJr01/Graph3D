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

  sim.force = function (name, forceInstance) {
    if (arguments.length === 1) return forces.get(name);
    if (forceInstance === null) {
      forces.delete(name);
    } else {
      forces.set(name, forceInstance);
    }
    return sim;
  };

  sim.alpha = function (value) {
    if (arguments.length === 0) return alpha;
    alpha = value;
    return sim;
  };
  sim.alphaMin = function (value) {
    if (arguments.length === 0) return alphaMin;
    alphaMin = value;
    return sim;
  };
  sim.alphaDecay = function (value) {
    if (arguments.length === 0) return alphaDecay;
    alphaDecay = value;
    return sim;
  };
  sim.alphaTarget = function (value) {
    if (arguments.length === 0) return alphaTarget;
    alphaTarget = value;
    return sim;
  };
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
