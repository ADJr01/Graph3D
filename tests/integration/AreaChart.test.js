import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { AreaChart } from '../../src/chart/AreaChart.js';
import { scale } from '../../src/compose/index.js';

/**
 * Integration coverage for AreaChart (Prompt 135): a full render -> update
 * -> destroy lifecycle against a real THREE.Scene, exercising scaled axes,
 * a configured baseline/curve, and mesh replacement on point-count change.
 */
describe('AreaChart / integration', () => {
  it('renders, updates, and destroys cleanly with scaled axes and a configured baseline', () => {
    const scene = new THREE.Scene();
    const x = scale.linear().domain([0, 1]).range([-6, 6]);
    const y = scale.linear().domain([0, 1]).range([0, 6]);

    const chart = new AreaChart(scene)
      .x((d) => d.t, x)
      .y((d) => d.value, y)
      .baseline(0)
      .curve('catmullRom');

    chart.data([
      { t: 0, value: 0.2 },
      { t: 0.5, value: 0.8 },
      { t: 1, value: 0.4 },
    ]);
    chart.render();
    expect(scene.children.length).toBe(1);
    expect(scene.children[0].geometry.getAttribute('position').count).toBeGreaterThan(6);

    chart.data([
      { t: 0, value: 0.1 },
      { t: 1, value: 0.9 },
    ]);
    chart.update();
    expect(scene.children.length).toBe(1);
    expect(chart.data()).toEqual([
      { t: 0, value: 0.1 },
      { t: 1, value: 0.9 },
    ]);

    chart.destroy();
    expect(scene.children.length).toBe(0);
    expect(() => chart.render()).toThrow(/destroyed/);
  });
});
