import { glow } from './presets/glow.js';
import { fire } from './presets/fire.js';
import { crackers } from './presets/crackers.js';
import { lightenup } from './presets/lightenup.js';
import { pulse } from './presets/pulse.js';
import { ripple } from './presets/ripple.js';
import { neonEdge } from './presets/neonEdge.js';

/**
 * @typedef {Object} EffectPresetDefinition
 * @property {string} name
 * @property {Object<string, *>} defaultOptions
 * @property {Object<string, string>} schema - Option name → a short type tag ('color'/'number'), for `effects.list()` to surface to docs/tooling.
 * @property {boolean} needsLocalPosition - Whether the harness should pass through an extra `vEffectLocalPos_<slot>` varying for this preset's `fragmentChunk`.
 * @property {(slot: string) => string} uniformDecls - GLSL `uniform`/helper-function declarations for the fragment shader, suffixed by `slot`.
 * @property {(slot: string, options: Object) => Object<string, {value: *}>} buildUniforms - The matching `shader.uniforms` entries.
 * @property {(slot: string) => string} [vertexChunk] - Extra per-vertex GLSL (rare — most presets are fragment-only).
 * @property {(slot: string) => string} fragmentChunk - The preset's own color contribution, gated by the harness's `vEffectPhase_<slot> > 0.001` check.
 */

/** @type {Map<string, EffectPresetDefinition>} */
const registry = new Map();

for (const preset of [glow, fire, crackers, lightenup, pulse, ripple, neonEdge]) {
  registry.set(preset.name, preset);
}

/**
 * Classic Levenshtein edit distance — small, iterative, no dependency,
 * exactly what a "did you mean" suggestion needs (CLAUDE.md §1.2 KISS: no
 * npm package for an ~15-line algorithm used in one place).
 * @param {string} a @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist = Array.from({ length: rows }, (_unused, i) => {
    const row = new Array(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) dist[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(dist[i - 1][j] + 1, dist[i][j - 1] + 1, dist[i - 1][j - 1] + cost);
    }
  }
  return dist[rows - 1][cols - 1];
}

/**
 * The `effects` namespace (CLAUDE.md §5) — `chart.hoverEffect(name)`/
 * `selectEffect(name)` validate against this registry (Fail Fast: unknown
 * `name` throws with a "did you mean" suggestion instead of silently
 * no-op'ing). Strict scope limit (Prompt 150): only these 7 registered
 * presets are accepted — no user-authored/custom GLSL in this prompt (see
 * `docs/concepts/interact.md` for the documented future-work note).
 */
export const effects = {
  /**
   * @returns {{name: string, options: Object<string, string>}[]} Every registered preset's name and option schema, for docs/tooling to enumerate.
   * @example effects.list(); // [{ name: 'glow', options: { color: 'color', intensity: 'number', ... } }, ...]
   */
  list() {
    return [...registry.values()].map((preset) => ({ name: preset.name, options: preset.schema }));
  },

  /**
   * Whether `name` is a registered effect preset.
   *
   * @param {string} name
   * @returns {boolean}
   * @example effects.has('glow'); // true
   */
  has(name) {
    return registry.has(name);
  },

  /**
   * @param {string} name
   * @returns {EffectPresetDefinition}
   * @throws {Error} If `name` isn't registered — includes a Levenshtein "did you mean" suggestion when a close match exists.
   * @example effects.get('glow');
   */
  get(name) {
    const preset = registry.get(name);
    if (preset) return preset;
    const names = [...registry.keys()];
    const closest = names.reduce((best, candidate) => {
      const distance = levenshtein(name, candidate);
      return !best || distance < best.distance ? { name: candidate, distance } : best;
    }, null);
    const suggestion = closest && closest.distance <= 3 ? ` Did you mean '${closest.name}'?` : '';
    throw new Error(
      `Unknown effect '${name}'.${suggestion} Registered effects: ${names.join(', ')}.`,
    );
  },
};
