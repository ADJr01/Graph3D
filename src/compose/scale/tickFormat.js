import { tickStep } from './ticks.js';

// SI prefixes actually reachable by chart-scale magnitudes; d3-format's full
// table runs y…Y (1e-24…1e24), which is more than any current consumer needs.
const SI_PREFIXES = [
  { exp: -9, symbol: 'n' },
  { exp: -6, symbol: 'µ' },
  { exp: -3, symbol: 'm' },
  { exp: 0, symbol: '' },
  { exp: 3, symbol: 'k' },
  { exp: 6, symbol: 'M' },
  { exp: 9, symbol: 'G' },
  { exp: 12, symbol: 'T' },
];

function siPrefixFor(value) {
  if (value === 0) return SI_PREFIXES[3];
  const rawExp = Math.floor(Math.log10(Math.abs(value)) / 3) * 3;
  const clampedExp = Math.max(
    SI_PREFIXES[0].exp,
    Math.min(SI_PREFIXES[SI_PREFIXES.length - 1].exp, rawExp),
  );
  return SI_PREFIXES.find((p) => p.exp === clampedExp);
}

/** Decimal digits needed so steps of size `step` are distinguishable — d3-format's `precisionFixed`. */
function precisionFixed(step) {
  if (step === 0) return 0;
  return Math.max(0, -Math.floor(Math.log10(Math.abs(step)) + 1e-12));
}

/** `toFixed`, with the "-0.00" gotcha (small negatives rounding to zero) trimmed. */
function formatFixed(value, precision) {
  const formatted = value.toFixed(precision);
  return /^-0(\.0+)?$/.test(formatted) ? formatted.slice(1) : formatted;
}

function parseSpecifier(specifier) {
  if (specifier == null || specifier === '') return { type: 'f', precision: null };
  const match = /^(?:\.(\d+))?(f|s)$/.exec(specifier);
  if (!match) {
    throw new TypeError(
      `tickFormat: unsupported specifier '${specifier}'. Supported: 'f' (fixed) or 's' ` +
        "(SI-prefix), optionally with explicit precision, e.g. '.2f'.",
    );
  }
  return { type: match[2], precision: match[1] == null ? null : Number(match[1]) };
}

/**
 * D3-flavored tick label formatter — the "fixed/precision/SI-prefix basics"
 * subset of `d3-format`'s specifier language (not the full grammar: no fill,
 * align, sign, comma-grouping, etc.). Precision is auto-derived from the
 * tick step (so labels show exactly the digits needed to distinguish
 * adjacent ticks) unless the specifier gives an explicit one.
 * @param {number} start Domain start (as passed to `ticks()`).
 * @param {number} stop Domain stop.
 * @param {number} count Target tick count, used to derive the step size.
 * @param {string} [specifier] `'f'` (fixed, default) or `'s'` (SI-prefix),
 *   optionally prefixed with explicit precision, e.g. `'.2f'`, `'.1s'`.
 * @returns {(value: number) => string}
 * @throws {TypeError} If `specifier` isn't one of the supported forms.
 * @example tickFormat(0, 1, 10)(0.3); // '0.3'
 * @example tickFormat(0, 5000, 5, 's')(1500); // '1.5k'
 */
export function tickFormat(start, stop, count, specifier) {
  const step = tickStep(start, stop, count);
  const { type, precision } = parseSpecifier(specifier);

  if (type === 's') {
    const magnitude = Math.max(Math.abs(start), Math.abs(stop));
    const prefix = siPrefixFor(magnitude);
    const scale10 = 10 ** prefix.exp;
    const p = precision == null ? precisionFixed(step / scale10) : precision;
    return (value) => `${formatFixed(value / scale10, p)}${prefix.symbol}`;
  }

  const p = precision == null ? precisionFixed(step) : precision;
  return (value) => formatFixed(value, p);
}
