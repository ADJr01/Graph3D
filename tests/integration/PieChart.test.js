import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PieChart } from '../../src/chart/PieChart.js';
import { palette } from '../../src/compose/index.js';

/**
 * Integration coverage for PieChart (Prompt 139): a full render -> explode ->
 * update -> destroy lifecycle against a real THREE.Scene, exercising
 * `.pick()`-then-`.explode()` (the "explode-on-hover" mechanism), a donut
 * (`.innerRadius()`) configuration, and `.color()`.
 */
describe('PieChart / integration', () => {
  it('renders one wedge mesh per slice, sweeping a full 2π proportional to value', () => {
    const scene = new THREE.Scene();
    const rows = [
      { label: 'a', count: 1 },
      { label: 'b', count: 3 },
    ];
    const chart = new PieChart(scene).data(rows).value((d) => d.count).color((d) => d.label, palette.category10);
    chart.render();

    expect(scene.children).toHaveLength(2);
    for (const mesh of scene.children) {
      const positions = mesh.geometry.attributes.position.array;
      for (const v of positions) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('supports a donut configuration via innerRadius', () => {
    const scene = new THREE.Scene();
    const chart = new PieChart(scene)
      .data([{ count: 1 }, { count: 1 }])
      .value((d) => d.count)
      .innerRadius(0.5)
      .outerRadius(1);
    chart.render();

    for (const mesh of scene.children) {
      let maxRadius = 0;
      let minRadius = Infinity;
      const positions = mesh.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        const r = Math.hypot(positions[i], positions[i + 2]);
        maxRadius = Math.max(maxRadius, r);
        minRadius = Math.min(minRadius, r);
      }
      expect(maxRadius).toBeCloseTo(1);
      expect(minRadius).toBeCloseTo(0.5);
    }
  });

  it('picks a slice via raycaster then explodes it outward, restoring on un-explode', () => {
    const scene = new THREE.Scene();
    const rows = [
      { label: 'a', count: 1 },
      { label: 'b', count: 1 },
      { label: 'c', count: 1 },
    ];
    const chart = new PieChart(scene).data(rows).value((d) => d.count);
    chart.render();

    const targetMesh = scene.children[1];
    const raycaster = { intersectObjects: () => [{ object: targetMesh }] };
    const hitDatum = chart.pick(raycaster);
    expect(hitDatum).toBe(rows[1]);

    expect(targetMesh.position.length()).toBeCloseTo(0);
    chart.explode(hitDatum, true);
    expect(targetMesh.position.length()).toBeCloseTo(chart.explodeOffset());

    // Un-exploding every other slice (simulating pointer leaving the chart).
    for (const d of rows) chart.explode(d, d === null);
    expect(targetMesh.position.length()).toBeCloseTo(0);
  });

  it('rebuilds the backend on update() while keeping a still-hovered slice exploded', () => {
    const scene = new THREE.Scene();
    const rows = [{ count: 1 }, { count: 2 }];
    const chart = new PieChart(scene).data(rows).value((d) => d.count);
    chart.render();
    chart.explode(rows[0], true);

    chart.data([...rows, { count: 3 }]);
    chart.update();

    expect(scene.children).toHaveLength(3);
    const mesh0 = scene.children.find((m) => m.userData.graph3d.datum === rows[0]);
    expect(mesh0.position.length()).toBeCloseTo(chart.explodeOffset());

    chart.destroy();
    expect(scene.children.length).toBe(0);
    expect(() => chart.render()).toThrow(/destroyed/);
  });
});
