import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GraphChart } from '../../src/chart/GraphChart.js';
import { generator } from '../../src/compose/index.js';

/**
 * Integration disposal tests for GraphChart (Prompt 131).
 *
 * Verifies the disposal contract: every geometry/material a chart's render()
 * created must have its .dispose() called when the chart is destroyed, and
 * no scene child should survive 1000 create/render/destroy cycles, for both
 * the meshes backend (small datasets) and the instanced backend (large ones).
 */
describe('GraphChart / disposal contract', () => {
  it('1000 create/render/destroy cycles (meshes backend) leave no scene children', () => {
    const scene = new THREE.Scene();
    for (let i = 0; i < 1000; i++) {
      const chart = new GraphChart(scene, generator.bar());
      chart.data([1, 2, 3]);
      chart.render();
      chart.destroy();
    }
    expect(scene.children.length).toBe(0);
  });

  it('1000 create/render/destroy cycles (instanced backend) leave no scene children', () => {
    const scene = new THREE.Scene();
    const rows = Array.from({ length: 60 }, (_, i) => i);
    for (let i = 0; i < 1000; i++) {
      const chart = new GraphChart(scene, generator.bar());
      chart.data(rows);
      chart.render();
      chart.destroy();
    }
    expect(scene.children.length).toBe(0);
  });
});
