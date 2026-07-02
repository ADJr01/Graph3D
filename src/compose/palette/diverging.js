import { ramp } from './ramp.js';

// ColorBrewer's 11-class diverging schemes, low to high.

export const spectral = ramp([
  '#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#ffffbf',
  '#e6f598', '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2',
]);

export const RdYlBu = ramp([
  '#a50026', '#d73027', '#f46d43', '#fdae61', '#fee090', '#ffffbf',
  '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695',
]);

export const RdBu = ramp([
  '#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7',
  '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061',
]);

export const BrBG = ramp([
  '#543005', '#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#f5f5f5',
  '#c7eae5', '#80cdc1', '#35978f', '#01665e', '#003c30',
]);

export const PiYG = ramp([
  '#8e0152', '#c51b7d', '#de77ae', '#f1b6da', '#fde0ef', '#f7f7f7',
  '#e6f5d0', '#b8e186', '#7fbc41', '#4d9221', '#276419',
]);
