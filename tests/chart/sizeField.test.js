import { describe, it, expect } from 'vitest';
import { applySizeField } from '../../src/chart/sizeField.js';

function makeMeshBackendChart(sizeAccessor, scales) {
  const written = [];
  const meshes = scales.map((s) => ({ getScale: () => ({ x: s[0], y: s[1], z: s[2] }) }));
  const backend = { type: 'meshes', meshes };
  return {
    size: () => sizeAccessor,
    selection: () => ({
      backend,
      size: () => meshes.length,
      attr(name, resolve) {
        written.push({ name, resolve });
        return this;
      },
    }),
    written,
  };
}

function makeInstancedBackendChart(sizeAccessor, scales) {
  const written = [];
  const indices = Uint32Array.from(scales.map((_, i) => i));
  const backend = {
    type: 'instanced',
    indices,
    object: { getInstanceScale: (i) => ({ x: scales[i][0], y: scales[i][1], z: scales[i][2] }) },
  };
  return {
    size: () => sizeAccessor,
    selection: () => ({
      backend,
      size: () => indices.length,
      attr(name, resolve) {
        written.push({ name, resolve });
        return this;
      },
    }),
    written,
  };
}

describe('applySizeField', () => {
  it('is a no-op when .size() has no accessor configured', () => {
    const chart = makeMeshBackendChart(null, [[1, 1, 1]]);
    applySizeField(chart);
    expect(chart.written).toHaveLength(0);
  });

  it('multiplies the current per-datum scale (meshes backend) by the size accessor, all 3 axes by default', () => {
    const sizeFn = (d) => d.multiplier;
    const chart = makeMeshBackendChart(sizeFn, [[2, 3, 4]]);
    applySizeField(chart);

    const datum = { multiplier: 2 };
    const byName = Object.fromEntries(chart.written.map((w) => [w.name, w.resolve]));
    expect(Object.keys(byName).sort()).toEqual(['scale.x', 'scale.y', 'scale.z']);
    expect(byName['scale.x'](datum, 0)).toBe(4); // 2 * 2
    expect(byName['scale.y'](datum, 0)).toBe(6); // 3 * 2
    expect(byName['scale.z'](datum, 0)).toBe(8); // 4 * 2
  });

  it('multiplies the current per-datum scale (instanced backend) the same way', () => {
    const sizeFn = () => 3;
    const chart = makeInstancedBackendChart(sizeFn, [[1, 1, 1], [2, 2, 2]]);
    applySizeField(chart);

    const byName = Object.fromEntries(chart.written.map((w) => [w.name, w.resolve]));
    expect(byName['scale.x']({}, 1)).toBe(6); // 2 * 3
  });

  it('restricts the multiply to only the given axes, leaving others untouched', () => {
    const chart = makeMeshBackendChart(() => 5, [[1, 1, 1]]);
    applySizeField(chart, ['x', 'z']);
    expect(chart.written.map((w) => w.name).sort()).toEqual(['scale.x', 'scale.z']);
  });

  it('reads the current scale once per datum, not once per axis (no redundant backend reads)', () => {
    let readCount = 0;
    const chart = {
      size: () => () => 2,
      selection: () => ({
        backend: {
          type: 'meshes',
          meshes: [{ getScale: () => { readCount++; return { x: 1, y: 1, z: 1 }; } }],
        },
        size: () => 1,
        attr(name, resolve) {
          this._written = this._written ?? [];
          this._written.push({ name, resolve });
          return this;
        },
      }),
    };
    applySizeField(chart);
    expect(readCount).toBe(1);
  });

  it('throws TypeError for an invalid axis name', () => {
    const chart = makeMeshBackendChart(() => 1, [[1, 1, 1]]);
    expect(() => applySizeField(chart, ['w'])).toThrow(TypeError);
  });
});
