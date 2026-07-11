import { ramp } from './ramp.js';

// ColorBrewer's 9-class single-hue sequential schemes, low to high.

/** Sequential white → deep-blue colormap. */
export const blues = ramp([
  '#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6',
  '#4292c6', '#2171b5', '#08519c', '#08306b',
]);

/** Sequential white → deep-green colormap. */
export const greens = ramp([
  '#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476',
  '#41ab5d', '#238b45', '#006d2c', '#00441b',
]);

/** Sequential white → deep-orange colormap. */
export const oranges = ramp([
  '#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c',
  '#f16913', '#d94801', '#a63603', '#7f2704',
]);

/** Sequential white → deep-purple colormap. */
export const purples = ramp([
  '#fcfbfd', '#efedf5', '#dadaeb', '#bcbddc', '#9e9ac8',
  '#807dba', '#6a51a3', '#54278f', '#3f007d',
]);

/** Sequential white → deep-red colormap. */
export const reds = ramp([
  '#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a',
  '#ef3b2c', '#cb181d', '#a50f15', '#67000d',
]);

/** Sequential white → black greyscale colormap. */
export const greys = ramp([
  '#ffffff', '#f0f0f0', '#d9d9d9', '#bdbdbd', '#969696',
  '#737373', '#525252', '#252525', '#000000',
]);
