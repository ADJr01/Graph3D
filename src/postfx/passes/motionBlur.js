import { Matrix4, ShaderMaterial, UniformsUtils } from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { PostFX } from '../PostFX.js';
import { configureUniforms, DepthPrepass } from './_shared.js';

const MAX_SAMPLES = 32;

/**
 * Reprojects each pixel's depth through the *previous* frame's
 * view-projection matrix to derive a per-pixel screen-space velocity, then
 * smears the color buffer along it. This is camera-motion blur (moving the
 * camera blurs the frame); it does not track individual objects' own motion,
 * which would require a per-object velocity render pass reaching into
 * `object/` — out of scope for a `postfx/`-only pass (CLAUDE.md §1.4). See
 * `skipping_list.md` for this scope note.
 */
const MotionBlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    currentInverseViewProjection: { value: new Matrix4() },
    previousViewProjection: { value: new Matrix4() },
    strength: { value: 1.0 },
    samples: { value: 16 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform mat4 currentInverseViewProjection;
    uniform mat4 previousViewProjection;
    uniform float strength;
    uniform int samples;
    varying vec2 vUv;

    void main() {
      float depth = unpackRGBAToDepth(texture2D(tDepth, vUv));
      vec4 ndc = vec4(vUv.x * 2.0 - 1.0, vUv.y * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 worldPos = currentInverseViewProjection * ndc;
      worldPos /= worldPos.w;

      vec4 previousClip = previousViewProjection * worldPos;
      vec2 previousUv = previousClip.xy / previousClip.w * 0.5 + 0.5;
      vec2 velocity = (vUv - previousUv) * strength;

      vec4 color = texture2D(tDiffuse, vUv);
      float total = 1.0;
      for (int i = 1; i < ${MAX_SAMPLES}; i++) {
        if (i >= samples) break;
        float t = float(i) / float(samples - 1);
        color += texture2D(tDiffuse, vUv + velocity * (t - 0.5));
        total += 1.0;
      }
      gl_FragColor = color / total;
    }
  `,
};

/** Memoized by {@link getMotionBlurPassClass} — see that function's doc for why this isn't a plain top-level `class ... extends Pass`. */
let MotionBlurPassClass = null;

/**
 * Builds (and memoizes) the `MotionBlurPass` class. Deferred until first
 * call, rather than a plain top-level `class MotionBlurPass extends Pass {}`
 * — same reasoning as `godRays.js`'s `getGodRaysPassClass()` (see that
 * function's doc): a top-level `extends Pass` would crash while the library
 * itself is loading in the UMD `<script>`-tag build without the matching
 * `Pass_js` global, since this module is imported unconditionally by
 * `postfx/index.js` to self-register via `PostFX.registerPass()`. See
 * `improvement.md` initiative (d) PR 2.
 * @returns {typeof Pass}
 */
function getMotionBlurPassClass() {
  if (MotionBlurPassClass !== null) return MotionBlurPassClass;

  /** @augments Pass */
  MotionBlurPassClass = class MotionBlurPass extends Pass {
    /**
     * @param {import('three').Scene} scene
     * @param {import('three').Camera} camera
     * @param {{strength?: number, samples?: number}} [opts={}]
     */
    constructor(scene, camera, opts = {}) {
      super();
      this.scene = scene;
      this.camera = camera;

      this._depth = new DepthPrepass();

      this._previousViewProjection = new Matrix4();
      this._viewProjection = new Matrix4();

      this.uniforms = UniformsUtils.clone(MotionBlurShader.uniforms);
      this.uniforms.strength.value = opts.strength ?? 1.0;
      this.uniforms.samples.value = Math.min(opts.samples ?? 16, MAX_SAMPLES - 1);

      this.material = new ShaderMaterial({
        name: 'MotionBlurShader',
        uniforms: this.uniforms,
        vertexShader: MotionBlurShader.vertexShader,
        fragmentShader: MotionBlurShader.fragmentShader,
      });
      this._fsQuad = new FullScreenQuad(this.material);
    }

    render(renderer, writeBuffer, readBuffer) {
      const oldAutoClear = renderer.autoClear;
      renderer.autoClear = false;

      this._depth.render(renderer, this.scene, this.camera);

      this._viewProjection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
      this.uniforms.currentInverseViewProjection.value.copy(this._viewProjection).invert();
      this.uniforms.previousViewProjection.value.copy(this._previousViewProjection);
      this.uniforms.tDiffuse.value = readBuffer.texture;
      this.uniforms.tDepth.value = this._depth.target.texture;

      if (this.renderToScreen) {
        renderer.setRenderTarget(null);
        this._fsQuad.render(renderer);
      } else {
        renderer.setRenderTarget(writeBuffer);
        renderer.clear();
        this._fsQuad.render(renderer);
      }

      this._previousViewProjection.copy(this._viewProjection);
      renderer.autoClear = oldAutoClear;
    }

    setSize(width, height) {
      this._depth.setSize(width, height);
    }

    dispose() {
      this._depth.dispose();
      this.material.dispose();
      this._fsQuad.dispose();
    }
  };
  return MotionBlurPassClass;
}

/**
 * `motionBlur` — camera-motion-only reprojection blur (see the scope note
 * above the shader definition in this file).
 *
 * @example graph3d.postfx.enable('motionBlur', { strength: 1.0, samples: 16 });
 */
PostFX.registerPass('motionBlur', {
  order: 40,
  create: ({ scene, camera }, opts) => {
    const MotionBlurPass = getMotionBlurPassClass();
    return new MotionBlurPass(scene, camera, opts);
  },
  configure: configureUniforms,
});
