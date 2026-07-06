import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SurfaceChart } from '../../src/chart/SurfaceChart.js';

/**
 * Integration coverage for SurfaceChart (Prompt 135): a full render ->
 * update -> destroy lifecycle against a real THREE.Scene, exercising a
 * function-sourced heightfield together with a multi-level contour overlay.
 */
describe('SurfaceChart / integration', () => {
  it('renders a heightfield with a multi-level contour overlay, updates, and destroys cleanly', () => {
    const scene = new THREE.Scene();
    const chart = new SurfaceChart(scene)
      .values((x, z) => Math.sin(x) * Math.cos(z))
      .xDomain([-3, 3])
      .zDomain([-3, 3])
      .resolution(24)
      .contours([-0.5, 0, 0.5]);

    chart.render();
    const mesh = scene.children.find((c) => !c.isLine2);
    expect(mesh).toBeDefined();
    expect(mesh.geometry.getAttribute('position').count).toBe(25 * 25);
    expect(scene.children.filter((c) => c.isLine2).length).toBeGreaterThan(0);

    chart.resolution(12);
    chart.update();
    const meshAfter = scene.children.find((c) => !c.isLine2);
    expect(meshAfter.geometry.getAttribute('position').count).toBe(13 * 13);

    chart.destroy();
    expect(scene.children.length).toBe(0);
    expect(() => chart.render()).toThrow(/destroyed/);
  });
});
