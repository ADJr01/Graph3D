/**
 * Diffs `oldData` (bound data, in current selection order) against `newData`
 * — the **single diff authority** behind `Selection.data(newData, keyFn)`
 * (Prompt 78) and, per `prompts.md`, the future `GraphChartDataBinding`
 * (CLAUDE.md §1.1 DRY: one place computes "what entered/updated/exited",
 * never reimplemented per consumer). Pure and backend-agnostic — it only
 * ever reads plain arrays and calls `keyFn`, never touches a `GraphMesh`/
 * `GraphInstancedObject`.
 *
 * Without a `keyFn`, the join is positional (mirrors d3's own default): index
 * `i` in both arrays is "the same" node, so shrinking/growing `newData`
 * exits/enters only the tail. With a `keyFn`, the join is keyed: a `newData`
 * entry updates the `oldData` entry sharing its key (wherever it sits),
 * everything else enters or exits.
 * @param {*[]} oldData
 * @param {*[]} newData
 * @param {(datum: *, index: number) => *} [keyFn]
 * @returns {{
 *   enter: {datum: *, newIndex: number}[],
 *   update: {datum: *, oldIndex: number, newIndex: number}[],
 *   exit: {datum: *, oldIndex: number}[],
 * }}
 * @throws {TypeError} If `oldData`/`newData` are not arrays, or `keyFn` is
 *   provided but not a function.
 * @throws {Error} If `keyFn` produces the same key for two different
 *   `newData` entries (an ambiguous join).
 * @example diffData([{id:1},{id:2}], [{id:2},{id:3}], (d) => d.id);
 * // { enter: [{datum:{id:3},newIndex:1}], update: [{datum:{id:2},oldIndex:1,newIndex:0}], exit: [{datum:{id:1},oldIndex:0}] }
 */
export function diffData(oldData, newData, keyFn) {
  if (!Array.isArray(oldData) || !Array.isArray(newData)) {
    throw new TypeError('diffData: oldData and newData must both be arrays.');
  }
  if (keyFn !== undefined && typeof keyFn !== 'function') {
    throw new TypeError(`diffData: keyFn must be a function, received ${JSON.stringify(keyFn)}.`);
  }

  if (!keyFn) {
    const overlap = Math.min(oldData.length, newData.length);
    const update = [];
    for (let i = 0; i < overlap; i++) update.push({ datum: newData[i], oldIndex: i, newIndex: i });
    const enter = [];
    for (let i = overlap; i < newData.length; i++) enter.push({ datum: newData[i], newIndex: i });
    const exit = [];
    for (let i = overlap; i < oldData.length; i++) exit.push({ datum: oldData[i], oldIndex: i });
    return { enter, update, exit };
  }

  const oldIndexByKey = new Map();
  for (let i = 0; i < oldData.length; i++) oldIndexByKey.set(keyFn(oldData[i], i), i);

  const seenNewKeys = new Set();
  const enter = [];
  const update = [];
  for (let i = 0; i < newData.length; i++) {
    const key = keyFn(newData[i], i);
    if (seenNewKeys.has(key)) {
      throw new Error(`diffData: duplicate key '${String(key)}' at newData[${i}] — keys must be unique within newData.`);
    }
    seenNewKeys.add(key);
    if (oldIndexByKey.has(key)) {
      update.push({ datum: newData[i], oldIndex: oldIndexByKey.get(key), newIndex: i });
      oldIndexByKey.delete(key);
    } else {
      enter.push({ datum: newData[i], newIndex: i });
    }
  }
  const exit = [];
  for (const oldIndex of oldIndexByKey.values()) exit.push({ datum: oldData[oldIndex], oldIndex });
  return { enter, update, exit };
}
