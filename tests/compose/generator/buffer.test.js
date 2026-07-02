import { describe, it, expect } from 'vitest';
import { buildBuffers } from '../../../src/compose/generator/buffer.js';

describe('buildBuffers', () => {
  it('packs positions and defaults scales to [1, 1, 1]', () => {
    const { positions, scales, colors, attributes } = buildBuffers(
      [{ x: 0 }, { x: 1 }],
      (d) => ({ position: [d.x, 0, 0] }),
    );
    expect(positions).toBeInstanceOf(Float32Array);
    expect(Array.from(positions)).toEqual([0, 0, 0, 1, 0, 0]);
    expect(Array.from(scales)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(colors).toBeNull();
    expect(attributes).toEqual({});
  });

  it('packs explicit scales', () => {
    const { scales } = buildBuffers(
      [{}, {}],
      () => ({ position: [0, 0, 0], scale: [2, 3, 4] }),
    );
    expect(Array.from(scales)).toEqual([2, 3, 4, 2, 3, 4]);
  });

  it('only allocates colors when at least one datum supplies one', () => {
    const { colors } = buildBuffers(
      [{}, {}],
      (d, i) => ({ position: [0, 0, 0], color: i === 1 ? [1, 0, 0] : undefined }),
    );
    expect(colors).toBeInstanceOf(Float32Array);
    expect(Array.from(colors)).toEqual([0, 0, 0, 1, 0, 0]);
  });

  it('infers scalar attribute item size from the first datum that supplies it', () => {
    const { attributes } = buildBuffers(
      [{ phase: 0.1 }, { phase: 0.5 }],
      (d) => ({ position: [0, 0, 0], attributes: { phase: d.phase } }),
    );
    expect(attributes.phase[0]).toBeCloseTo(0.1);
    expect(attributes.phase[1]).toBeCloseTo(0.5);
  });

  it('infers vector attribute item size from an array value', () => {
    const { attributes } = buildBuffers(
      [{ dir: [1, 0] }, { dir: [0, 1] }],
      (d) => ({ position: [0, 0, 0], attributes: { dir: d.dir } }),
    );
    expect(Array.from(attributes.dir)).toEqual([1, 0, 0, 1]);
  });

  it('leaves unset attribute slots as zero for data that omits the attribute', () => {
    const { attributes } = buildBuffers(
      [{ phase: 0.7 }, {}],
      (d) => ({ position: [0, 0, 0], attributes: d.phase === undefined ? {} : { phase: d.phase } }),
    );
    expect(attributes.phase[0]).toBeCloseTo(0.7);
    expect(attributes.phase[1]).toBe(0);
  });

  it('throws TypeError when data is not an array', () => {
    expect(() => buildBuffers('nope', () => ({ position: [0, 0, 0] }))).toThrow(TypeError);
  });
});
