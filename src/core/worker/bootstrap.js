/**
 * Worker entry point — bundled as a self-contained IIFE by Rollup and
 * base64-inlined into `workerBlob.js`. Do NOT import this file directly
 * from the main bundle; use `workerBlob.js` instead.
 *
 * Message protocol (must match WorkerPool.js):
 *   main → worker  { id, task, payload }          — execute a task
 *   main → worker  { type: 'register', name, fn } — register a custom task at runtime
 *   worker → main  { id, result }                 — success
 *   worker → main  { id, error }                  — failure
 */
import { registerTask, handleMessage } from './tasks.js';

const post = self.postMessage.bind(self);

self.onmessage = ({ data }) => {
  if (data?.type === 'register') {
    try {
      // The main thread serialises custom task functions via fn.toString().
      // We reconstruct them here. Requires CSP `unsafe-eval` if the host enforces it.
      const fn = new Function('payload', `return (${data.fn})(payload)`);
      registerTask(data.name, fn);
    } catch (e) {
      // ponytail: swallow + log — a bad registration must not kill the worker
      console.error(`[graph3d worker] Failed to register task '${data.name}':`, e);
    }
    return;
  }
  handleMessage(data, post);
};
