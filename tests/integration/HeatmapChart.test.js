import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HeatmapChart } from '../../src/chart/HeatmapChart.js';
import { scale } from '../../src/compose/index.js';
import { INSTANCING_THRESHOLD } from '../../src/object/GraphObjectFactory.js';

/**
 * Integration coverage for HeatmapChart (Prompt 136): a full render -> update
 * -> destroy lifecycle against a real THREE.Scene, exercising both the
 * 2D-plane and 3D-voxel modes, and the million-cell-target instanced backend.
 */
describe('HeatmapChart / integration', () => {
  it('renders, updates, and destroys cleanly on the meshes backend (plane mode)', () => {
    const scene = new THREE.Scene();
    const x = scale.band().domain(['a', 'b']).range([-6, 6]);
    const z = scale.band().domain(['x', 'y']).range([-6, 6]);

    const chart = new HeatmapChart(scene)
      .x((d) => d.col, x)
      .z((d) => d.row, z)
      .color((d) => d.value);

    chart.data([
      { col: 'a', row: 'x', value: 10 },
      { col: 'b', row: 'y', value: 90 },
    ]);
    chart.render();
    expect(scene.children.length).toBe(2);
    expect(scene.children[0].position.y).toBeCloseTo(0);

    chart.data([
      { col: 'a', row: 'x', value: 50 },
      { col: 'b', row: 'y', value: 20 },
    ]);
    chart.update();
    expect(chart.data()).toEqual([
      { col: 'a', row: 'x', value: 50 },
      { col: 'b', row: 'y', value: 20 },
    ]);

    chart.destroy();
    expect(scene.children.length).toBe(0);
    expect(() => chart.render()).toThrow(/destroyed/);
  });

  it('renders 60 cells (>INSTANCING_THRESHOLD) as one GraphInstancedObject in voxel mode', () => {
    const scene = new THREE.Scene();
    const rows = Array.from({ length: INSTANCING_THRESHOLD + 10 }, (_, i) => ({ x: i, y: 0, z: 0, density: i / 100 }));

    const chart = new HeatmapChart(scene)
      .mode('voxel')
      .x((d) => d.x)
      .y((d) => d.y)
      .z((d) => d.z)
      .color((d) => d.density)
      .opacity((d) => d.density);
    chart.data(rows);
    chart.render();

    expect(scene.children.length).toBe(1);
    expect(scene.children[0]).toBeInstanceOf(THREE.InstancedMesh);

    chart.destroy();
    expect(scene.children.length).toBe(0);
  });
});
