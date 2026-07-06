import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TreeChart } from '../../src/chart/TreeChart.js';
import { INSTANCING_THRESHOLD } from '../../src/object/GraphObjectFactory.js';

/**
 * Integration coverage for TreeChart (Prompt 138): a full render -> update ->
 * destroy lifecycle against a real THREE.Scene, exercising both the meshes
 * and instanced node backends, plus `.children()`/`.levelHeight()`/
 * `.levelRadius()`.
 */
function buildTree(depth, branching) {
  if (depth === 0) return { value: 1 };
  return { value: 1, children: Array.from({ length: branching }, () => buildTree(depth - 1, branching)) };
}

describe('TreeChart / integration', () => {
  it('renders, updates, and destroys cleanly on the meshes backend', () => {
    const scene = new THREE.Scene();
    const root = {
      name: 'root',
      children: [
        { name: 'a', value: 1 },
        { name: 'b', value: 2, children: [{ name: 'b1', value: 1 }, { name: 'b2', value: 1 }] },
      ],
    };

    const chart = new TreeChart(scene).levelHeight(1.5).levelRadius(2);
    chart.data(root);
    chart.render();

    // root, a, b, b1, b2 = 5 nodes; edges: root->a, root->b, b->b1, b->b2 = 4
    expect(scene.children.filter((c) => !c.isLine2)).toHaveLength(5);
    expect(scene.children.filter((c) => c.isLine2)).toHaveLength(4);

    for (const node of scene.children.filter((c) => !c.isLine2)) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
      expect(Number.isFinite(node.position.z)).toBe(true);
    }

    chart.data({ ...root, children: [...root.children, { name: 'c', value: 1 }] });
    chart.update();
    expect(scene.children.filter((c) => !c.isLine2)).toHaveLength(6);
    expect(scene.children.filter((c) => c.isLine2)).toHaveLength(5);

    chart.destroy();
    expect(scene.children.length).toBe(0);
    expect(() => chart.render()).toThrow(/destroyed/);
  });

  it('renders a wide tree (>INSTANCING_THRESHOLD nodes) as one GraphInstancedObject, fanned radially by a custom children() accessor', () => {
    const scene = new THREE.Scene();
    const root = { kids: Array.from({ length: INSTANCING_THRESHOLD + 10 }, (_, i) => ({ id: i })) };

    const chart = new TreeChart(scene).children((d) => d.kids);
    chart.data(root);
    chart.render();

    const nodeObjects = scene.children.filter((c) => !c.isLine2);
    expect(nodeObjects).toHaveLength(1);
    expect(nodeObjects[0]).toBeInstanceOf(THREE.InstancedMesh);
    // root + every leaf = 1 edge per leaf (root -> each leaf)
    expect(scene.children.filter((c) => c.isLine2)).toHaveLength(INSTANCING_THRESHOLD + 10);

    chart.destroy();
    expect(scene.children.length).toBe(0);
  });

  it('sortChildren() reorders siblings (angular position changes deterministically)', () => {
    const scene = new THREE.Scene();
    const root = { children: [{ name: 'z', value: 1 }, { name: 'a', value: 1 }] };

    const ascending = new TreeChart(scene).sortChildren((a, b) => a.data.name.localeCompare(b.data.name));
    ascending.data(root);
    ascending.render();

    const meshes = ascending.selection().data();
    const names = meshes.filter((n) => n.depth === 1).map((n) => n.data.name);
    expect(names).toEqual(['a', 'z']);

    ascending.destroy();
  });
});
