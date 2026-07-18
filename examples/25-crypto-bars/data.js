// Illustrative sample data — NOT real market prices. Five coins, each with a
// starting price and a coin-specific drift/volatility for a seeded random
// walk (mulberry32 — same tiny PRNG examples/24-GraphHTML-test/data.js
// uses), so every page load renders the same "market" without a network
// fetch or a bundled dataset.

export const COINS = [
  { ticker: 'BTC', color: '#F7931A', price: 62000, drift: 0.4, volatility: 2.2, seed: 1 },
  { ticker: 'ETH', color: '#627EEA', price: 3400, drift: 0.6, volatility: 2.8, seed: 2 },
  { ticker: 'SOL', color: '#14F195', price: 145, drift: 1.1, volatility: 4.5, seed: 3 },
  { ticker: 'DOGE', color: '#C2A633', price: 0.14, drift: -0.3, volatility: 6, seed: 4 },
  { ticker: 'ADA', color: '#0033AD', price: 0.42, drift: 0.2, volatility: 3.5, seed: 5 },
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

const rand = new Map(COINS.map((coin) => [coin.ticker, mulberry32(coin.seed * 7919)]));
const price = new Map(COINS.map((coin) => [coin.ticker, coin.price]));

/** Advances every coin's price one random-walk step and returns the new snapshot. @returns {Array<{ticker: string, color: string, price: number}>} */
export function nextTick() {
  return COINS.map((coin) => {
    const noise = (rand.get(coin.ticker)() * 2 - 1) * coin.volatility;
    const next = Math.max(coin.price * 0.2, price.get(coin.ticker) * (1 + (coin.drift + noise) / 100));
    price.set(coin.ticker, next);
    return { ticker: coin.ticker, color: coin.color, price: next };
  });
}

/** A flat-colored circle + ticker-initial SVG, inlined as a `data:` URI — no network fetch, no brand-logo licensing concern. @param {{ticker: string, color: string}} coin @returns {string} */
export function coinIconDataUri({ ticker, color }) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
    `<circle cx="32" cy="32" r="30" fill="${color}" stroke="#0b0b0f" stroke-width="2"/>` +
    `<text x="32" y="41" font-family="system-ui, sans-serif" font-size="22" font-weight="800" ` +
    `fill="#0b0b0f" text-anchor="middle">${ticker[0]}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
