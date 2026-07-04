import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js';
import { PostFX } from '../PostFX.js';
import { configureUniforms } from './_shared.js';

/**
 * `chromaticAberration` — shifts red/blue channels apart from center.
 *
 * @example graph3d.postfx.enable('chromaticAberration', { amount: 0.005, angle: 0.0 });
 */
PostFX.registerPass('chromaticAberration', {
  order: 70,
  create: (_ctx, opts) => {
    const pass = new ShaderPass(RGBShiftShader);
    configureUniforms(pass, opts);
    return pass;
  },
  configure: configureUniforms,
});
