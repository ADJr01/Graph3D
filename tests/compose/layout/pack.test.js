import { describe, it, expect } from 'vitest';
import { pack } from '../../../src/compose/layout/pack.js';

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe('layout.pack', () => {
  it('throws TypeError for a non-object root', () => {
    expect(() => pack()(null)).toThrow(TypeError);
  });

  it('positions the root at the origin', () => {
    const root = pack()({ value: 1 });
    expect(root.x).toBe(0);
    expect(root.y).toBe(0);
    expect(root.z).toBe(0);
  });

  it('sizes a leaf sphere from its value (r^3 proportional to value)', () => {
    const root = pack()({ value: 8 });
    expect(root.r).toBeCloseTo(2, 10);
  });

  it('a single child is centered inside its parent', () => {
    const root = pack()({ children: [{ value: 1 }] });
    const [child] = root.children;
    expect(child.x).toBe(0);
    expect(child.y).toBe(0);
    expect(child.z).toBe(0);
    expect(root.r).toBeGreaterThanOrEqual(child.r);
  });

  it('packs multiple children without overlap and encloses them in the parent radius', () => {
    const root = pack()({
      children: [{ value: 5 }, { value: 5 }, { value: 5 }, { value: 5 }],
    });
    const children = root.children;
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        // small relaxation tolerance: this settles via force-collide, not an
        // exact solver (see pack.js's ponytail note).
        expect(dist(children[i], children[j])).toBeGreaterThan(children[i].r + children[j].r - 0.05);
      }
      const distFromCenter = Math.hypot(children[i].x, children[i].y, children[i].z);
      expect(distFromCenter + children[i].r).toBeLessThanOrEqual(root.r + 1e-6);
    }
  });

  it('positions descendants in the parent global space, not local-only offsets', () => {
    const root = pack()({
      children: [{ children: [{ value: 1 }, { value: 1 }] }],
    });
    const branch = root.children[0];
    const leaf = branch.children[0];
    // leaf's global position is branch's global position plus leaf's local
    // offset - it should not coincide with branch's own center exactly
    // unless the local offset were zero, which two children never produce.
    expect(dist(leaf, branch)).toBeGreaterThan(0);
  });

  it('does not overlap sibling subtrees at a deeper level', () => {
    const root = pack()({
      children: [
        { children: [{ value: 4 }, { value: 4 }] },
        { children: [{ value: 4 }, { value: 4 }] },
      ],
    });
    const [branchA, branchB] = root.children;
    expect(dist(branchA, branchB)).toBeGreaterThan(branchA.r + branchB.r - 0.05);
  });

  it('accepts custom children/value accessors', () => {
    const root = pack({ children: (d) => d.kids, value: (d) => d.size })({
      kids: [{ size: 1 }, { size: 2 }],
    });
    expect(root.children).toHaveLength(2);
  });

  it('padding increases separation between siblings', () => {
    const tight = pack({ padding: 0 })({ children: [{ value: 5 }, { value: 5 }] });
    const padded = pack({ padding: 2 })({ children: [{ value: 5 }, { value: 5 }] });
    const [ta, tb] = tight.children;
    const [pa, pb] = padded.children;
    expect(dist(pa, pb)).toBeGreaterThan(dist(ta, tb));
  });

  it('leaves no leftover force-simulation bookkeeping fields on returned nodes', () => {
    const root = pack()({ children: [{ value: 1 }, { value: 1 }, { value: 1 }] });
    for (const child of root.children) {
      expect(child.vx).toBeUndefined();
      expect(child.__ax).toBeUndefined();
    }
  });
});
