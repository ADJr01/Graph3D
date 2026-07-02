import { readFileSync, existsSync } from 'fs';

const [baselinePath, currentPath] = process.argv.slice(2);
const THRESHOLD = 0.1; // 10% regression tolerance

if (!existsSync(baselinePath) || !existsSync(currentPath)) {
  console.log('Missing bench results, skipping regression check');
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const current = JSON.parse(readFileSync(currentPath, 'utf8'));

// ponytail: vitest bench JSON shape — files[].benchmarks[].{name,hz}
const byName = (data) => {
  const map = new Map();
  for (const file of data.files ?? []) {
    for (const b of file.benchmarks ?? []) map.set(b.name, b.hz);
  }
  return map;
};

const base = byName(baseline);
const curr = byName(current);
let failed = false;

for (const [name, hz] of curr) {
  const baseHz = base.get(name);
  if (baseHz == null) continue;
  const delta = (hz - baseHz) / baseHz;
  const sign = delta >= 0 ? '+' : '';
  const status = delta < -THRESHOLD ? 'REGRESSION' : 'OK';
  console.log(`${status} ${name}: ${sign}${(delta * 100).toFixed(1)}% (${hz.toFixed(0)} vs ${baseHz.toFixed(0)} hz)`);
  if (delta < -THRESHOLD) failed = true;
}

process.exit(failed ? 1 : 0);
