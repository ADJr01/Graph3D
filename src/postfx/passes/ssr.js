import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import { PostFX } from '../PostFX.js';

/**
 * `ssr` needs a solid render-target pipeline (it renders normal/depth/beauty
 * G-buffers and blurs a half-float reflection buffer every frame) — too
 * costly to risk on hardware `CapabilityProbe` already flags as limited.
 * `webgl2`/`floatTextures` are the closest existing signals to a "GPU tier"
 * in this codebase (no dedicated tier score exists — see `skipping_list.md`).
 * @param {import('../../core/CapabilityProbe.js').Capabilities|undefined} capabilities
 * @returns {boolean}
 */
function isWeakGPU(capabilities) {
  if (!capabilities) return false; // unknown — don't block what we can't assess
  return !capabilities.webgl2 || !capabilities.floatTextures;
}

/**
 * `ssr` — screen-space reflections (backs Prompt 111's `material.addPlanarReflection`:
 * pass its returned mirror as `groundReflector` here for a `Reflector`/`SSRPass`
 * pairing). Auto-disables itself on weak GPUs (`CapabilityProbe`-reported) with
 * a `console.warn`, per CLAUDE.md §1.5's capability-driven-fallback exception.
 *
 * @example graph3d.postfx.enable('ssr', { groundReflector: mirror });
 * @example graph3d.postfx.enable('ssr'); // reflects all eligible materials, no ground plane
 */
PostFX.registerPass('ssr', {
  order: 12,
  canEnable: (ctx) => {
    if (isWeakGPU(ctx.capabilities)) {
      console.warn(
        "PostFX: 'ssr' pass disabled — CapabilityProbe reports a weak GPU " +
          '(no WebGL2 and/or no float-texture support). Screen-space reflections ' +
          'need a solid render-target pipeline and would tank frame rate here.',
      );
      return false;
    }
    return true;
  },
  create: ({ scene, camera, renderer, size }, opts) => new SSRPass({
    renderer,
    scene,
    camera,
    width: size.width,
    height: size.height,
    selects: opts.selects ?? null,
    bouncing: opts.bouncing ?? false,
    groundReflector: opts.groundReflector ?? null,
  }),
});
