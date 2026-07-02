import { viridis, inferno, magma, plasma, cividis, turbo } from './sequentialMultiHue.js';
import { warm, cool, rainbow, sinebow } from './parametric.js';
import { spectral, RdYlBu, RdBu, BrBG, PiYG } from './diverging.js';
import { blues, greens, oranges, purples, reds, greys } from './sequentialSingleHue.js';
import { category10, tableau10, accent, dark2, paired, pastel, set1, set2, set3 } from './categorical.js';
import { interpolateRGB, interpolateHSL, interpolateLAB, fromCSS } from './custom.js';

/**
 * The `palette` namespace (CLAUDE.md §5). Sequential/diverging entries are
 * `(t) => '#rrggbb'` ramps for `color.sequential()`/`color.diverging()`,
 * each with a precomputed `.colors` 256-step array for instance color
 * buffers. Categorical entries (`category10`, `tableau10`, `accent`,
 * `dark2`, `paired`, `pastel`, `set1`, `set2`, `set3`) are cycling functions
 * built on `color.categorical()`, each with its raw D3-compatible color
 * array on `.colors` for direct migration use. `interpolateRGB/HSL/LAB` and
 * `fromCSS` (Prompt 63) build custom ramps from user-supplied colors.
 */
export const palette = {
  viridis,
  inferno,
  magma,
  plasma,
  cividis,
  turbo,
  warm,
  cool,
  rainbow,
  sinebow,
  spectral,
  RdYlBu,
  RdBu,
  BrBG,
  PiYG,
  blues,
  greens,
  oranges,
  purples,
  reds,
  greys,
  category10,
  tableau10,
  accent,
  dark2,
  paired,
  pastel,
  set1,
  set2,
  set3,
  interpolateRGB,
  interpolateHSL,
  interpolateLAB,
  fromCSS,
};
