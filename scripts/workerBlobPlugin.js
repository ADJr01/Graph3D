import { rollup as buildBundle } from 'rollup';

/**
 * Build `src/core/worker/bootstrap.js` as a self-contained IIFE and return it
 * base64-encoded. Shared by the Rollup library build and the Vite dev server
 * so both resolve `virtual:worker-blob` identically.
 */
export async function buildWorkerBlob() {
  const bundle = await buildBundle({
    input: 'src/core/worker/bootstrap.js',
    // No external: the IIFE must be fully self-contained for blob loading.
  });
  const { output } = await bundle.generate({ format: 'iife', name: '_g3dWorker' });
  await bundle.close();
  // Buffer handles unicode safely; btoa() rejects non-Latin1 chars.
  return Buffer.from(output[0].code, 'utf8').toString('base64');
}

/**
 * Virtual-module plugin (Rollup- and Vite-compatible, same plugin interface)
 * that exposes the pre-built worker blob as:
 *   import { WORKER_BLOB } from 'virtual:worker-blob';
 *
 * @param {string} blob - Base64-encoded worker IIFE source.
 */
export function workerBlobPlugin(blob) {
  const VIRTUAL_ID = '\0virtual:worker-blob';
  return {
    name: 'worker-blob',
    resolveId(id) {
      if (id === 'virtual:worker-blob') return VIRTUAL_ID;
    },
    load(id) {
      if (id === VIRTUAL_ID) return `export const WORKER_BLOB = '${blob}';`;
    },
  };
}
