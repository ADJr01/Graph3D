import { describe, it, expect } from 'vitest';
import { applyLegend } from '../../src/chart/legendField.js';
import { palette } from '../../src/compose/index.js';

function makeChart({ legendConfig = null, data = [], colorField = { accessor: null, palette: null }, sizeAccessor = null } = {}) {
  return {
    legend: () => legendConfig,
    data: () => data,
    color: () => colorField,
    size: () => sizeAccessor,
  };
}

describe('applyLegend', () => {
  it('is a no-op when legend() was never configured', () => {
    const container = document.createElement('div');
    applyLegend(makeChart({ legendConfig: { container } }));
    expect(container.childNodes.length).toBe(0);

    const noLegendChart = makeChart();
    applyLegend(noLegendChart); // no container to even check — just must not throw
  });

  it('is a no-op when data() is not an array (hierarchy charts)', () => {
    const container = document.createElement('div');
    applyLegend(makeChart({ legendConfig: { container }, data: { root: true }, colorField: { accessor: (d) => d.v, palette: null } }));
    expect(container.childNodes.length).toBe(0);
  });

  it('clears previous content on each call', () => {
    const container = document.createElement('div');
    container.appendChild(document.createElement('span'));
    applyLegend(makeChart({ legendConfig: { container } }));
    expect(container.childNodes.length).toBe(0);
  });

  it('renders a gradient bar with min/max labels for a continuous color field', () => {
    const container = document.createElement('div');
    const data = [{ v: 0 }, { v: 5 }, { v: 10 }];
    applyLegend(makeChart({ legendConfig: { container }, data, colorField: { accessor: (d) => d.v, palette: null } }));

    expect(container.childNodes.length).toBe(1);
    const text = container.textContent;
    expect(text).toContain('0');
    expect(text).toContain('10');
  });

  it('renders swatches for a categorical palette', () => {
    const container = document.createElement('div');
    const data = [{ cat: 'a' }, { cat: 'b' }, { cat: 'a' }];
    applyLegend(makeChart({ legendConfig: { container }, data, colorField: { accessor: (d) => d.cat, palette: palette.category10 } }));

    const section = container.firstChild;
    expect(section.children.length).toBe(2); // one row per distinct category, in first-occurrence order
    expect(section.textContent).toContain('a');
    expect(section.textContent).toContain('b');
  });

  it('renders a size section with min/mid/max sample dots', () => {
    const container = document.createElement('div');
    const data = [{ s: 1 }, { s: 2 }, { s: 3 }];
    applyLegend(makeChart({ legendConfig: { container }, data, sizeAccessor: (d) => d.s }));

    expect(container.childNodes.length).toBe(1);
    const dots = container.firstChild.querySelectorAll('span');
    expect(dots.length).toBe(3);
    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('3');
  });

  it('renders both sections when both color and size are configured', () => {
    const container = document.createElement('div');
    const data = [{ v: 1, s: 1 }, { v: 2, s: 2 }];
    applyLegend(
      makeChart({
        legendConfig: { container },
        data,
        colorField: { accessor: (d) => d.v, palette: null },
        sizeAccessor: (d) => d.s,
      }),
    );

    expect(container.childNodes.length).toBe(2);
  });
});
