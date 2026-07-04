import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { PostFX } from '../PostFX.js';
import { configureUniforms } from './_shared.js';

/**
 * `dof` — depth-of-field bokeh blur. `focus` is in world units from the
 * camera; `aperture` and `maxblur` control blur strength/radius.
 *
 * @example graph3d.postfx.enable('dof', { focus: 10, aperture: 0.025, maxblur: 1.0 });
 */
PostFX.registerPass('dof', {
  order: 30,
  create: ({ scene, camera }, opts) => new BokehPass(scene, camera, opts),
  configure: configureUniforms,
});
