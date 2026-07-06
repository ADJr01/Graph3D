import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { NetworkChart } from '../../src/chart/NetworkChart.js';
import { color, palette } from '../../src/compose/index.js';

function makeScene() {
  return new THREE.Scene();
}

function makeNodes(count) {
  return Array.from({ length: count }, (_, i) => ({ id: i, group: i % 2 === 0 ? 'a' : 'b' }));
}

describe('NetworkChart', () => {
  describe('constructor', () => {
    it('throws if scene is falsy (inherited from GraphChart)', () => {
      expect(() => new NetworkChart(null)).toThrow(TypeError);
    });
  });

  describe('.data()/.links() getters/setters', () => {
    it('stores and reads the node/link arrays', () => {
      const chart = new NetworkChart(makeScene());
      const nodes = makeNodes(2);
      const links = [{ source: 0, target: 1 }];
      chart.data(nodes);
      chart.links(links);
      expect(chart.data()).toBe(nodes);
      expect(chart.links()).toBe(links);
    });

    it('links() defaults to an empty array', () => {
      expect(new NetworkChart(makeScene()).links()).toEqual([]);
    });

    it('throws for a non-array', () => {
      const chart = new NetworkChart(makeScene());
      expect(() => chart.data('nope')).toThrow(TypeError);
      expect(() => chart.links('nope')).toThrow(TypeError);
    });
  });

  describe('.linkDistance()', () => {
    it('getter/setter accepts a number or function', () => {
      const chart = new NetworkChart(makeScene());
      expect(chart.linkDistance()).toBeUndefined();
      chart.linkDistance(5);
      expect(chart.linkDistance()).toBe(5);
      const fn = () => 3;
      chart.linkDistance(fn);
      expect(chart.linkDistance()).toBe(fn);
    });

    it('throws for a non-number/function', () => {
      expect(() => new NetworkChart(makeScene()).linkDistance('nope')).toThrow(TypeError);
    });
  });

  describe('.cluster()', () => {
    it('getter/setter accepts a function or null', () => {
      const chart = new NetworkChart(makeScene());
      expect(chart.cluster()).toBeNull();
      const keyFn = (d) => d.group;
      chart.cluster(keyFn);
      expect(chart.cluster()).toBe(keyFn);
      chart.cluster(null);
      expect(chart.cluster()).toBeNull();
    });

    it('throws for a non-function, non-null value', () => {
      expect(() => new NetworkChart(makeScene()).cluster('nope')).toThrow(TypeError);
    });
  });

  describe('render() — node spheres + edge lines', () => {
    it('throws calling render() before data(nodes)', () => {
      expect(() => new NetworkChart(makeScene()).render()).toThrow(/call data\(nodes\)/);
    });

    it('renders one mesh per node (below INSTANCING_THRESHOLD) and one Line2 per link', () => {
      const scene = makeScene();
      const chart = new NetworkChart(scene)
        .data(makeNodes(3))
        .links([{ source: 0, target: 1 }, { source: 1, target: 2 }]);
      chart.render();

      const lines = scene.children.filter((c) => c.isLine2);
      const nodes = scene.children.filter((c) => !c.isLine2);
      expect(lines).toHaveLength(2);
      expect(nodes).toHaveLength(3);
    });

    it('renders a single GraphInstancedObject above INSTANCING_THRESHOLD', () => {
      const scene = makeScene();
      const chart = new NetworkChart(scene).data(makeNodes(60)).links([{ source: 0, target: 1 }]);
      chart.render();

      const nodes = scene.children.filter((c) => !c.isLine2);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].isInstancedMesh || nodes[0].count === 60).toBeTruthy();
    });
  });

  describe('update()', () => {
    it('throws calling update() before render()', () => {
      const chart = new NetworkChart(makeScene()).data(makeNodes(2));
      expect(() => chart.update()).toThrow(/call render\(\) first/);
    });

    it('rebuilds the backend to match a changed node/link count', () => {
      const scene = makeScene();
      const chart = new NetworkChart(scene).data(makeNodes(2)).links([{ source: 0, target: 1 }]);
      chart.render();

      chart.data(makeNodes(4)).links([{ source: 0, target: 1 }, { source: 2, target: 3 }]);
      chart.update();

      const lines = scene.children.filter((c) => c.isLine2);
      const nodes = scene.children.filter((c) => !c.isLine2);
      expect(lines).toHaveLength(2);
      expect(nodes).toHaveLength(4);
    });

    it('preserves an existing node position across update() (same object reference)', () => {
      const scene = makeScene();
      const nodes = makeNodes(2);
      const chart = new NetworkChart(scene).data(nodes).links([{ source: 0, target: 1 }]);
      chart.render();
      nodes[0].x = 42;
      nodes[0].y = 7;
      nodes[0].z = -3;

      chart.update();

      expect(nodes[0].x).toBe(42);
      expect(nodes[0].y).toBe(7);
      expect(nodes[0].z).toBe(-3);
    });
  });

  describe('.tick()', () => {
    it('throws calling tick() before render()', () => {
      expect(() => new NetworkChart(makeScene()).data(makeNodes(2)).tick()).toThrow(/call render\(\) first/);
    });

    it('returns true and moves nodes while active, then auto-pauses within a bounded number of ticks', () => {
      const scene = makeScene();
      const chart = new NetworkChart(scene).data(makeNodes(3)).links([{ source: 0, target: 1 }]);
      chart.render();

      expect(chart.tick()).toBe(true);

      let ticks = 0;
      while (chart.tick() && ticks < 2000) ticks++;
      expect(ticks).toBeLessThan(2000);
      expect(chart.tick()).toBe(false);
    });
  });

  describe('.pin()/.unpin()', () => {
    it('fixes a node at its current (or given) position and wakes the simulation', () => {
      const scene = makeScene();
      const nodes = makeNodes(2);
      const chart = new NetworkChart(scene).data(nodes).links([{ source: 0, target: 1 }]);
      chart.render();

      chart.pin(nodes[0], { x: 1, y: 2, z: 3 });
      expect(nodes[0].fx).toBe(1);
      expect(nodes[0].fy).toBe(2);
      expect(nodes[0].fz).toBe(3);

      chart.unpin(nodes[0]);
      expect(nodes[0].fx).toBeUndefined();
      expect(nodes[0].fy).toBeUndefined();
      expect(nodes[0].fz).toBeUndefined();
    });

    it('throws for a non-object node', () => {
      const chart = new NetworkChart(makeScene()).data(makeNodes(1));
      chart.render();
      expect(() => chart.pin(null)).toThrow(TypeError);
      expect(() => chart.unpin(null)).toThrow(TypeError);
    });
  });

  describe('.color() — reused via applyColorField', () => {
    it('colors nodes via palette.viridis when no palette is given', () => {
      const scene = makeScene();
      const nodes = [
        { id: 0, value: 0 },
        { id: 1, value: 100 },
      ];
      const chart = new NetworkChart(scene).data(nodes).color((d) => d.value);
      chart.render();

      const expectedScale = color.sequential(palette.viridis, [0, 100]);
      const meshes = scene.children.filter((c) => !c.isLine2);
      expect(meshes[0].material.color.getHexString()).toBe(new THREE.Color(expectedScale(0)).getHexString());
      expect(meshes[1].material.color.getHexString()).toBe(new THREE.Color(expectedScale(100)).getHexString());
    });
  });

  describe('destroy()', () => {
    it('disposes every node/edge object and is idempotent', () => {
      const scene = makeScene();
      const chart = new NetworkChart(scene).data(makeNodes(3)).links([{ source: 0, target: 1 }]);
      chart.render();
      expect(scene.children.length).toBeGreaterThan(0);

      chart.destroy();
      expect(scene.children.length).toBe(0);
      expect(() => chart.destroy()).not.toThrow();
    });

    it('throws calling public methods after destroy()', () => {
      const chart = new NetworkChart(makeScene()).data(makeNodes(2));
      chart.render();
      chart.destroy();

      expect(() => chart.render()).toThrow(/destroyed/);
      expect(() => chart.update()).toThrow(/destroyed/);
      expect(() => chart.tick()).toThrow(/destroyed/);
      expect(() => chart.data([])).toThrow(/destroyed/);
      expect(() => chart.links([])).toThrow(/destroyed/);
      expect(() => chart.pin({})).toThrow(/destroyed/);
    });
  });
});
