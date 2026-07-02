import { describe, it, expect } from 'vitest';
import {
  sampleLinear,
  sampleCatmullRom,
  sampleMonotone,
  sampleBezier,
  sampleCurve,
  CURVE_TYPES,
} from '../../../src/compose/generator/curve.js';

const P = [[0, 0, 0], [1, 2, 0], [2, 1, 0], [3, 3, 0]];

describe('sampleLinear', () => {
  it('passes points through unsubdivided', () => {
    expect(sampleLinear(P)).toEqual(P);
  });
});

describe('sampleCatmullRom', () => {
  it('starts and ends exactly on the first/last data point', () => {
    const out = sampleCatmullRom(P, 0);
    expect(out[0]).toEqual(P[0]);
    expect(out[out.length - 1]).toEqual(P[P.length - 1]);
  });

  it('passes through every interior data point at a segment boundary', () => {
    const out = sampleCatmullRom(P, 0, 4);
    expect(out).toContainEqual(P[1]);
    expect(out).toContainEqual(P[2]);
  });

  it('degenerates to sampleLinear for 2 points', () => {
    expect(sampleCatmullRom([P[0], P[1]], 0)).toEqual(sampleLinear([P[0], P[1]]));
  });

  it('tension = 1 flattens the curve so points fall on the straight secant', () => {
    const out = sampleCatmullRom(P, 1, 4);
    // Every sampled point in the first interval (indices 0-3, before P1 at
    // index 4) should lie on the line P0->P1.
    for (const [x, y] of out.slice(0, 4)) {
      const t = x / (P[1][0] - P[0][0]);
      expect(y).toBeCloseTo(P[0][1] + t * (P[1][1] - P[0][1]), 5);
    }
  });

  it('produces more points at a higher segment count', () => {
    expect(sampleCatmullRom(P, 0, 8).length).toBeGreaterThan(sampleCatmullRom(P, 0, 4).length);
  });
});

describe('sampleMonotone', () => {
  it('starts and ends exactly on the first/last data point', () => {
    const out = sampleMonotone(P);
    expect(out[0]).toEqual(P[0]);
    expect(out[out.length - 1]).toEqual(P[P.length - 1]);
  });

  it('never overshoots the local min/max of neighboring y-values', () => {
    const monotoneData = [[0, 0, 0], [1, 1, 0], [2, 1, 0], [3, 0, 0]];
    const out = sampleMonotone(monotoneData, 8);
    const ys = out.map((p) => p[1]);
    expect(Math.max(...ys)).toBeLessThanOrEqual(1 + 1e-9);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0 - 1e-9);
  });

  it('degenerates to sampleLinear for 2 points', () => {
    expect(sampleMonotone([P[0], P[1]])).toEqual(sampleLinear([P[0], P[1]]));
  });
});

describe('sampleBezier', () => {
  it('starts and ends exactly on the first/last data point', () => {
    const out = sampleBezier(P, 0);
    expect(out[0]).toEqual(P[0]);
    expect(out[out.length - 1]).toEqual(P[P.length - 1]);
  });

  it('tension = 1 puts the corner control point exactly on the straight chord between midpoints', () => {
    const straight = [[0, 0, 0], [2, 0, 0], [4, 2, 0]];
    // midpoints: M0 = [1, 0, 0], M1 = [3, 1, 0]; with tension 1 the quadratic
    // control point equals (M0 + M1) / 2, which degenerates the corner to a
    // straight line lerp(M0, M1, u) — verify the midpoint of the corner (u=0.5).
    const out = sampleBezier(straight, 1, 2);
    // out = [P0, stub(u=0.5), M0, corner(u=0.5), corner(u=1)=M1, stub(u=0.5), P2]
    const cornerMidpoint = out[3];
    expect(cornerMidpoint[0]).toBeCloseTo(2, 5);
    expect(cornerMidpoint[1]).toBeCloseTo(0.5, 5);
    expect(cornerMidpoint[2]).toBeCloseTo(0, 5);
  });

  it('degenerates to sampleLinear for 2 points', () => {
    expect(sampleBezier([P[0], P[1]], 0)).toEqual(sampleLinear([P[0], P[1]]));
  });
});

describe('sampleCurve', () => {
  it('dispatches to the named sampler', () => {
    expect(sampleCurve('linear', P, 0)).toEqual(sampleLinear(P));
  });

  it('exposes all 4 curve names', () => {
    expect(CURVE_TYPES.sort()).toEqual(['bezier', 'catmullRom', 'linear', 'monotone'].sort());
  });

  it('throws TypeError for an unknown curve name', () => {
    expect(() => sampleCurve('spline9000', P, 0)).toThrow(TypeError);
  });
});
