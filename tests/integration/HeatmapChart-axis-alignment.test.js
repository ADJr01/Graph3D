import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HeatmapChart } from '../../src/chart/HeatmapChart.js';
import { Axis } from '../../src/compose/axis/Axis.js';
import { scale } from '../../src/compose/index.js';

/**
 * Regression coverage for the band-scale coordinate mismatch (improvement.md
 * initiative (b)): a heatmap cell and its z-axis tick, driven off the same
 * band scale instance, must land at the same z position.
 */
describe('HeatmapChart / Axis alignment', () => {
  it('renders each cell at the same z position as its axis tick/label', () => {
    const scene = new THREE.Scene();
    const rows = ['x', 'y', 'z'];
    const x = scale.band().domain(['a']).range([-6, 6]);
    const z = scale.band().domain(rows).range([-6, 6]);

    const chart = new HeatmapChart(scene).x((d) => d.col, x).z((d) => d.row, z);
    chart.data(rows.map((row) => ({ col: 'a', row })));
    chart.render();

    const cellMeshes = scene.children.filter((c) => c instanceof THREE.Mesh);
    expect(cellMeshes.length).toBe(rows.length);

    const axis = new Axis().scale(z).orientation('z').render(scene, 'z');
    expect(axis.labels.length).toBe(rows.length);

    rows.forEach((row, i) => {
      expect(cellMeshes[i].position.z).toBeCloseTo(z(row) + z.bandwidth() / 2);
      expect(cellMeshes[i].position.z).toBeCloseTo(axis.labels[i].position.z);
    });
  });
});
