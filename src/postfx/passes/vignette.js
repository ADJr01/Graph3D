import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { PostFX } from '../PostFX.js';
import { configureUniforms } from './_shared.js';

/**
 * `vignette` — darkens the frame's corners.
 *
 * @example graph3d.postfx.enable('vignette', { offset: 1.0, darkness: 1.0 });
 */
PostFX.registerPass('vignette', {
  order: 60,
  create: (_ctx, opts) => {
    const pass = new ShaderPass(VignetteShader);
    configureUniforms(pass, opts);
    return pass;
  },
  configure: configureUniforms,
});
