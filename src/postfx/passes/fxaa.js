import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { PostFX } from '../PostFX.js';

/**
 * `fxaa` — cheap screen-space antialiasing. An alternative to `smaa`; enabling
 * both is redundant (double-blurs edges), not prevented but not recommended.
 *
 * @example graph3d.postfx.enable('fxaa');
 */
PostFX.registerPass('fxaa', {
  order: 90,
  create: () => new FXAAPass(),
});
