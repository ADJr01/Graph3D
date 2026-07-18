import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BarChart } from '../../src/chart/BarChart.js';
import { Axis } from '../../src/compose/axis/Axis.js';
import { scale } from '../../src/compose/index.js';

/**
 * Regression coverage for the band-scale coordinate mismatch (improvement.md
 * initiative (b)): a bar and its axis tick, driven off the same band scale
 * instance, must land at the same x position — the bar previously rendered
 * at the band's start edge while the axis rendered at its center.
 */
describe('BarChart / Axis alignment', () => {
  it('renders each bar at the same x position as its axis tick/label', () => {
    const scene = new THREE.Scene();
    const categories = ['a', 'b', 'c'];
    const x = scale.band().domain(categories).range([-6, 6]);
    const y = scale.linear().domain([0, 100]).range([0, 6]);

    const chart = new BarChart(scene).x((d) => d.category, x).y((d) => d.value, y);
    chart.data(categories.map((category, i) => ({ category, value: (i + 1) * 10 })));
    chart.render();

    const barMeshes = scene.children.filter((c) => c instanceof THREE.Mesh);
    expect(barMeshes.length).toBe(categories.length);

    const axis = new Axis().scale(x).orientation('x').render(scene, 'x');
    expect(axis.labels.length).toBe(categories.length);

    categories.forEach((category, i) => {
      expect(barMeshes[i].position.x).toBeCloseTo(x(category) + x.bandwidth() / 2);
      expect(barMeshes[i].position.x).toBeCloseTo(axis.labels[i].position.x);
    });
  });
});
