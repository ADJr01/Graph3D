import * as THREE from 'three';
import { loop } from '../../core/Graph3DLoop.js';
import { assertPlainOptions, assertFiniteNumber } from '../validate.js';
import { wrapDisposeWithCleanup } from './lifecycle.js';

/**
 * Bloom-friendly emissive "neon sign" material: a dark base `color` with a
 * bright `emissive` color whose `emissiveIntensity` deliberately exceeds
 * `1.0` (an HDR value — a bloom postfx pass, Phase 7, thresholds on exactly
 * this). A thin, validated wrapper over `THREE.MeshStandardMaterial`.
 *
 * Pass `pulse` to make it breathe: `true` uses sensible defaults, or an
 * object overriding `min`/`max`/`speed`. Wires a `pulse()` controller
 * internally and folds its cleanup into the returned material's own
 * `dispose()` — callers keep calling `material.dispose()` as normal; nothing
 * extra to remember.
 * @param {{
 *   emissive?: (string|number|THREE.Color),
 *   emissiveIntensity?: number,
 *   pulse?: (boolean|{min?: number, max?: number, speed?: number}),
 * } & THREE.MeshStandardMaterialParameters} [options]
 * @returns {THREE.MeshStandardMaterial}
 * @throws {TypeError} If `options` is not a plain object.
 * @throws {TypeError} If `emissiveIntensity` is not a finite number.
 * @example material.neon({ emissive: '#39ff14', emissiveIntensity: 3 });
 * @example
 * const sign = material.neon({ emissive: '#ff2fd6', pulse: true });
 * // ... later:
 * sign.dispose(); // also stops the pulse — one call, nothing leaked
 */
export function neon(options = {}) {
  assertPlainOptions('material.neon', options);
  const { color = '#000000', emissive = '#ff2fd6', emissiveIntensity = 2.5, pulse: pulseOption = false, ...rest } = options;
  assertFiniteNumber('material.neon', 'emissiveIntensity', emissiveIntensity);

  const material = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    ...rest,
  });

  if (!pulseOption) return material;

  const pulseOptions = pulseOption === true ? {} : pulseOption;
  const controller = pulse(material, {
    property: 'emissiveIntensity',
    min: emissiveIntensity * 0.4,
    max: emissiveIntensity,
    ...pulseOptions,
  });

  return wrapDisposeWithCleanup(material, () => controller.dispose());
}

/**
 * Oscillate a numeric material property (`emissiveIntensity` by default)
 * between `min` and `max` off the shared render loop — the generic engine
 * `neon()`'s own `pulse` option builds on. Independent of `GraphObjectMaterial`
 * (which only drives `THREE.ShaderMaterial` uniforms): this works on any
 * `THREE.Material` property, since `MeshStandardMaterial`/etc. expose plain
 * numeric properties, not a `uniforms` object.
 * @param {THREE.Material} material
 * @param {{ property?: string, min?: number, max?: number, speed?: number }} [options]
 * @returns {{ dispose(): void }} Idempotent — stop pulsing and unsubscribe from the render loop.
 * @throws {TypeError} If `options` is not a plain object.
 * @throws {TypeError} If `material` has no `property` of that name.
 * @throws {TypeError} If `min`/`max`/`speed` is not a finite number, or `min >= max`.
 * @example
 * const controller = material.pulse(glowMat, { property: 'opacity', min: 0.3, max: 1, speed: 0.8 });
 * // later: controller.dispose();
 */
export function pulse(material, options = {}) {
  assertPlainOptions('material.pulse', options);
  const { property = 'emissiveIntensity', min = 0.5, max = 1.5, speed = 1.5 } = options;
  if (!(property in material)) {
    throw new TypeError(`material.pulse: the given material has no '${property}' property.`);
  }
  assertFiniteNumber('material.pulse', 'min', min);
  assertFiniteNumber('material.pulse', 'max', max);
  assertFiniteNumber('material.pulse', 'speed', speed);
  if (min >= max) {
    throw new TypeError(`material.pulse: min must be less than max, received min=${min}, max=${max}.`);
  }

  const tick = (deltaSec, elapsedSec) => {
    const t = 0.5 - 0.5 * Math.cos(elapsedSec * speed * Math.PI * 2);
    material[property] = min + (max - min) * t;
  };
  loop.add(tick);

  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      loop.remove(tick);
    },
  };
}
