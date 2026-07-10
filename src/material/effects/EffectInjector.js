import { loop } from '../../core/Graph3DLoop.js';
import { effects } from './registry.js';
import { buildSlotInjection, phaseUniformName, GLOBAL_FRAGMENT_HEADER, TIME_UNIFORM_NAME } from './harness.js';

/**
 * Keys stashed on `material.userData` — namespaced (`graph3dEffect*`) so
 * this never collides with a user's own `userData` entries.
 */
const SLOTS_KEY = 'graph3dEffectSlots';
const UNIFORMS_KEY = 'graph3dEffectUniforms';
const TIME_TICK_KEY = 'graph3dEffectTimeTick';

/** @param {import('three').Material} material @returns {Map<string, {presetName: string, options: Object}>} */
function slotsOf(material) {
  if (!material.userData[SLOTS_KEY]) material.userData[SLOTS_KEY] = new Map();
  return material.userData[SLOTS_KEY];
}

/** @param {Object} a @param {Object} b @returns {boolean} Shallow key/value equality — enough for flat preset option objects (color/intensity/speed/...). */
function shallowEqual(a, b) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

/**
 * Bakes (or re-bakes) one named effect slot into `material`'s shader via
 * `onBeforeCompile` — non-destructive: every other property of `material`
 * (color, roughness, its own existing `onBeforeCompile` if it had none set
 * by this injector, ...) is untouched, and removing every slot
 * (`removeSlot` down to zero) leaves the exact original compiled behavior
 * (`material.onBeforeCompile`/`customProgramCacheKey` reset to `undefined`,
 * `material.needsUpdate = true` forces the byte-identical original program
 * to recompile).
 *
 * Idempotent: calling this again with the same `slot`/`presetName`/
 * `options` is a no-op — critical for rapid hover sweeps re-triggering the
 * same preset on the same shared instanced material without forcing a
 * shader recompile on every hover-enter.
 * @param {import('three').Material} material
 * @param {'hover'|'select'} slot
 * @param {string} presetName - Must be registered (`effects.list()`); throws with a suggestion otherwise.
 * @param {Object} [options] - Merged over the preset's own `defaultOptions`.
 * @returns {Object<string, {value: *}>} The live, mutable `shader.uniforms`-compatible map for this material (same object references get assigned into every future recompiled `shader.uniforms`) — callers needing to drive a mesh-backend uniform phase directly (`EffectController`) read `[phaseUniformName(slot)]` off this.
 * @throws {Error} If `presetName` isn't a registered effect.
 * @example EffectInjector.applySlot(material, 'hover', 'glow', { intensity: 2 });
 */
export function applySlot(material, slot, presetName, options = {}) {
  const preset = effects.get(presetName);
  const merged = { ...preset.defaultOptions, ...options };
  const slots = slotsOf(material);
  const existing = slots.get(slot);
  if (existing && existing.presetName === presetName && shallowEqual(existing.options, merged)) {
    return material.userData[UNIFORMS_KEY];
  }
  slots.set(slot, { presetName, options: merged });
  return rebuild(material);
}

/**
 * Removes one effect slot and rebuilds the shader without it. No-op if
 * `slot` was never applied. Once the last slot is removed, restores
 * `material` to its pre-injection compiled state.
 * @param {import('three').Material} material
 * @param {'hover'|'select'} slot
 * @example EffectInjector.removeSlot(material, 'hover');
 */
export function removeSlot(material, slot) {
  const slots = slotsOf(material);
  if (!slots.has(slot)) return;
  slots.delete(slot);
  rebuild(material);
}

/** @param {import('three').Material} material @returns {Object<string, {value: *}>|undefined} The live uniforms map from the most recent `applySlot`, or `undefined` if no slot has ever been applied. */
export function getUniforms(material) {
  return material.userData[UNIFORMS_KEY];
}

/**
 * Recomposes `material.onBeforeCompile` from every currently-active slot,
 * concatenating each slot's own harness injection (`buildSlotInjection`) —
 * one shared header/anchor pair regardless of how many slots (`'hover'`,
 * `'select'`) are baked in at once.
 * @param {import('three').Material} material
 * @returns {Object<string, {value: *}>|undefined}
 */
function rebuild(material) {
  const slots = slotsOf(material);

  // The uniforms object is long-lived and mutated in place (never replaced
  // wholesale) — a phase uniform's `{value}` descriptor object is what a
  // caller (`EffectController`'s `PhaseAnimator`) is actively mutating every
  // frame while an animation is in flight; replacing it out from under a
  // second slot's rebuild would silently orphan that closure (it would keep
  // writing a `.value` nobody reads anymore, since THREE only sees whatever
  // object *this* uniforms map holds at compile time).
  if (!material.userData[UNIFORMS_KEY]) material.userData[UNIFORMS_KEY] = {};
  const uniforms = material.userData[UNIFORMS_KEY];

  if (slots.size === 0) {
    for (const key of Object.keys(uniforms)) delete uniforms[key];
    material.onBeforeCompile = () => {};
    material.customProgramCacheKey = undefined;
    material.needsUpdate = true;
    unbindTime(material);
    delete material.userData[UNIFORMS_KEY];
    return undefined;
  }

  // Drop uniforms belonging to a slot that's no longer active — every
  // per-slot uniform name this file/presets produce is `<base>_<slot>`
  // (`uColor_hover`, `effectPhase_select`, ...) with no underscore inside
  // `<base>` itself (see every preset's `uniformDecls`/`buildUniforms`), so
  // splitting on the last `_` reliably recovers the owning slot.
  const activeSlotNames = new Set(slots.keys());
  for (const key of Object.keys(uniforms)) {
    if (key === TIME_UNIFORM_NAME) continue;
    const owningSlot = key.slice(key.lastIndexOf('_') + 1);
    if (!activeSlotNames.has(owningSlot)) delete uniforms[key];
  }
  if (!uniforms[TIME_UNIFORM_NAME]) uniforms[TIME_UNIFORM_NAME] = { value: 0 };

  let vertexHeader = '';
  let vertexMain = '';
  let fragmentHeader = GLOBAL_FRAGMENT_HEADER;
  let fragmentMain = '';

  for (const [slot, { presetName, options }] of slots) {
    const preset = effects.get(presetName);
    const injection = buildSlotInjection(slot, preset);
    vertexHeader += injection.vertexHeader;
    vertexMain += injection.vertexMain;
    fragmentHeader += injection.fragmentHeader;
    fragmentMain += injection.fragmentMain;
    Object.assign(uniforms, preset.buildUniforms(slot, options));
    // Preserve an in-flight phase value across a rebuild triggered by a
    // *different* slot being added/removed/reconfigured.
    if (!uniforms[phaseUniformName(slot)]) uniforms[phaseUniformName(slot)] = { value: 0 };
  }

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vertexHeader}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertexMain}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${fragmentHeader}`)
      .replace('#include <dithering_fragment>', `${fragmentMain}\n#include <dithering_fragment>`);
  };
  material.customProgramCacheKey = () =>
    [...slots.entries()].map(([slot, { presetName: name }]) => `${slot}:${name}`).join('|');
  material.needsUpdate = true;
  bindTime(material, uniforms);
  return uniforms;
}

/** Wires the shared `graph3dEffectTime` uniform to the render loop's elapsed time, once per material regardless of active slot count. */
function bindTime(material, uniforms) {
  if (material.userData[TIME_TICK_KEY]) return;
  const tick = (_deltaSeconds, elapsedSeconds) => {
    uniforms[TIME_UNIFORM_NAME].value = elapsedSeconds;
  };
  material.userData[TIME_TICK_KEY] = tick;
  loop.add(tick);
}

/** @param {import('three').Material} material */
function unbindTime(material) {
  const tick = material.userData[TIME_TICK_KEY];
  if (!tick) return;
  loop.remove(tick);
  delete material.userData[TIME_TICK_KEY];
}
