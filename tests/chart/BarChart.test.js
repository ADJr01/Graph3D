import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BarChart } from '../../src/chart/BarChart.js';
import { color, palette } from '../../src/compose/index.js';

function makeScene() {
  return new THREE.Scene();
}

describe('BarChart', () => {
  describe('constructor defaults', () => {
    it('defaults material to standard and transition to 800ms/linear', () => {
      const chart = new BarChart(makeScene());
      expect(chart.material()).toEqual({ presetName: 'standard', options: {} });
      expect(chart.transition()).toEqual({ durationMs: 800, easing: 'linear' });
    });

    it('throws if scene is falsy (inherited from GraphChart)', () => {
      expect(() => new BarChart(null)).toThrow(TypeError);
    });
  });

  describe('render() — plain (no grouping/stacking/orientation)', () => {
    it('positions/scales bars per generator.bar() defaults (index x, identity y, baseline 0)', () => {
      const scene = makeScene();
      const chart = new BarChart(scene);
      chart.data([3, 5, 2]);
      chart.render();

      expect(scene.children.length).toBe(3);
      expect(scene.children[0].position.x).toBeCloseTo(0);
      expect(scene.children[0].position.y).toBeCloseTo(1.5);
      expect(scene.children[0].scale.y).toBeCloseTo(3);
      expect(scene.children[1].position.x).toBeCloseTo(1);
      expect(scene.children[1].position.y).toBeCloseTo(2.5);
      expect(scene.children[2].scale.y).toBeCloseTo(2);
    });
  });

  describe('.horizontal()/.vertical()', () => {
    it('horizontal() swaps x/y of both position and scale', () => {
      const scene = makeScene();
      const chart = new BarChart(scene).horizontal();
      chart.data([3, 5, 2]);
      chart.render();

      expect(scene.children[0].position.x).toBeCloseTo(1.5);
      expect(scene.children[0].position.y).toBeCloseTo(0);
      expect(scene.children[0].scale.x).toBeCloseTo(3);
      expect(scene.children[0].scale.y).toBeCloseTo(0.8);
    });

    it('vertical() is the default and can restore it after horizontal()', () => {
      const scene = makeScene();
      const chart = new BarChart(scene).horizontal().vertical();
      chart.data([3, 5, 2]);
      chart.render();

      expect(scene.children[0].position.x).toBeCloseTo(0);
      expect(scene.children[0].position.y).toBeCloseTo(1.5);
    });
  });

  describe('.grouped(keyFn)', () => {
    const rows = [
      { cat: 0, series: 'a', value: 10 },
      { cat: 0, series: 'b', value: 20 },
      { cat: 1, series: 'a', value: 5 },
      { cat: 1, series: 'b', value: 15 },
    ];

    it('narrows and offsets bars along x so same-category series sit side-by-side', () => {
      const scene = makeScene();
      const chart = new BarChart(scene)
        .x((d) => d.cat)
        .y((d) => d.value)
        .grouped((d) => d.series);
      chart.data(rows);
      chart.render();

      expect(scene.children[0].position.x).toBeCloseTo(-0.2);
      expect(scene.children[0].scale.x).toBeCloseTo(0.4);
      expect(scene.children[1].position.x).toBeCloseTo(0.2);
      expect(scene.children[1].scale.x).toBeCloseTo(0.4);
      expect(scene.children[2].position.x).toBeCloseTo(0.8);
      expect(scene.children[3].position.x).toBeCloseTo(1.2);
    });

    it('depthSeries() offsets along z instead of x', () => {
      const scene = makeScene();
      const chart = new BarChart(scene)
        .x((d) => d.cat)
        .y((d) => d.value)
        .grouped((d) => d.series)
        .depthSeries();
      chart.data(rows);
      chart.render();

      expect(scene.children[0].position.x).toBeCloseTo(0);
      expect(scene.children[0].position.z).toBeCloseTo(-0.2);
      expect(scene.children[0].scale.z).toBeCloseTo(0.4);
      expect(scene.children[1].position.z).toBeCloseTo(0.2);
    });

    it('is a no-op for a single series', () => {
      const scene = makeScene();
      const chart = new BarChart(scene).grouped(() => 'only');
      chart.data([3, 5]);
      chart.render();
      expect(scene.children[0].scale.x).toBeCloseTo(0.8);
    });

    it('throws if keyFn is not a function', () => {
      const chart = new BarChart(makeScene());
      expect(() => chart.grouped(null)).toThrow(TypeError);
    });
  });

  describe('.stacked(keyFn)', () => {
    const rows = [
      { cat: 0, series: 'a', value: 10 },
      { cat: 0, series: 'b', value: 20 },
      { cat: 1, series: 'a', value: 5 },
      { cat: 1, series: 'b', value: 15 },
    ];

    it('stacks same-category series into cumulative [y0, y1] bands', () => {
      const scene = makeScene();
      const chart = new BarChart(scene)
        .x((d) => d.cat)
        .y((d) => d.value)
        .stacked((d) => d.series);
      chart.data(rows);
      chart.render();

      expect(scene.children[0].position.y).toBeCloseTo(5); // cat0/a: [0,10]
      expect(scene.children[0].scale.y).toBeCloseTo(10);
      expect(scene.children[1].position.y).toBeCloseTo(20); // cat0/b: [10,30]
      expect(scene.children[1].scale.y).toBeCloseTo(20);
      expect(scene.children[2].position.y).toBeCloseTo(2.5); // cat1/a: [0,5]
      expect(scene.children[3].position.y).toBeCloseTo(12.5); // cat1/b: [5,20]
      expect(scene.children[3].scale.y).toBeCloseTo(15);
    });

    it('throws if keyFn is not a function', () => {
      const chart = new BarChart(makeScene());
      expect(() => chart.stacked('nope')).toThrow(TypeError);
    });
  });

  describe('.color(fn) — palette.viridis default', () => {
    it('colors bars via palette.viridis when no palette is given', () => {
      const scene = makeScene();
      const chart = new BarChart(scene).color((d) => d);
      chart.data([0, 50, 100]);
      chart.render();

      const expectedScale = color.sequential(palette.viridis, [0, 100]);
      expect(scene.children[0].material.color.getHexString()).toBe(new THREE.Color(expectedScale(0)).getHexString());
      expect(scene.children[2].material.color.getHexString()).toBe(new THREE.Color(expectedScale(100)).getHexString());
    });

    it('honors an explicit palette override', () => {
      const scene = makeScene();
      const chart = new BarChart(scene).color((d) => d, palette.magma);
      chart.data([0, 100]);
      chart.render();

      const expectedScale = color.sequential(palette.magma, [0, 100]);
      expect(scene.children[0].material.color.getHexString()).toBe(new THREE.Color(expectedScale(0)).getHexString());
      expect(scene.children[0].material.color.getHexString()).not.toBe(
        new THREE.Color(color.sequential(palette.viridis, [0, 100])(0)).getHexString(),
      );
    });

    it('leaves the material color untouched when .color() is never called', () => {
      const scene = makeScene();
      const chart = new BarChart(scene);
      chart.data([1, 2, 3]);
      chart.render();
      expect(scene.children[0].material.color.getHexString()).toBe(scene.children[1].material.color.getHexString());
    });

    it('re-applies color on update() as data changes', () => {
      const scene = makeScene();
      const chart = new BarChart(scene).color((d) => d);
      chart.data([0, 100]);
      chart.render();
      chart.data([0, 200]);
      chart.update();

      const expectedScale = color.sequential(palette.viridis, [0, 200]);
      expect(scene.children[1].material.color.getHexString()).toBe(new THREE.Color(expectedScale(200)).getHexString());
    });
  });

  describe('.opacity(fn)/.visible(fn)/.size(fn) (Prompt 141)', () => {
    it('writes per-datum opacity via applyOpacityField', () => {
      const scene = makeScene();
      const chart = new BarChart(scene).opacity((d) => d / 100);
      chart.data([0, 50, 100]);
      chart.render();

      expect(scene.children[0].material.opacity).toBeCloseTo(0);
      expect(scene.children[1].material.opacity).toBeCloseTo(0.5);
      expect(scene.children[2].material.opacity).toBeCloseTo(1);
    });

    it('writes per-datum visibility via applyVisibleField', () => {
      const scene = makeScene();
      const chart = new BarChart(scene).visible((d) => d > 0);
      chart.data([0, 5]);
      chart.render();

      expect(scene.children[0].visible).toBe(false);
      expect(scene.children[1].visible).toBe(true);
    });

    it('.size(fn) multiplies the footprint (x/z) only, leaving the value-encoding y scale untouched', () => {
      const scene = makeScene();
      const chart = new BarChart(scene).size(() => 2);
      chart.data([3, 5]);
      chart.render();

      expect(scene.children[0].scale.x).toBeCloseTo(1.6); // 0.8 (default bar width) * 2
      expect(scene.children[0].scale.z).toBeCloseTo(1.6);
      expect(scene.children[0].scale.y).toBeCloseTo(3); // untouched — still encodes the value
    });

    it('.size(fn) multiplies y/z (not x) when .horizontal() is active', () => {
      const scene = makeScene();
      const chart = new BarChart(scene).horizontal().size(() => 2);
      chart.data([3, 5]);
      chart.render();

      expect(scene.children[0].scale.x).toBeCloseTo(3); // untouched value axis
      expect(scene.children[0].scale.y).toBeCloseTo(1.6);
      expect(scene.children[0].scale.z).toBeCloseTo(1.6);
    });

    it('leaves opacity/visible/size untouched when never called', () => {
      const scene = makeScene();
      const chart = new BarChart(scene);
      chart.data([3, 5]);
      chart.render();

      expect(scene.children[0].material.opacity).toBe(1);
      expect(scene.children[0].visible).toBe(true);
      expect(scene.children[0].scale.x).toBeCloseTo(0.8);
    });
  });

  describe('.legend(options) (Prompt 143)', () => {
    it('renders into the configured container on render(), and stays synced on update()', () => {
      const scene = makeScene();
      const container = document.createElement('div');
      const chart = new BarChart(scene).color((d) => d).legend({ container });
      chart.data([1, 2, 3]);
      chart.render();

      expect(container.childNodes.length).toBe(1);

      chart.data([10, 20, 30]);
      chart.update();

      expect(container.textContent).toContain('10');
      expect(container.textContent).toContain('30');
    });
  });
});
