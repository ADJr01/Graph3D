import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TreeChart } from '../../src/chart/TreeChart.js';
import { color, palette } from '../../src/compose/index.js';

function makeScene() {
  return new THREE.Scene();
}

function makeTree(childCount) {
  return {
    name: 'root',
    value: 1,
    children: Array.from({ length: childCount }, (_, i) => ({ name: `child-${i}`, value: i + 1 })),
  };
}

describe('TreeChart', () => {
  describe('constructor', () => {
    it('throws if scene is falsy (inherited from GraphChart)', () => {
      expect(() => new TreeChart(null)).toThrow(TypeError);
    });
  });

  describe('.data()', () => {
    it('stores and reads the root datum', () => {
      const chart = new TreeChart(makeScene());
      const root = makeTree(2);
      chart.data(root);
      expect(chart.data()).toBe(root);
    });

    it('throws for a non-object', () => {
      const chart = new TreeChart(makeScene());
      expect(() => chart.data('nope')).toThrow(TypeError);
      expect(() => chart.data(null)).toThrow(TypeError);
    });
  });

  describe('.children()/.value()/.sortChildren()', () => {
    it('getters/setters accept a function', () => {
      const chart = new TreeChart(makeScene());
      expect(chart.children()).toBeUndefined();
      const childrenFn = (d) => d.kids;
      chart.children(childrenFn);
      expect(chart.children()).toBe(childrenFn);

      const valueFn = (d) => d.size;
      chart.value(valueFn);
      expect(chart.value()).toBe(valueFn);

      const sortFn = (a, b) => b.value - a.value;
      chart.sortChildren(sortFn);
      expect(chart.sortChildren()).toBe(sortFn);
    });

    it('throws for a non-function', () => {
      const chart = new TreeChart(makeScene());
      expect(() => chart.children('nope')).toThrow(TypeError);
      expect(() => chart.value('nope')).toThrow(TypeError);
      expect(() => chart.sortChildren('nope')).toThrow(TypeError);
    });
  });

  describe('.levelHeight()/.levelRadius()', () => {
    it('getters/setters accept a finite number', () => {
      const chart = new TreeChart(makeScene());
      expect(chart.levelHeight()).toBeUndefined();
      chart.levelHeight(2);
      expect(chart.levelHeight()).toBe(2);

      expect(chart.levelRadius()).toBeUndefined();
      chart.levelRadius(3);
      expect(chart.levelRadius()).toBe(3);
    });

    it('throws for a non-finite value', () => {
      const chart = new TreeChart(makeScene());
      expect(() => chart.levelHeight('nope')).toThrow(TypeError);
      expect(() => chart.levelHeight(NaN)).toThrow(TypeError);
      expect(() => chart.levelRadius('nope')).toThrow(TypeError);
    });
  });

  describe('render() — node spheres + edge lines', () => {
    it('throws calling render() before data(rootDatum)', () => {
      expect(() => new TreeChart(makeScene()).render()).toThrow(/call data\(rootDatum\)/);
    });

    it('renders one mesh per hierarchy node (below INSTANCING_THRESHOLD) and one Line2 per parent-child edge', () => {
      const scene = makeScene();
      const chart = new TreeChart(scene).data(makeTree(2));
      chart.render();

      const lines = scene.children.filter((c) => c.isLine2);
      const nodes = scene.children.filter((c) => !c.isLine2);
      expect(lines).toHaveLength(2); // root -> child-0, root -> child-1
      expect(nodes).toHaveLength(3); // root + 2 children
    });

    it('renders a single GraphInstancedObject above INSTANCING_THRESHOLD', () => {
      const scene = makeScene();
      const chart = new TreeChart(scene).data(makeTree(60));
      chart.render();

      const nodes = scene.children.filter((c) => !c.isLine2);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].isInstancedMesh || nodes[0].count === 61).toBeTruthy();
    });

    it('renders a lone root (no children) with no edges', () => {
      const scene = makeScene();
      const chart = new TreeChart(scene).data({ name: 'root', value: 1 });
      chart.render();

      const lines = scene.children.filter((c) => c.isLine2);
      const nodes = scene.children.filter((c) => !c.isLine2);
      expect(lines).toHaveLength(0);
      expect(nodes).toHaveLength(1);
    });
  });

  describe('update()', () => {
    it('throws calling update() before render()', () => {
      const chart = new TreeChart(makeScene()).data(makeTree(2));
      expect(() => chart.update()).toThrow(/call render\(\) first/);
    });

    it('rebuilds the backend to match a changed hierarchy', () => {
      const scene = makeScene();
      const chart = new TreeChart(scene).data(makeTree(2));
      chart.render();

      chart.data(makeTree(4));
      chart.update();

      const lines = scene.children.filter((c) => c.isLine2);
      const nodes = scene.children.filter((c) => !c.isLine2);
      expect(lines).toHaveLength(4);
      expect(nodes).toHaveLength(5);
    });
  });

  describe('.color() — reused via applyColorField', () => {
    it('colors nodes via palette.viridis when no palette is given', () => {
      const scene = makeScene();
      const root = { name: 'root', value: 1, children: [{ name: 'a', value: 1 }] };
      // .color() receives the hierarchy node itself (per the class doc), so
      // `.depth` (root: 0, child: 1) is used here rather than `.value`, which
      // buildHierarchy sums bottom-up (a leaf's raw value and its parent's
      // accumulated value can coincide, making them a poor test signal).
      const chart = new TreeChart(scene).data(root).color((d) => d.depth);
      chart.render();

      const expectedScale = color.sequential(palette.viridis, [0, 1]);
      const meshes = scene.children.filter((c) => !c.isLine2);
      const rootMesh = meshes.find((m) => m.userData.graph3d.datum.data === root);
      const childMesh = meshes.find((m) => m.userData.graph3d.datum.data === root.children[0]);
      expect(rootMesh.material.color.getHexString()).toBe(new THREE.Color(expectedScale(0)).getHexString());
      expect(childMesh.material.color.getHexString()).toBe(new THREE.Color(expectedScale(1)).getHexString());
    });
  });

  describe('destroy()', () => {
    it('disposes every node/edge object and is idempotent', () => {
      const scene = makeScene();
      const chart = new TreeChart(scene).data(makeTree(2));
      chart.render();
      expect(scene.children.length).toBeGreaterThan(0);

      chart.destroy();
      expect(scene.children.length).toBe(0);
      expect(() => chart.destroy()).not.toThrow();
    });

    it('throws calling public methods after destroy()', () => {
      const chart = new TreeChart(makeScene()).data(makeTree(2));
      chart.render();
      chart.destroy();

      expect(() => chart.render()).toThrow(/destroyed/);
      expect(() => chart.update()).toThrow(/destroyed/);
      expect(() => chart.data({})).toThrow(/destroyed/);
      expect(() => chart.children(() => [])).toThrow(/destroyed/);
      expect(() => chart.value(() => 1)).toThrow(/destroyed/);
      expect(() => chart.sortChildren(() => 0)).toThrow(/destroyed/);
      expect(() => chart.levelHeight(1)).toThrow(/destroyed/);
      expect(() => chart.levelRadius(1)).toThrow(/destroyed/);
      expect(() => chart.selection()).toThrow(/destroyed/);
    });
  });
});
