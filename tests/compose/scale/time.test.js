import { describe, it, expect } from 'vitest';
import { scale } from '../../../src/compose/scale/index.js';

const UTC = (...args) => new Date(Date.UTC(...args));

describe('scale.time', () => {
  it('domain accepts and returns Date objects', () => {
    const s = scale.time().domain([UTC(2024, 0, 1), UTC(2024, 0, 2)]);
    const d = s.domain();
    expect(d[0]).toBeInstanceOf(Date);
    expect(d[0].getTime()).toBe(UTC(2024, 0, 1).getTime());
  });

  it('maps a date linearly into the range', () => {
    const s = scale.time().domain([UTC(2024, 0, 1), UTC(2024, 0, 2)]).range([0, 1]);
    expect(s(UTC(2024, 0, 1, 12))).toBeCloseTo(0.5);
  });

  it('inverts to a Date', () => {
    const s = scale.time().domain([UTC(2024, 0, 1), UTC(2024, 0, 2)]).range([0, 1]);
    const inverted = s.invert(0.5);
    expect(inverted).toBeInstanceOf(Date);
    expect(inverted.getTime()).toBe(UTC(2024, 0, 1, 12).getTime());
  });

  it('copy is independent and keeps the Date domain', () => {
    const s = scale.time().domain([UTC(2024, 0, 1), UTC(2024, 0, 2)]);
    const c = s.copy();
    c.domain([UTC(2000, 0, 1), UTC(2000, 0, 2)]);
    expect(s.domain()[0].getTime()).toBe(UTC(2024, 0, 1).getTime());
  });

  describe('ticks', () => {
    it('ticks by day across a ten-day span', () => {
      const s = scale.time().domain([UTC(2024, 0, 1), UTC(2024, 0, 11)]);
      const ticks = s.ticks();
      expect(ticks.every((t) => t instanceof Date)).toBe(true);
      expect(ticks.map((t) => t.getTime())).toEqual(
        Array.from({ length: 11 }, (_, i) => UTC(2024, 0, 1 + i).getTime()),
      );
    });

    it('ticks by year across a decade span', () => {
      const s = scale.time().domain([UTC(2000, 0, 1), UTC(2010, 0, 1)]);
      const ticks = s.ticks();
      expect(ticks[0].getUTCFullYear()).toBe(2000);
      expect(ticks[ticks.length - 1].getUTCFullYear()).toBe(2010);
      expect(ticks.every((t) => t.getUTCMonth() === 0 && t.getUTCDate() === 1)).toBe(true);
    });

    it('ticks by hour across a one-day span', () => {
      const s = scale.time().domain([UTC(2024, 0, 1), UTC(2024, 0, 1, 12)]);
      const ticks = s.ticks(6);
      expect(ticks[0].getTime()).toBe(UTC(2024, 0, 1).getTime());
      expect(ticks.every((t) => t.getUTCMinutes() === 0)).toBe(true);
    });

    it('ticks by millisecond across a sub-second span', () => {
      const s = scale.time().domain([UTC(2024, 0, 1, 0, 0, 0, 0), UTC(2024, 0, 1, 0, 0, 0, 100)]);
      const ticks = s.ticks(5);
      expect(ticks.length).toBeGreaterThan(1);
      expect(ticks[ticks.length - 1].getTime() - ticks[0].getTime()).toBeLessThanOrEqual(100);
    });
  });

  describe('tickFormat', () => {
    it('auto-formats a year-aligned tick as a bare year', () => {
      const s = scale.time().domain([UTC(2000, 0, 1), UTC(2010, 0, 1)]);
      expect(s.tickFormat()(UTC(2005, 0, 1))).toBe('2005');
    });

    it('auto-formats a day-aligned tick within a month', () => {
      const s = scale.time().domain([UTC(2024, 0, 1), UTC(2024, 0, 8)]);
      expect(s.tickFormat()(UTC(2024, 0, 3))).toBe('Jan 03');
    });

    it('honors an explicit specifier', () => {
      const s = scale.time().domain([UTC(2024, 0, 1), UTC(2024, 0, 2)]);
      expect(s.tickFormat(10, '%Y-%m-%d')(UTC(2024, 5, 15))).toBe('2024-06-15');
    });
  });
});
