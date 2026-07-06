import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { AreaChart } from '../../src/chart/AreaChart.js';

function makeScene() {
  return new THREE.Scene();
}

/** Reads back a flat position/normal typed array as an array of [x,y,z] triples. */
function toTriples(array) {
  const out = [];
  for (let i = 0; i < array.length; i += 3) out.push([array[i], array[i + 1], array[i + 2]]);
  return out;
}

describe('AreaChart', () => {
  describe('constructor', () => {
    it('throws if scene is falsy (inherited from GraphChart)', () => {
      expect(() => new AreaChart(null)).toThrow(TypeError);
    });
  });

  describe('render() — single wall', () => {
    it('renders one triangulated mesh extruded from each value to baseline 0', () => {
      const scene = makeScene();
      const chart = new AreaChart(scene);
      chart.data([3, 7]);
      chart.render();

      expect(scene.children.length).toBe(1);
      const mesh = scene.children[0];
      const positions = toTriples(mesh.geometry.getAttribute('position').array);
      expect(positions).toEqual([
        [0, 3, 0],
        [0, 0, 0],
        [1, 7, 0],
        [1, 0, 0],
      ]);
    });

    it('throws calling render() before data()', () => {
      const chart = new AreaChart(makeScene());
      expect(() => chart.render()).toThrow(/call data\(arr\)/);
    });

    it('throws calling update() before render()', () => {
      const chart = new AreaChart(makeScene());
      chart.data([1, 2]);
      expect(() => chart.update()).toThrow(/call render\(\) first/);
    });
  });

  describe('.baseline(value)', () => {
    it('getter/setter passes through to generator.area().baseline()', () => {
      const chart = new AreaChart(makeScene());
      expect(chart.baseline()).toBe(0);
      chart.baseline(-5);
      expect(chart.baseline()).toBe(-5);
    });

    it('extrudes down to the configured baseline', () => {
      const scene = makeScene();
      const chart = new AreaChart(scene).baseline(-2);
      chart.data([3, 7]);
      chart.render();

      const positions = toTriples(scene.children[0].geometry.getAttribute('position').array);
      expect(positions[1]).toEqual([0, -2, 0]);
      expect(positions[3]).toEqual([1, -2, 0]);
    });

    it('throws for a non-finite baseline', () => {
      const chart = new AreaChart(makeScene());
      expect(() => chart.baseline(NaN)).toThrow(TypeError);
    });
  });

  describe('.curve(type)', () => {
    it('passes through to generator.area().curve()', () => {
      const chart = new AreaChart(makeScene());
      expect(chart.curve()).toBe('linear');
      chart.curve('catmullRom');
      expect(chart.curve()).toBe('catmullRom');
    });

    it('throws for an unsupported curve name', () => {
      const chart = new AreaChart(makeScene());
      expect(() => chart.curve('nope')).toThrow(TypeError);
    });
  });

  describe('update() — replaces the wall mesh', () => {
    it('disposes the old mesh and builds a fresh one from the new data', () => {
      const scene = makeScene();
      const chart = new AreaChart(scene);
      chart.data([3, 7]);
      chart.render();
      const meshBefore = scene.children[0];

      chart.data([10, 20, 30]);
      chart.update();

      expect(scene.children.length).toBe(1);
      expect(scene.children[0]).not.toBe(meshBefore);
      const positions = toTriples(scene.children[0].geometry.getAttribute('position').array);
      expect(positions).toHaveLength(6); // 3 points -> 6 vertices
    });
  });

  describe('.material()', () => {
    it('defaults to material.standard() when never configured', () => {
      const scene = makeScene();
      const chart = new AreaChart(scene);
      chart.data([3, 7]);
      chart.render();
      expect(scene.children[0].material).toBeInstanceOf(THREE.MeshStandardMaterial);
    });
  });

  describe('destroy()', () => {
    it('disposes the wall mesh and is idempotent', () => {
      const scene = makeScene();
      const chart = new AreaChart(scene);
      chart.data([3, 7]);
      chart.render();
      expect(scene.children.length).toBe(1);

      chart.destroy();
      expect(scene.children.length).toBe(0);
      expect(() => chart.destroy()).not.toThrow();
    });

    it('throws calling public methods after destroy()', () => {
      const chart = new AreaChart(makeScene());
      chart.data([1, 2]);
      chart.render();
      chart.destroy();

      expect(() => chart.render()).toThrow(/destroyed/);
      expect(() => chart.update()).toThrow(/destroyed/);
      expect(() => chart.data([1, 2])).toThrow(/destroyed/);
      expect(() => chart.baseline(1)).toThrow(/destroyed/);
      expect(() => chart.curve('linear')).toThrow(/destroyed/);
    });
  });
});
