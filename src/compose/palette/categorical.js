import { categorical } from '../color/categorical.js';

// D3-compatible categorical schemes (exact hex values, for migration ease).

/**
 * Wraps a raw color array into the palette's dual form: calling the
 * returned function cycles colors by first-seen value (built on
 * `color.categorical`, CLAUDE.md §1.1 DRY — no separate cycling logic), and
 * `.colors` exposes the original array for direct use (e.g.
 * `scale.ordinal().range(palette.category10.colors)`), matching the
 * `.colors` convention set by the sequential/diverging palettes. `.categorical`
 * (`true`) tags it as a direct key→color mapping (call it with the raw
 * datum value itself, no `[min, max]` domain-fitting) — the discriminator
 * `chart/colorField.js`'s `applyColorField` (Prompt 139's colorField fix)
 * uses to tell it apart from a continuous ramp like `palette.viridis` (which
 * expects a `t` in `[0, 1]` and needs `color.sequential`'s domain-fitting
 * first). Every sequential/diverging palette leaves `.categorical` unset
 * (falsy), so existing callers checking only `.colors` are unaffected.
 * @param {string[]} colors
 * @returns {{ (value: *): string, colors: string[], categorical: true }}
 */
function schemeToPalette(colors) {
  const fn = categorical(colors);
  fn.colors = colors;
  fn.categorical = true;
  return fn;
}

/** D3 `schemeCategory10`-equivalent — 10 categorical colors. Call with a raw datum value: `category10('apples')`. */
export const category10 = schemeToPalette([
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
]);

/** Tableau's default 10-color categorical scheme. Call with a raw datum value: `tableau10('apples')`. */
export const tableau10 = schemeToPalette([
  '#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f',
  '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab',
]);

/** ColorBrewer's 8-color "Accent" categorical scheme. Call with a raw datum value: `accent('apples')`. */
export const accent = schemeToPalette([
  '#7fc97f', '#beaed4', '#fdc086', '#ffff99', '#386cb0',
  '#f0027f', '#bf5b17', '#666666',
]);

/** ColorBrewer's 8-color "Dark2" categorical scheme. Call with a raw datum value: `dark2('apples')`. */
export const dark2 = schemeToPalette([
  '#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e',
  '#e6ab02', '#a6761d', '#666666',
]);

/** ColorBrewer's 12-color "Paired" categorical scheme. Call with a raw datum value: `paired('apples')`. */
export const paired = schemeToPalette([
  '#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99',
  '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a',
  '#ffff99', '#b15928',
]);

/** ColorBrewer's 9-color "Pastel1" categorical scheme. Call with a raw datum value: `pastel('apples')`. */
export const pastel = schemeToPalette([
  '#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6',
  '#ffffcc', '#e5d8bd', '#fddaec', '#f2f2f2',
]);

/** ColorBrewer's 9-color "Set1" categorical scheme. Call with a raw datum value: `set1('apples')`. */
export const set1 = schemeToPalette([
  '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
  '#ffff33', '#a65628', '#f781bf', '#999999',
]);

/** ColorBrewer's 8-color "Set2" categorical scheme. Call with a raw datum value: `set2('apples')`. */
export const set2 = schemeToPalette([
  '#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854',
  '#ffd92f', '#e5c494', '#b3b3b3',
]);

/** ColorBrewer's 12-color "Set3" categorical scheme. Call with a raw datum value: `set3('apples')`. */
export const set3 = schemeToPalette([
  '#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3',
  '#fdb462', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd',
  '#ccebc5', '#ffed6f',
]);
