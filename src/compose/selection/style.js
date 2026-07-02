import { accessor } from '../generator/index.js';
import { applyAttr, writeInstanceScalarAttribute } from './attr.js';

// The only material properties a per-instance attribute can drive today
// (color via instanceColor, opacity/emissiveIntensity via a scalar
// InstancedBufferAttribute) — everything else lives on the ONE material an
// InstancedMesh's instances all share, so it can't vary per datum without
// the Phase 6 dataDriven material reading a custom attribute per property,
// which doesn't exist yet.
const INSTANCE_CAPABLE_PROPS = new Set(['color', 'opacity', 'emissiveIntensity']);

/** @param {THREE.Material|THREE.Material[]} material @returns {THREE.Material[]} */
function materialsOf(material) {
  return Array.isArray(material) ? material : [material];
}

/**
 * Assign `value` to `prop` on every material in `materials` that has it.
 * @param {THREE.Material[]} materials @param {string} prop @param {*} value
 * @throws {Error} If none of `materials` has a property named `prop`.
 */
function applyMaterialGlobal(materials, prop, value) {
  const capable = materials.filter((m) => prop in m);
  if (capable.length === 0) {
    throw new Error(`Selection.style('${prop}'): no material in this selection has a '${prop}' property.`);
  }
  for (const m of capable) m[prop] = value;
}

/**
 * Routes `Selection.style(materialProp, valueOrFn)` (Prompt 77) — material-
 * level micro-control, as opposed to `attr`'s fixed transform/color/opacity/
 * visible vocabulary. `color` and `opacity` are handled identically to
 * `attr` (delegates there — CLAUDE.md §1.1 DRY, not reimplemented). Meshes
 * back their own material, so every `materialProp` (including arbitrary ones
 * like `roughness`/`metalness`/`wireframe`) writes per-datum without
 * restriction. The instanced backend shares ONE material across every
 * instance: `color`/`opacity`/`emissiveIntensity` are per-instance-capable
 * (routed to instance buffers/attributes); anything else is material-global
 * — a per-datum accessor can't vary it per instance, so this warns and
 * writes a single value (resolved from the first datum) to the shared
 * material instead of silently keeping only the last-resolved value.
 * @param {{ type: 'meshes', meshes: object[] }|{ type: 'instanced', object: object, indices: Uint32Array }} backend
 * @param {number} size
 * @param {(index: number) => *} datumAt
 * @param {string} materialProp
 * @param {*} valueOrFn A constant, or `(datum, index) => value`.
 * @throws {TypeError} If `materialProp` is not a non-empty string.
 * @throws {Error} If no material in the selection has `materialProp`.
 */
export function applyStyle(backend, size, datumAt, materialProp, valueOrFn) {
  if (typeof materialProp !== 'string' || materialProp.length === 0) {
    throw new TypeError(`Selection.style: materialProp must be a non-empty string, received ${JSON.stringify(materialProp)}.`);
  }
  const resolve = accessor(valueOrFn);

  if (materialProp === 'color' || materialProp === 'opacity') {
    applyAttr(backend, size, datumAt, materialProp, valueOrFn);
    return;
  }

  if (backend.type === 'meshes') {
    for (let i = 0; i < size; i++) {
      applyMaterialGlobal(materialsOf(backend.meshes[i].material), materialProp, resolve(datumAt(i), i));
    }
    return;
  }

  const { object, indices } = backend;
  if (materialProp === 'emissiveIntensity') {
    // ponytail: lands in a per-instance attribute now; no shader reads it
    // until the Phase 6 dataDriven material (Prompt 106) wires it up.
    writeInstanceScalarAttribute(object, indices, size, datumAt, resolve, materialProp);
    return;
  }

  if (size === 0) return;
  console.warn(
    `Selection.style('${materialProp}'): the instanced backend shares one material across all its instances — ` +
      `applying a single value (resolved from the first datum) instead of one per instance. Per-instance ` +
      `micro-control is only available for ${[...INSTANCE_CAPABLE_PROPS].join(', ')}.`,
  );
  applyMaterialGlobal(materialsOf(object.material), materialProp, resolve(datumAt(0), 0));
}
