import * as THREE from 'three';
import { GraphSceneCamera } from './GraphSceneCamera.js';
import { GraphSceneLight } from './GraphSceneLight.js';
import { GraphSceneEnvironment } from './GraphSceneEnvironment.js';
import { GraphSceneShadows } from './GraphSceneShadows.js';
import { GraphSceneClipping } from './GraphSceneClipping.js';
import { THEMES, VALID_THEMES, buildTheme } from './GraphSceneThemes.js';
import { getSceneObjectsByName } from './GraphSceneRegistry.js';

/** @type {{x:number,y:number,width:number,height:number}} */
const FULL_CANVAS_VIEWPORT = Object.freeze({ x: 0, y: 0, width: 1, height: 1 });

/**
 * Disposes a material and all THREE.Texture values it references.
 * Handles both single materials and arrays of materials.
 * @param {THREE.Material|THREE.Material[]} material
 */
export function disposeMaterial(material) {
  if (Array.isArray(material)) {
    for (const m of material) disposeMaterial(m);
    return;
  }
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  material.dispose();
}

/**
 * Walks an Object3D subtree and disposes every geometry/material reachable
 * from it. Shared by `GraphScene.dispose()` (the whole-scene safety net) and
 * any object wrapper whose own `dispose()` needs to release a multi-mesh
 * hierarchy it doesn't otherwise track piece by piece (e.g. a loaded model).
 * @param {THREE.Object3D} object3D
 */
export function disposeObjectTree(object3D) {
  object3D.traverse((object) => {
    if (object.geometry) {
      object.geometry.dispose();
    }
    if (object.material) {
      disposeMaterial(object.material);
    }
  });
}

/**
 * Wraps a THREE.Scene with managed defaults and rigorous disposal.
 *
 * Serves as the **disposal foundation** for Phase 2: every geometry,
 * material, and texture reachable from this scene is disposed when
 * `dispose()` is called. The constructor auto-creates a camera and a
 * default light rig; if `graph3d.renderer.three` is available it also
 * auto-creates environment, shadow, and clip-plane managers so a scene is
 * immediately usable without any further setup calls.
 *
 * To drop down to raw Three.js, use `scene.three` for full scene access,
 * `scene.useCamera(threeCamera)` to replace the managed camera, or
 * `scene.useLights(threeLightArray)` to replace the managed light rig.
 *
 * @example
 * const scene = new GraphScene({ graph3d: g, name: 'main' });
 * scene.add(myMesh);
 * scene.dispose(); // all geometry, materials, textures released
 */
export class GraphScene {
  /** @type {*} Graph3D instance reference. */
  #graph3d;

  /** @type {string} */
  #name;

  /** @type {THREE.Scene} */
  #scene;

  /** @type {THREE.WebGLRenderer|null} resolved from `graph3d.renderer.three`, if available */
  #renderer;

  /** @type {GraphSceneCamera} */
  #camera;

  /** @type {boolean} */
  #disposed = false;

  /** @type {Array<{x:number,y:number,width:number,height:number}>} */
  #viewports;

  /** @type {string|null} name of the currently applied theme, if any */
  #themeName = null;

  /** @type {GraphSceneLight|null} the active light rig — null only after `useLights()` */
  #light;

  /** @type {GraphSceneEnvironment|null} null when constructed without a renderer */
  #environment;

  /** @type {GraphSceneShadows|null} null when constructed without a renderer */
  #shadows;

  /** @type {GraphSceneClipping|null} null when constructed without a renderer */
  #clipping;

  /**
   * @param {{ graph3d: *, name: string }} options
   * @throws {TypeError} If `graph3d` is falsy.
   * @throws {TypeError} If `name` is not a non-empty string.
   * @example
   * const scene = new GraphScene({ graph3d: g, name: 'main' });
   */
  constructor({ graph3d, name } = {}) {
    if (!graph3d) {
      throw new TypeError('GraphScene: graph3d is required.');
    }
    if (typeof name !== 'string' || name.length === 0) {
      throw new TypeError(
        `GraphScene: name must be a non-empty string, received ${JSON.stringify(name)}.`,
      );
    }

    this.#graph3d = graph3d;
    this.#name = name;

    this.#scene = new THREE.Scene();
    this.#scene.name = name;

    this.#camera = new GraphSceneCamera();
    this.#light = new GraphSceneLight({ scene: this.#scene });

    // Environment/shadows/clipping need a renderer; skip them when graph3d
    // doesn't carry one yet (e.g. a bare stub in tests) — callers can still
    // reach the equivalent setup via GraphSceneSetup.ensureDefaults().
    this.#renderer = graph3d.renderer?.three ?? null;
    if (this.#renderer) {
      this.#environment = new GraphSceneEnvironment({ renderer: this.#renderer, scene: this.#scene });
      this.#shadows = new GraphSceneShadows({
        renderer: this.#renderer,
        scene: this.#scene,
        camera: this.#camera.three,
      });
      this.#clipping = new GraphSceneClipping({ renderer: this.#renderer });
    } else {
      this.#environment = null;
      this.#shadows = null;
      this.#clipping = null;
    }

    // Default: render to full canvas. Override with setViewports().
    this.#viewports = [FULL_CANVAS_VIEWPORT];
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  /**
   * Scene name as passed to the constructor.
   * @returns {string}
   */
  get name() {
    return this.#name;
  }

  /**
   * The underlying THREE.Scene — use as an escape hatch to raw Three.js.
   * @returns {THREE.Scene}
   */
  get three() {
    return this.#scene;
  }

  /**
   * The active camera. Graph3D reads `scene.camera.three` each frame to drive the renderer.
   * @returns {GraphSceneCamera}
   */
  get camera() {
    return this.#camera;
  }

  /**
   * The active managed light rig, or `null` after `useLights()` hands lighting to raw THREE.
   * @returns {GraphSceneLight|null}
   */
  get light() {
    return this.#light;
  }

  /**
   * The environment manager (HDR, background, fog), or `null` if this scene
   * was constructed without a renderer available on `graph3d`.
   * @returns {GraphSceneEnvironment|null}
   */
  get environment() {
    return this.#environment;
  }

  /**
   * The shadow manager, or `null` if this scene was constructed without a
   * renderer available on `graph3d`.
   * @returns {GraphSceneShadows|null}
   */
  get shadows() {
    return this.#shadows;
  }

  /**
   * The clip-plane manager, or `null` if this scene was constructed without a
   * renderer available on `graph3d`.
   * @returns {GraphSceneClipping|null}
   */
  get clipping() {
    return this.#clipping;
  }

  /**
   * Viewport configurations for multiViewport rendering.
   * Each entry uses normalized [0, 1] canvas coordinates.
   * Default: one viewport covering the full canvas.
   * @returns {Array<{x:number,y:number,width:number,height:number}>}
   */
  get viewports() {
    return this.#viewports;
  }

  /**
   * Name of the currently applied theme, or `null` if `applyTheme` has never been called.
   * @returns {string|null}
   */
  get theme() {
    return this.#themeName;
  }

  /**
   * Default hex-colour palette of the currently applied theme, or `null` if
   * `applyTheme` has never been called.
   * @returns {number[]|null}
   */
  get palette() {
    return this.#themeName ? THEMES[this.#themeName].palette : null;
  }

  // ── Theme ──────────────────────────────────────────────────────────────────

  /**
   * Apply a named theme: a coherent bundle of camera preset, light preset,
   * HDR, fog, shadow quality, and a default material palette.
   *
   * A theme fully owns scene lighting and atmosphere once applied — any
   * existing lights (including the constructor's defaults) are removed, and
   * the environment/shadow managers from a previous `applyTheme` call are
   * disposed once the new ones are ready to take their place.
   *
   * The HDR fetch (the only step that can fail, e.g. a missing/malformed
   * `.hdr` file) runs before anything is mutated, so a rejected promise
   * leaves the previous theme — camera, lights, environment, shadows —
   * fully intact rather than half-applying the new one.
   *
   * Environment and shadows require a renderer; without one (and none was
   * resolved from `graph3d.renderer.three` at construction) they are skipped
   * and `scene.theme`/`scene.palette`/camera/lights still apply, matching
   * the renderer-optional behavior of `GraphSceneSetup`.
   *
   * @param {string} name - One of: studio-light, studio-dark, cinema-night,
   *   clinical-white, terminal-green, editorial, cyberpunk, museum.
   * @param {{ renderer?: THREE.WebGLRenderer }} [options] - Defaults to the
   *   renderer resolved from `graph3d.renderer.three` at construction.
   * @returns {Promise<this>}
   * @throws {TypeError} If `name` is not a recognised theme.
   * @throws {Error} If called after `dispose()`.
   * @throws {Error} Propagates a rejected HDR load (e.g. missing `.hdr` asset)
   *   without mutating the scene.
   * @example
   * await scene.applyTheme('cinema-night');
   */
  async applyTheme(name, { renderer = this.#renderer } = {}) {
    this.#assertNotDisposed('applyTheme');
    const config = THEMES[name];
    if (!config) {
      throw new TypeError(
        `GraphScene.applyTheme: unknown theme '${name}'. ` +
          `Expected one of: [${VALID_THEMES.join(', ')}].`,
      );
    }

    // buildTheme() runs its fallible HDR fetch before mutating anything, so if
    // it rejects, the previous theme's camera/light/environment/shadows are
    // still intact — don't dispose them until the new ones are ready to swap in.
    const { light, environment, shadows } = await buildTheme(this, config, renderer);

    if (this.#disposed) {
      light.dispose();
      environment?.dispose();
      shadows?.dispose();
      return this;
    }

    this.#light?.dispose();
    this.#environment?.dispose();
    this.#shadows?.dispose();

    this.#light = light;
    this.#environment = environment;
    this.#shadows = shadows;
    this.#themeName = name;
    return this;
  }

  // ── Escape hatches ─────────────────────────────────────────────────────────

  /**
   * Replace the managed camera with a raw THREE camera, dropping to manual
   * control. Delegates to `GraphSceneCamera.useCustom`.
   *
   * @param {THREE.Camera} camera
   * @returns {this}
   * @throws {TypeError} If `camera` is not a `THREE.Camera`.
   * @throws {Error} If called after `dispose()`.
   * @example scene.useCamera(new THREE.PerspectiveCamera(45, aspect, 0.1, 1000));
   */
  useCamera(camera) {
    this.#assertNotDisposed('useCamera');
    this.#camera.useCustom(camera);
    return this;
  }

  /**
   * Replace the managed light rig with a raw array of THREE lights, dropping
   * to manual control. Disposes the current `GraphSceneLight` (if any) and
   * adds `lights` directly to the scene graph. `scene.light` is `null` after
   * this call — reach for the raw lights via `scene.three` or `findByName`.
   *
   * @param {THREE.Light[]} lights
   * @returns {this}
   * @throws {TypeError} If `lights` is not an array of `THREE.Light` instances.
   * @throws {Error} If called after `dispose()`.
   * @example scene.useLights([new THREE.HemisphereLight(0xffffff, 0x444444, 1)]);
   */
  useLights(lights) {
    this.#assertNotDisposed('useLights');
    if (!Array.isArray(lights) || lights.some((l) => !(l instanceof THREE.Light))) {
      throw new TypeError(
        'GraphScene.useLights: expected an array of THREE.Light instances.',
      );
    }
    this.#light?.dispose();
    this.#light = null;
    this.#scene.add(...lights);
    return this;
  }

  // ── Scene graph ────────────────────────────────────────────────────────────

  /**
   * Add one or more objects to the scene.
   * @param {...THREE.Object3D} objects
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example scene.add(mesh, group);
   */
  add(...objects) {
    this.#assertNotDisposed('add');
    this.#scene.add(...objects);
    return this;
  }

  /**
   * Remove one or more objects from the scene.
   * @param {...THREE.Object3D} objects
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example scene.remove(mesh);
   */
  remove(...objects) {
    this.#assertNotDisposed('remove');
    this.#scene.remove(...objects);
    return this;
  }

  /**
   * Walk the full scene graph depth-first, passing every object to `callback`.
   * @param {function(THREE.Object3D): void} callback
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example scene.traverse(obj => console.log(obj.name));
   */
  traverse(callback) {
    this.#assertNotDisposed('traverse');
    this.#scene.traverse(callback);
    return this;
  }

  /**
   * Find the first object in the scene graph with the given name.
   * Uses THREE.Scene.getObjectByName (depth-first search).
   * @param {string} name
   * @returns {THREE.Object3D|null} Matching object or `null` if not found.
   * @throws {Error} If called after `dispose()`.
   * @example scene.findByName('_key'); // the default light rig's key light
   */
  findByName(name) {
    this.#assertNotDisposed('findByName');
    return this.#scene.getObjectByName(name) ?? null;
  }

  // ── Selection ──────────────────────────────────────────────────────────────

  /**
   * Look up every `GraphObject` (a `GraphMesh`, a `GraphInstancedObject`, or
   * any other wrapper registered under `name`) added to this scene — as
   * opposed to `findByName`, which walks the raw `THREE.Object3D` graph.
   * @param {string} name
   * @returns {object[]} A fresh array, empty if nothing is registered under `name`.
   * @throws {TypeError} If `name` is not a non-empty string.
   * @throws {Error} If called after `dispose()`.
   * @example scene.selectByName('bars'); // [GraphInstancedObject]
   */
  selectByName(name) {
    this.#assertNotDisposed('selectByName');
    if (typeof name !== 'string' || name.length === 0) {
      throw new TypeError(
        `GraphScene.selectByName: name must be a non-empty string, received ${JSON.stringify(name)}.`,
      );
    }
    return getSceneObjectsByName(this.#scene, name);
  }

  /**
   * Resolve a single indexed slot on the `GraphInstancedObject` registered
   * under `name`, for interaction code (Phase 9) that picks one instance out
   * of a batch rather than the whole object.
   * @param {string} name
   * @param {number} index
   * @returns {{ object: object, index: number }}
   * @throws {TypeError} If `name` is not a non-empty string, or `index` is not a non-negative integer.
   * @throws {Error} If zero or more than one instanced object is registered under `name`.
   * @throws {RangeError} If `index` exceeds the object's capacity.
   * @throws {Error} If called after `dispose()`.
   * @example scene.selectInstance('bars', 12); // { object: GraphInstancedObject, index: 12 }
   */
  selectInstance(name, index) {
    this.#assertNotDisposed('selectInstance');
    if (typeof name !== 'string' || name.length === 0) {
      throw new TypeError(
        `GraphScene.selectInstance: name must be a non-empty string, received ${JSON.stringify(name)}.`,
      );
    }
    if (!Number.isInteger(index) || index < 0) {
      throw new TypeError(
        `GraphScene.selectInstance: index must be a non-negative integer, received ${JSON.stringify(index)}.`,
      );
    }
    const matches = getSceneObjectsByName(this.#scene, name).filter((obj) => obj.isInstanced);
    if (matches.length !== 1) {
      throw new Error(
        `GraphScene.selectInstance: expected exactly one instanced object named '${name}' ` +
          `in scene '${this.#name}', found ${matches.length}.`,
      );
    }
    const object = matches[0];
    if (index >= object.capacity) {
      throw new RangeError(
        `GraphScene.selectInstance: index ${index} is out of bounds for '${name}' (capacity ${object.capacity}).`,
      );
    }
    return { object, index };
  }

  // ── Viewport ──────────────────────────────────────────────────────────────

  /**
   * Set the viewport layout for this scene. Each entry uses normalized [0, 1]
   * canvas coordinates `{ x, y, width, height }`. Providing multiple viewports
   * enables picture-in-picture or side-by-side rendering.
   *
   * @param {Array<{x:number,y:number,width:number,height:number}>} viewports
   * @returns {this}
   * @throws {TypeError} If `viewports` is not a non-empty array of `{ x, y, width, height }` objects.
   * @throws {Error} If called after `dispose()`.
   * @example
   * // Side-by-side
   * scene.setViewports([
   *   { x: 0,   y: 0, width: 0.5, height: 1 },
   *   { x: 0.5, y: 0, width: 0.5, height: 1 },
   * ]);
   * @example
   * // Picture-in-picture: full canvas + top-right inset
   * scene.setViewports([
   *   { x: 0,    y: 0,    width: 1,    height: 1    },
   *   { x: 0.75, y: 0.75, width: 0.25, height: 0.25 },
   * ]);
   */
  setViewports(viewports) {
    this.#assertNotDisposed('setViewports');
    if (!Array.isArray(viewports) || viewports.length === 0) {
      throw new TypeError('GraphScene.setViewports: viewports must be a non-empty array.');
    }
    for (let i = 0; i < viewports.length; i++) {
      const vp = viewports[i];
      if (
        typeof vp?.x !== 'number' ||
        typeof vp?.y !== 'number' ||
        typeof vp?.width !== 'number' ||
        typeof vp?.height !== 'number'
      ) {
        throw new TypeError(
          `GraphScene.setViewports: viewport[${i}] must have numeric x, y, width, height.`,
        );
      }
    }
    this.#viewports = viewports;
    return this;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Release all GPU resources reachable from this scene.
   *
   * Walks the full THREE.Scene graph and calls `.dispose()` on every
   * geometry, material, and texture it encounters. After walking, clears
   * the scene graph. Idempotent — safe to call twice.
   *
   * This is the **disposal foundation** for Phase 2. Sub-components added
   * in later prompts must add their resources to the scene graph for this
   * walk to cover them automatically.
   *
   * @example scene.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;

    this.#camera.dispose();
    this.#light?.dispose();
    this.#environment?.dispose();
    this.#shadows?.dispose();
    this.#clipping?.dispose();

    disposeObjectTree(this.#scene);
    this.#scene.clear();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * @param {string} method
   * @throws {Error}
   */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(
        `GraphScene.${method}: scene '${this.#name}' has been disposed.`,
      );
    }
  }
}
