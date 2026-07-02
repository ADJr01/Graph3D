import { describe, it, expect } from 'vitest';
import { forceCharge, forceLink, forceCenter, forceCollide, forceRadial } from '../../../../src/compose/layout/force/forces.js';

function applyAccel(force, nodes, alpha = 1) {
  for (const node of nodes) {
    node.__ax = 0;
    node.__ay = 0;
    node.__az = 0;
  }
  force(nodes, alpha);
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe('forceCharge', () => {
  it('a negative strength repels: two coincident-ish nodes accelerate apart', () => {
    const nodes = [
      { x: -1, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ];
    applyAccel(forceCharge(-30), nodes);
    expect(nodes[0].__ax).toBeLessThan(0); // pushed further toward -x
    expect(nodes[1].__ax).toBeGreaterThan(0); // pushed further toward +x
  });

  it('a positive strength attracts: two nodes accelerate toward each other', () => {
    const nodes = [
      { x: -1, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ];
    applyAccel(forceCharge(30), nodes);
    expect(nodes[0].__ax).toBeGreaterThan(0); // pulled toward +x, i.e. toward node 1
    expect(nodes[1].__ax).toBeLessThan(0); // pulled toward -x, i.e. toward node 0
  });

  it('distanceMax excludes far-away nodes from the interaction', () => {
    const nodes = [
      { x: 0, y: 0, z: 0 },
      { x: 1000, y: 0, z: 0 },
    ];
    applyAccel(forceCharge(-30, { distanceMax: 10 }), nodes);
    expect(nodes[0].__ax).toBe(0);
    expect(nodes[1].__ax).toBe(0);
  });
});

describe('forceLink', () => {
  it('pulls two nodes farther apart than the rest distance together', () => {
    const nodes = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ];
    const links = [{ source: 0, target: 1 }];
    applyAccel(forceLink(links, { distance: 2 }), nodes);
    expect(nodes[0].__ax).toBeGreaterThan(0); // pulled toward node 1
    expect(nodes[1].__ax).toBeLessThan(0); // pulled toward node 0
  });

  it('pushes two nodes closer than the rest distance apart', () => {
    const nodes = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ];
    const links = [{ source: 0, target: 1 }];
    applyAccel(forceLink(links, { distance: 10 }), nodes);
    expect(nodes[0].__ax).toBeLessThan(0); // pushed away from node 1
    expect(nodes[1].__ax).toBeGreaterThan(0); // pushed away from node 0
  });

  it('throws TypeError when a link references a node index outside nodes()', () => {
    const nodes = [{ x: 0, y: 0, z: 0 }];
    const links = [{ source: 0, target: 5 }];
    expect(() => applyAccel(forceLink(links, { distance: 2 }), nodes)).toThrow(TypeError);
  });

  it('resolves source/target by node-object reference as well as by index', () => {
    const nodes = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ];
    const links = [{ source: nodes[0], target: nodes[1] }];
    applyAccel(forceLink(links, { distance: 2 }), nodes);
    expect(nodes[0].__ax).toBeGreaterThan(0);
  });

  it('splits strength so a highly-connected node moves less per link than a lone pair', () => {
    // node 1 has two links (to 0 and 2); node 0 and node 2 have one each.
    const nodes = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 20, y: 0, z: 0 },
    ];
    const links = [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
    ];
    applyAccel(forceLink(links, { distance: 5 }), nodes);
    // node 1's default strength on each link is 1/2 (it has 2 links);
    // node 0's and node 2's is 1 (each has 1 link) — so node 1's net pull
    // from a single link is smaller than node 0's.
    expect(Math.abs(nodes[1].__ax)).toBeLessThan(Math.abs(nodes[0].__ax));
  });
});

describe('forceCenter', () => {
  it('shifts every node by the same vector toward the target centroid', () => {
    const nodes = [
      { x: 10, y: 0, z: 0 },
      { x: 20, y: 0, z: 0 },
    ];
    applyAccel(forceCenter(0, 0, 0), nodes);
    expect(nodes[0].__ax).toBeCloseTo(nodes[1].__ax, 10);
    expect(nodes[0].__ax).toBeLessThan(0); // centroid (15,0,0) is at +x of target (0,0,0)
  });

  it('is a no-op with zero nodes', () => {
    expect(() => applyAccel(forceCenter(), [])).not.toThrow();
  });
});

describe('forceCollide', () => {
  it('pushes two overlapping nodes apart', () => {
    const nodes = [
      { x: 0, y: 0, z: 0 },
      { x: 0.5, y: 0, z: 0 },
    ];
    applyAccel(forceCollide(1), nodes);
    expect(nodes[0].__ax).toBeLessThan(0);
    expect(nodes[1].__ax).toBeGreaterThan(0);
  });

  it('leaves non-overlapping nodes untouched', () => {
    const nodes = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ];
    applyAccel(forceCollide(1), nodes);
    expect(nodes[0].__ax).toBe(0);
    expect(nodes[1].__ax).toBe(0);
  });

  it('accepts a per-node radius function', () => {
    const nodes = [
      { x: 0, y: 0, z: 0, r: 5 },
      { x: 1, y: 0, z: 0, r: 5 },
    ];
    applyAccel(forceCollide((d) => d.r), nodes);
    expect(nodes[0].__ax).toBeLessThan(0);
  });
});

describe('forceRadial', () => {
  it('pulls a node outward when it is closer than the target radius', () => {
    const nodes = [{ x: 1, y: 0, z: 0 }];
    applyAccel(forceRadial(5), nodes);
    expect(nodes[0].__ax).toBeGreaterThan(0);
  });

  it('pushes a node inward when it is farther than the target radius', () => {
    const nodes = [{ x: 10, y: 0, z: 0 }];
    applyAccel(forceRadial(5), nodes);
    expect(nodes[0].__ax).toBeLessThan(0);
  });

  it('respects a custom center', () => {
    const nodes = [{ x: 15, y: 0, z: 0 }];
    applyAccel(forceRadial(1, 10, 0, 0), nodes);
    expect(nodes[0].__ax).toBeLessThan(0); // farther than radius 1 from (10,0,0), pulled back in
  });
});

describe('force integration smoke test', () => {
  it('a linked pair under charge repulsion settles near the link distance', () => {
    const nodes = [
      { x: -0.1, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
      { x: 0.1, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
    ];
    const link = forceLink([{ source: 0, target: 1 }], { distance: 5, strength: 0.3 });
    const charge = forceCharge(-20);
    for (let i = 0; i < 200; i++) {
      applyAccel((n, a) => {
        link(n, a);
        charge(n, a);
      }, nodes, 1);
      for (const node of nodes) {
        node.vx = (node.vx + node.__ax) * 0.6;
        node.x += node.vx;
      }
    }
    // Smoke test only: checks the pair settles into a stable, bounded
    // separation near the link's rest distance rather than exploding or
    // collapsing — not an exact equilibrium (charge + link balance depends
    // on both strengths).
    expect(dist(nodes[0], nodes[1])).toBeGreaterThan(2);
    expect(dist(nodes[0], nodes[1])).toBeLessThan(10);
    expect(Number.isFinite(nodes[0].x)).toBe(true);
  });
});
