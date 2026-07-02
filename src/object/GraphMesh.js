import * as THREE from 'three';
import { GraphObject } from './GraphObject.js';
// Imports core/GraphDisposal.js directly, not '../scene/index.js' — see
// GraphObject.js's identical note on why object/ must not import that barrel.
import { disposeMaterial } from '../core/GraphDisposal.js';

/**
 * Mutation API for a single mesh — the low-instance-count path
 * (`GraphObjectFactory` keeps individual `GraphMesh`es, rather than folding
 * into one `GraphInstancedObject`, when `count <= 50`, for inspectability)
 * and for any one-off user-added mesh that doesn't need instancing at all.
 *
 * `geometry` and `material` are consumed exclusively by this instance and are
 * disposed alongside it in `dispose()` (see `GraphInstancedObject`'s
 * ownership note for the same rule). `clone()` shares them with the
 * original — cheap, but only one of the two clones should ever be disposed.
 * `deepClone()` clones the geometry/material too, producing a fully
 * independent copy that's safe to dispose on its own.
 *
 * @example
 * const mesh = new GraphMesh({ scene: graphScene.three, name: 'bar_0', geometry, material });
 * mesh.setPosition(1, 2, 3).setScale(1, 2, 1);
 * const vertex = mesh.getVertices()[0];
 * mesh.setVertex(0, vertex.x, vertex.y + 1, vertex.z).commit();
 */
export class GraphMesh extends GraphObject {
  /** @type {THREE.Mesh} */
  #mesh;

  /** @type {boolean} */
  #disposed = false;

  /**
   * @param {{ scene: THREE.Scene, name: string, geometry: THREE.BufferGeometry,
   *   material: THREE.Material|THREE.Material[] }} options
   * @throws {TypeError} If `geometry` is not a `THREE.BufferGeometry`.
   * @throws {TypeError} If `material` is not a `THREE.Material` (or array of them).
   * @example
   * new GraphMesh({ scene, name: 'bar_0', geometry, material });
   */
  constructor({ scene, name, geometry, material } = {}) {
    if (!(geometry instanceof THREE.BufferGeometry)) {
      throw new TypeError('GraphMesh: geometry must be a THREE.BufferGeometry instance.');
    }
    const materials = Array.isArray(material) ? material : [material];
    if (materials.length === 0 || materials.some((m) => !(m instanceof THREE.Material))) {
      throw new TypeError(
        'GraphMesh: material must be a THREE.Material instance or a non-empty array of them.',
      );
    }

    const mesh = new THREE.Mesh(geometry, material);
    super({ scene, name, three: mesh });
    this.#mesh = mesh;
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  /**
   * This mesh's material, as a lazy accessor so the return type can change
   * without touching call sites. Currently the raw `THREE.Material` (or
   * array) — Phase 6 will wrap it in a `GraphObjectMaterial`, but `object/`
   * cannot import from `material/` (a higher layer, per CLAUDE.md §1.4), so
   * that wrapping has to be added once `material/` exists, not here.
   * @returns {THREE.Material|THREE.Material[]}
   * @throws {Error} If called after `dispose()`.
   * @example mesh.material.color.set('crimson');
   */
  get material() {
    this.#assertNotDisposed('material');
    return this.#mesh.material;
  }

  // ── Transform ──────────────────────────────────────────────────────────────

  /**
   * Read the mesh's current position — a fresh `THREE.Vector3` (mutating it
   * has no effect on the mesh; call `setPosition` to write changes back).
   * Exists for read-modify-write callers (e.g. `Selection.attr('position.x', ...)`,
   * Prompt 75) that need to change one component without disturbing the others.
   * @returns {THREE.Vector3}
   * @throws {Error} If called after `dispose()`.
   * @example const p = mesh.getPosition(); mesh.setPosition(p.x + 1, p.y, p.z);
   */
  getPosition() {
    this.#assertNotDisposed('getPosition');
    return this.#mesh.position.clone();
  }

  /**
   * Read the mesh's current rotation — a fresh `THREE.Euler` (mutating it has
   * no effect on the mesh; call `setRotation` to write changes back).
   * @returns {THREE.Euler}
   * @throws {Error} If called after `dispose()`.
   * @example const r = mesh.getRotation(); r.y += Math.PI / 2; mesh.setRotation(r);
   */
  getRotation() {
    this.#assertNotDisposed('getRotation');
    return this.#mesh.rotation.clone();
  }

  /**
   * Read the mesh's current scale — a fresh `THREE.Vector3` (mutating it has
   * no effect on the mesh; call `setScale` to write changes back).
   * @returns {THREE.Vector3}
   * @throws {Error} If called after `dispose()`.
   * @example const s = mesh.getScale(); mesh.setScale(s.x, s.y * 2, s.z);
   */
  getScale() {
    this.#assertNotDisposed('getScale');
    return this.#mesh.scale.clone();
  }

  /**
   * Set the mesh's position.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {this}
   * @throws {TypeError} If `x`, `y`, or `z` is not a finite number.
   * @throws {Error} If called after `dispose()`.
   * @example mesh.setPosition(1, 2, 3);
   */
  setPosition(x, y, z) {
    this.#assertNotDisposed('setPosition');
    this.#assertFiniteNumbers('setPosition', x, y, z);
    this.#mesh.position.set(x, y, z);
    return this;
  }

  /**
   * Set the mesh's rotation from a `THREE.Euler` (radians).
   * @param {THREE.Euler} euler
   * @returns {this}
   * @throws {TypeError} If `euler` is not a `THREE.Euler`.
   * @throws {Error} If called after `dispose()`.
   * @example mesh.setRotation(new THREE.Euler(0, Math.PI / 2, 0));
   */
  setRotation(euler) {
    this.#assertNotDisposed('setRotation');
    if (!(euler instanceof THREE.Euler)) {
      throw new TypeError('GraphMesh.setRotation: euler must be a THREE.Euler instance.');
    }
    this.#mesh.rotation.copy(euler);
    return this;
  }

  /**
   * Set the mesh's rotation from degrees, for callers who'd rather not
   * convert to radians themselves.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {this}
   * @throws {TypeError} If `x`, `y`, or `z` is not a finite number.
   * @throws {Error} If called after `dispose()`.
   * @example mesh.setRotationDegrees(0, 90, 0);
   */
  setRotationDegrees(x, y, z) {
    this.#assertNotDisposed('setRotationDegrees');
    this.#assertFiniteNumbers('setRotationDegrees', x, y, z);
    this.#mesh.rotation.set(
      THREE.MathUtils.degToRad(x),
      THREE.MathUtils.degToRad(y),
      THREE.MathUtils.degToRad(z),
    );
    return this;
  }

  /**
   * Set the mesh's scale.
   * @param {number} sx
   * @param {number} sy
   * @param {number} sz
   * @returns {this}
   * @throws {TypeError} If `sx`, `sy`, or `sz` is not a finite number.
   * @throws {Error} If called after `dispose()`.
   * @example mesh.setScale(1, 2, 1);
   */
  setScale(sx, sy, sz) {
    this.#assertNotDisposed('setScale');
    this.#assertFiniteNumbers('setScale', sx, sy, sz);
    this.#mesh.scale.set(sx, sy, sz);
    return this;
  }

  /**
   * Offset the mesh's current position.
   * @param {number} dx
   * @param {number} dy
   * @param {number} dz
   * @returns {this}
   * @throws {TypeError} If `dx`, `dy`, or `dz` is not a finite number.
   * @throws {Error} If called after `dispose()`.
   * @example mesh.translate(0, 1, 0);
   */
  translate(dx, dy, dz) {
    this.#assertNotDisposed('translate');
    this.#assertFiniteNumbers('translate', dx, dy, dz);
    this.#mesh.position.x += dx;
    this.#mesh.position.y += dy;
    this.#mesh.position.z += dz;
    return this;
  }

  /**
   * Rotate the mesh relative to its current rotation, in its local frame.
   * @param {THREE.Euler} euler
   * @returns {this}
   * @throws {TypeError} If `euler` is not a `THREE.Euler`.
   * @throws {Error} If called after `dispose()`.
   * @example mesh.rotateBy(new THREE.Euler(0, Math.PI / 8, 0));
   */
  rotateBy(euler) {
    this.#assertNotDisposed('rotateBy');
    if (!(euler instanceof THREE.Euler)) {
      throw new TypeError('GraphMesh.rotateBy: euler must be a THREE.Euler instance.');
    }
    this.#mesh.quaternion.multiply(new THREE.Quaternion().setFromEuler(euler));
    return this;
  }

  /**
   * Orient the mesh to face a world-space point.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {this}
   * @throws {TypeError} If `x`, `y`, or `z` is not a finite number.
   * @throws {Error} If called after `dispose()`.
   * @example mesh.lookAt(0, 0, 0);
   */
  lookAt(x, y, z) {
    this.#assertNotDisposed('lookAt');
    this.#assertFiniteNumbers('lookAt', x, y, z);
    this.#mesh.lookAt(x, y, z);
    return this;
  }

  /**
   * Show or hide the mesh (`THREE.Object3D.visible`) without removing it
   * from the scene or disturbing its transform.
   * @param {boolean} visible
   * @returns {this}
   * @throws {TypeError} If `visible` is not a boolean.
   * @throws {Error} If called after `dispose()`.
   * @example mesh.setVisible(false);
   */
  setVisible(visible) {
    this.#assertNotDisposed('setVisible');
    if (typeof visible !== 'boolean') {
      throw new TypeError(`GraphMesh.setVisible: expected a boolean, received ${JSON.stringify(visible)}.`);
    }
    this.#mesh.visible = visible;
    return this;
  }

  // ── Vertex-level ───────────────────────────────────────────────────────────

  /**
   * Read every vertex position as a fresh array of `THREE.Vector3` (not live
   * references — mutating the returned vectors has no effect on the mesh;
   * use `setVertex`/`setVertices` to write changes back).
   * @returns {THREE.Vector3[]}
   * @throws {Error} If called after `dispose()`.
   * @example const vertices = mesh.getVertices();
   */
  getVertices() {
    this.#assertNotDisposed('getVertices');
    const position = this.#mesh.geometry.getAttribute('position');
    const vertices = new Array(position.count);
    for (let i = 0; i < position.count; i++) {
      vertices[i] = new THREE.Vector3().fromBufferAttribute(position, i);
    }
    return vertices;
  }

  /**
   * Write one vertex position. Does not upload to the GPU — call `commit()`
   * once after a batch of writes.
   * @param {number} i
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {this}
   * @throws {RangeError} If `i` is out of bounds.
   * @throws {TypeError} If `x`, `y`, or `z` is not a finite number.
   * @throws {Error} If called after `dispose()`.
   * @example mesh.setVertex(0, 1, 2, 3).commit();
   */
  setVertex(i, x, y, z) {
    this.#assertNotDisposed('setVertex');
    this.#assertFiniteNumbers('setVertex', x, y, z);
    const position = this.#mesh.geometry.getAttribute('position');
    this.#assertVertexIndex('setVertex', position, i);
    position.setXYZ(i, x, y, z);
    return this;
  }

  /**
   * Write every vertex position in one call. Does not upload to the GPU —
   * call `commit()` afterward.
   * @param {Array<{x: number, y: number, z: number}>} vertices - Exactly one
   *   entry per existing vertex, each with numeric `x`/`y`/`z`.
   * @returns {this}
   * @throws {TypeError} If `vertices` isn't an array with exactly one entry
   *   per vertex, or an entry is missing numeric `x`/`y`/`z`.
   * @throws {Error} If called after `dispose()`.
   * @example mesh.setVertices(mesh.getVertices().map(v => ({ x: v.x, y: v.y * 2, z: v.z }))).commit();
   */
  setVertices(vertices) {
    this.#assertNotDisposed('setVertices');
    const position = this.#mesh.geometry.getAttribute('position');
    if (!Array.isArray(vertices) || vertices.length !== position.count) {
      throw new TypeError(
        `GraphMesh.setVertices: expected an array of exactly ${position.count} vertices, received ${
          Array.isArray(vertices) ? vertices.length : JSON.stringify(vertices)
        }.`,
      );
    }
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      this.#assertFiniteNumbers('setVertices', v?.x, v?.y, v?.z);
      position.setXYZ(i, v.x, v.y, v.z);
    }
    return this;
  }

  /**
   * Flag the position buffer for GPU upload. Call once after a batch of
   * `setVertex`/`setVertices` calls, not after each one.
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example mesh.commit();
   */
  commit() {
    this.#assertNotDisposed('commit');
    this.#mesh.geometry.getAttribute('position').needsUpdate = true;
    return this;
  }

  // ── Cloning ────────────────────────────────────────────────────────────────

  /**
   * Shallow clone: a new `GraphMesh` with the same transform, sharing this
   * mesh's geometry and material. Cheap, but only one of the two `GraphMesh`
   * instances should ever be disposed — disposing both would double-free the
   * shared geometry/material. Use `deepClone()` if you need two
   * independently-disposable copies.
   * @param {string} [name] - Defaults to this mesh's own name.
   * @returns {GraphMesh}
   * @throws {Error} If called after `dispose()`.
   * @example const ghost = mesh.clone('bar_0_ghost');
   */
  clone(name = this.name) {
    this.#assertNotDisposed('clone');
    return this.#cloneWith(name, this.#mesh.geometry, this.#mesh.material);
  }

  /**
   * Deep clone: a new `GraphMesh` with the same transform, and its own
   * independent copy of the geometry and material — safe to dispose
   * independently of the original.
   * @param {string} [name] - Defaults to this mesh's own name.
   * @returns {GraphMesh}
   * @throws {Error} If called after `dispose()`.
   * @example const copy = mesh.deepClone('bar_0_copy');
   */
  deepClone(name = this.name) {
    this.#assertNotDisposed('deepClone');
    const material = Array.isArray(this.#mesh.material)
      ? this.#mesh.material.map((m) => m.clone())
      : this.#mesh.material.clone();
    return this.#cloneWith(name, this.#mesh.geometry.clone(), material);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Dispose `geometry` and `material` and unregister via `GraphObject.dispose()`.
   * Idempotent. Do not call on a `GraphMesh` produced by `clone()` unless its
   * sibling clone (or the original) has already been disposed or discarded —
   * see the `clone()` sharing caveat.
   * @example mesh.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#mesh.geometry.dispose();
    disposeMaterial(this.#mesh.material);
    super.dispose();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * @param {string} name @param {THREE.BufferGeometry} geometry
   * @param {THREE.Material|THREE.Material[]} material @returns {GraphMesh}
   */
  #cloneWith(name, geometry, material) {
    const cloned = new GraphMesh({ scene: this.scene, name, geometry, material });
    cloned.three.position.copy(this.#mesh.position);
    cloned.three.quaternion.copy(this.#mesh.quaternion);
    cloned.three.scale.copy(this.#mesh.scale);
    return cloned;
  }

  /** @param {string} method @param {THREE.BufferAttribute} position @param {number} i @throws {RangeError} */
  #assertVertexIndex(method, position, i) {
    if (!Number.isInteger(i) || i < 0 || i >= position.count) {
      throw new RangeError(
        `GraphMesh.${method}: index ${i} is out of bounds for ${position.count} vertices.`,
      );
    }
  }

  /** @param {string} method @param {...number} values @throws {TypeError} */
  #assertFiniteNumbers(method, ...values) {
    if (values.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
      throw new TypeError(
        `GraphMesh.${method}: expected finite numbers, received [${values.join(', ')}].`,
      );
    }
  }

  /** @param {string} method @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`GraphMesh.${method}: object '${this.name}' has been disposed.`);
    }
  }
}
