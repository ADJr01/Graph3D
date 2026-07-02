import { defineConfig } from 'vite';
import { buildWorkerBlob, workerBlobPlugin } from './scripts/workerBlobPlugin.js';

// Dev-server counterpart to the workerBlobPlugin wired into rollup.config.js —
// without it, any example importing src/index.js fails to resolve
// `virtual:worker-blob` (src/core/worker/workerBlob.js) and the page never loads.
export default defineConfig(async () => ({
  plugins: [workerBlobPlugin(await buildWorkerBlob())],
}));
