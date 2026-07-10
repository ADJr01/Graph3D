import { smooth } from './smooth.js';
import { decimate } from './decimate.js';
import { aggregate } from './aggregate.js';
import { normalize } from './normalize.js';
import { sort } from './sort.js';

/**
 * The `transform` namespace (CLAUDE.md §5) — pure data-in, data-out
 * middleware factories for `chart.use()` (Prompt 142). Each function takes
 * its configuration up front and returns a plain `(data) => data` middleware
 * — no chainable configuration, unlike `generator`/`layout`'s factories,
 * since no current prompt needs more than each one's fixed argument list
 * (YAGNI). `smooth` (moving average) and `decimate` (uniform-stride
 * downsampling) reshape a `number[]`/array by position; `aggregate` groups
 * and reduces; `normalize` rescales one named field to `[0, 1]`; `sort` is
 * the same comparator `chart.sort()` takes, exposed here so it can be
 * interleaved with the others inside one `.use()` pipeline.
 */
export const transform = { smooth, decimate, aggregate, normalize, sort };
