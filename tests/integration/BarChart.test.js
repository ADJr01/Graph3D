import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BarChart } from '../../src/chart/BarChart.js';
import { scale } from '../../src/compose/index.js';

/**
 * Integration coverage for BarChart (Prompt 132): a full render -> update ->
 * destroy lifecycle against a real THREE.Scene, exercising both the meshes
 * backend (small datasets) and the instanced backend (>INSTANCING_THRESHOLD
 * datums) with grouped series and a configured scale.
 */
describe('BarChart / integration', () => {
  it('renders, updates, and destroys cleanly on the meshes backend', () => {
    const scene = new THREE.Scene();
    const categories = ['a', 'b', 'c'];
    const x = scale.band().domain(categories).range([-6, 6]);
    const y = scale.linear().domain([0, 100]).range([0, 6]);

    const chart = new BarChart(scene)
      .x((d) => d.category, x)
      .y((d) => d.value, y)
      .color((d) => d.value);

    chart.data([
      { category: 'a', value: 10 },
      { category: 'b', value: 90 },
      { category: 'c', value: 50 },
    ]);
    chart.render();
    expect(scene.children.length).toBe(3);

    chart.data([
      { category: 'a', value: 20 },
      { category: 'b', value: 40 },
    ]);
    chart.update();
    expect(chart.data()).toEqual([
      { category: 'a', value: 20 },
      { category: 'b', value: 40 },
    ]);

    chart.destroy();
    expect(scene.children.length).toBe(0);
    expect(() => chart.render()).toThrow(/destroyed/);
  });

  it('renders 60 grouped datums (>INSTANCING_THRESHOLD) on the instanced backend', () => {
    const scene = new THREE.Scene();
    const rows = Array.from({ length: 60 }, (_, i) => ({
      cat: i % 10,
      series: i % 2 === 0 ? 'a' : 'b',
      value: i,
    }));

    const chart = new BarChart(scene)
      .x((d) => d.cat)
      .y((d) => d.value)
      .grouped((d) => d.series);
    chart.data(rows);
    chart.render();

    expect(scene.children.length).toBe(1);
    expect(scene.children[0]).toBeInstanceOf(THREE.InstancedMesh);

    chart.destroy();
    expect(scene.children.length).toBe(0);
  });
});
