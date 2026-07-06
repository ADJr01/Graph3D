import { describe, it, expect } from 'vitest';
import { pie } from '../../../src/compose/layout/pie.js';

describe('layout.pie defaults', () => {
  it('value defaults to the datum itself, sort defaults to null (input order)', () => {
    const p = pie();
    expect(p.value()(5, 0)).toBe(5);
    expect(p.sort()).toBeNull();
  });

  it('startAngle/endAngle/padAngle default to 0/2π/0', () => {
    const p = pie();
    expect(p.startAngle()).toBe(0);
    expect(p.endAngle()).toBeCloseTo(Math.PI * 2);
    expect(p.padAngle()).toBe(0);
  });

  it('is chainable', () => {
    const p = pie();
    expect(p.value((d) => d)).toBe(p);
    expect(p.sort(() => 0)).toBe(p);
    expect(p.startAngle(0)).toBe(p);
    expect(p.endAngle(Math.PI)).toBe(p);
    expect(p.padAngle(0.1)).toBe(p);
  });
});

describe('layout.pie()(data)', () => {
  it('splits a full 2π sweep proportionally to each value', () => {
    const result = pie()([1, 3]);
    expect(result).toHaveLength(2);
    expect(result[0].startAngle).toBeCloseTo(0);
    expect(result[0].endAngle).toBeCloseTo(Math.PI / 2); // 1/4 of 2π
    expect(result[1].startAngle).toBeCloseTo(Math.PI / 2);
    expect(result[1].endAngle).toBeCloseTo(Math.PI * 2);
  });

  it('tags each entry with its source datum, value, and index', () => {
    const data = [{ v: 1 }, { v: 3 }];
    const result = pie().value((d) => d.v)(data);
    expect(result[0].data).toBe(data[0]);
    expect(result[0].value).toBe(1);
    expect(result[0].index).toBe(0);
    expect(result[1].data).toBe(data[1]);
    expect(result[1].value).toBe(3);
    expect(result[1].index).toBe(1);
  });

  it('returns entries in original data order, even when sort() reorders the sweep', () => {
    const data = [{ v: 1 }, { v: 3 }];
    const result = pie()
      .value((d) => d.v)
      .sort((a, b) => b.v - a.v)(data);
    // Descending by value means datum index 1 (v=3) sweeps first [0, 3/4*2π),
    // then datum index 0 (v=1) sweeps last — but the returned array order
    // still matches `data`'s own order (index 0 first).
    expect(result[0].data).toBe(data[0]);
    expect(result[1].data).toBe(data[1]);
    expect(result[1].startAngle).toBeCloseTo(0);
    expect(result[1].endAngle).toBeCloseTo((Math.PI * 2 * 3) / 4);
    expect(result[0].startAngle).toBeCloseTo((Math.PI * 2 * 3) / 4);
    expect(result[0].endAngle).toBeCloseTo(Math.PI * 2);
  });

  it('honors a custom startAngle/endAngle sweep', () => {
    const result = pie().startAngle(0).endAngle(Math.PI)([1, 1]);
    expect(result[0].startAngle).toBeCloseTo(0);
    expect(result[0].endAngle).toBeCloseTo(Math.PI / 2);
    expect(result[1].endAngle).toBeCloseTo(Math.PI);
  });

  it('inserts padAngle between adjacent slices without changing the total sweep bounds', () => {
    const pad = 0.1;
    const result = pie().padAngle(pad)([1, 1]);
    expect(result[0].startAngle).toBeCloseTo(0);
    expect(result[1].startAngle - result[0].endAngle).toBeCloseTo(pad);
    // d3.pie()'s own padAngle convention: every slice (including the last)
    // reserves a trailing pad, so the last slice's endAngle sits one pad
    // short of the sweep's true end (the "missing" pad is never rendered).
    expect(result[1].endAngle).toBeCloseTo(Math.PI * 2 - pad);
  });

  it('every entry carries padAngle', () => {
    const result = pie().padAngle(0.2)([1, 1]);
    expect(result[0].padAngle).toBe(0.2);
    expect(result[1].padAngle).toBe(0.2);
  });

  it('produces zero-width slices (no NaN) when all values are 0', () => {
    const result = pie()([0, 0]);
    expect(result[0].startAngle).toBe(0);
    expect(result[0].endAngle).toBe(0);
    expect(result[1].startAngle).toBe(0);
    expect(result[1].endAngle).toBe(0);
  });

  it('treats a negative value as 0', () => {
    const result = pie()([1, -5, 1]);
    expect(result[1].value).toBe(0);
    expect(result[1].startAngle).toBe(result[1].endAngle);
  });

  it('throws TypeError when data is not an array', () => {
    expect(() => pie()('nope')).toThrow(TypeError);
  });

  it('throws TypeError for invalid startAngle/endAngle/padAngle', () => {
    expect(() => pie().startAngle('nope')).toThrow(TypeError);
    expect(() => pie().endAngle(NaN)).toThrow(TypeError);
    expect(() => pie().padAngle(Infinity)).toThrow(TypeError);
  });

  it('throws TypeError for a non-function, non-null sort', () => {
    expect(() => pie().sort('nope')).toThrow(TypeError);
  });
});
