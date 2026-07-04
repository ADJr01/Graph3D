import * as THREE from 'three';
import { assertPlainOptions, assertFiniteNumber } from '../validate.js';
import { WORLD_SPACE_VERTEX_SHADER } from './shaderChunks.js';

const FRAGMENT_SHADER = `
uniform samplerCube envMap;
uniform float refractionRatio;
uniform float dispersion;
uniform float causticIntensity;
uniform vec3 color;
uniform float time;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec2 vUv;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewDir);
  vec3 incident = -viewDir;

  // Chromatic dispersion: refract each channel at a slightly different ratio
  // (a real IOR-vs-wavelength effect) instead of one shared refraction — this
  // IS the "caustic approximation": no light-transport simulation, just the
  // colorful fringing dispersion produces at grazing angles, close enough to
  // read as a crystal/prism to the eye.
  vec3 refractedR = refract(incident, normal, refractionRatio - dispersion);
  vec3 refractedG = refract(incident, normal, refractionRatio);
  vec3 refractedB = refract(incident, normal, refractionRatio + dispersion);
  vec3 refractedColor = vec3(
    textureCube(envMap, refractedR).r,
    textureCube(envMap, refractedG).g,
    textureCube(envMap, refractedB).b
  );

  vec3 reflected = reflect(incident, normal);
  vec3 reflectedColor = textureCube(envMap, reflected).rgb;

  float fresnel = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 3.0);
  vec3 base = mix(refractedColor, reflectedColor, fresnel);

  // A subtle animated sparkle standing in for true caustic light-focusing,
  // brightest where dispersion is widest (near grazing angles).
  float sparkle = fresnel * (0.5 + 0.5 * sin(dot(normal, refractedG) * 40.0 + time * 3.0));

  gl_FragColor = vec4(base * color + sparkle * causticIntensity, 1.0);
}
`;

/**
 * Refractive crystal look: chromatic-dispersion refraction plus a
 * fresnel-blended reflection, both sampled from a `THREE.CubeTexture`
 * environment map, with a subtle animated sparkle standing in for real
 * caustic light-focusing (see the fragment shader's own comment — this is
 * an approximation, not a light-transport simulation). Works on both a
 * single `GraphMesh` and an instanced `GraphInstancedObject` target.
 *
 * A custom `THREE.ShaderMaterial` — `time` starts at `0` and does nothing on
 * its own; pair with `GraphObjectMaterial.bindUniforms({ time: 'auto' })` to
 * animate the sparkle off the shared render loop.
 * @param {{
 *   envMap: THREE.CubeTexture,
 *   ior?: number,
 *   dispersion?: number,
 *   causticIntensity?: number,
 *   color?: (string|number|THREE.Color),
 * } & THREE.ShaderMaterialParameters} options - `envMap` is required.
 * @returns {THREE.ShaderMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @throws {TypeError} If `envMap` is not a `THREE.CubeTexture`.
 * @throws {TypeError} If `ior`, `dispersion`, or `causticIntensity` is not a finite number.
 * @example
 * const envMap = await new THREE.CubeTextureLoader().loadAsync(['+x.png','-x.png','+y.png','-y.png','+z.png','-z.png']);
 * const mat = material.crystal({ envMap, ior: 2.4 });
 * new GraphObjectMaterial(bar).applyShader(mat).bindUniforms({ time: 'auto' });
 */
export function crystal(options) {
  assertPlainOptions('material.crystal', options);
  const {
    envMap,
    ior = 2.4,
    dispersion = 0.02,
    causticIntensity = 0.5,
    color = '#ffffff',
    ...rest
  } = options;

  if (!(envMap instanceof THREE.CubeTexture)) {
    throw new TypeError(
      `material.crystal: envMap must be a THREE.CubeTexture instance, received ${JSON.stringify(envMap)}.`,
    );
  }
  assertFiniteNumber('material.crystal', 'ior', ior);
  if (ior <= 0) {
    throw new TypeError(`material.crystal: ior must be greater than 0, received ${ior}.`);
  }
  assertFiniteNumber('material.crystal', 'dispersion', dispersion);
  assertFiniteNumber('material.crystal', 'causticIntensity', causticIntensity);

  return new THREE.ShaderMaterial({
    uniforms: {
      envMap: { value: envMap },
      refractionRatio: { value: 1 / ior },
      dispersion: { value: dispersion },
      causticIntensity: { value: causticIntensity },
      color: { value: new THREE.Color(color) },
      time: { value: 0 },
    },
    vertexShader: WORLD_SPACE_VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    ...rest,
  });
}
