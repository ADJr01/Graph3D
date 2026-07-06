import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PackChart } from '../../src/chart/PackChart.js';
import { INSTANCING_THRESHOLD } from '../../src/object/GraphObjectFactory.js';

/**
 * Integration coverage for PackChart (Prompt 138): a full render -> update ->
 * destroy lifecycle against a real THREE.Scene, exercising both the meshes
 * and instanced node backends, `.padding()`, and non-overlap of packed
 * sibling spheres.
 */
describe('PackChart / integration', () => {
  it('renders, updates, and destroys cleanly on the meshes backend, with non-overlapping sibling spheres', () => {
    const scene = new THREE.Scene();
    const root = {
      name: 'root',
      children: [
        { name: 'a', value: 3 },
        { name: 'b', value: 5 },
        { name: 'c', value: 8 },
      ],
    };

    const chart = new PackChart(scene).padding(0.05);
    chart.data(root);
    chart.render();

    expect(scene.children.filter((c) => !c.isLine2)).toHaveLength(4); // root + 3 children
    expect(scene.children.filter((c) => c.isLine2)).toHaveLength(0);

    const childMeshes = scene.children.filter((c) => c.userData.graph3d.datum.depth === 1);
    for (let i = 0; i < childMeshes.length; i++) {
      for (let j = i + 1; j < childMeshes.length; j++) {
        const a = childMeshes[i];
        const b = childMeshes[j];
        const distance = a.position.distanceTo(b.position);
        const combinedRadius = a.userData.graph3d.datum.r + b.userData.graph3d.datum.r;
        expect(distance).toBeGreaterThanOrEqual(combinedRadius - 1e-6);
      }
    }

    chart.data({ ...root, children: [...root.children, { name: 'd', value: 2 }] });
    chart.update();
    expect(scene.children.filter((c) => !c.isLine2)).toHaveLength(5);

    chart.destroy();
    expect(scene.children.length).toBe(0);
    expect(() => chart.render()).toThrow(/destroyed/);
  });

  it('renders a wide pack (>INSTANCING_THRESHOLD nodes) as one GraphInstancedObject', () => {
    const scene = new THREE.Scene();
    const root = {
      name: 'root',
      children: Array.from({ length: INSTANCING_THRESHOLD + 10 }, (_, i) => ({ name: `leaf-${i}`, value: 1 })),
    };

    const chart = new PackChart(scene);
    chart.data(root);
    chart.render();

    const nodeObjects = scene.children;
    expect(nodeObjects).toHaveLength(1);
    expect(nodeObjects[0]).toBeInstanceOf(THREE.InstancedMesh);
    expect(nodeObjects[0].count).toBe(INSTANCING_THRESHOLD + 11); // root + every leaf

    chart.destroy();
    expect(scene.children.length).toBe(0);
  });

  it('a custom value() accessor changes relative sphere sizes', () => {
    const scene = new THREE.Scene();
    const root = { children: [{ name: 'small', weight: 1 }, { name: 'large', weight: 27 }] };

    const chart = new PackChart(scene).value((d) => d.weight);
    chart.data(root);
    chart.render();

    const meshes = scene.children.filter((c) => c.userData.graph3d.datum.depth === 1);
    const small = meshes.find((m) => m.userData.graph3d.datum.data.name === 'small');
    const large = meshes.find((m) => m.userData.graph3d.datum.data.name === 'large');
    // radius ∝ ∛value, so the large sphere (27x the value) should be ~3x the radius.
    expect(large.scale.x / small.scale.x).toBeCloseTo(3, 1);

    chart.destroy();
  });
});
