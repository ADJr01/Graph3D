import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LineChart } from '../../src/chart/LineChart.js';
import { palette } from '../../src/compose/index.js';

function makeScene() {
  return new THREE.Scene();
}

/** Reads a Line2's flat vertex positions back out of its interleaved buffer. */
function readLinePositions(line) {
  const { instanceStart, instanceEnd } = line.geometry.attributes;
  const segmentCount = instanceStart.count;
  const points = new Array(segmentCount + 1);
  for (let i = 0; i < segmentCount; i++) {
    points[i] = [instanceStart.getX(i), instanceStart.getY(i), instanceStart.getZ(i)];
  }
  const last = segmentCount - 1;
  points[segmentCount] = [instanceEnd.getX(last), instanceEnd.getY(last), instanceEnd.getZ(last)];
  return points;
}

describe('LineChart', () => {
  describe('constructor', () => {
    it('throws if scene is falsy (inherited from GraphChart)', () => {
      expect(() => new LineChart(null)).toThrow(TypeError);
    });
  });

  describe('render() — single series (default)', () => {
    it('renders one Line2 through every point in order', () => {
      const scene = makeScene();
      const chart = new LineChart(scene);
      chart.data([0, 1, 2]);
      chart.render();

      expect(scene.children.length).toBe(1);
      const line = scene.children[0];
      expect(line.isLine2).toBe(true);
      const points = readLinePositions(line);
      expect(points).toEqual([
        [0, 0, 0],
        [1, 1, 0],
        [2, 2, 0],
      ]);
    });

    it('throws calling render() before data()', () => {
      const chart = new LineChart(makeScene());
      expect(() => chart.render()).toThrow(/call data\(arr\)/);
    });

    it('throws calling update() before render()', () => {
      const chart = new LineChart(makeScene());
      chart.data([0, 1]);
      expect(() => chart.update()).toThrow(/call render\(\) first/);
    });
  });

  describe('update() — same-count mutation vs. rebuild', () => {
    it('mutates the existing instanceStart attribute in place when point count is unchanged', () => {
      const scene = makeScene();
      const chart = new LineChart(scene);
      chart.data([0, 1, 2]);
      chart.render();
      const line = scene.children[0];
      const attributeBefore = line.geometry.attributes.instanceStart;

      chart.data([10, 11, 12]);
      chart.update();

      expect(line.geometry.attributes.instanceStart).toBe(attributeBefore);
      expect(readLinePositions(line)).toEqual([
        [0, 10, 0],
        [1, 11, 0],
        [2, 12, 0],
      ]);
    });

    it('rebuilds the geometry attributes when point count changes', () => {
      const scene = makeScene();
      const chart = new LineChart(scene);
      chart.data([0, 1, 2]);
      chart.render();
      const line = scene.children[0];
      const attributeBefore = line.geometry.attributes.instanceStart;

      chart.data([0, 1, 2, 3]);
      chart.update();

      expect(line.geometry.attributes.instanceStart).not.toBe(attributeBefore);
      expect(readLinePositions(line)).toEqual([
        [0, 0, 0],
        [1, 1, 0],
        [2, 2, 0],
        [3, 3, 0],
      ]);
    });
  });

  describe('.curve(type)', () => {
    it('passes through to generator.line().curve()', () => {
      const chart = new LineChart(makeScene());
      expect(chart.curve()).toBe('linear');
      chart.curve('catmullRom');
      expect(chart.curve()).toBe('catmullRom');
    });

    it('throws for an unsupported curve name', () => {
      const chart = new LineChart(makeScene());
      expect(() => chart.curve('nope')).toThrow(TypeError);
    });
  });

  describe('.series(keyFn)', () => {
    const rows = [
      { t: 0, series: 'a', value: 1 },
      { t: 0, series: 'b', value: 10 },
      { t: 1, series: 'a', value: 2 },
      { t: 1, series: 'b', value: 20 },
    ];

    it('renders one Line2 per distinct series key', () => {
      const scene = makeScene();
      const chart = new LineChart(scene)
        .x((d) => d.t)
        .y((d) => d.value)
        .series((d) => d.series);
      chart.data(rows);
      chart.render();

      expect(scene.children.length).toBe(2);
      const a = readLinePositions(scene.children[0]);
      const b = readLinePositions(scene.children[1]);
      expect(a).toEqual([
        [0, 1, 0],
        [1, 2, 0],
      ]);
      expect(b).toEqual([
        [0, 10, 0],
        [1, 20, 0],
      ]);
    });

    it('colors each series distinctly via palette.category10', () => {
      const scene = makeScene();
      const chart = new LineChart(scene)
        .x((d) => d.t)
        .y((d) => d.value)
        .series((d) => d.series);
      chart.data(rows);
      chart.render();

      const colorA = new THREE.Color(palette.category10('a')).getHexString();
      const colorB = new THREE.Color(palette.category10('b')).getHexString();
      expect(scene.children[0].material.color.getHexString()).toBe(colorA);
      expect(scene.children[1].material.color.getHexString()).toBe(colorB);
      expect(colorA).not.toBe(colorB);
    });

    it('disposes a series line that no longer appears in data on update()', () => {
      const scene = makeScene();
      const chart = new LineChart(scene)
        .x((d) => d.t)
        .y((d) => d.value)
        .series((d) => d.series);
      chart.data(rows);
      chart.render();
      expect(scene.children.length).toBe(2);

      chart.data(rows.filter((d) => d.series === 'a'));
      chart.update();

      expect(scene.children.length).toBe(1);
    });

    it('throws if keyFn is not a function', () => {
      const chart = new LineChart(makeScene());
      expect(() => chart.series(null)).toThrow(TypeError);
    });
  });

  describe('.data(arr) — plain getter/setter (no join)', () => {
    it('reads back the last array passed', () => {
      const chart = new LineChart(makeScene());
      const rows = [0, 1, 2];
      chart.data(rows);
      expect(chart.data()).toBe(rows);
    });

    it('throws if arr is not an array', () => {
      const chart = new LineChart(makeScene());
      expect(() => chart.data('nope')).toThrow(TypeError);
    });
  });

  describe('.setResolution(width, height)', () => {
    it('forwards to every live line', () => {
      const scene = makeScene();
      const chart = new LineChart(scene).series((d) => d.series);
      chart.data([
        { series: 'a', v: 0 },
        { series: 'a', v: 1 },
        { series: 'b', v: 2 },
        { series: 'b', v: 3 },
      ]);
      chart.render();

      chart.setResolution(800, 600);
      for (const line of scene.children) {
        expect(line.material.resolution.x).toBe(800);
        expect(line.material.resolution.y).toBe(600);
      }
    });
  });

  describe('destroy()', () => {
    it('disposes every live line and is idempotent', () => {
      const scene = makeScene();
      const chart = new LineChart(scene);
      chart.data([0, 1, 2]);
      chart.render();
      expect(scene.children.length).toBe(1);

      chart.destroy();
      expect(scene.children.length).toBe(0);
      expect(() => chart.destroy()).not.toThrow();
    });

    it('throws calling public methods after destroy()', () => {
      const chart = new LineChart(makeScene());
      chart.data([0, 1]);
      chart.render();
      chart.destroy();

      expect(() => chart.render()).toThrow(/destroyed/);
      expect(() => chart.update()).toThrow(/destroyed/);
      expect(() => chart.data([1, 2])).toThrow(/destroyed/);
      expect(() => chart.series(() => 'x')).toThrow(/destroyed/);
      expect(() => chart.curve('linear')).toThrow(/destroyed/);
    });
  });
});
