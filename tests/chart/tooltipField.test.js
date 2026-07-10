import { describe, it, expect } from 'vitest';
import { resolveTooltipContent } from '../../src/chart/tooltipField.js';

describe('resolveTooltipContent', () => {
  it('calls the configured handler with (datum, index) and returns its result', () => {
    const chart = { tooltip: () => (d, i) => `${d.label}@${i}` };
    expect(resolveTooltipContent(chart, { label: 'a' }, 2)).toBe('a@2');
  });

  it('formats a plain object datum as "key: value" lines when no handler is set', () => {
    const chart = { tooltip: () => null };
    const result = resolveTooltipContent(chart, { value: 42, category: 'x' }, 0);
    expect(result).toBe('value: 42\ncategory: "x"');
  });

  it('stringifies a primitive datum when no handler is set', () => {
    const chart = { tooltip: () => null };
    expect(resolveTooltipContent(chart, 42, 0)).toBe('42');
  });
});
