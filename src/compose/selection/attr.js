import { accessor } from '../generator/index.js';
import { nearestMatch } from '../../core/textDistance.js';

export const VECTOR_COMPONENTS = new Set(['x', 'y', 'z']);
export const TRANSFORM_BASES = new Set(['position', 'rotation', 'scale']);

// Every fixed-vocabulary base name — checked against an unrecognized `attr()`
// path (Prompt 179) for a "did you mean" suggestion. Custom attribute names
// are an open, unbounded vocabulary (`GraphInstancedObject.defineAttribute`),
// so this can only ever suggest, never reject outright.
const KNOWN_ATTR_BASES = [...TRANSFORM_BASES, 'color', 'opacity', 'visible'];

/**
 * `get`/`set` method-name pairs for each transform base, on both backends —
 * the single source of truth for "which `GraphMesh`/`GraphInstancedObject`
 * method reads/writes `position`/`rotation`/`scale`". Exported so
 * `SelectionTransition` (Prompt 91) can read a "from" value through the same
 * mapping `applyTransformComponent` writes through, rather than a second
 * copy of this table (CLAUDE.md §1.1 DRY two-strike rule).
 */
export const TRANSFORM_ACCESSORS = {
  position: { get: 'getPosition', set: 'setPosition', instanceGet: 'getInstancePosition', instanceSet: 'setInstancePosition' },
  rotation: { get: 'getRotation', set: 'setRotation', instanceGet: 'getInstanceRotation', instanceSet: 'setInstanceRotation' },
  scale: { get: 'getScale', set: 'setScale', instanceGet: 'getInstanceScale', instanceSet: 'setInstanceScale' },
};

/** @param {string} path @returns {[string, (string|null)]} */
export function splitPath(path) {
  const dot = path.indexOf('.');
  return dot === -1 ? [path, null] : [path.slice(0, dot), path.slice(dot + 1)];
}

/** @param {*} value @param {string} path @throws {TypeError} */
export function assertFiniteNumber(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Selection.attr('${path}'): expected a finite number, received ${JSON.stringify(value)}.`);
  }
}

/** @param {*} value @param {string} path @throws {TypeError} */
function assertBoolean(value, path) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`Selection.attr('${path}'): expected a boolean, received ${JSON.stringify(value)}.`);
  }
}

/**
 * @param {THREE.Material|THREE.Material[]} material
 * @returns {THREE.Material[]}
 */
export function materialsOf(material) {
  return Array.isArray(material) ? material : [material];
}

// ── position.*/rotation.*/scale.* ───────────────────────────────────────────

function applyTransformComponent(backend, size, datumAt, resolve, path, base, component) {
  const { get: getter, set: setter, instanceGet: instanceGetter, instanceSet: instanceSetter } = TRANSFORM_ACCESSORS[base];

  if (backend.type === 'meshes') {
    for (let i = 0; i < size; i++) {
      const value = resolve(datumAt(i), i);
      assertFiniteNumber(value, path);
      const mesh = backend.meshes[i];
      const vector = mesh[getter]();
      vector[component] = value;
      base === 'rotation' ? mesh.setRotation(vector) : mesh[setter](vector.x, vector.y, vector.z);
    }
    return;
  }

  const { object, indices } = backend;
  for (let i = 0; i < size; i++) {
    const value = resolve(datumAt(i), i);
    assertFiniteNumber(value, path);
    const rawIndex = indices[i];
    const vector = object[instanceGetter](rawIndex);
    vector[component] = value;
    base === 'rotation' ? object.setInstanceRotation(rawIndex, vector) : object[instanceSetter](rawIndex, vector.x, vector.y, vector.z);
  }
  if (size > 0) object.commitMatrix();
}

// ── color ────────────────────────────────────────────────────────────────

function applyColor(backend, size, datumAt, resolve) {
  if (backend.type === 'meshes') {
    for (let i = 0; i < size; i++) {
      const value = resolve(datumAt(i), i);
      const materials = materialsOf(backend.meshes[i].material);
      const colorCapable = materials.filter((m) => m.color);
      if (colorCapable.length === 0) {
        throw new Error("Selection.attr('color'): the mesh's material has no 'color' property to write to.");
      }
      for (const m of colorCapable) m.color.set(value);
    }
    return;
  }
  const { object, indices } = backend;
  for (let i = 0; i < size; i++) {
    object.setInstanceColor(indices[i], resolve(datumAt(i), i));
  }
  if (size > 0) object.commitColor();
}

// ── opacity ──────────────────────────────────────────────────────────────

// ponytail: the instanced path only stores the value in a per-instance
// attribute — no material reads it yet, so it has no visual effect on an
// instanced backend until the Phase 6 dataDriven material (Prompt 106)
// wires it up. The meshes path is fully functional today (each mesh owns
// its material outright).
const SCALAR_ATTRIBUTE_ITEM_SIZE = 1;

/**
 * Write a single-component (`itemSize: 1`) per-instance attribute across an
 * instanced backend, auto-defining it on first use — the shared "define if
 * missing, loop-write, commit once" pattern behind `attr('opacity', ...)`
 * and `style('emissiveIntensity', ...)` alike (CLAUDE.md §1.1 DRY two-strike
 * rule: `style.js` is the second consumer of this exact shape).
 * @param {object} object A `GraphInstancedObject`.
 * @param {Uint32Array} indices
 * @param {number} size
 * @param {(index: number) => *} datumAt
 * @param {(datum: *, index: number) => *} resolve
 * @param {string} name
 */
export function writeInstanceScalarAttribute(object, indices, size, datumAt, resolve, name) {
  if (size > 0 && !object.hasAttribute(name)) object.defineAttribute(name, SCALAR_ATTRIBUTE_ITEM_SIZE);
  for (let i = 0; i < size; i++) {
    const value = resolve(datumAt(i), i);
    assertFiniteNumber(value, name);
    object.setInstanceAttribute(indices[i], name, value);
  }
  if (size > 0) object.commitAttribute(name);
}

function applyOpacity(backend, size, datumAt, resolve) {
  if (backend.type === 'meshes') {
    for (let i = 0; i < size; i++) {
      const value = resolve(datumAt(i), i);
      assertFiniteNumber(value, 'opacity');
      for (const m of materialsOf(backend.meshes[i].material)) {
        m.opacity = value;
        m.transparent = true;
      }
    }
    return;
  }
  writeInstanceScalarAttribute(backend.object, backend.indices, size, datumAt, resolve, 'opacity');
}

// ── visible ──────────────────────────────────────────────────────────────

function applyVisible(backend, size, datumAt, resolve) {
  if (backend.type === 'meshes') {
    for (let i = 0; i < size; i++) {
      const value = resolve(datumAt(i), i);
      assertBoolean(value, 'visible');
      backend.meshes[i].setVisible(value);
    }
    return;
  }
  const { object, indices } = backend;
  for (let i = 0; i < size; i++) {
    const value = resolve(datumAt(i), i);
    assertBoolean(value, 'visible');
    object.setInstanceVisible(indices[i], value);
  }
  if (size > 0) object.commitMatrix();
}

// ── custom instance attribute (Prompt 38's defineAttribute) ────────────────

function applyCustomAttribute(backend, size, datumAt, resolve, name) {
  const suggestion = nearestMatch(name, KNOWN_ATTR_BASES);

  if (backend.type === 'meshes') {
    // Prompt 179: a close match to a real fixed-vocabulary name is far more
    // likely a typo than a genuine custom-attribute name — meshes have no
    // per-instance attributes at all, so this path can only ever be a
    // mistake; surface the likely intent instead of the generic message.
    throw new Error(
      suggestion
        ? `Selection.attr: unknown path '${name}'. Did you mean '${suggestion}'?`
        : `Selection.attr: custom attribute '${name}' is only supported on the instanced backend — meshes have no per-instance attributes.`,
    );
  }

  const { object, indices } = backend;
  // A near-miss on an attribute that was never explicitly `defineAttribute`d
  // is far more likely a typo than a genuine custom attribute — surface the
  // likely intent instead of the generic "call defineAttribute() first"
  // GraphInstancedObject.setInstanceAttribute would otherwise throw below.
  // An already-defined attribute close to a reserved name (someone
  // deliberately named a custom attribute 'colour') is left alone — it's
  // real, established usage, not a typo to flag.
  if (suggestion && !object.hasAttribute(name)) {
    throw new Error(`Selection.attr: unknown path '${name}'. Did you mean '${suggestion}'?`);
  }
  for (let i = 0; i < size; i++) {
    object.setInstanceAttribute(indices[i], name, resolve(datumAt(i), i));
  }
  if (size > 0) object.commitAttribute(name);
}

/**
 * Routes `Selection.attr(path, valueOrFn)` to the correct backend calls —
 * the "attribute write path" (Prompt 75). `path` is one of the fixed
 * vocabulary entries (`position.x/y/z`, `rotation.x/y/z`, `scale.x/y/z`,
 * `color`, `opacity`, `visible`) or a custom per-instance attribute name
 * previously registered via `GraphInstancedObject.defineAttribute`
 * (Prompt 38). `valueOrFn` is resolved per node via the same
 * constant-or-`(datum, index) => value` convention as every other accessor
 * in `compose/` (`compose/generator/accessor.js`, CLAUDE.md §1.1 DRY).
 *
 * Both backends apply every node's write in a loop, then flush GPU-facing
 * state exactly once (`commitMatrix`/`commitColor`/`commitAttribute`) — never
 * per node — per the prompt's explicit requirement. The meshes backend needs
 * no equivalent flush: `THREE.Object3D`/`THREE.Material` properties take
 * effect immediately, there is no buffer to upload.
 * @param {{ type: 'meshes', meshes: object[] }|{ type: 'instanced', object: object, indices: Uint32Array }} backend
 * @param {number} size
 * @param {(index: number) => *} datumAt
 * @param {string} path
 * @param {*} valueOrFn
 * @throws {TypeError} If `path` is empty, names an unknown fixed-vocabulary
 *   sub-property, or a resolved value has the wrong type for `path`.
 * @throws {Error} If `path` is a custom attribute name used on a meshes
 *   backend, or (instanced) an undefined custom attribute name.
 */
export function applyAttr(backend, size, datumAt, path, valueOrFn) {
  if (typeof path !== 'string' || path.length === 0) {
    throw new TypeError(`Selection.attr: path must be a non-empty string, received ${JSON.stringify(path)}.`);
  }
  const resolve = accessor(valueOrFn);
  const [base, component] = splitPath(path);

  if (TRANSFORM_BASES.has(base)) {
    if (!VECTOR_COMPONENTS.has(component)) {
      throw new TypeError(`Selection.attr: '${path}' is not a valid path — '${base}' takes .x/.y/.z, received '${component}'.`);
    }
    applyTransformComponent(backend, size, datumAt, resolve, path, base, component);
    return;
  }
  if (component !== null) {
    throw new TypeError(`Selection.attr: unknown path '${path}' — '${base}' does not take a sub-property.`);
  }
  if (base === 'color') return applyColor(backend, size, datumAt, resolve);
  if (base === 'opacity') return applyOpacity(backend, size, datumAt, resolve);
  if (base === 'visible') return applyVisible(backend, size, datumAt, resolve);
  applyCustomAttribute(backend, size, datumAt, resolve, base);
}
