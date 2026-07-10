import { PhaseAnimator } from './PhaseAnimator.js';
import * as EffectInjector from './EffectInjector.js';
import { phaseAttributeName, phaseUniformName } from './harness.js';

const PHASE_DURATION_MS = 150;

/** @type {WeakMap<import('../../object/GraphInstancedObject.js').GraphInstancedObject, PhaseAnimator>} */
const instancedAnimators = new WeakMap();

/**
 * @type {WeakMap<import('three').Object3D, {original: import('three').Material, clone: import('three').Material, animator: PhaseAnimator, activeSlots: Set<string>}>}
 * Per-mesh state for the mesh-backend path — `applyMesh`/`removeMesh` clone
 * the mesh's original material once (on the first active slot) and restore
 * it once (when the last slot's fade-out finishes), regardless of how many
 * slots (`'hover'`, `'select'`) are active on that mesh concurrently.
 */
const meshEffectState = new WeakMap();

/**
 * Applies (or re-targets) one named effect slot to a single datum, resolved
 * from a `Selection`-shaped `backend` (`compose/selection/Selection.js`'s
 * own public `.backend` getter) and the datum's index within it — the same
 * vocabulary `StateMachine.setState`'s filtered, single-datum selection
 * already has on hand, so this needs no separate "hit" shape of its own.
 * @param {{type: 'meshes', meshes: import('../../object/GraphMesh.js').GraphMesh[]}|{type: 'instanced', object: import('../../object/GraphInstancedObject.js').GraphInstancedObject, indices: Uint32Array}} backend
 * @param {number} index - Index within `backend` (not the raw instance index — resolved internally for the instanced case via `backend.indices[index]`).
 * @param {'hover'|'select'} slot
 * @param {string} presetName - A registered effect name (`effects.list()`); throws with a suggestion otherwise.
 * @param {Object} [options]
 * @example EffectController.applyEffect(chart.selection().backend, 0, 'hover', 'neonEdge', { color: '#66ccff' });
 */
export function applyEffect(backend, index, slot, presetName, options = {}) {
  if (backend.type === 'instanced') {
    applyInstanced(backend.object, backend.indices[index], slot, presetName, options);
  } else {
    applyMesh(backend.meshes[index].three, slot, presetName, options);
  }
}

/**
 * Fades out and removes one effect slot from a single datum. No-op if that
 * slot was never applied to this datum.
 * @param {{type: 'meshes', meshes: import('../../object/GraphMesh.js').GraphMesh[]}|{type: 'instanced', object: import('../../object/GraphInstancedObject.js').GraphInstancedObject, indices: Uint32Array}} backend
 * @param {number} index
 * @param {'hover'|'select'} slot
 * @example EffectController.removeEffect(chart.selection().backend, 0, 'hover');
 */
export function removeEffect(backend, index, slot) {
  if (backend.type === 'instanced') {
    removeInstanced(backend.object, backend.indices[index], slot);
  } else {
    removeMesh(backend.meshes[index].three, slot);
  }
}

// ── Instanced backend: shared material, per-instance phase attribute ───────

/**
 * @param {import('../../object/GraphInstancedObject.js').GraphInstancedObject} graphInstancedObject
 * @returns {PhaseAnimator}
 */
function animatorFor(graphInstancedObject) {
  let animator = instancedAnimators.get(graphInstancedObject);
  if (!animator) {
    animator = new PhaseAnimator();
    instancedAnimators.set(graphInstancedObject, animator);
  }
  return animator;
}

function applyInstanced(graphInstancedObject, rawIndex, slot, presetName, options) {
  EffectInjector.applySlot(graphInstancedObject.material, slot, presetName, options);
  const attrName = phaseAttributeName(slot);
  if (!graphInstancedObject.hasAttribute(attrName)) graphInstancedObject.defineAttribute(attrName, 1);

  const current = graphInstancedObject.getInstanceAttribute(rawIndex, attrName);
  animatorFor(graphInstancedObject).animate(`${slot}:${rawIndex}`, current, 1, (phase) => {
    graphInstancedObject.setInstanceAttribute(rawIndex, attrName, phase);
    graphInstancedObject.commitAttribute(attrName);
  }, { durationMs: PHASE_DURATION_MS });
}

function removeInstanced(graphInstancedObject, rawIndex, slot) {
  const attrName = phaseAttributeName(slot);
  if (!graphInstancedObject.hasAttribute(attrName)) return;
  const current = graphInstancedObject.getInstanceAttribute(rawIndex, attrName);
  if (current === 0) return;
  animatorFor(graphInstancedObject).animate(`${slot}:${rawIndex}`, current, 0, (phase) => {
    graphInstancedObject.setInstanceAttribute(rawIndex, attrName, phase);
    graphInstancedObject.commitAttribute(attrName);
  }, { durationMs: PHASE_DURATION_MS });
}

// ── Mesh backend: per-hover material clone, restored byte-identical ───────

function applyMesh(threeMesh, slot, presetName, options) {
  let entry = meshEffectState.get(threeMesh);
  if (!entry) {
    entry = { original: threeMesh.material, clone: threeMesh.material.clone(), animator: new PhaseAnimator(), activeSlots: new Set() };
    threeMesh.material = entry.clone;
    meshEffectState.set(threeMesh, entry);
  }
  entry.activeSlots.add(slot);
  const uniforms = EffectInjector.applySlot(entry.clone, slot, presetName, options);
  const phaseUniform = uniforms[phaseUniformName(slot)];
  entry.animator.animate(slot, phaseUniform.value, 1, (phase) => {
    phaseUniform.value = phase;
  }, { durationMs: PHASE_DURATION_MS });
}

function removeMesh(threeMesh, slot) {
  const entry = meshEffectState.get(threeMesh);
  if (!entry || !entry.activeSlots.has(slot)) return;
  const uniforms = EffectInjector.getUniforms(entry.clone);
  const phaseUniform = uniforms?.[phaseUniformName(slot)];
  if (!phaseUniform) return;

  entry.animator.animate(slot, phaseUniform.value, 0, (phase) => {
    phaseUniform.value = phase;
  }, {
    durationMs: PHASE_DURATION_MS,
    onDone: () => {
      entry.activeSlots.delete(slot);
      if (entry.activeSlots.size === 0) {
        threeMesh.material = entry.original;
        entry.clone.dispose();
        entry.animator.dispose();
        meshEffectState.delete(threeMesh);
      }
    },
  });
}
