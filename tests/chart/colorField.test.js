import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { applyColorField } from '../../src/chart/colorField.js';
import { color, palette } from '../../src/compose/index.js';

function makeChart(colorConfig) {
  const written = [];
  return {
    color: () => colorConfig,
    selection: () => ({
      attr(name, resolve) {
        written.push({ name, resolve });
        return this;
      },
    }),
    written,
  };
}

describe('applyColorField', () => {
  it('is a no-op when .color() has no accessor configured', () => {
    const chart = makeChart({ accessor: null, palette: null });
    applyColorField(chart, [{ v: 1 }]);
    expect(chart.written).toHaveLength(0);
  });

  it('falls back to palette.viridis, fit via color.sequential to data\'s [min, max]', () => {
    const data = [{ v: 0 }, { v: 100 }];
    const chart = makeChart({ accessor: (d) => d.v, palette: null });
    applyColorField(chart, data);

    const expectedScale = color.sequential(palette.viridis, [0, 100]);
    const [{ resolve }] = chart.written;
    expect(resolve(data[0], 0)).toBe(expectedScale(0));
    expect(resolve(data[1], 1)).toBe(expectedScale(100));
  });

  it('fits an explicit continuous palette via color.sequential the same way', () => {
    const data = [{ v: 0 }, { v: 10 }];
    const chart = makeChart({ accessor: (d) => d.v, palette: palette.plasma });
    applyColorField(chart, data);

    const expectedScale = color.sequential(palette.plasma, [0, 10]);
    const [{ resolve }] = chart.written;
    expect(resolve(data[0], 0)).toBe(expectedScale(0));
  });

  it('calls a categorical palette (e.g. palette.category10) directly with the raw datum value, bypassing color.sequential', () => {
    const data = [{ label: 'a' }, { label: 'b' }, { label: 'a' }];
    const chart = makeChart({ accessor: (d) => d.label, palette: palette.category10 });
    applyColorField(chart, data);

    const [{ resolve }] = chart.written;
    const colorA = resolve(data[0], 0);
    const colorB = resolve(data[1], 1);
    // Distinct colors per category — this is the exact bug this test guards
    // against: routing a categorical palette through color.sequential's
    // numeric [min, max] domain-fitting silently collapses every category
    // to the same color (a broken/NaN numeric domain from string inputs).
    expect(colorA).not.toBe(colorB);
    expect(new THREE.Color(colorA).getHexString()).toBe(new THREE.Color(palette.category10('a')).getHexString());
    expect(new THREE.Color(colorB).getHexString()).toBe(new THREE.Color(palette.category10('b')).getHexString());
    // Same key, same color, first-seen-order assignment (repeated 'a').
    expect(resolve(data[2], 2)).toBe(colorA);
  });

  it('works with every categorical palette export (category10, tableau10, accent, dark2, ...)', () => {
    for (const name of ['category10', 'tableau10', 'accent', 'dark2', 'paired', 'pastel', 'set1', 'set2', 'set3']) {
      const chart = makeChart({ accessor: (d) => d.label, palette: palette[name] });
      applyColorField(chart, [{ label: 'x' }, { label: 'y' }]);
      const [{ resolve }] = chart.written;
      expect(resolve({ label: 'x' }, 0)).not.toBe(resolve({ label: 'y' }, 1));
    }
  });
});
