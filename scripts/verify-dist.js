// Verifies the committed dist/ release build actually works, not just that
// `npm run build` exited 0. Two things a green build can still get wrong:
// tree-shaking/minification silently dropping or renaming a public export,
// and the UMD bundle failing to produce valid UMD boilerplate. Run after
// `npm run build` (see the "release" npm script) — never against a stale
// dist/, so this always reflects the artifacts about to be committed.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { publicExportNames } from './publicExportNames.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const INDEX_FILE = path.join(ROOT, 'src', 'index.js');

const REQUIRED_FILES = ['graph3d.esm.js', 'graph3d.esm.min.js', 'graph3d.umd.js', 'graph3d.umd.min.js'];

let failed = false;

/** @param {boolean} ok @param {string} message */
function check(ok, message) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`);
  if (!ok) failed = true;
}

async function main() {
  for (const name of REQUIRED_FILES) {
    const size = fs.existsSync(path.join(DIST_DIR, name)) ? fs.statSync(path.join(DIST_DIR, name)).size : 0;
    check(size > 0, `dist/${name} exists and is non-empty (${size} bytes)`);
  }
  if (failed) {
    console.error('Missing dist artifacts — run `npm run build` first.');
    process.exit(1);
  }

  // Export surface: every name src/index.js declares must survive the ESM
  // build (unminified and minified) unchanged — a tree-shake/mangle bug
  // would silently drop or rename one.
  const expectedNames = [...publicExportNames(INDEX_FILE)].sort();
  for (const file of ['graph3d.esm.js', 'graph3d.esm.min.js']) {
    const mod = await import(pathToFileURL(path.join(DIST_DIR, file)).href);
    const actualNames = Object.keys(mod).sort();
    check(
      JSON.stringify(actualNames) === JSON.stringify(expectedNames),
      `dist/${file} exports match src/index.js (${actualNames.length} names)`,
    );
  }

  // Functional smoke test against the minified bundle specifically — the
  // one artifact terser has actually mangled/rewritten, so it's the one
  // most likely to expose a real minification bug rather than a build
  // config typo.
  const min = await import(pathToFileURL(path.join(DIST_DIR, 'graph3d.esm.min.js')).href);
  check(typeof min.VERSION === 'string' && min.VERSION.length > 0, `VERSION is exported ("${min.VERSION}")`);
  check(min.scale.linear().domain([0, 10]).range([0, 100])(5) === 50, 'scale.linear() computes correctly');
  check(min.scale.band().domain(['a', 'b']).range([0, 10]).bandwidth() > 0, 'scale.band() computes correctly');
  check(
    typeof min.color.categorical(['#f00', '#0f0'])('a') === 'string',
    'color.categorical() returns a color string',
  );
  check(min.resolve('linear')(0.5) === 0.5, 'anim resolve("linear") returns the identity curve');
  check(typeof min.Graph3D === 'function', 'Graph3D is exported as a constructor');
  check(typeof min.BarChart === 'function', 'BarChart is exported as a constructor');

  // UMD outputs aren't executed here (they'd need a THREE global + DOM/WebGL
  // stack, which the rest of the test suite already exercises against
  // src/) — just confirm Rollup actually emitted valid UMD boilerplate for
  // the declared library name.
  for (const file of ['graph3d.umd.js', 'graph3d.umd.min.js']) {
    const source = fs.readFileSync(path.join(DIST_DIR, file), 'utf8');
    check(source.includes('typeof exports') && source.includes('Graph3D'), `dist/${file} has valid UMD boilerplate`);
  }

  if (failed) {
    console.error('\ndist verification failed.');
    process.exit(1);
  }
  console.log('\ndist verification passed.');
}

main();
