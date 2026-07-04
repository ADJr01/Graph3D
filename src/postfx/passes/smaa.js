import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { PostFX } from '../PostFX.js';

/**
 * `smaa` — higher-quality screen-space antialiasing than `fxaa`, at higher
 * cost. An alternative to `fxaa`; enabling both is redundant.
 *
 * @example graph3d.postfx.enable('smaa');
 */
PostFX.registerPass('smaa', {
  order: 95,
  create: () => new SMAAPass(),
});
