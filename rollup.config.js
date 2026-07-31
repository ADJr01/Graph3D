import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import { visualizer } from 'rollup-plugin-visualizer';
import { buildWorkerBlob, workerBlobPlugin } from './scripts/workerBlobPlugin.js';
import { isThreeImport } from './scripts/rollupExternal.js';

const INPUT = 'src/index.js';
const EXTERNAL = isThreeImport;

export default async function () {
  const blob = await buildWorkerBlob();
  const blobPlugin = workerBlobPlugin(blob);

  return [
    // ESM — tree-shakeable, for bundlers
    {
      input: INPUT,
      external: EXTERNAL,
      plugins: [blobPlugin, resolve()],
      output: [
        { file: 'dist/graph3d.esm.js', format: 'es' },
        {
          file: 'dist/graph3d.esm.min.js',
          format: 'es',
          plugins: [
            terser(),
            visualizer({ filename: 'dist/stats.html', gzipSize: true, template: 'treemap' }),
          ],
        },
      ],
    },
    // UMD — for <script> tags, global Graph3D
    {
      input: INPUT,
      external: EXTERNAL,
      plugins: [blobPlugin, resolve()],
      output: [
        { file: 'dist/graph3d.umd.js', format: 'umd', name: 'Graph3D', globals: { three: 'THREE' } },
        {
          file: 'dist/graph3d.umd.min.js',
          format: 'umd',
          name: 'Graph3D',
          globals: { three: 'THREE' },
          plugins: [terser()],
        },
      ],
    },
  ];
}
