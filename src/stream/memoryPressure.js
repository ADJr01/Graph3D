/**
 * Heuristic memory-pressure signal (Prompt 168). `performance.memory` is a
 * non-standard, Chromium-only API (`usedJSHeapSize`/`jsHeapSizeLimit`) — the
 * closest thing the web platform exposes to "how close is this page to its
 * heap ceiling." Where it's unavailable (Firefox, Safari, any non-Chromium
 * engine, or an environment with no `performance` global at all), there is
 * no reliable substitute, so this returns `null` rather than guessing —
 * callers should treat `null` as "unknown," not "no pressure."
 *
 * A signal only — this module never acts on it. Pair it with `chart.compact()`/
 * `chart.window(size)` (`chart/GraphChart.js`) yourself, at whatever
 * threshold and polling cadence fits the application; nothing here polls or
 * triggers automatically (CLAUDE.md §1.5: no hidden behavior).
 * @returns {number|null} `usedJSHeapSize / jsHeapSizeLimit`, a ratio in
 *   `[0, 1]` — higher means closer to the heap ceiling — or `null` if the
 *   API isn't available.
 * @example
 * const pressure = memoryPressure();
 * if (pressure !== null && pressure > 0.8) chart.compact();
 */
export function memoryPressure() {
  const mem = typeof performance !== 'undefined' ? performance.memory : undefined;
  if (!mem || typeof mem.usedJSHeapSize !== 'number' || typeof mem.jsHeapSizeLimit !== 'number' || mem.jsHeapSizeLimit === 0) {
    return null;
  }
  return mem.usedJSHeapSize / mem.jsHeapSizeLimit;
}
