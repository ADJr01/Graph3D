import fs from 'node:fs';
import path from 'node:path';

// The /example/barChart live demo (site/.vitepress/theme/components/ExampleDemo.vue)
// loads a real HDRI for its scene background/environment. The source file lives in
// the project-root HDRI/ folder (gitignored — a local, developer-supplied asset, not
// a bundled library asset), so it needs copying into site/public/ the same way
// syncPlaygroundLibrary.js copies the built library — except this asset is optional:
// a fresh checkout without HDRI/ populated should still be able to run the docs site,
// just without that one demo's background (ExampleDemo.vue's own setHDR() call
// surfaces the resulting fetch failure, per this project's Fail-Fast rule).

const SOURCE = path.resolve('HDRI/test_industrial_sunset_puresky.exr');
const DEST = path.resolve('site/public/HDRI/test_industrial_sunset_puresky.exr');

if (!fs.existsSync(SOURCE)) {
  console.warn(`syncExampleHdri: ${SOURCE} not found — skipping (the /example/barChart demo's HDRI background will fail to load).`);
} else {
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  fs.copyFileSync(SOURCE, DEST);
  console.log(`syncExampleHdri: copied ${SOURCE} -> ${DEST}`);
}
