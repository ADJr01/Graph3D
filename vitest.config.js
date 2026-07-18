import { defineConfig } from 'vitest/config';

/**
 * In production builds this virtual module is populated by rollup.config.js's
 * workerBlobPlugin. In tests, we supply an empty stub so workerBlob.js can be
 * imported without a real Rollup build step.
 */
function workerBlobStub() {
  const VIRTUAL_ID = '\0virtual:worker-blob';
  // btoa is a Node 16+ global; we're on Node 20.
  const STUB = btoa('/* test stub: no real worker code */');
  return {
    name: 'worker-blob-stub',
    resolveId(id) {
      if (id === 'virtual:worker-blob') return VIRTUAL_ID;
    },
    load(id) {
      if (id === VIRTUAL_ID) return `export const WORKER_BLOB = '${STUB}';`;
    },
  };
}

export default defineConfig({
  plugins: [workerBlobStub()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 85,
        branches: 80,
        functions: 85,
      },
    },
  },
});
