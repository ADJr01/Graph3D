import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SurfaceChart } from '../../src/chart/SurfaceChart.js';

function makeScene() {
  return new THREE.Scene();
}

describe('SurfaceChart', () => {
  describe('constructor', () => {
    it('throws if scene is falsy (inherited from GraphChart)', () => {
      expect(() => new SurfaceChart(null)).toThrow(TypeError);
    });
  });

  describe('.values()/.xDomain()/.zDomain()/.resolution() passthroughs', () => {
    it('getters/setters pass straight through to generator.surface()', () => {
      const chart = new SurfaceChart(makeScene());
      const fn = (x, z) => x + z;
      chart.values(fn);
      expect(chart.values()).toBe(fn);

      chart.xDomain([-3, 3]);
      expect(chart.xDomain()).toEqual([-3, 3]);

      chart.zDomain([-2, 2]);
      expect(chart.zDomain()).toEqual([-2, 2]);

      chart.resolution(8);
      expect(chart.resolution()).toBe(8);
    });

    it('throws for an invalid xDomain/zDomain/resolution (delegated to the generator)', () => {
      const chart = new SurfaceChart(makeScene());
      expect(() => chart.xDomain([1])).toThrow(TypeError);
      expect(() => chart.zDomain('nope')).toThrow(TypeError);
      expect(() => chart.resolution(0)).toThrow(TypeError);
    });
  });

  describe('render() — heightfield mesh', () => {
    it('renders one triangulated mesh from a values[][] grid', () => {
      const scene = makeScene();
      const chart = new SurfaceChart(scene).values([
        [0, 1],
        [1, 2],
      ]);
      chart.render();

      expect(scene.children.length).toBe(1);
      const mesh = scene.children[0];
      expect(mesh.geometry.getAttribute('position').count).toBe(4);
      expect(mesh.geometry.getIndex().count).toBe(6);
    });

    it('renders from a function source over xDomain/zDomain/resolution', () => {
      const scene = makeScene();
      const chart = new SurfaceChart(scene)
        .values((x, z) => x + z)
        .xDomain([0, 1])
        .zDomain([0, 1])
        .resolution(4);
      chart.render();

      expect(scene.children.length).toBe(1);
      expect(scene.children[0].geometry.getAttribute('position').count).toBe(5 * 5);
    });

    it('throws calling render() before .values() is set', () => {
      const chart = new SurfaceChart(makeScene());
      expect(() => chart.render()).toThrow(TypeError);
    });

    it('throws calling update() before render()', () => {
      const chart = new SurfaceChart(makeScene()).values([[0, 1], [1, 2]]);
      expect(() => chart.update()).toThrow(/call render\(\) first/);
    });
  });

  describe('.contours(levels)', () => {
    it('getter/setter validates and stores levels', () => {
      const chart = new SurfaceChart(makeScene());
      expect(chart.contours()).toBeNull();
      chart.contours([0, 5]);
      expect(chart.contours()).toEqual([0, 5]);
    });

    it('throws for invalid levels', () => {
      const chart = new SurfaceChart(makeScene());
      expect(() => chart.contours('nope')).toThrow(TypeError);
      expect(() => chart.contours([NaN])).toThrow(TypeError);
    });

    it('renders one GraphLine per traced contour path, alongside the surface mesh', () => {
      const scene = makeScene();
      const chart = new SurfaceChart(scene)
        .values([
          [0, 10],
          [10, 20],
        ])
        .contours([5]);
      chart.render();

      // 1 surface mesh + at least 1 contour line.
      expect(scene.children.length).toBeGreaterThanOrEqual(2);
      const lines = scene.children.filter((c) => c.isLine2);
      expect(lines.length).toBeGreaterThanOrEqual(1);
    });

    it('renders no contour lines when never configured', () => {
      const scene = makeScene();
      const chart = new SurfaceChart(scene).values([[0, 1], [1, 2]]);
      chart.render();
      expect(scene.children.filter((c) => c.isLine2)).toHaveLength(0);
    });
  });

  describe('update() — replaces mesh and contour lines', () => {
    it('disposes old mesh/lines and builds fresh ones', () => {
      const scene = makeScene();
      const chart = new SurfaceChart(scene)
        .values([
          [0, 10],
          [10, 20],
        ])
        .contours([5]);
      chart.render();
      const meshBefore = scene.children.find((c) => !c.isLine2);
      const lineCountBefore = scene.children.filter((c) => c.isLine2).length;

      chart.contours(null);
      chart.update();

      expect(scene.children.filter((c) => c.isLine2)).toHaveLength(0);
      expect(scene.children.find((c) => !c.isLine2)).not.toBe(meshBefore);
      expect(lineCountBefore).toBeGreaterThan(0);
    });
  });

  describe('destroy()', () => {
    it('disposes the mesh and contour lines, and is idempotent', () => {
      const scene = makeScene();
      const chart = new SurfaceChart(scene)
        .values([
          [0, 10],
          [10, 20],
        ])
        .contours([5]);
      chart.render();
      expect(scene.children.length).toBeGreaterThan(0);

      chart.destroy();
      expect(scene.children.length).toBe(0);
      expect(() => chart.destroy()).not.toThrow();
    });

    it('throws calling public methods after destroy()', () => {
      const chart = new SurfaceChart(makeScene()).values([[0, 1], [1, 2]]);
      chart.render();
      chart.destroy();

      expect(() => chart.render()).toThrow(/destroyed/);
      expect(() => chart.update()).toThrow(/destroyed/);
      expect(() => chart.values([[0, 1]])).toThrow(/destroyed/);
      expect(() => chart.contours([1])).toThrow(/destroyed/);
    });
  });
});
