// Prompt 176: CI-enforced bundle budgets.
//   - Full library (src/index.js), minified+gzipped, excluding THREE (peer
//     dependency, already `external`): must stay under 200 KB.
//   - A consumer that imports only BarChart (tests/fixtures/bar-chart-only.entry.js)
//     must tree-shake down to a minified+gzipped bundle under 50 KB, and must
//     not contain any of the other eleven chart classes.
import { rollup } from 'rollup';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import { gzipSync } from 'node:zlib';
import { buildWorkerBlob, workerBlobPlugin } from './workerBlobPlugin.js';
import { isThreeImport } from './rollupExternal.js';

const EXTERNAL = isThreeImport;
const FULL_BUDGET_BYTES = 200 * 1024;
const BAR_ONLY_BUDGET_BYTES = 50 * 1024;

const OTHER_CHART_CLASSES = [
  'LineChart',
  'ScatterChart',
  'AreaChart',
  'SurfaceChart',
  'HeatmapChart',
  'NetworkChart',
  'TreeChart',
  'PackChart',
  'PieChart',
  'VolumeChart',
];

/**
 * Bundles `input` and returns both the raw (unminified) code — identifiers
 * are untouched by Rollup, so it's what the tree-shake grep checks — and the
 * minified+gzipped size used for the budget assertion. Terser mangles
 * class/function names by default, which would hide a real tree-shake leak
 * if we grepped the minified output instead.
 * @returns {Promise<{ raw: string, gzipBytes: number }>}
 */
async function bundleAndMeasure(input, blobPlugin) {
  const bundle = await rollup({ input, external: EXTERNAL, plugins: [blobPlugin, resolve()] });
  const raw = (await bundle.generate({ format: 'es' })).output[0].code;
  const minified = (await bundle.generate({ format: 'es', plugins: [terser()] })).output[0].code;
  await bundle.close();
  return { raw, gzipBytes: gzipSync(minified).length };
}

async function main() {
  const blobPlugin = workerBlobPlugin(await buildWorkerBlob());
  let failed = false;

  const full = await bundleAndMeasure('src/index.js', blobPlugin);
  const fullKB = (full.gzipBytes / 1024).toFixed(1);
  const fullOver = full.gzipBytes > FULL_BUDGET_BYTES;
  failed ||= fullOver;
  console.log(
    `${fullOver ? 'FAIL' : 'PASS'} full ESM (min+gz): ${fullKB} KB (budget ${FULL_BUDGET_BYTES / 1024} KB)`,
  );

  const barOnly = await bundleAndMeasure('tests/fixtures/bar-chart-only.entry.js', blobPlugin);
  const barOnlyKB = (barOnly.gzipBytes / 1024).toFixed(1);
  const barOnlyOver = barOnly.gzipBytes > BAR_ONLY_BUDGET_BYTES;
  failed ||= barOnlyOver;
  console.log(
    `${barOnlyOver ? 'FAIL' : 'PASS'} bar-chart-only ESM (min+gz): ${barOnlyKB} KB (budget ${BAR_ONLY_BUDGET_BYTES / 1024} KB)`,
  );

  // Matched against the declaration signature, not a bare word boundary:
  // GraphChart.js's own JSDoc lists every sibling chart type by name
  // ("BarChart, LineChart, ScatterChart, ..."), which would false-positive
  // on a plain \bname\b search since Rollup's raw output keeps comments.
  const leaked = OTHER_CHART_CLASSES.filter((name) => new RegExp(`class ${name}\\b`).test(barOnly.raw));
  if (leaked.length > 0) {
    failed = true;
    console.log(`FAIL bar-chart-only bundle is not tree-shaken, found: ${leaked.join(', ')}`);
  } else {
    console.log('PASS bar-chart-only bundle contains none of the other chart classes');
  }

  if (failed) {
    console.error('Bundle budget check failed.');
    process.exit(1);
  }
}

main();
