import * as THREE from 'three';
import { registerSceneObject, unregisterSceneObject } from '../scene/index.js';

/**
 * Base wrapper for any scene entity. Every chart-facing object type (meshes,
 * instanced batches, loaded models) extends this class rather than exposing
 * raw Three.js objects directly.
 *
 * Adds `three` to `scene` on construction and removes it on `dispose()`.
 * Auto-registers under its `name` in a per-scene registry so later lookups
 * (`GraphScene.selectByName`, Phase 3) can find it without a scene-graph walk.
 *
 * @example
 * const mesh = new THREE.Mesh(geometry, material);
 * const obj = new GraphObject({ scene: graphScene.three, name: 'bar_0', three: mesh });
 * obj.setUserData('value', 42);
 * obj.dispose();
 */
export class GraphObject {
  /** @type {THREE.Scene} */
  #scene;

  /** @type {string} */
  #name;

  /** @type {THREE.Object3D} */
  #three;

  /** @type {boolean} */
  #disposed = false;

  /**
   * @param {{ scene: THREE.Scene, name: string, three: THREE.Object3D }} options
   * @throws {TypeError} If `scene` is not a `THREE.Scene`.
   * @throws {TypeError} If `name` is not a non-empty string.
   * @throws {TypeError} If `three` is not a `THREE.Object3D`.
   * @example
   * new GraphObject({ scene: graphScene.three, name: 'bar_0', three: mesh });
   */
  constructor({ scene, name, three } = {}) {
    if (!(scene instanceof THREE.Scene)) {
      throw new TypeError('GraphObject: scene must be a THREE.Scene instance.');
    }
    if (typeof name !== 'string' || name.length === 0) {
      throw new TypeError(
        `GraphObject: name must be a non-empty string, received ${JSON.stringify(name)}.`,
      );
    }
    if (!(three instanceof THREE.Object3D)) {
      throw new TypeError('GraphObject: three must be a THREE.Object3D instance.');
    }

    this.#scene = scene;
    this.#name = name;
    this.#three = three;
    this.#three.name = name;

    this.#scene.add(three);
    registerSceneObject(scene, name, this);
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  /**
   * The `THREE.Scene` this object belongs to.
   * @returns {THREE.Scene}
   */
  get scene() {
    return this.#scene;
  }

  /**
   * The current name, as last set by the constructor or `setName`.
   * @returns {string}
   */
  get name() {
    return this.#name;
  }

  /**
   * The wrapped `THREE.Object3D` — use as an escape hatch to raw Three.js.
   * @returns {THREE.Object3D}
   */
  get three() {
    return this.#three;
  }

  /**
   * Whether this wrapper exposes indexed multi-instance access
   * (`GraphInstancedObject`) rather than a single transform (`GraphMesh`).
   * Lets `GraphScene.selectInstance` tell the two apart without importing
   * either concrete subclass.
   * @returns {boolean}
   */
  get isInstanced() {
    return false;
  }

  // ── Naming ─────────────────────────────────────────────────────────────────

  /**
   * Rename this object, updating both `three.name` and the per-scene registry.
   * @param {string} name
   * @returns {this}
   * @throws {TypeError} If `name` is not a non-empty string.
   * @throws {Error} If called after `dispose()`.
   * @example obj.setName('bar_1');
   */
  setName(name) {
    this.#assertNotDisposed('setName');
    if (typeof name !== 'string' || name.length === 0) {
      throw new TypeError(
        `GraphObject.setName: name must be a non-empty string, received ${JSON.stringify(name)}.`,
      );
    }
    unregisterSceneObject(this.#scene, this.#name, this);
    this.#name = name;
    this.#three.name = name;
    registerSceneObject(this.#scene, name, this);
    return this;
  }

  // ── User data ──────────────────────────────────────────────────────────────

  /**
   * Store a value under `three.userData.graph3d.*`, namespaced to avoid
   * colliding with userData set by other Three.js code or loaders.
   * @param {string} key
   * @param {*} value
   * @returns {this}
   * @throws {TypeError} If `key` is not a non-empty string.
   * @throws {Error} If called after `dispose()`.
   * @example obj.setUserData('value', 42);
   */
  setUserData(key, value) {
    this.#assertNotDisposed('setUserData');
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError(
        `GraphObject.setUserData: key must be a non-empty string, received ${JSON.stringify(key)}.`,
      );
    }
    this.#three.userData.graph3d ??= {};
    this.#three.userData.graph3d[key] = value;
    return this;
  }

  /**
   * Read a value previously stored via `setUserData`.
   * @param {string} key
   * @returns {*} The stored value, or `undefined` if never set.
   * @throws {TypeError} If `key` is not a non-empty string.
   * @throws {Error} If called after `dispose()`.
   * @example obj.getUserData('value'); // 42
   */
  getUserData(key) {
    this.#assertNotDisposed('getUserData');
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError(
        `GraphObject.getUserData: key must be a non-empty string, received ${JSON.stringify(key)}.`,
      );
    }
    return this.#three.userData.graph3d?.[key];
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Remove `three` from its scene and unregister from the per-scene registry.
   * Idempotent — safe to call twice. Does not dispose `three`'s geometry or
   * material — subclasses that own GPU resources (`GraphMesh`,
   * `GraphInstancedObject`) are responsible for releasing those themselves.
   * @example obj.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#scene.remove(this.#three);
    unregisterSceneObject(this.#scene, this.#name, this);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /** @param {string} method @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`GraphObject.${method}: object '${this.#name}' has been disposed.`);
    }
  }
}
