/**
 * Wraps construction of something that depends on an unbundled `three/addons`
 * or `three/examples/jsm` submodule (`UnrealBloomPass`, `Line2`, `Pass`,
 * etc.) — a real import in the ESM/CJS builds, but an external global in the
 * UMD `<script>`-tag build (`rollup.config.js`'s UMD output only maps `three`
 * itself, not its 17 addon submodules — see `improvement.md` initiative (d)
 * PR 2's audit). A UMD build loaded without those globals throws a bare
 * `TypeError` the instant `build()` touches the missing import; this catches
 * exactly that and rethrows a clear, actionable error naming the feature and
 * pointing at the ESM build instead. Any other kind of error from `build()`
 * (a real bug, not a missing-global situation) propagates unchanged.
 *
 * A `core/` leaf utility, importable directly by any layer — the same
 * "shared cross-cutting infra" precedent `core/devWarnings.js` and
 * `core/GraphDisposal.js` already established (CLAUDE.md §1.4).
 * @template T
 * @param {string} featureName - What's being built, e.g. `"PostFX 'bloom' pass"`.
 * @param {() => T} build
 * @returns {T}
 * @throws {Error} A clear, actionable error if `build` throws a `TypeError`/
 *   `ReferenceError` (the UMD-without-globals case).
 * @example
 * const pass = guardExternalImport("PostFX 'bloom' pass", () => new UnrealBloomPass(size, strength, radius, threshold));
 */
export function guardExternalImport(featureName, build) {
  try {
    return build();
  } catch (error) {
    if (!(error instanceof TypeError) && !(error instanceof ReferenceError)) throw error;
    throw new Error(
      `${featureName} isn't available in this build. The UMD <script>-tag bundle doesn't include ` +
        "the 'three/addons'/'three/examples/jsm' submodule it depends on — use the ESM build " +
        `instead (an npm install, or 'graph3d.esm.js'). Original error: ${error.message}`,
    );
  }
}
