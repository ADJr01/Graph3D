// Side-effect-only: each module calls `PostFX.registerPass()` on import.
// Imported once from `postfx/index.js` so every built-in pass is available
// the moment `PostFX`/`Graph3D` is imported, matching how `material`/`texture`
// presets are already-registered namespaces rather than opt-in imports.
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
