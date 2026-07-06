import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ScatterChart } from '../../src/chart/ScatterChart.js';
import { scale } from '../../src/compose/index.js';
import { INSTANCING_THRESHOLD } from '../../src/object/GraphObjectFactory.js';

/**
 * Integration coverage for ScatterChart (Prompt 134): a full render -> update
 * -> destroy lifecycle against a real THREE.Scene, exercising scaled axes,
 * size/color/opacity together, and octree-backed picking on the instanced
 * (>INSTANCING_THRESHOLD) backend.
 */
describe('ScatterChart / integration', () => {
  it('renders, updates, and destroys cleanly on the meshes backend', () => {
    const scene = new THREE.Scene();
    const x = scale.linear().domain([0, 10]).range([-6, 6]);
    const y = scale.linear().domain([0, 10]).range([0, 6]);

    const chart = new ScatterChart(scene)
      .x((d) => d.x, x)
      .y((d) => d.y, y)
      .size((d) => d.size)
      .color((d) => d.value)
      .opacity(0.9);

    chart.data([
      { x: 1, y: 2, size: 0.5, value: 10 },
      { x: 3, y: 4, size: 1, value: 90 },
    ]);
    chart.render();
    expect(scene.children.length).toBe(2);
    expect(scene.children[0].material.opacity).toBeCloseTo(0.9);

    chart.data([
      { x: 5, y: 6, size: 2, value: 50 },
      { x: 7, y: 8, size: 1.5, value: 20 },
    ]);
    chart.update();
    expect(chart.data()).toEqual([
      { x: 5, y: 6, size: 2, value: 50 },
      { x: 7, y: 8, size: 1.5, value: 20 },
    ]);

    chart.destroy();
    expect(scene.children.length).toBe(0);
    expect(() => chart.render()).toThrow(/destroyed/);
  });

  it('renders 60 points (>INSTANCING_THRESHOLD) on the instanced backend with working octree picking', () => {
    const scene = new THREE.Scene();
    const rows = Array.from({ length: INSTANCING_THRESHOLD + 10 }, (_, i) => ({ x: i * 2, y: 0, z: 0 }));

    const chart = new ScatterChart(scene)
      .x((d) => d.x)
      .y((d) => d.y)
      .z((d) => d.z);
    chart.data(rows);
    chart.render();

    expect(scene.children.length).toBe(1);
    expect(scene.children[0]).toBeInstanceOf(THREE.InstancedMesh);

    const hitRay = new THREE.Raycaster(new THREE.Vector3(10, 0, 5), new THREE.Vector3(0, 0, -1));
    expect(chart.pick(hitRay)).toEqual({ x: 10, y: 0, z: 0 });

    chart.destroy();
    expect(scene.children.length).toBe(0);
  });
});
