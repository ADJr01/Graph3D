import { continuous } from './continuous.js';
import { tickStep } from './ticks.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const YEAR = 365 * DAY;

// Candidate calendar steps, ordered by increasing duration — mirrors d3-time's
// tickIntervals table. `duration` is only used to pick the closest candidate;
// the actual stepping is done with calendar-aware Date field arithmetic below
// so months/years land on real month/year boundaries despite varying length.
const INTERVALS = [
  { unit: 'second', step: 1, duration: SECOND },
  { unit: 'second', step: 5, duration: 5 * SECOND },
  { unit: 'second', step: 15, duration: 15 * SECOND },
  { unit: 'second', step: 30, duration: 30 * SECOND },
  { unit: 'minute', step: 1, duration: MINUTE },
  { unit: 'minute', step: 5, duration: 5 * MINUTE },
  { unit: 'minute', step: 15, duration: 15 * MINUTE },
  { unit: 'minute', step: 30, duration: 30 * MINUTE },
  { unit: 'hour', step: 1, duration: HOUR },
  { unit: 'hour', step: 3, duration: 3 * HOUR },
  { unit: 'hour', step: 6, duration: 6 * HOUR },
  { unit: 'hour', step: 12, duration: 12 * HOUR },
  { unit: 'day', step: 1, duration: DAY },
  { unit: 'day', step: 2, duration: 2 * DAY },
  { unit: 'week', step: 1, duration: WEEK },
  { unit: 'month', step: 1, duration: 30 * DAY },
  { unit: 'month', step: 3, duration: 91 * DAY },
  { unit: 'year', step: 1, duration: YEAR },
];

/** Floors a timestamp to the start of the nearest `step`-multiple of `unit`, in UTC. */
function floorDate(t, unit, step) {
  if (unit === 'millisecond') return Math.floor(t / step) * step;
  const d = new Date(t);
  switch (unit) {
    case 'second':
      d.setUTCMilliseconds(0);
      d.setUTCSeconds(Math.floor(d.getUTCSeconds() / step) * step);
      break;
    case 'minute':
      d.setUTCSeconds(0, 0);
      d.setUTCMinutes(Math.floor(d.getUTCMinutes() / step) * step);
      break;
    case 'hour':
      d.setUTCMinutes(0, 0, 0);
      d.setUTCHours(Math.floor(d.getUTCHours() / step) * step);
      break;
    case 'day':
      d.setUTCHours(0, 0, 0, 0);
      break;
    case 'week':
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - d.getUTCDay());
      break;
    case 'month':
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(1);
      d.setUTCMonth(Math.floor(d.getUTCMonth() / step) * step);
      break;
    case 'year':
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCMonth(0, 1);
      d.setUTCFullYear(Math.floor(d.getUTCFullYear() / step) * step);
      break;
    default:
      break;
  }
  return +d;
}

/** Advances a timestamp by one `step`-multiple of `unit`, in UTC. */
function incrementDate(t, unit, step) {
  if (unit === 'millisecond') return t + step;
  const d = new Date(t);
  switch (unit) {
    case 'second':
      d.setUTCSeconds(d.getUTCSeconds() + step);
      break;
    case 'minute':
      d.setUTCMinutes(d.getUTCMinutes() + step);
      break;
    case 'hour':
      d.setUTCHours(d.getUTCHours() + step);
      break;
    case 'day':
      d.setUTCDate(d.getUTCDate() + step);
      break;
    case 'week':
      d.setUTCDate(d.getUTCDate() + step * 7);
      break;
    case 'month':
      d.setUTCMonth(d.getUTCMonth() + step);
      break;
    case 'year':
      d.setUTCFullYear(d.getUTCFullYear() + step);
      break;
    default:
      break;
  }
  return +d;
}

/** Picks the calendar unit/step whose duration is closest to `(hi - lo) / count`. */
function chooseInterval(lo, hi, count) {
  const target = (hi - lo) / Math.max(count, 1);
  let i = 0;
  while (i < INTERVALS.length && INTERVALS[i].duration < target) i++;
  if (i === INTERVALS.length) {
    return { unit: 'year', step: Math.max(1, Math.round(tickStep(lo / YEAR, hi / YEAR, count))) };
  }
  if (i === 0) {
    return { unit: 'millisecond', step: Math.max(1, Math.round(tickStep(lo, hi, count))) };
  }
  // Geometric (not linear) midpoint between candidates — matches d3-time,
  // and avoids linear distance's bias toward the larger of two candidates.
  const prev = INTERVALS[i - 1];
  const curr = INTERVALS[i];
  return target * target < prev.duration * curr.duration ? prev : curr;
}

function timeTicks(start, stop, count = 10) {
  const startMs = +start;
  const stopMs = +stop;
  if (startMs === stopMs) return count > 0 ? [new Date(startMs)] : [];
  const reverse = stopMs < startMs;
  const lo = reverse ? stopMs : startMs;
  const hi = reverse ? startMs : stopMs;
  const { unit, step } = chooseInterval(lo, hi, count);
  let t = floorDate(lo, unit, step);
  if (t < lo) t = incrementDate(t, unit, step);
  const result = [];
  while (t <= hi) {
    result.push(new Date(t));
    t = incrementDate(t, unit, step);
  }
  return reverse ? result.reverse() : result;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

// ponytail: a fixed subset of strftime-style tokens (%Y %m %d %H %I %M %S %L
// %B %b %a %p), English-only, UTC-only — covers every format this scale's
// own autoFormat needs. Expand the token switch if a chart ever needs more.
function formatDate(date, specifier) {
  return specifier.replace(/%([YmdHIMSLBbap%])/g, (_, token) => {
    switch (token) {
      case 'Y': return String(date.getUTCFullYear());
      case 'm': return pad(date.getUTCMonth() + 1);
      case 'd': return pad(date.getUTCDate());
      case 'H': return pad(date.getUTCHours());
      case 'I': return pad(((date.getUTCHours() + 11) % 12) + 1);
      case 'M': return pad(date.getUTCMinutes());
      case 'S': return pad(date.getUTCSeconds());
      case 'L': return pad(date.getUTCMilliseconds(), 3);
      case 'B': return MONTH_NAMES[date.getUTCMonth()];
      case 'b': return MONTH_NAMES[date.getUTCMonth()].slice(0, 3);
      case 'a': return WEEKDAY_ABBR[date.getUTCDay()];
      case 'p': return date.getUTCHours() < 12 ? 'AM' : 'PM';
      default: return '%';
    }
  });
}

// ponytail: skips D3's day-vs-week-start distinction (a tick that lands on a
// week boundary but not a month boundary is formatted as a day here, not a
// week) — add if week-aligned axes need a visibly different label.
function autoFormat(date) {
  if (date.getUTCMilliseconds()) return formatDate(date, '.%L');
  if (date.getUTCSeconds()) return formatDate(date, ':%S');
  if (date.getUTCMinutes()) return formatDate(date, '%H:%M');
  if (date.getUTCHours()) return formatDate(date, '%H:00');
  if (date.getUTCDate() !== 1) return formatDate(date, '%b %d');
  if (date.getUTCMonth()) return formatDate(date, '%B');
  return formatDate(date, '%Y');
}

/**
 * Creates a time scale: like `scale.linear()`, but the domain is `[Date, Date]`
 * and `ticks()`/`tickFormat()` operate on calendar units (millisecond through
 * year) instead of decimal steps, so an axis over a week gets day ticks while
 * an axis over a decade gets year ticks.
 * @returns {import('./continuous.js').ContinuousScale & {
 *   ticks: (count?: number) => Date[],
 *   tickFormat: (count?: number, specifier?: string) => (date: Date) => string,
 * }}
 * @example
 * const s = scale.time().domain([new Date(2024, 0, 1), new Date(2024, 0, 8)]).range([0, 1]);
 * s.ticks(); // one Date per day
 */
export function time() {
  const s = continuous();
  const rawDomain = s.domain;
  const rawInvert = s.invert;

  /**
   * Get (no args) or set (chainable) the domain as `[Date, Date]`.
   * @param {Array<Date|number>} [arr]
   * @returns {Date[]|object}
   */
  s.domain = function (arr) {
    if (arguments.length === 0) return rawDomain().map((t) => new Date(t));
    return rawDomain(arr);
  };

  /**
   * Maps a range value back to a domain `Date`.
   * @param {number} value
   * @returns {Date}
   */
  s.invert = function (value) {
    return new Date(rawInvert(value));
  };

  s.ticks = function (count = 10) {
    const d = rawDomain();
    return timeTicks(d[0], d[d.length - 1], count);
  };

  s.tickFormat = function (_count = 10, specifier) {
    if (specifier != null) return (date) => formatDate(date, specifier);
    return (date) => autoFormat(date);
  };

  s.copy = function () {
    return time().domain(s.domain()).range(s.range()).clamp(s.clamp());
  };

  return s;
}
