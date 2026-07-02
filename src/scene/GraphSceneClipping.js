import * as THREE from 'three';

/**
 * Manages global clip planes on a renderer for slicing/sectioning a scene —
 * letting users "cut into" volumetric heatmaps or surface charts.
 *
 * Clip planes are global (`renderer.clippingPlanes`): they apply to every
 * object in every scene rendered by this renderer, not just one `GraphScene`.
 *
 * @example
 * const clipping = new GraphSceneClipping({ renderer });
 * const plane = clipping.addClipPlane([0, -1, 0], 0); // hide everything below y=0
 * clipping.removeClipPlane(plane);
 */
export class GraphSceneClipping {
  /** @type {THREE.WebGLRenderer} */
  #renderer;

  /** @type {THREE.Plane[]} */
  #planes = [];

  /** @type {boolean} */
  #disposed = false;

  /**
   * @param {{ renderer: THREE.WebGLRenderer }} options
   * @throws {TypeError} If `renderer` is not a THREE.WebGLRenderer instance.
   * @example
   * const clipping = new GraphSceneClipping({ renderer });
   */
  constructor({ renderer } = {}) {
    if (!renderer || typeof renderer !== 'object' || !Array.isArray(renderer.clippingPlanes)) {
      throw new TypeError(
        'GraphSceneClipping: renderer must be a THREE.WebGLRenderer instance.',
      );
    }
    this.#renderer = renderer;
  }

  /** Active clip planes, in insertion order. @returns {THREE.Plane[]} */
  get planes() {
    return this.#planes;
  }

  /**
   * Add a global clip plane. Geometry on the positive side of the plane
   * normal is kept; geometry on the negative side is clipped away.
   *
   * @param {THREE.Vector3|[number, number, number]} normal - Plane normal.
   * @param {number} constant - Signed distance of the plane from the origin.
   * @returns {THREE.Plane} The created plane — pass it to `removeClipPlane` later.
   * @throws {TypeError} If `normal` is not a Vector3 or a 3-number array, or `constant` is not a finite number.
   * @throws {Error} If called after `dispose()`.
   * @example clipping.addClipPlane([0, -1, 0], 0); // clip below y=0
   */
  addClipPlane(normal, constant) {
    this.#assertNotDisposed('addClipPlane');
    const normalVector = this.#toVector3(normal);
    if (typeof constant !== 'number' || !Number.isFinite(constant)) {
      throw new TypeError(
        `GraphSceneClipping.addClipPlane: constant must be a finite number, received ${JSON.stringify(constant)}.`,
      );
    }
    const plane = new THREE.Plane(normalVector, constant);
    this.#planes.push(plane);
    this.#sync();
    return plane;
  }

  /**
   * Remove a previously added clip plane.
   * @param {THREE.Plane} plane - The plane instance returned by `addClipPlane`.
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example clipping.removeClipPlane(plane);
   */
  removeClipPlane(plane) {
    this.#assertNotDisposed('removeClipPlane');
    const index = this.#planes.indexOf(plane);
    if (index !== -1) {
      this.#planes.splice(index, 1);
      this.#sync();
    }
    return this;
  }

  /**
   * Remove every active clip plane.
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example clipping.clearClipPlanes();
   */
  clearClipPlanes() {
    this.#assertNotDisposed('clearClipPlanes');
    this.#planes.length = 0;
    this.#sync();
    return this;
  }

  /**
   * Remove all clip planes from the renderer. Idempotent — safe to call twice.
   * @example clipping.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#planes.length = 0;
    this.#sync();
  }

  /** @param {THREE.Vector3|[number, number, number]} normal @returns {THREE.Vector3} */
  #toVector3(normal) {
    if (normal instanceof THREE.Vector3) return normal.clone();
    if (
      Array.isArray(normal) &&
      normal.length === 3 &&
      normal.every((n) => typeof n === 'number' && Number.isFinite(n))
    ) {
      return new THREE.Vector3(...normal);
    }
    throw new TypeError(
      `GraphSceneClipping.addClipPlane: normal must be a THREE.Vector3 or a [x, y, z] array of finite numbers, received ${JSON.stringify(normal)}.`,
    );
  }

  #sync() {
    this.#renderer.clippingPlanes = this.#planes;
  }

  /** @param {string} method */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`GraphSceneClipping.${method}: instance has been disposed.`);
    }
  }
}
