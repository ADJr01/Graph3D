import { describe, it, expect } from 'vitest';
import { stack } from '../../../src/compose/layout/stack.js';

const data = [
  { a: 1, b: 2 },
  { a: 3, b: 4 },
];

// Points and series carry extra own properties (.data, .key, .index) that
// toEqual would otherwise compare against plain array literals; strip them
// via the array iterator, which only yields indexed elements.
const plain = (series) => [...series].map((point) => [...point]);

describe('layout.stack defaults', () => {
  it('keys defaults to empty, value defaults to datum[key]', () => {
    const s = stack();
    expect(s.keys()(data)).toEqual([]);
    expect(s.value()({ a: 5 }, 'a')).toBe(5);
  });

  it('is chainable', () => {
    const s = stack();
    expect(s.keys(['a'])).toBe(s);
    expect(s.value((d, k) => d[k])).toBe(s);
    expect(s.order((series) => series.map((_, i) => i))).toBe(s);
    expect(s.offset(() => {})).toBe(s);
  });
});

describe('layout.stack(data)', () => {
  it('stacks each key on top of the previous one, baseline at 0', () => {
    const series = stack().keys(['a', 'b'])(data);
    expect(series).toHaveLength(2);
    expect(series[0].key).toBe('a');
    expect(plain(series[0])).toEqual([
      [0, 1],
      [0, 3],
    ]);
    expect(series[1].key).toBe('b');
    expect(plain(series[1])).toEqual([
      [1, 3],
      [3, 7],
    ]);
  });

  it('holds the previous top over a NaN value instead of breaking the stack', () => {
    const withGap = [{ a: 1, b: NaN }];
    const series = stack().keys(['a', 'b'])(withGap);
    expect(plain(series[1])).toEqual([[1, NaN]]);
  });

  it('carries the last valid top forward past a NaN series, for the series after it', () => {
    const withGap = [{ a: 1, b: NaN, c: 5 }];
    const series = stack().keys(['a', 'b', 'c'])(withGap);
    expect(plain(series[2])).toEqual([[1, 6]]);
  });

  it('assigns series.index in keys() order by default', () => {
    const series = stack().keys(['a', 'b'])(data);
    expect(series[0].index).toBe(0);
    expect(series[1].index).toBe(1);
  });

  it('tags each stacked point with its source datum', () => {
    const series = stack().keys(['a', 'b'])(data);
    expect(series[0][0].data).toBe(data[0]);
    expect(series[1][1].data).toBe(data[1]);
  });

  it('honors a custom value accessor', () => {
    const series = stack()
      .keys(['a'])
      .value((d, key) => d[key] * 10)(data);
    expect(plain(series[0])).toEqual([
      [0, 10],
      [0, 30],
    ]);
  });

  it('honors a custom order function (reversed)', () => {
    const series = stack()
      .keys(['a', 'b'])
      .order((s) => s.map((_, i) => i).reverse())(data);
    // 'b' is stacked first (baseline), then 'a' on top of it.
    expect(plain(series[1])).toEqual([
      [0, 2],
      [0, 4],
    ]); // key 'b'
    expect(plain(series[0])).toEqual([
      [2, 3],
      [4, 7],
    ]); // key 'a'
  });

  it('honors a custom offset function', () => {
    const series = stack()
      .keys(['a', 'b'])
      .offset(() => {})(data); // no-op offset leaves points at their initial [0, value]
    expect(plain(series[0])).toEqual([
      [0, 1],
      [0, 3],
    ]);
    expect(plain(series[1])).toEqual([
      [0, 2],
      [0, 4],
    ]);
  });

  it('throws TypeError when data is not an array', () => {
    expect(() => stack().keys(['a'])('nope')).toThrow(TypeError);
  });
});
