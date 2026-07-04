import { Vector2 } from 'three';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { PostFX } from '../PostFX.js';

/**
 * Applies `selectedObjects` and the color options, converting
 * `visibleEdgeColor`/`hiddenEdgeColor` through `THREE.Color.set()` so both a
 * raw hex number and a `THREE.Color` work — `Object.assign` would instead
 * replace `OutlinePass`'s internal `Color` instances with a bare number,
 * which its `.copy()` calls during render can't consume.
 * @param {OutlinePass} pass
 * @param {Object} opts
 */
function applyOutlineOpts(pass, opts) {
  const { selectedObjects, visibleEdgeColor, hiddenEdgeColor, ...rest } = opts;
  if (selectedObjects) pass.selectedObjects = selectedObjects;
  if (visibleEdgeColor !== undefined) pass.visibleEdgeColor.set(visibleEdgeColor);
  if (hiddenEdgeColor !== undefined) pass.hiddenEdgeColor.set(hiddenEdgeColor);
  Object.assign(pass, rest);
}

/**
 * `outline` — hover/selection highlighting via `OutlinePass`. Prompt 118
 * calls for this to be "auto-wired to the Phase 9 state machine"; Phase 9
 * (`interact/`) doesn't exist yet, and `postfx/` must not import from a layer
 * above it (CLAUDE.md §1.4) even once it does. Instead this pass exposes the
 * exact hook Phase 9 will need: `graph3d.postfx.configure('outline', { selectedObjects })`
 * updates the highlighted set on an already-enabled pass with no extra glue.
 *
 * @example graph3d.postfx.enable('outline', { selectedObjects: [mesh], visibleEdgeColor: 0xffaa00 });
 * @example graph3d.postfx.configure('outline', { selectedObjects: [mesh1, mesh2] });
 */
PostFX.registerPass('outline', {
  order: 5,
  create: ({ scene, camera, size }, opts) => {
    const pass = new OutlinePass(new Vector2(size.width, size.height), scene, camera, opts.selectedObjects ?? []);
    applyOutlineOpts(pass, opts);
    return pass;
  },
  configure: applyOutlineOpts,
});
