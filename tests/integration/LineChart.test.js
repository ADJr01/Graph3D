import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LineChart } from '../../src/chart/LineChart.js';
import { scale } from '../../src/compose/index.js';

/**
 * Integration coverage for LineChart (Prompt 133): a full render -> update ->
 * destroy lifecycle against a real THREE.Scene, exercising scaled axes,
 * multi-series splitting, curve interpolation, and resize wiring together.
 */
describe('LineChart / integration', () => {
  it('renders, updates, and destroys cleanly with scaled axes and multiple series', () => {
    const scene = new THREE.Scene();
    const x = scale.linear().domain([0, 1]).range([-6, 6]);
    const y = scale.linear().domain([0, 1]).range([0, 6]);

    const chart = new LineChart(scene)
      .x((d) => d.t, x)
      .y((d) => d.value, y)
      .series((d) => d.symbol)
      .curve('linear');

    chart.data([
      { t: 0, value: 10, symbol: 'A' },
      { t: 1, value: 20, symbol: 'A' },
      { t: 2, value: 30, symbol: 'A' },
      { t: 0, value: 5, symbol: 'B' },
      { t: 1, value: 15, symbol: 'B' },
      { t: 2, value: 25, symbol: 'B' },
    ]);
    chart.render();
    expect(scene.children.length).toBe(2);
    expect(scene.children.every((child) => child.isLine2)).toBe(true);

    chart.setResolution(1024, 768);
    for (const child of scene.children) {
      expect(child.material.resolution.x).toBe(1024);
    }

    // Drop series B and grow series A's point count on update().
    chart.data([
      { t: 0, value: 10, symbol: 'A' },
      { t: 1, value: 20, symbol: 'A' },
      { t: 2, value: 30, symbol: 'A' },
      { t: 3, value: 40, symbol: 'A' },
    ]);
    chart.update();
    expect(scene.children.length).toBe(1);
    expect(scene.children[0].geometry.attributes.instanceStart.count).toBe(3);

    chart.destroy();
    expect(scene.children.length).toBe(0);
    expect(() => chart.render()).toThrow(/destroyed/);
  });
});
