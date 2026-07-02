import { describe, it, expect } from 'vitest';
import { force } from '../../../../src/compose/layout/force/index.js';

describe('force() defaults', () => {
  it('starts with alpha 1 and no nodes/forces', () => {
    const sim = force();
    expect(sim.alpha()).toBe(1);
    expect(sim.nodes()).toEqual([]);
    expect(sim.active()).toBe(true);
  });

  it('exposes alphaMin/alphaDecay/alphaTarget/velocityDecay getters', () => {
    const sim = force();
    expect(sim.alphaMin()).toBeGreaterThan(0);
    expect(sim.alphaDecay()).toBeGreaterThan(0);
    expect(sim.alphaTarget()).toBe(0);
    expect(sim.velocityDecay()).toBeGreaterThan(0);
  });

  it('every setter is chainable', () => {
    const sim = force();
    expect(sim.alpha(0.5)).toBe(sim);
    expect(sim.alphaMin(0.01)).toBe(sim);
    expect(sim.alphaDecay(0.1)).toBe(sim);
    expect(sim.alphaTarget(0.1)).toBe(sim);
    expect(sim.velocityDecay(0.5)).toBe(sim);
    expect(sim.nodes([])).toBe(sim);
    expect(sim.force('x', () => {})).toBe(sim);
    expect(sim.restart()).toBe(sim);
    expect(sim.stop()).toBe(sim);
  });
});

describe('force().nodes()', () => {
  it('fills in missing x/y/z/vx/vy/vz', () => {
    const sim = force().nodes([{}]);
    const [node] = sim.nodes();
    expect(typeof node.x).toBe('number');
    expect(typeof node.y).toBe('number');
    expect(typeof node.z).toBe('number');
    expect(node.vx).toBe(0);
    expect(node.vy).toBe(0);
    expect(node.vz).toBe(0);
  });

  it('preserves an explicitly given position', () => {
    const sim = force().nodes([{ x: 1, y: 2, z: 3 }]);
    const [node] = sim.nodes();
    expect(node.x).toBe(1);
    expect(node.y).toBe(2);
    expect(node.z).toBe(3);
  });

  it('throws TypeError for a non-array', () => {
    expect(() => force().nodes('nope')).toThrow(TypeError);
  });
});

describe('force().force()', () => {
  it('gets, sets, and removes a named force', () => {
    const sim = force();
    const charge = () => {};
    sim.force('charge', charge);
    expect(sim.force('charge')).toBe(charge);
    sim.force('charge', null);
    expect(sim.force('charge')).toBeUndefined();
  });
});

describe('force().tick()', () => {
  it('returns false and does nothing with no nodes', () => {
    expect(force().tick()).toBe(false);
  });

  it('moves nodes and decays alpha each tick', () => {
    const sim = force()
      .nodes([
        { x: -1, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ])
      .force('charge', force.charge(-30));
    const alphaBefore = sim.alpha();
    const result = sim.tick();
    expect(result).toBe(true);
    expect(sim.alpha()).toBeLessThan(alphaBefore);
    // Velocity Verlet: the very first tick has zero prior acceleration, so
    // it only sets up velocity from the freshly-computed force — position
    // moves starting on the second tick.
    sim.tick();
    const [a, b] = sim.nodes();
    expect(a.x).toBeLessThan(-1); // repelled further apart
    expect(b.x).toBeGreaterThan(1);
  });

  it('auto-pauses once alpha decays to alphaMin: tick() becomes a no-op', () => {
    const sim = force().nodes([{ x: 0, y: 0, z: 0 }]).alpha(0.0001).alphaMin(0.001);
    expect(sim.active()).toBe(false);
    expect(sim.tick()).toBe(false);
  });

  it('restart() wakes an auto-paused simulation back up', () => {
    const sim = force().nodes([{ x: 0, y: 0, z: 0 }]).alphaMin(0.001).stop();
    expect(sim.active()).toBe(false);
    sim.restart();
    expect(sim.active()).toBe(true);
  });

  it('a pinned node (fx/fy/fz) does not move', () => {
    const sim = force()
      .nodes([
        { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0 },
        { x: 1, y: 0, z: 0 },
      ])
      .force('charge', force.charge(-30));
    sim.tick();
    const [pinned] = sim.nodes();
    expect(pinned.x).toBe(0);
    expect(pinned.y).toBe(0);
    expect(pinned.z).toBe(0);
  });

  it('runs to auto-pause within a bounded number of ticks and stays finite', () => {
    const sim = force()
      .nodes([
        { x: -1, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ])
      .force('charge', force.charge(-30))
      .force('center', force.center());
    let ticks = 0;
    while (sim.active() && ticks < 1000) {
      sim.tick();
      ticks++;
    }
    expect(ticks).toBeLessThan(1000);
    for (const node of sim.nodes()) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(Number.isFinite(node.z)).toBe(true);
    }
  });
});

describe('force static factories', () => {
  it('exposes .link/.charge/.center/.collide/.radial', () => {
    expect(typeof force.link).toBe('function');
    expect(typeof force.charge).toBe('function');
    expect(typeof force.center).toBe('function');
    expect(typeof force.collide).toBe('function');
    expect(typeof force.radial).toBe('function');
  });
});
