import * as THREE from 'three';
import { anim } from '../anim/index.js';

// Wireframe marker radius for pick/selection overlays — small enough not to
// obscure the datum it's marking, large enough to spot at typical chart scale.
const MARKER_RADIUS = 0.15;
const PICK_MARKER_COLOR = 0xff00ff;
const SELECTION_MARKER_COLOR = 0x00ffff;
const OCTREE_LEAF_COLOR = 0xffaa00;

/**
 * Dev-only debugging surface (Prompt 178), reached via `Graph3D.devtools`.
 * Every method is either pure introspection (console output + a returned
 * data structure) or an ephemeral, disposable visual overlay added directly
 * to the active scene — none of it participates in rendering a chart
 * correctly, which is why `Graph3D.devtools` throws in production (see that
 * getter's own doc for the stripping mechanism).
 *
 * A composition-root exception (CLAUDE.md §1.4, alongside `Graph3D`'s own
 * `postfx`/`chart`/`GraphScene` imports): debugging needs to reach into
 * every layer's live state at once, so `GraphDevTools` reads the shared
 * `anim` singleton directly for `listActiveTimelines` rather than every
 * layer growing its own parallel debug surface. The other methods take the
 * object to inspect as an argument (a `Selection`, a `GraphInstancedObject`,
 * a `Picker.pickAt()` result) instead of importing those layers — only
 * `anim` needed a direct import, since timelines have no other public
 * registry to read from.
 *
 * @example
 * g.devtools.dumpSceneGraph();
 * g.devtools.memorySnapshot();
 * const helper = g.devtools.frustumDebugOverlay();
 * // later: g.activeScene.three.remove(helper);
 */
export class GraphDevTools {
  /** @type {import('./Graph3D.js').Graph3D} */
  #graph3d;

  /** @param {import('./Graph3D.js').Graph3D} graph3d */
  constructor(graph3d) {
    this.#graph3d = graph3d;
  }

  /**
   * Logs an indented tree of `scene`'s contents to the console and returns
   * the same tree as data.
   * @param {import('../scene/GraphScene.js').GraphScene} [scene] Defaults to the active scene.
   * @returns {{name: string, type: string, uuid: string, visible: boolean, children: object[]}}
   * @throws {Error} If no scene is given and no scene is active.
   * @example g.devtools.dumpSceneGraph();
   */
  dumpSceneGraph(scene = this.#graph3d.activeScene) {
    const resolved = this.#requireScene(scene, 'dumpSceneGraph');
    const tree = this.#buildNode(resolved.three);
    console.log(`[Graph3D.devtools] scene graph for '${resolved.name}':`);
    this.#logNode(tree, 0);
    return tree;
  }

  /**
   * Every timeline currently registered with the shared `anim` engine.
   * @returns {{isPlaying: boolean, time: number, duration: number}[]}
   * @example g.devtools.listActiveTimelines();
   */
  listActiveTimelines() {
    const snapshot = anim.timelines.map((timeline) => ({
      isPlaying: timeline.isPlaying,
      time: timeline.time,
      duration: timeline.duration,
    }));
    console.table(snapshot);
    return snapshot;
  }

  /**
   * GPU resource counts read from `THREE.WebGLRenderer.info`.
   * @returns {{geometries: number, textures: number, calls: number, triangles: number, points: number, lines: number}}
   * @throws {Error} If there is no browser renderer (e.g. under SSR).
   * @example g.devtools.memorySnapshot();
   */
  memorySnapshot() {
    const renderer = this.#graph3d.renderer.three;
    if (!renderer) {
      throw new Error(
        'Graph3D.devtools.memorySnapshot: no browser renderer available (this Graph3D instance was constructed under SSR).',
      );
    }
    const { memory, render } = renderer.info;
    const snapshot = {
      geometries: memory.geometries,
      textures: memory.textures,
      calls: render.calls,
      triangles: render.triangles,
      points: render.points,
      lines: render.lines,
    };
    console.log('[Graph3D.devtools] memory snapshot:', snapshot);
    return snapshot;
  }

  /**
   * Adds a wireframe marker at a `Picker.pickAt()` hit's world point.
   * @param {{worldPoint: THREE.Vector3, chart: *, instanceIndex: number|null, datum: *}|null} hit
   * @returns {THREE.Mesh|null} The added marker, or `null` if `hit` was `null`.
   * @throws {Error} If no scene is active.
   * @example g.devtools.pickingDebugOverlay(picker.pickAt(x, y));
   */
  pickingDebugOverlay(hit) {
    const scene = this.#requireScene(this.#graph3d.activeScene, 'pickingDebugOverlay');
    if (!hit) {
      console.log('[Graph3D.devtools] pickingDebugOverlay: no hit.');
      return null;
    }
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(MARKER_RADIUS, 12, 8),
      new THREE.MeshBasicMaterial({ color: PICK_MARKER_COLOR, wireframe: true }),
    );
    marker.name = 'devtools:pick-marker';
    marker.position.copy(hit.worldPoint);
    scene.three.add(marker);
    console.log('[Graph3D.devtools] pick:', { instanceIndex: hit.instanceIndex, datum: hit.datum });
    return marker;
  }

  /**
   * Adds a `THREE.CameraHelper` visualizing `camera`'s frustum.
   * @param {THREE.Camera} [camera] Defaults to the active scene's camera.
   * @returns {THREE.CameraHelper}
   * @throws {Error} If no scene is active and no `camera` is given.
   * @example g.devtools.frustumDebugOverlay();
   */
  frustumDebugOverlay(camera) {
    const scene = this.#requireScene(this.#graph3d.activeScene, 'frustumDebugOverlay');
    const resolvedCamera = camera ?? scene.camera.three;
    const helper = new THREE.CameraHelper(resolvedCamera);
    helper.name = 'devtools:frustum-helper';
    scene.three.add(helper);
    return helper;
  }

  /**
   * Adds a wireframe box for every populated leaf of `instancedObject`'s
   * internal octree.
   * @param {import('../object/GraphInstancedObject.js').GraphInstancedObject} instancedObject
   * @returns {THREE.Group}
   * @throws {TypeError} If `instancedObject` doesn't expose an `octree`.
   * @throws {Error} If no scene is active.
   * @example g.devtools.octreeDebugOverlay(chart.selection().backend.object);
   */
  octreeDebugOverlay(instancedObject) {
    const scene = this.#requireScene(this.#graph3d.activeScene, 'octreeDebugOverlay');
    if (!instancedObject || typeof instancedObject.octree?.dumpBounds !== 'function') {
      throw new TypeError(
        'Graph3D.devtools.octreeDebugOverlay: expected a GraphInstancedObject, received ' +
          JSON.stringify(instancedObject),
      );
    }
    const group = new THREE.Group();
    group.name = 'devtools:octree-overlay';
    for (const node of instancedObject.octree.dumpBounds()) {
      if (!node.isLeaf || node.itemCount === 0) continue;
      group.add(new THREE.Box3Helper(node.bounds, new THREE.Color(OCTREE_LEAF_COLOR)));
    }
    scene.three.add(group);
    return group;
  }

  /**
   * Logs `selection`'s backend type and member indices, and adds a wireframe
   * marker at every member's world position.
   * @param {import('../compose/selection/Selection.js').Selection} selection
   * @returns {THREE.Group}
   * @throws {TypeError} If `selection` doesn't expose a `backend`.
   * @throws {Error} If no scene is active.
   * @example g.devtools.selectionDebugOverlay(chart.selection().filter((d) => d.value > 90));
   */
  selectionDebugOverlay(selection) {
    const scene = this.#requireScene(this.#graph3d.activeScene, 'selectionDebugOverlay');
    if (!selection || typeof selection.backend !== 'object' || selection.backend === null) {
      throw new TypeError(
        `Graph3D.devtools.selectionDebugOverlay: expected a Selection, received ${JSON.stringify(selection)}.`,
      );
    }
    const { backend } = selection;
    const indices =
      backend.type === 'instanced' ? Array.from(backend.indices) : backend.meshes.map((_, i) => i);
    console.log(`[Graph3D.devtools] selection: backend=${backend.type} size=${selection.size()} indices=[${indices.join(', ')}]`);

    const group = new THREE.Group();
    group.name = 'devtools:selection-overlay';
    const worldPosition = new THREE.Vector3();
    for (let i = 0; i < selection.size(); i++) {
      if (backend.type === 'instanced') {
        worldPosition.copy(backend.object.getInstancePosition(backend.indices[i]));
      } else {
        backend.meshes[i].three.getWorldPosition(worldPosition);
      }
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(MARKER_RADIUS, 8, 6),
        new THREE.MeshBasicMaterial({ color: SELECTION_MARKER_COLOR, wireframe: true }),
      );
      marker.position.copy(worldPosition);
      group.add(marker);
    }
    scene.three.add(group);
    return group;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * @param {import('../scene/GraphScene.js').GraphScene|null|undefined} scene
   * @param {string} method
   * @returns {import('../scene/GraphScene.js').GraphScene}
   * @throws {Error}
   */
  #requireScene(scene, method) {
    if (!scene) {
      throw new Error(`Graph3D.devtools.${method}: no active scene. Call setActiveScene() first.`);
    }
    return scene;
  }

  /** @param {THREE.Object3D} object3D @returns {object} */
  #buildNode(object3D) {
    return {
      name: object3D.name || '(unnamed)',
      type: object3D.type,
      uuid: object3D.uuid,
      visible: object3D.visible,
      children: object3D.children.map((child) => this.#buildNode(child)),
    };
  }

  /** @param {object} node @param {number} depth */
  #logNode(node, depth) {
    console.log(`${'  '.repeat(depth)}${node.name} [${node.type}]${node.visible ? '' : ' (hidden)'}`);
    for (const child of node.children) this.#logNode(child, depth + 1);
  }
}
