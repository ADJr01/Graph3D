/**
 * Folds one `DataStream` chunk (`{added, updated, removed}`, `stream/`'s
 * shape) into `currentData`, producing the next full dataset snapshot —
 * pure bookkeeping, not a join. `GraphChart.stream()` hands the result
 * straight to `data(nextData, keyFn)` + `update()`, the exact same path a
 * manual caller drives (CLAUDE.md §1.1 DRY: no second enter/update/exit
 * computation lives here, only the array-level merge `diffData` itself
 * doesn't do).
 *
 * `updated` and `removed` entries are matched to `currentData` by `keyFn`,
 * same identity rule as `data(arr, keyFn)`'s own join — a `removed`/`updated`
 * entry with no matching key is a no-op removal / an upsert-as-add,
 * respectively (a stream can race with itself; silently ignoring an unknown
 * key would hide that, so treating it as "the closest sane outcome" —
 * ignore, or add it — beats throwing mid-stream over something the caller
 * can't act on immediately).
 * @param {Array} currentData
 * @param {{added: Array, updated: Array, removed: Array}} chunk
 * @param {(datum:*, index:number) => *} keyFn
 * @returns {Array} The next dataset snapshot.
 * @example applyStreamChunk(chart.data(), { added: [row], updated: [], removed: [] }, (d) => d.id);
 */
export function applyStreamChunk(currentData, chunk, keyFn) {
  let next = currentData.slice();

  if (chunk.removed.length > 0) {
    const removedKeys = new Set(chunk.removed.map((datum) => keyFn(datum, undefined)));
    next = next.filter((datum, index) => !removedKeys.has(keyFn(datum, index)));
  }

  const upserts = [...chunk.updated, ...chunk.added];
  if (upserts.length > 0) {
    const indexByKey = new Map(next.map((datum, index) => [keyFn(datum, index), index]));
    for (const datum of upserts) {
      const key = keyFn(datum, undefined);
      const existingIndex = indexByKey.get(key);
      if (existingIndex !== undefined) {
        next[existingIndex] = datum;
      } else {
        indexByKey.set(key, next.length);
        next.push(datum);
      }
    }
  }

  return next;
}
