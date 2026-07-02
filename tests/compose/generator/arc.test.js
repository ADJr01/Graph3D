import { describe, it, expect } from 'vitest';
import { arc } from '../../../src/compose/generator/arc.js';

// A tiny span (endAngle=0.01) rounds down to exactly 1 angular segment, which
// makes the vertex layout deterministic: top(4) -> bottom(4) -> outer(4) ->
// inner(4) -> startCap(4) -> endCap(4), 24 vertices total. That lets these
// tests assert on exact index ranges without depending on internal helpers.
function faceNormal(normals, faceIndex) {
  const base = faceIndex * 4 * 3;
  return [normals[base], normals[base + 1], normals[base + 2]];
}

describe('generator.arc defaults', () => {
  it('innerRadius=0, outerRadius=1, startAngle=0, extrude=1', () => {
    const g = arc();
    expect(g.innerRadius()({}, 0)).toBe(0);
    expect(g.outerRadius()({}, 0)).toBe(1);
    expect(g.startAngle()({}, 0)).toBe(0);
    expect(g.extrude()({}, 0)).toBe(1);
  });

  it('endAngle defaults to the datum itself, so a plain array of angles works', () => {
    expect(arc().endAngle()(Math.PI / 2, 0)).toBe(Math.PI / 2);
  });
});

describe('generator.arc chainable accessors', () => {
  it('every field is chainable', () => {
    const g = arc();
    expect(g.innerRadius(0.5)).toBe(g);
    expect(g.outerRadius(2)).toBe(g);
    expect(g.startAngle(1)).toBe(g);
    expect(g.endAngle(2)).toBe(g);
    expect(g.extrude(3)).toBe(g);
  });

  it('accepts per-datum accessor functions', () => {
    const g = arc().endAngle((d) => d.angle);
    expect(g.endAngle()({ angle: 1.2 }, 0)).toBe(1.2);
  });
});

describe('generator.arc wedge winding (1-segment wedge)', () => {
  const { positions, normals, indices } = arc()
    .innerRadius(0.5)
    .outerRadius(1)
    .startAngle(0)
    .extrude(1)
    .compute([0.01]);

  it('produces 6 quads (top, bottom, outer, inner, start cap, end cap) for a partial wedge', () => {
    expect(positions).toHaveLength(6 * 4 * 3);
    expect(indices).toHaveLength(6 * 6);
  });

  it('top face normal points +y', () => {
    const [nx, ny, nz] = faceNormal(normals, 0);
    expect(nx).toBeCloseTo(0, 5);
    expect(ny).toBeCloseTo(1, 5);
    expect(nz).toBeCloseTo(0, 5);
  });

  it('bottom face normal points -y', () => {
    const [nx, ny, nz] = faceNormal(normals, 1);
    expect(nx).toBeCloseTo(0, 5);
    expect(ny).toBeCloseTo(-1, 5);
    expect(nz).toBeCloseTo(0, 5);
  });

  it('outer wall normal points radially outward (away from the axis)', () => {
    const [nx, , nz] = faceNormal(normals, 2);
    expect(nx).toBeGreaterThan(0);
    expect(nz).toBeCloseTo(0, 1);
  });

  it('inner wall normal points radially inward (toward the axis)', () => {
    const [nx, , nz] = faceNormal(normals, 3);
    expect(nx).toBeLessThan(0);
    expect(nz).toBeCloseTo(0, 1);
  });

  it('start cap normal points away from the wedge body (-z at startAngle=0)', () => {
    const [nx, ny, nz] = faceNormal(normals, 4);
    expect(nz).toBeLessThan(0);
    expect(nx).toBeCloseTo(0, 1);
    expect(ny).toBeCloseTo(0, 5);
  });

  it('end cap normal points away from the wedge body (+z at endAngle=0.01)', () => {
    const [, ny, nz] = faceNormal(normals, 5);
    expect(nz).toBeGreaterThan(0);
    expect(ny).toBeCloseTo(0, 5);
  });

  it('every index is within the positions vertex range', () => {
    const vertexCount = positions.length / 3;
    for (const index of indices) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(vertexCount);
    }
  });
});

describe('generator.arc full-circle wedge', () => {
  it('skips end caps for a full 2π sweep', () => {
    const { positions, indices } = arc().startAngle(0).endAngle(2 * Math.PI).compute([0]);
    // 64 angular segments (FULL_CIRCLE_SEGMENTS), 4 faces per segment, no caps.
    expect(positions).toHaveLength(64 * 4 * 4 * 3);
    expect(indices).toHaveLength(64 * 4 * 6);
  });
});

describe('generator.arc compute(data)', () => {
  it('returns positions/indices/normals ready for a BufferGeometry', () => {
    const result = arc().compute([1, 2]);
    expect(result.positions).toBeInstanceOf(Float32Array);
    expect(result.indices).toBeInstanceOf(Uint32Array);
    expect(result.normals).toBeInstanceOf(Float32Array);
    expect(result.positions).toHaveLength(result.normals.length);
  });

  it('combines multiple data points into one mesh with correctly offset indices', () => {
    const { positions, indices } = arc().startAngle(0).endAngle(0.01).compute([0, 1, 2]);
    const vertexCount = positions.length / 3;
    expect(vertexCount).toBe(3 * 6 * 4); // 3 wedges * 6 quads * 4 vertices
    for (const index of indices) {
      expect(index).toBeLessThan(vertexCount);
    }
  });

  it('throws TypeError when data is not an array', () => {
    expect(() => arc().compute('nope')).toThrow(TypeError);
  });
});
