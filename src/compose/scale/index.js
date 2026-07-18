import { linear } from './linear.js';
import { pow, sqrt } from './pow.js';
import { log } from './log.js';
import { time } from './time.js';
import { ordinal } from './ordinal.js';
import { band, point } from './band.js';
import { bandCenter } from './bandCenter.js';

/** The `scale` namespace — D3-flavored scale factories (CLAUDE.md §5, "Adding New Things"). */
export const scale = { linear, pow, sqrt, log, time, ordinal, band, point };

export { bandCenter };
