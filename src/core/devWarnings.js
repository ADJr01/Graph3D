/**
 * Whether this is a production build, per `process.env.NODE_ENV` — the same
 * unminified check `Graph3D.devtools` (Prompt 178) uses, checked live (not
 * cached at import time) so it stays testable and reflects the environment
 * at call time. `typeof process !== 'undefined'` guards environments (a raw
 * `<script>` include) where `process` doesn't exist at all.
 * @returns {boolean}
 */
export function isProductionBuild() {
  return typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
}

/**
 * Dev-only diagnostic (Prompt 179): a no-op in production, a tagged
 * `console.warn` otherwise. Relies on the same consumer-bundler dead-code
 * elimination `Graph3D.devtools` (Prompt 178) documents — this library
 * ships one unminified check either way.
 *
 * A `core/` leaf utility, importable directly by any layer — the same
 * "shared cross-cutting infra" precedent `core/GraphDisposal.js` and
 * `core/Graph3DLoop.js` already established (CLAUDE.md §1.4).
 * @param {string} message
 * @returns {void}
 * @example devWarn('GraphChart.data(): render() was never called.');
 */
export function devWarn(message) {
  if (isProductionBuild()) return;
  console.warn(`[Graph3D dev warning] ${message}`);
}
