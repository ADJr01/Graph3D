import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ScatterChart } from '../../src/chart/ScatterChart.js';
import { color, palette } from '../../src/compose/index.js';
import { INSTANCING_THRESHOLD } from '../../src/object/GraphObjectFactory.js';

function makeScene() {
  return new THREE.Scene();
}

describe('ScatterChart', () => {
  describe('constructor defaults', () => {
    it('throws if scene is falsy (inherited from GraphChart)', () => {
      expect(() => new ScatterChart(null)).toThrow(TypeError);
    });
  });

  describe('render() — plain (meshes backend, defaults)', () => {
    it('positions points per generator.point() defaults (index x, identity y, size 1)', () => {
      const scene = makeScene();
      const chart = new ScatterChart(scene);
      chart.data([3, 5, 2]);
      chart.render();

      expect(scene.children.length).toBe(3);
      expect(scene.children[0].position.x).toBeCloseTo(0);
      expect(scene.children[0].position.y).toBeCloseTo(3);
      expect(scene.children[0].scale.x).toBeCloseTo(1);
      expect(scene.children[1].position.x).toBeCloseTo(1);
      expect(scene.children[1].position.y).toBeCloseTo(5);
    });
  });

  describe('.size(fn)', () => {
    it('wires the size accessor into generator.point().size() before compute', () => {
      const scene = makeScene();
      const chart = new ScatterChart(scene).y(() => 0).size((d) => d.r);
      chart.data([{ r: 1 }, { r: 2 }, { r: 3 }]);
      chart.render();

      expect(scene.children[0].scale.x).toBeCloseTo(1);
      expect(scene.children[1].scale.x).toBeCloseTo(2);
      expect(scene.children[2].scale.x).toBeCloseTo(3);
    });

    it('leaves the default size (1) untouched when never called', () => {
      const scene = makeScene();
      const chart = new ScatterChart(scene);
      chart.data([1, 2]);
      chart.render();
      expect(scene.children[0].scale.x).toBeCloseTo(1);
      expect(scene.children[1].scale.x).toBeCloseTo(1);
    });
  });

  describe('.color(fn) — palette.viridis default', () => {
    it('colors points via palette.viridis when no palette is given', () => {
      const scene = makeScene();
      const chart = new ScatterChart(scene).color((d) => d);
      chart.data([0, 50, 100]);
      chart.render();

      const expectedScale = color.sequential(palette.viridis, [0, 100]);
      expect(scene.children[0].material.color.getHexString()).toBe(new THREE.Color(expectedScale(0)).getHexString());
      expect(scene.children[2].material.color.getHexString()).toBe(new THREE.Color(expectedScale(100)).getHexString());
    });

    it('honors an explicit palette override', () => {
      const scene = makeScene();
      const chart = new ScatterChart(scene).color((d) => d, palette.magma);
      chart.data([0, 100]);
      chart.render();

      const expectedScale = color.sequential(palette.magma, [0, 100]);
      expect(scene.children[0].material.color.getHexString()).toBe(new THREE.Color(expectedScale(0)).getHexString());
    });
  });

  describe('.opacity(valueOrFn)', () => {
    it('applies a constant opacity to every point', () => {
      const scene = makeScene();
      const chart = new ScatterChart(scene).opacity(0.5);
      chart.data([1, 2, 3]);
      chart.render();

      for (const child of scene.children) expect(child.material.opacity).toBeCloseTo(0.5);
    });

    it('applies a per-datum opacity accessor', () => {
      const scene = makeScene();
      const chart = new ScatterChart(scene).y(() => 0).opacity((d) => d.o);
      chart.data([{ o: 0.2 }, { o: 0.9 }]);
      chart.render();

      expect(scene.children[0].material.opacity).toBeCloseTo(0.2);
      expect(scene.children[1].material.opacity).toBeCloseTo(0.9);
    });

    it('leaves opacity untouched when never called', () => {
      const scene = makeScene();
      const chart = new ScatterChart(scene);
      chart.data([1, 2]);
      chart.render();
      expect(scene.children[0].material.opacity).toBe(1);
    });

    it('re-applies opacity on update()', () => {
      const scene = makeScene();
      const chart = new ScatterChart(scene).y(() => 0).opacity((d) => d.o);
      chart.data([{ o: 0.2 }]);
      chart.render();
      chart.data([{ o: 0.7 }]);
      chart.update();
      expect(scene.children[0].material.opacity).toBeCloseTo(0.7);
    });
  });

  describe('.pick(raycaster) — meshes backend', () => {
    it('returns the datum hit by the ray, or null on a miss', () => {
      const scene = makeScene();
      const chart = new ScatterChart(scene)
        .x((d) => d.x)
        .y((d) => d.y)
        .z((d) => d.z);
      chart.data([
        { x: 0, y: 0, z: 0 },
        { x: 5, y: 0, z: 0 },
      ]);
      chart.render();

      const hitRay = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
      expect(chart.pick(hitRay)).toEqual({ x: 0, y: 0, z: 0 });

      const missRay = new THREE.Raycaster(new THREE.Vector3(100, 100, 5), new THREE.Vector3(0, 0, -1));
      expect(chart.pick(missRay)).toBeNull();
    });
  });

  describe('.pick(raycaster) — instanced backend', () => {
    it('returns the datum hit by the ray via the octree-backed GraphInstancedObject.pick()', () => {
      const scene = makeScene();
      const rows = Array.from({ length: INSTANCING_THRESHOLD + 5 }, (_, i) => ({ x: i * 3, y: 0, z: 0 }));
      const chart = new ScatterChart(scene)
        .x((d) => d.x)
        .y((d) => d.y)
        .z((d) => d.z);
      chart.data(rows);
      chart.render();

      expect(scene.children[0]).toBeInstanceOf(THREE.InstancedMesh);

      const hitRay = new THREE.Raycaster(new THREE.Vector3(9, 0, 5), new THREE.Vector3(0, 0, -1));
      expect(chart.pick(hitRay)).toEqual({ x: 9, y: 0, z: 0 });

      const missRay = new THREE.Raycaster(new THREE.Vector3(9, 500, 5), new THREE.Vector3(0, 0, -1));
      expect(chart.pick(missRay)).toBeNull();
    });
  });
});
