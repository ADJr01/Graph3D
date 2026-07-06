import { describe, it, expect } from 'vitest';
import { nodeScaleForRadius, flattenHierarchyNodes } from '../../src/chart/hierarchyField.js';

describe('hierarchyField', () => {
  describe('nodeScaleForRadius()', () => {
    it('returns 1 for a radius equal to the base geometry radius (0.2)', () => {
      expect(nodeScaleForRadius(0.2)).toBe(1);
    });

    it('scales linearly with radius', () => {
      expect(nodeScaleForRadius(0.4)).toBe(2);
      expect(nodeScaleForRadius(0.1)).toBe(0.5);
    });
  });

  describe('flattenHierarchyNodes()', () => {
    it('returns just the root when it has no children', () => {
      const root = { children: null };
      expect(flattenHierarchyNodes(root)).toEqual([root]);
    });

    it('walks nested children pre-order', () => {
      const grandchild = { children: null };
      const childA = { children: [grandchild] };
      const childB = { children: null };
      const root = { children: [childA, childB] };

      expect(flattenHierarchyNodes(root)).toEqual([root, childA, grandchild, childB]);
    });
  });
});
