import fs from 'node:fs';
import path from 'node:path';

// The Monaco playground (docs/.vitepress/theme/components/PlaygroundDemo.vue,
// Prompt 188) runs arbitrary edited code in an isolated iframe document that
// Vite never processes, so `graph3d.js`'s bare specifier can't be resolved
// through the docs site's own module graph the way GalleryDemo.vue's direct
// `src/index.js` import is (see config.mjs's workerBlobPlugin note) — the
// iframe instead resolves it via an import map pointing at a plain static
// file, which `npm run build` (rollup) already produces at
// dist/graph3d.esm.min.js. This script just copies that already-built file
// into docs/public/ (a plain static-asset copy, gitignored like dist/ itself)
// so `predocs:dev`/`predocs:build` can run `npm run build` once and have both
// the library build and the playground's copy stay in sync automatically.

const SOURCE = path.resolve('dist/graph3d.esm.min.js');
const DEST = path.resolve('docs/public/dist/graph3d.esm.js');

if (!fs.existsSync(SOURCE)) {
  throw new Error(`syncPlaygroundLibrary: ${SOURCE} does not exist — run "npm run build" first.`);
}

fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.copyFileSync(SOURCE, DEST);
console.log(`syncPlaygroundLibrary: copied ${SOURCE} -> ${DEST}`);
