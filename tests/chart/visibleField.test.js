import { describe, it, expect } from 'vitest';
import { applyVisibleField } from '../../src/chart/visibleField.js';

function makeChart(visibleAccessor) {
  const written = [];
  return {
    visible: () => visibleAccessor,
    selection: () => ({
      attr(name, resolve) {
        written.push({ name, resolve });
        return this;
      },
    }),
    written,
  };
}

describe('applyVisibleField', () => {
  it('is a no-op when .visible() has no accessor configured', () => {
    const chart = makeChart(null);
    applyVisibleField(chart);
    expect(chart.written).toHaveLength(0);
  });

  it("writes chart.visible()'s accessor directly through selection().attr('visible', ...)", () => {
    const fn = (d) => d.value > 0;
    const chart = makeChart(fn);
    applyVisibleField(chart);
    expect(chart.written).toEqual([{ name: 'visible', resolve: fn }]);
  });
});
