import { readdirSync, writeFileSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const OUT = join(ROOT, 'bench-results.json');

// Scenario file contract: export default [{ name: string, fn: () => any }]

async function measure(fn) {
  // warmup: run for 100 ms, let JIT settle
  const warmupEnd = performance.now() + 100;
  while (performance.now() < warmupEnd) fn();

  // measure for 1 s, count iterations
  let count = 0;
  const end = performance.now() + 1000;
  while (performance.now() < end) {
    fn();
    count++;
  }
  return count; // ops/sec (measured over exactly 1 s)
}

async function main() {
  const files = readdirSync(__dir)
    .filter((f) => f.endsWith('.bench.js'))
    .sort();

  if (files.length === 0) {
    console.log('bench/harness: no *.bench.js files — writing empty results');
    writeFileSync(OUT, JSON.stringify({ files: [] }, null, 2));
    return;
  }

  const report = { files: [] };

  for (const file of files) {
    const { default: scenarios } = await import(join(__dir, file));
    const benchmarks = [];
    console.log(`\n${file}`);

    for (const { name, fn } of scenarios) {
      const hz = await measure(fn);
      benchmarks.push({ name, hz });
      console.log(`  ${name}: ${hz.toLocaleString()} ops/sec`);
    }

    report.files.push({ name: relative(ROOT, join(__dir, file)), benchmarks });
  }

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
