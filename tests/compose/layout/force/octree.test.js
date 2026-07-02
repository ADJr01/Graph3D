import { describe, it, expect } from 'vitest';
import { buildBarnesHutOctree } from '../../../../src/compose/layout/force/octree.js';

describe('buildBarnesHutOctree', () => {
  it('accumulates every other point\'s mass exactly once (theta near 0, no approximation)', () => {
    const points = [
      { x: 0, y: 0, z: 0, mass: 1 },
      { x: 1, y: 0, z: 0, mass: 2 },
      { x: 0, y: 1, z: 0, mass: 3 },
      { x: -5, y: -5, z: -5, mass: 4 },
    ];
    const tree = buildBarnesHutOctree(points);
    let totalMass = 0;
    tree.accumulate(0, points[0].x, points[0].y, points[0].z, 1e-9, (mass) => {
      totalMass += mass;
    });
    expect(totalMass).toBeCloseTo(2 + 3 + 4, 10);
  });

  it('excludes the point itself even when it is the sole occupant of a leaf', () => {
    const points = [
      { x: 0, y: 0, z: 0, mass: 1 },
      { x: 10, y: 0, z: 0, mass: 1 },
    ];
    const tree = buildBarnesHutOctree(points);
    const contributions = [];
    tree.accumulate(0, points[0].x, points[0].y, points[0].z, 1e-9, (mass, dx, dy, dz, distSq) => {
      contributions.push({ mass, dx, dy, dz, distSq });
    });
    expect(contributions).toHaveLength(1);
    expect(contributions[0].mass).toBe(1);
    expect(contributions[0].distSq).toBeCloseTo(100, 10);
  });

  it('approximates a distant, tightly-packed cluster as one aggregate mass when theta is large', () => {
    // Cluster sits entirely in the +x/+y/+z octant relative to the query
    // point, so it collapses into a single child of the root — the query
    // point's own octant (root's -x/-y/-z child) is a separate branch, so
    // approximating the cluster never needs to fold the query's own mass in.
    const farCluster = [
      { x: 100, y: 100, z: 100, mass: 1 },
      { x: 100.1, y: 100, z: 100, mass: 1 },
      { x: 100, y: 100.1, z: 100, mass: 1 },
    ];
    const points = [{ x: 0, y: 0, z: 0, mass: 1 }, ...farCluster];
    const tree = buildBarnesHutOctree(points);
    const contributions = [];
    tree.accumulate(0, points[0].x, points[0].y, points[0].z, 10, (mass, dx, dy, dz, distSq) => {
      contributions.push({ mass, dx, dy, dz, distSq });
    });
    expect(contributions).toHaveLength(1);
    expect(contributions[0].mass).toBe(3);
  });

  it('never folds the query point itself into a coarse aggregate, even at an extreme theta', () => {
    // The query point sits at an outlier corner of the bounding box while
    // the rest of the mass clusters at the opposite corner — a pathological
    // layout where the root's center-of-mass looks "far enough" from the
    // query point to satisfy even a very permissive theta. Without forcing
    // recursion into any node that geometrically contains the query point,
    // this would wrongly include the query's own mass in the root-level
    // aggregate.
    const points = [
      { x: 0, y: 0, z: 0, mass: 1 },
      { x: 100, y: 0, z: 0, mass: 1 },
      { x: 101, y: 0, z: 0, mass: 1 },
      { x: 100, y: 1, z: 0, mass: 1 },
    ];
    const tree = buildBarnesHutOctree(points);
    let totalMass = 0;
    tree.accumulate(0, points[0].x, points[0].y, points[0].z, 1000, (mass) => {
      totalMass += mass;
    });
    expect(totalMass).toBeCloseTo(3, 10);
  });

  it('handles a single point (no self-contribution)', () => {
    const tree = buildBarnesHutOctree([{ x: 0, y: 0, z: 0, mass: 5 }]);
    let calls = 0;
    tree.accumulate(0, 0, 0, 0, 0.9, () => {
      calls++;
    });
    expect(calls).toBe(0);
  });

  it('handles an empty points array', () => {
    const tree = buildBarnesHutOctree([]);
    expect(() => tree.accumulate(0, 0, 0, 0, 0.9, () => {})).not.toThrow();
  });

  it('handles coincident points beyond MAX_DEPTH without infinite recursion', () => {
    const points = Array.from({ length: 5 }, () => ({ x: 1, y: 1, z: 1, mass: 1 }));
    const tree = buildBarnesHutOctree(points);
    let totalMass = 0;
    tree.accumulate(0, 1, 1, 1, 1e-9, (mass) => {
      totalMass += mass;
    });
    expect(totalMass).toBeCloseTo(4, 10);
  });
});
