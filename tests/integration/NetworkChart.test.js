import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { NetworkChart } from '../../src/chart/NetworkChart.js';
import { INSTANCING_THRESHOLD } from '../../src/object/GraphObjectFactory.js';

/**
 * Integration coverage for NetworkChart (Prompt 137): a full render -> tick
 * -> update -> destroy lifecycle against a real THREE.Scene, exercising both
 * the meshes and instanced node backends, `.pin()`, and `.cluster()`.
 */
describe('NetworkChart / integration', () => {
  it('renders, ticks toward stability, updates, and destroys cleanly on the meshes backend', () => {
    const scene = new THREE.Scene();
    const nodes = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    const links = [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
    ];

    const chart = new NetworkChart(scene).data(nodes).links(links).linkDistance(3);
    chart.render();
    expect(scene.children.filter((c) => !c.isLine2)).toHaveLength(5);
    expect(scene.children.filter((c) => c.isLine2)).toHaveLength(4);

    let ticks = 0;
    while (chart.tick() && ticks < 2000) ticks++;
    expect(ticks).toBeLessThan(2000);
    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(Number.isFinite(node.z)).toBe(true);
    }

    chart.pin(nodes[0], { x: 0, y: 0, z: 0 });
    expect(chart.tick()).toBe(true); // pinning wakes the auto-paused simulation

    chart.data([...nodes, { id: 5 }]).links([...links, { source: 4, target: 5 }]);
    chart.update();
    expect(scene.children.filter((c) => !c.isLine2)).toHaveLength(6);
    expect(scene.children.filter((c) => c.isLine2)).toHaveLength(5);

    chart.destroy();
    expect(scene.children.length).toBe(0);
    expect(() => chart.render()).toThrow(/destroyed/);
  });

  it('renders 60 nodes (>INSTANCING_THRESHOLD) as one GraphInstancedObject and clusters by group', () => {
    const scene = new THREE.Scene();
    const nodes = Array.from({ length: INSTANCING_THRESHOLD + 10 }, (_, i) => ({ id: i, group: i % 2 === 0 ? 'a' : 'b' }));

    const chart = new NetworkChart(scene).data(nodes).cluster((d) => d.group);
    chart.render();

    const nodeObjects = scene.children.filter((c) => !c.isLine2);
    expect(nodeObjects).toHaveLength(1);
    expect(nodeObjects[0]).toBeInstanceOf(THREE.InstancedMesh);

    let ticks = 0;
    while (chart.tick() && ticks < 2000) ticks++;

    const groupA = nodes.filter((d) => d.group === 'a');
    const groupB = nodes.filter((d) => d.group === 'b');
    const centroidX = (group) => group.reduce((sum, d) => sum + d.x, 0) / group.length;
    // Clustering pulls each group toward its own centroid, away from the
    // other group's — the two centroids should end up well separated.
    expect(Math.abs(centroidX(groupA) - centroidX(groupB))).toBeGreaterThan(0.5);

    chart.destroy();
    expect(scene.children.length).toBe(0);
  });
});
