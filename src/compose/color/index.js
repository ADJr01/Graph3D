import { sequential, diverging } from './continuous.js';
import { categorical } from './categorical.js';
import { quantize, quantile, threshold } from './discretize.js';

/** The `color` namespace — D3-flavored color scale factories (CLAUDE.md §5). */
export const color = { sequential, diverging, categorical, quantize, quantile, threshold };
