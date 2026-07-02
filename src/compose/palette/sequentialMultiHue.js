import { ramp } from './ramp.js';

// ponytail: each palette below is a reduced set of anchor colors (~10
// stops), linearly ramped via `ramp()` — a close visual approximation of
// the source colormap, not a pixel-exact reproduction of matplotlib's/
// d3-scale-chromatic's full 256-entry lookup table (CLAUDE.md §9 forbids
// adding d3-scale-chromatic as a dependency without justification, and no
// current prompt needs scientific pixel parity). Swap in the full LUT here
// if a consumer ever needs exact parity.

/** Perceptually-uniform dark-purple → teal → yellow-green colormap. */
export const viridis = ramp([
  '#440154', '#482878', '#3e4989', '#31688e', '#26828e',
  '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725',
]);

/** Perceptually-uniform black → purple → orange → pale-yellow colormap. */
export const inferno = ramp([
  '#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60',
  '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4',
]);

/** Perceptually-uniform black → magenta → salmon → pale-yellow colormap. */
export const magma = ramp([
  '#000004', '#180f3e', '#451077', '#721f81', '#9f2f7f',
  '#cd4071', '#f1605d', '#fd9567', '#feca8d', '#fcfdbf',
]);

/** Perceptually-uniform indigo → magenta → orange → yellow colormap. */
export const plasma = ramp([
  '#0d0887', '#47039f', '#7301a8', '#9c179e', '#bd3786',
  '#d8576b', '#ed7953', '#fa9e3b', '#fdc926', '#f0f921',
]);

/** Perceptually-uniform, colorblind-safe navy → grey → gold colormap. */
export const cividis = ramp([
  '#00204d', '#00336f', '#39486b', '#575d6d', '#707173',
  '#8a8779', '#a69d75', '#c4b56c', '#e4cf5b', '#ffea46',
]);

/** High-contrast dark-blue → cyan → green → yellow → red colormap. */
export const turbo = ramp([
  '#30123b', '#4662d8', '#35abf8', '#1ae4b6', '#72fe5e',
  '#c8ef34', '#fabd25', '#fb7d20', '#d34213', '#a01f10', '#7a0402',
]);
