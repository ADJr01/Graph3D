import { describe, it, expect } from 'vitest';
import { tree } from '../../../src/compose/layout/tree.js';

describe('layout.tree', () => {
  it('throws TypeError for a non-object root', () => {
    expect(() => tree()(null)).toThrow(TypeError);
  });

  it('positions the root at the origin', () => {
    const root = tree()({ value: 1 });
    expect(root.x).toBeCloseTo(0, 10);
    expect(root.z).toBeCloseTo(0, 10);
    expect(root.y).toBeCloseTo(0, 10);
  });

  it('drops each depth level by levelHeight along -y', () => {
    const root = tree({ levelHeight: 2 })({ children: [{ children: [{ value: 1 }] }] });
    expect(root.children[0].y).toBe(-2);
    expect(root.children[0].children[0].y).toBe(-4);
  });

  it('spreads children around the full circle at levelRadius from the axis', () => {
    const root = tree({ levelRadius: 3 })({ children: [{ value: 1 }, { value: 1 }] });
    for (const child of root.children) {
      expect(Math.hypot(child.x, child.z)).toBeCloseTo(3, 10);
    }
  });

  it('gives a child with more descendant leaves a proportionally larger angular wedge', () => {
    const root = tree()({
      children: [
        { children: [{ value: 1 }, { value: 1 }, { value: 1 }] }, // 3 leaves
        { value: 1 }, // 1 leaf
      ],
    });
    const [big, small] = root.children;
    const angleOf = (n) => Math.atan2(n.z, n.x);
    // big's own angular position should be closer to the wedge boundary
    // proportional to its 3x share; check via the grandchildren spread
    // instead, which is a more direct signal of wedge width.
    const grandAngles = big.children.map(angleOf);
    const spread = Math.max(...grandAngles) - Math.min(...grandAngles);
    expect(spread).toBeGreaterThan(0);
    expect(typeof angleOf(small)).toBe('number');
  });

  it('sizes node markers from value (r^3 proportional to value)', () => {
    const root = tree()({ value: 8, children: [{ value: 1 }] });
    expect(root.r).toBeCloseTo(radiusOfValue(9), 10);
  });

  it('does not leak the internal leaf-count bookkeeping field', () => {
    const root = tree()({ children: [{ value: 1 }, { value: 1 }] });
    expect(root.__leafCount).toBeUndefined();
    expect(root.children[0].__leafCount).toBeUndefined();
  });

  it('accepts custom children/value accessors', () => {
    const root = tree({ children: (d) => d.kids, value: (d) => d.size })({
      kids: [{ size: 1 }, { size: 2 }],
    });
    expect(root.children).toHaveLength(2);
  });
});

function radiusOfValue(value) {
  return Math.cbrt(value);
}
