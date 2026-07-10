// Illustrative, rounded year-end market-cap figures ($ billions) for seven
// well-known tech companies, 2015–2024 — approximated from public reporting
// for demo purposes only. NOT real-time financial data; do not use for any
// investment decision. Chosen because the real trend (NVIDIA's 2023–2024
// run past Apple/Microsoft, Tesla's 2021 spike) produces genuine rank swaps,
// which is the whole point of this example (bar-chart-race via
// `.sort()` + `.transition()` + a keyed `update()` join — see `main.js`).

export const YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

export const COMPANIES = ['Apple', 'Microsoft', 'Alphabet', 'Amazon', 'NVIDIA', 'Meta', 'Tesla'];

export const TICKERS = {
  Apple: 'AAPL',
  Microsoft: 'MSFT',
  Alphabet: 'GOOGL',
  Amazon: 'AMZN',
  NVIDIA: 'NVDA',
  Meta: 'META',
  Tesla: 'TSLA',
};

// One array per company, one value per entry in YEARS, in $ billions.
export const MARKET_CAP_BILLIONS = {
  Apple: [583, 609, 861, 748, 1287, 2255, 2901, 2066, 2994, 3500],
  Microsoft: [441, 483, 660, 780, 1203, 1682, 2525, 1787, 2795, 3100],
  Alphabet: [528, 539, 729, 723, 923, 1185, 1922, 1155, 1756, 2150],
  Amazon: [318, 356, 566, 734, 916, 1634, 1691, 856, 1571, 2000],
  NVIDIA: [17, 32, 118, 81, 144, 323, 735, 359, 1223, 3600],
  Meta: [296, 332, 513, 375, 585, 778, 936, 320, 909, 1350],
  Tesla: [31, 32, 53, 59, 76, 669, 1061, 389, 790, 1250],
};

/** @returns {Array<{name:string, ticker:string, value:number}>} One row per company for `YEARS[yearIndex]`. */
export function rowsForYearIndex(yearIndex) {
  return COMPANIES.map((name) => ({
    name,
    ticker: TICKERS[name],
    value: MARKET_CAP_BILLIONS[name][yearIndex],
  }));
}
