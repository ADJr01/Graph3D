import {
  MeshDepthMaterial,
  NearestFilter,
  NoBlending,
  RGBADepthPacking,
  WebGLRenderTarget,
} from 'three';

/**
 * Writes each `opts` entry into `pass.uniforms[key].value`. Some Three.js
 * postprocessing passes (`BokehPass`, `FilmPass`, and any plain `ShaderPass`
 * built from a raw shader object like `RGBShiftShader`/`VignetteShader`)
 * only expose their tunables through `.uniforms`, not plain instance
 * properties — so `PostFX.configure()`'s default `Object.assign(pass, opts)`
 * would silently set dead properties on them instead of the uniform itself.
 * Passes that DO expose plain properties (`UnrealBloomPass`, `SSAOPass`,
 * `LUTPass`) don't need this — `Object.assign` already works for them.
 *
 * @param {*} pass
 * @param {Object} opts
 * @example configure: (pass, opts) => configureUniforms(pass, opts)
 */
export function configureUniforms(pass, opts) {
  for (const [key, value] of Object.entries(opts)) {
    pass.uniforms[key].value = value;
  }
}

/**
 * Renders scene depth (`RGBADepthPacking`) into an offscreen target, mirroring
 * `BokehPass`'s/`SSAOPass`'s established depth-prepass idiom. Shared by any
 * pass that needs scene depth outside the main color buffer — `motionBlur`
 * (reprojects depth through the previous frame) and `godRays` (tests whether
 * a marched sample point is background/sky) both use this (CLAUDE.md §1.1 DRY:
 * `motionBlur` had it first; `godRays` is the second use, so it moved here).
 */
export class DepthPrepass {
  constructor() {
    this.material = new MeshDepthMaterial({
      depthPacking: RGBADepthPacking,
      blending: NoBlending,
    });
    this.target = new WebGLRenderTarget(1, 1, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
    });
  }

  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').Scene} scene
   * @param {import('three').Camera} camera
   */
  render(renderer, scene, camera) {
    const previousOverride = scene.overrideMaterial;
    scene.overrideMaterial = this.material;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = previousOverride;
  }

  /**
   * @param {number} width
   * @param {number} height
   */
  setSize(width, height) {
    this.target.setSize(width, height);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
  }
}
