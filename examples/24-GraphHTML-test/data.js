// Illustrative sample data — NOT real historical crypto prices. Each coin is
// indexed to 100 at Week 1 (a standard "performance index" convention, like
// a stock index) and random-walked forward with a coin-specific drift/
// volatility so the ten weeks tell a clear, varied story (a steady climber,
// a volatile wildcard, a slow bleed, ...) — deterministic via a small seeded
// PRNG so every page load renders the exact same "race" without a network
// fetch or a bundled dataset.

export const WEEK_COUNT = 10;
export const WEEKS = Array.from({ length: WEEK_COUNT }, (_, i) => `Week ${i + 1}`);

export const COINS = [
  { ticker: 'ETH', name: 'Ethereum', color: '#627EEA', drift: 3.0, volatility: 4, seed: 1 },
  { ticker: 'SOL', name: 'Solana', color: '#14F195', drift: 2.2, volatility: 9, seed: 2 },
  { ticker: 'BNB', name: 'BNB', color: '#F0B90B', drift: 1.1, volatility: 3, seed: 3 },
  { ticker: 'TRON', name: 'TRON', color: '#EF0027', drift: -1.6, volatility: 5, seed: 4 },
  { ticker: 'SUI', name: 'Sui', color: '#4DA2FF', drift: 2.6, volatility: 7, seed: 5 },
];

/** Tiny deterministic PRNG (mulberry32) — no dependency needed for cosmetic demo noise. @param {number} seed @returns {() => number} */
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One coin's full 10-week index series, starting at 100.
 * @param {{ drift: number, volatility: number, seed: number }} coin
 * @returns {number[]}
 */
function buildSeries({ drift, volatility, seed }) {
  const rand = mulberry32(seed * 7919);
  const series = [100];
  for (let week = 1; week < WEEK_COUNT; week++) {
    const noise = (rand() * 2 - 1) * volatility;
    const next = series[week - 1] * (1 + (drift + noise) / 100);
    series.push(Math.max(20, next));
  }
  return series;
}

/** @type {Map<string, number[]>} ticker -> 10-week index series */
export const SERIES = new Map(COINS.map((coin) => [coin.ticker, buildSeries(coin)]));

/** The highest index value any coin reaches across all 10 weeks — used to size the value axis with headroom. @type {number} */
export const MAX_INDEX = Math.max(...[...SERIES.values()].flat());

/**
 * @param {number} weekIndex 0-based week index (0 = Week 1).
 * @returns {Array<{ ticker: string, name: string, color: string, index: number }>}
 */
export function rowsForWeek(weekIndex) {
  return COINS.map((coin) => ({
    ticker: coin.ticker,
    name: coin.name,
    color: coin.color,
    index: SERIES.get(coin.ticker)[weekIndex],
  }));
}
