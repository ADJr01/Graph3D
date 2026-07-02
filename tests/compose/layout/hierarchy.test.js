import { describe, it, expect } from 'vitest';
import { buildHierarchy, radiusFromValue } from '../../../src/compose/layout/hierarchy.js';

describe('buildHierarchy', () => {
  it('throws TypeError for a non-object root', () => {
    expect(() => buildHierarchy(null)).toThrow(TypeError);
    expect(() => buildHierarchy('nope')).toThrow(TypeError);
  });

  it('builds depth/height/parent from the default children accessor', () => {
    const root = buildHierarchy({
      name: 'root',
      children: [{ name: 'a', children: [{ name: 'b' }] }, { name: 'c' }],
    });
    expect(root.depth).toBe(0);
    expect(root.parent).toBe(null);
    expect(root.children).toHaveLength(2);
    const [a, c] = root.children;
    expect(a.depth).toBe(1);
    expect(a.parent).toBe(root);
    expect(a.children[0].depth).toBe(2);
    expect(c.children).toBe(null);
    expect(root.height).toBe(2); // root -> a -> b is the longest chain
    expect(c.height).toBe(0);
  });

  it('leaves with no children array (or an empty one) are treated as leaves', () => {
    const root = buildHierarchy({ children: [] });
    expect(root.children).toBe(null);
  });

  it('sums .value bottom-up using the default value accessor', () => {
    const root = buildHierarchy({
      children: [{ value: 1 }, { value: 2, children: [{ value: 3 }] }],
    });
    expect(root.value).toBe(6); // 1 + (2 + 3)
    expect(root.children[1].value).toBe(5);
  });

  it('coerces a non-numeric value to 0, matching d3-hierarchy.sum()', () => {
    const root = buildHierarchy({ children: [{ notValue: 1 }] });
    expect(root.value).toBe(0);
  });

  it('accepts a custom children accessor', () => {
    const root = buildHierarchy({ kids: [{ kids: [] }] }, { children: (d) => d.kids });
    expect(root.children).toHaveLength(1);
  });

  it('accepts a custom value accessor', () => {
    const root = buildHierarchy({ children: [{ size: 4 }, { size: 6 }] }, { value: (d) => d.size });
    expect(root.value).toBe(10);
  });

  it('sorts children at every level with the given comparator', () => {
    const root = buildHierarchy(
      { children: [{ value: 1 }, { value: 3 }, { value: 2 }] },
      { sort: (a, b) => b.value - a.value },
    );
    expect(root.children.map((c) => c.value)).toEqual([3, 2, 1]);
  });
});

describe('radiusFromValue', () => {
  it('is the cube root of value, so radius^3 (volume) is proportional to value', () => {
    expect(radiusFromValue(8)).toBeCloseTo(2, 10);
    expect(radiusFromValue(0)).toBe(0);
  });

  it('clamps a negative value to a 0 radius rather than returning NaN', () => {
    expect(radiusFromValue(-5)).toBe(0);
  });
});
