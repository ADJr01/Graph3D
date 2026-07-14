// Side-effect-only: each module calls `PostFX.registerPass()` on import.
// Imported once from `postfx/index.js` so every built-in pass is available
// the moment `PostFX`/`Graph3D` is imported, matching how `material`/`texture`
// presets are already-registered namespaces rather than opt-in imports.
//
// package.json's `sideEffects` field must list `src/postfx/**` — plain
// `false` (or omitting the field, npm's own default) drops every
// registerPass()/registerPreset() call site in a production tree-shaking
// build, silently emptying every preset and pass registry (verified against
// dist/graph3d.esm.min.js: zero surviving calls). A narrower glob like
// `src/postfx/passes/*.js` does NOT work with @rollup/plugin-node-resolve
// 16.0.3's own glob matching (verified: still dropped 10 of 12 calls) —
// `**` is required, not `*.js`.
import './bloom.js';
import './ssao.js';
import './dof.js';
import './motionBlur.js';
import './colorGrading.js';
import './vignette.js';
import './chromaticAberration.js';
import './filmGrain.js';
import './fxaa.js';
import './smaa.js';
import './outline.js';
import './godRays.js';
import './ssr.js';
