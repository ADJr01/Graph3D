import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { PostFX } from '../PostFX.js';

/**
 * `ssao` — screen-space ambient occlusion, darkening crevices and contact
 * points for depth cues on unlit/flat-shaded charts.
 *
 * @example graph3d.postfx.enable('ssao', { kernelRadius: 8, minDistance: 0.005, maxDistance: 0.1 });
 */
PostFX.registerPass('ssao', {
  order: 10,
  create: ({ scene, camera, size }, opts) => {
    const pass = new SSAOPass(scene, camera, size.width, size.height);
    Object.assign(pass, opts); // kernelRadius/minDistance/maxDistance/output are plain properties
    return pass;
  },
});
