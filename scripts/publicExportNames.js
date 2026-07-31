import fs from 'node:fs';

/**
 * The public export names declared by `src/index.js` — parsed statically
 * (regex over its own `export { A, B } from '...'`/`export const X` lines)
 * rather than executed, since `src/index.js` imports `virtual:worker-blob`
 * (a Rollup/Vite plugin-resolved specifier — see `vitest.config.js`'s own
 * stub for the same problem) which plain `node` can't resolve. `index.js`
 * is a pure re-export barrel with no other logic, so static parsing is both
 * simpler and doesn't need a real module evaluation at all.
 * @param {string} indexFile - absolute path to src/index.js
 * @returns {Set<string>}
 */
export function publicExportNames(indexFile) {
  const source = fs.readFileSync(indexFile, 'utf8');
  const names = new Set();
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  for (const match of source.matchAll(/export\s+const\s+(\w+)/g)) names.add(match[1]);
  return names;
}
