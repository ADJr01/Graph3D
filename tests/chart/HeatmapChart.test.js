import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HeatmapChart } from '../../src/chart/HeatmapChart.js';
import { color, palette } from '../../src/compose/index.js';

function makeScene() {
  return new THREE.Scene();
}

describe('HeatmapChart', () => {
  describe('constructor defaults', () => {
    it('throws if scene is falsy (inherited from GraphChart)', () => {
      expect(() => new HeatmapChart(null)).toThrow(TypeError);
    });

    it('defaults y to 0 so plane-mode tiles lie flat without configuration', () => {
      const scene = makeScene();
      const chart = new HeatmapChart(scene).x((d) => d.col).z((d) => d.row);
      chart.data([{ col: 0, row: 0 }]);
      chart.render();
      expect(scene.children[0].position.y).toBeCloseTo(0);
    });
  });

  describe('.mode(name)', () => {
    it('defaults to "plane"', () => {
      const chart = new HeatmapChart(makeScene());
      expect(chart.mode()).toBe('plane');
    });

    it('throws on an invalid mode', () => {
      const chart = new HeatmapChart(makeScene());
      expect(() => chart.mode('cube')).toThrow(TypeError);
    });

    it('"plane" mode renders thin tiles (y-scale much smaller than x/z)', () => {
      const scene = makeScene();
      const chart = new HeatmapChart(scene).x((d) => d.col).z((d) => d.row);
      chart.data([{ col: 0, row: 0 }]);
      chart.render();
      const mesh = scene.children[0];
      expect(mesh.scale.y).toBeLessThan(mesh.scale.x);
    });

    it('"voxel" mode renders full cubes (y-scale equals x/z)', () => {
      const scene = makeScene();
      const chart = new HeatmapChart(scene).mode('voxel').x((d) => d.x).y((d) => d.y).z((d) => d.z);
      chart.data([{ x: 0, y: 0, z: 0 }]);
      chart.render();
      const mesh = scene.children[0];
      expect(mesh.scale.y).toBeCloseTo(mesh.scale.x);
      expect(mesh.scale.y).toBeCloseTo(mesh.scale.z);
    });
  });

  describe('.color(fn) — palette.viridis default', () => {
    it('colors cells via palette.viridis when no palette is given', () => {
      const scene = makeScene();
      const chart = new HeatmapChart(scene).x((d) => d.col).z((d) => d.row).color((d) => d.value);
      chart.data([
        { col: 0, row: 0, value: 0 },
        { col: 1, row: 0, value: 100 },
      ]);
      chart.render();

      const expectedScale = color.sequential(palette.viridis, [0, 100]);
      expect(scene.children[0].material.color.getHexString()).toBe(new THREE.Color(expectedScale(0)).getHexString());
      expect(scene.children[1].material.color.getHexString()).toBe(new THREE.Color(expectedScale(100)).getHexString());
    });
  });

  describe('.opacity(valueOrFn) — inherited from GraphChart', () => {
    it('applies a per-datum opacity accessor, useful for voxel-mode density', () => {
      const scene = makeScene();
      const chart = new HeatmapChart(scene)
        .mode('voxel')
        .x((d) => d.x)
        .y((d) => d.y)
        .z((d) => d.z)
        .opacity((d) => d.density);
      chart.data([
        { x: 0, y: 0, z: 0, density: 0.2 },
        { x: 1, y: 0, z: 0, density: 0.9 },
      ]);
      chart.render();

      expect(scene.children[0].material.opacity).toBeCloseTo(0.2);
      expect(scene.children[1].material.opacity).toBeCloseTo(0.9);
    });

    it('leaves opacity untouched when never called', () => {
      const scene = makeScene();
      const chart = new HeatmapChart(scene).x((d) => d.col).z((d) => d.row);
      chart.data([{ col: 0, row: 0 }]);
      chart.render();
      expect(scene.children[0].material.opacity).toBe(1);
    });
  });

  describe('update()', () => {
    it('re-applies color/opacity and reflects new data', () => {
      const scene = makeScene();
      const chart = new HeatmapChart(scene).x((d) => d.col).z((d) => d.row).color((d) => d.value).opacity(0.5);
      chart.data([{ col: 0, row: 0, value: 1 }]);
      chart.render();

      chart.data([{ col: 0, row: 0, value: 2 }]);
      chart.update();
      expect(chart.data()).toEqual([{ col: 0, row: 0, value: 2 }]);
      expect(scene.children[0].material.opacity).toBeCloseTo(0.5);
    });
  });
});
