import { palette } from '../compose/index.js';

const GRADIENT_STOPS = 10;
const SIZE_DOT_MIN_PX = 6;
const SIZE_DOT_GROWTH_PX = 24;

/** @param {Array} data @param {(datum:*, index:number) => number} valueAccessor @returns {[number, number]} */
function domainOf(data, valueAccessor) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = valueAccessor(data[i], i);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/** @param {number} n @returns {string} */
function formatNumber(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * @param {Array} data
 * @param {{accessor: (datum:*, index:number) => *, palette: *}} colorField
 * @returns {HTMLElement}
 */
function buildColorSection(data, colorField) {
  const { accessor: colorAccessor, palette: userPalette } = colorField;
  const section = document.createElement('div');

  if (userPalette?.categorical) {
    const seen = [];
    for (let i = 0; i < data.length; i++) {
      const value = colorAccessor(data[i], i);
      if (!seen.includes(value)) seen.push(value);
    }
    for (const value of seen) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '4px';
      const swatch = document.createElement('span');
      swatch.style.width = '10px';
      swatch.style.height = '10px';
      swatch.style.display = 'inline-block';
      swatch.style.background = userPalette(value);
      const label = document.createElement('span');
      label.textContent = String(value);
      row.appendChild(swatch);
      row.appendChild(label);
      section.appendChild(row);
    }
    return section;
  }

  const [min, max] = domainOf(data, colorAccessor);
  const resolvedPalette = userPalette ?? palette.viridis;
  const stops = Array.from({ length: GRADIENT_STOPS }, (_, i) => resolvedPalette(i / (GRADIENT_STOPS - 1)));
  const bar = document.createElement('div');
  bar.style.width = '100px';
  bar.style.height = '10px';
  bar.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
  const labels = document.createElement('div');
  labels.style.display = 'flex';
  labels.style.justifyContent = 'space-between';
  const minLabel = document.createElement('span');
  minLabel.textContent = formatNumber(min);
  const maxLabel = document.createElement('span');
  maxLabel.textContent = formatNumber(max);
  labels.appendChild(minLabel);
  labels.appendChild(maxLabel);
  section.appendChild(bar);
  section.appendChild(labels);
  return section;
}

/**
 * @param {Array} data
 * @param {(datum:*, index:number) => number} sizeAccessor
 * @returns {HTMLElement}
 */
function buildSizeSection(data, sizeAccessor) {
  const [min, max] = domainOf(data, sizeAccessor);
  const mid = (min + max) / 2;
  const section = document.createElement('div');
  section.style.display = 'flex';
  section.style.alignItems = 'flex-end';
  section.style.gap = '6px';
  for (const value of [min, mid, max]) {
    const wrapper = document.createElement('div');
    wrapper.style.textAlign = 'center';
    const diameter = SIZE_DOT_MIN_PX + (max === min ? 0 : ((value - min) / (max - min)) * SIZE_DOT_GROWTH_PX);
    const dot = document.createElement('span');
    dot.style.display = 'inline-block';
    dot.style.width = `${diameter}px`;
    dot.style.height = `${diameter}px`;
    dot.style.borderRadius = '50%';
    dot.style.background = '#888';
    const label = document.createElement('div');
    label.textContent = formatNumber(value);
    wrapper.appendChild(dot);
    wrapper.appendChild(label);
    section.appendChild(wrapper);
  }
  return section;
}

/**
 * Renders `chart.legend()`'s configured container with a color-encoding
 * section (gradient bar + min/max for a continuous palette, or swatch list
 * for a categorical one) and/or a size-encoding section (three sample dots
 * at the data's min/mid/max `.size()` multiplier), synced to whatever
 * `.color()`/`.size()` are currently configured — a no-op if `.legend()`
 * was never called, or if there's nothing to show. Re-running this clears
 * and rebuilds the container's content each time, so it's safe to call on
 * every `render()`/`update()` (the per-chart-type "sync" pattern every other
 * style field here already follows — CLAUDE.md §1.1 DRY).
 * @param {{legend: () => {container: object}|null, data: () => Array, color: () => {accessor: (Function|null), palette: *}, size: () => ((datum:*, index:number) => *)|null}} chart
 *   Any `GraphChart` subclass — duck-typed to its `legend()`/`data()`/`color()`/`size()` getters.
 */
export function applyLegend(chart) {
  const config = chart.legend();
  if (!config) return;
  const data = chart.data();
  // ponytail: hierarchy charts (TreeChart/PackChart) bind a single root
  // datum, not an array — no per-datum domain to legend-fit, so `.legend()`
  // stays inert for them (same precedent as their other inert inherited fields).
  if (!Array.isArray(data)) return;

  const container = config.container;
  while (container.firstChild) container.removeChild(container.firstChild);

  const colorField = chart.color();
  if (colorField.accessor) container.appendChild(buildColorSection(data, colorField));

  const sizeAccessor = chart.size();
  if (sizeAccessor) container.appendChild(buildSizeSection(data, sizeAccessor));
}
