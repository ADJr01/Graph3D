import { Matrix4, ShaderMaterial, UniformsUtils, Vector2, Vector3 } from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { PostFX } from '../PostFX.js';
import { configureUniforms, DepthPrepass } from './_shared.js';

const MAX_SAMPLES = 64;

/**
 * Screen-space volumetric light scattering ("god rays"): marches from each
 * pixel toward the light's projected screen position, accumulating
 * brightness only where the depth prepass shows background (no geometry in
 * front of the light). This is the standard cheap approximation used by most
 * real-time renderers — not a true participating-media raymarch through the
 * fog volume itself. See `skipping_list.md`.
 */
const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    lightScreenPosition: { value: new Vector2(0.5, 0.5) },
    exposure: { value: 0.25 },
    decay: { value: 0.95 },
    density: { value: 0.7 },
    weight: { value: 0.4 },
    samples: { value: 48 },
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
    uniform vec2 lightScreenPosition;
    uniform float exposure;
    uniform float decay;
    uniform float density;
    uniform float weight;
    uniform int samples;
    varying vec2 vUv;

    void main() {
      vec3 sceneColor = texture2D(tDiffuse, vUv).rgb;
      vec2 texCoord = vUv;
      vec2 deltaTexCoord = (texCoord - lightScreenPosition) * (density / float(${MAX_SAMPLES}));

      vec3 rays = vec3(0.0);
      float illuminationDecay = 1.0;
      for (int i = 0; i < ${MAX_SAMPLES}; i++) {
        if (i >= samples) break;
        texCoord -= deltaTexCoord;
        float depth = unpackRGBAToDepth(texture2D(tDepth, texCoord));
        float isBackground = depth > 0.9999 ? 1.0 : 0.0;
        rays += vec3(isBackground) * weight * illuminationDecay;
        illuminationDecay *= decay;
      }

      gl_FragColor = vec4(sceneColor + rays * exposure, 1.0);
    }
  `,
};

/**
 * @augments Pass
 */
class GodRaysPass extends Pass {
  /**
   * @param {import('three').Scene} scene
   * @param {import('three').Camera} camera
   * @param {import('three').Object3D} light - Any object with a world
   *   position (`DirectionalLight`/`PointLight`/`SpotLight`); for directional
   *   lights this is the point they shine *from*, matching Three.js's own
   *   `position` → `target` convention.
   * @param {{exposure?: number, decay?: number, density?: number, weight?: number, samples?: number}} [opts={}]
   */
  constructor(scene, camera, light, opts = {}) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.light = light;

    this._depth = new DepthPrepass();
    this._viewProjection = new Matrix4();
    this._lightWorldPosition = new Vector3();

    this.uniforms = UniformsUtils.clone(GodRaysShader.uniforms);
    this.uniforms.exposure.value = opts.exposure ?? 0.25;
    this.uniforms.decay.value = opts.decay ?? 0.95;
    this.uniforms.density.value = opts.density ?? 0.7;
    this.uniforms.weight.value = opts.weight ?? 0.4;
    this.uniforms.samples.value = Math.min(opts.samples ?? 48, MAX_SAMPLES - 1);

    this.material = new ShaderMaterial({
      name: 'GodRaysShader',
      uniforms: this.uniforms,
      vertexShader: GodRaysShader.vertexShader,
      fragmentShader: GodRaysShader.fragmentShader,
    });
    this._fsQuad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    this._depth.render(renderer, this.scene, this.camera);

    this.light.getWorldPosition(this._lightWorldPosition);
    this._viewProjection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    const screen = this._lightWorldPosition.clone().applyMatrix4(this._viewProjection);
    this.uniforms.lightScreenPosition.value.set(screen.x * 0.5 + 0.5, screen.y * 0.5 + 0.5);

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
  }

  setSize(width, height) {
    this._depth.setSize(width, height);
  }

  dispose() {
    this._depth.dispose();
    this.material.dispose();
    this._fsQuad.dispose();
  }
}

/**
 * Finds the first real light (directional/point/spot) in the scene to use as
 * the god-rays source when the caller doesn't supply one explicitly.
 * @param {import('three').Scene} scene
 * @returns {import('three').Object3D|null}
 */
function findLight(scene) {
  let found = null;
  scene.traverse((object) => {
    if (!found && (object.isDirectionalLight || object.isPointLight || object.isSpotLight)) {
      found = object;
    }
  });
  return found;
}

/**
 * `configureUniforms` handles the numeric tunables, but `light` is a
 * structural reference (re-projected every frame in `render()`), not a
 * uniform — routing it through `configureUniforms` would crash on
 * `pass.uniforms.light`, which doesn't exist.
 * @param {GodRaysPass} pass
 * @param {Object} opts
 */
function configureGodRays(pass, opts) {
  const { light, ...uniformOpts } = opts;
  if (light) pass.light = light;
  configureUniforms(pass, uniformOpts);
}

/**
 * `godRays` — screen-space volumetric light scattering. Auto-activated by
 * `PostFX` when the active scene's fog preset is `'volumetric-cinematic'`
 * (`GraphSceneEnvironment.setFog`), or can be enabled manually.
 *
 * @throws {Error} If no `light` option is given and the scene contains no
 *   `DirectionalLight`/`PointLight`/`SpotLight` (Fail Fast — a god-rays pass
 *   with no light source has nothing to render rays from).
 * @example graph3d.postfx.enable('godRays', { light: sun, exposure: 0.3 });
 */
PostFX.registerPass('godRays', {
  order: 15,
  create: ({ scene, camera }, opts) => {
    const light = opts.light ?? findLight(scene);
    if (!light) {
      throw new Error(
        "PostFX 'godRays' pass requires a light source. Add a DirectionalLight/" +
          "PointLight/SpotLight to the scene, or pass one explicitly: " +
          "graph3d.postfx.enable('godRays', { light: mySunLight }).",
      );
    }
    return new GodRaysPass(scene, camera, light, opts);
  },
  configure: configureGodRays,
});
