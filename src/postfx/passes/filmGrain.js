import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { PostFX } from '../PostFX.js';
import { configureUniforms } from './_shared.js';

/**
 * `filmGrain` — animated grain, optionally grayscale.
 *
 * @example graph3d.postfx.enable('filmGrain', { intensity: 0.5, grayscale: false });
 */
PostFX.registerPass('filmGrain', {
  order: 80,
  create: (_ctx, opts) => new FilmPass(opts.intensity ?? 0.5, opts.grayscale ?? false),
  configure: configureUniforms,
});
