import { describe, it, expect } from 'vitest';
import { heatmap } from '../../../src/compose/generator/heatmap.js';

describe('generator.heatmap()', () => {
  it('positions each cell at [x, y, z] with default 0.8 scale on every axis', () => {
    const gen = heatmap()
      .x((d) => d.col)
      .y(0)
      .z((d) => d.row);
    const buffers = gen.compute([
      { col: 0, row: 0 },
      { col: 1, row: 2 },
    ]);

    expect(Array.from(buffers.positions)).toEqual([0, 0, 0, 1, 0, 2]);
    for (const s of buffers.scales) expect(s).toBeCloseTo(0.8);
  });

  it('defaults x to index, y to the datum itself, and z to 0', () => {
    const gen = heatmap();
    const buffers = gen.compute([3, 5]);
    expect(Array.from(buffers.positions)).toEqual([0, 3, 0, 1, 5, 0]);
  });

  it('.width()/.height()/.depth() override the default cell size', () => {
    const gen = heatmap().width(2).height(0.1).depth(3);
    const buffers = gen.compute([1]);
    expect(buffers.scales[0]).toBeCloseTo(2);
    expect(buffers.scales[1]).toBeCloseTo(0.1);
    expect(buffers.scales[2]).toBeCloseTo(3);
  });

  it('.height() accepts a per-datum accessor, mirroring .width()', () => {
    const gen = heatmap().height((d) => d.h);
    const buffers = gen.compute([{ h: 0.2 }, { h: 0.4 }]);
    expect(buffers.scales[1]).toBeCloseTo(0.2);
    expect(buffers.scales[4]).toBeCloseTo(0.4);
  });
});
