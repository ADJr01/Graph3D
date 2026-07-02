import * as THREE from 'three';
import { GraphInstancedObject } from './GraphInstancedObject.js';
import { GraphMesh } from './GraphMesh.js';

/**
 * Below this many datums, `GraphObjectFactory` keeps one `GraphMesh` per
 * datum (inspectable in DevTools/the scene graph, individually pickable at
 * negligible cost); at or above it, one `GraphInstancedObject` batch (a
 * single draw call, the only path that scales to millions). This is the
 * single most important performance decision in the library — override it
 * per call via `options.instancingThreshold`.
 */
export const INSTANCING_THRESHOLD = 50;

/**
 * @param {THREE.Material|THREE.Material[]} material
 * @returns {THREE.Material|THREE.Material[]} a clone (or array of clones)
 */
function cloneMaterial(material) {
  return Array.isArray(material) ? material.map((m) => m.clone()) : material.clone();
}

/**
 * Shared dispatch: below `instancingThreshold`, one cloned geometry/material
 * per `GraphMesh` (each must own an independent, independently-disposable
 * copy — see `GraphMesh`'s cloning/disposal notes); at or above it, one
 * `GraphInstancedObject` that owns `geometry`/`material` directly.
 * @param {{ scene: THREE.Scene, name: string, geometry: THREE.BufferGeometry,
 *   material: THREE.Material|THREE.Material[], count: number, instancingThreshold?: number }} params
 * @returns {GraphMesh[]|GraphInstancedObject}
 * @throws {TypeError} If `count` or `instancingThreshold` is not a positive integer.
 */
function build({ scene, name, geometry, material, count, instancingThreshold }) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new TypeError(
      `GraphObjectFactory: count must be a positive integer, received ${JSON.stringify(count)}.`,
    );
  }
  const threshold = instancingThreshold ?? INSTANCING_THRESHOLD;
  if (!Number.isInteger(threshold) || threshold < 1) {
    throw new TypeError(
      `GraphObjectFactory: instancingThreshold must be a positive integer, received ${JSON.stringify(threshold)}.`,
    );
  }

  if (count <= threshold) {
    const objects = new Array(count);
    for (let i = 0; i < count; i++) {
      objects[i] = GraphObjectFactory.createMesh(`${name}_${i}`, { scene, geometry, material });
    }
    return objects;
  }

  return new GraphInstancedObject({ scene, name, geometry, material, count });
}

/**
 * Static factories for the five base chart primitives. Each picks
 * `GraphMesh[]` or `GraphInstancedObject` per `INSTANCING_THRESHOLD` and
 * returns default (unit-scale) geometry ready for the caller to position,
 * scale, and color per datum via the APIs those classes already expose.
 *
 * @example
 * const bars = GraphObjectFactory.createBars(100_000, { scene: graphScene.three, name: 'bars' });
 * // bars is a single GraphInstancedObject — bars.setInstancePosition(...), etc.
 *
 * const points = GraphObjectFactory.createPoints(12, { scene: graphScene.three, name: 'pt' });
 * // points is a GraphMesh[] of length 12 — points[0].setPosition(...), etc.
 */
export class GraphObjectFactory {
  /**
   * A single independently-disposable `GraphMesh`, cloning `geometry`/
   * `material` so it owns them outright (matches the per-mesh cloning `build()`
   * already does below `instancingThreshold` — factored out here so the join
   * system's enter-materialization (`compose/selection/join.js`, Prompt 79)
   * can create one new mesh at a time without duplicating that clone logic,
   * CLAUDE.md §1.1 DRY two-strike rule).
   * @param {string} name
   * @param {{ scene: THREE.Scene, geometry: THREE.BufferGeometry, material: THREE.Material|THREE.Material[] }} options
   * @returns {GraphMesh}
   * @throws {TypeError} If `geometry`/`material` don't match `GraphMesh`'s constructor requirements.
   * @example GraphObjectFactory.createMesh('bar_3', { scene, geometry, material });
   */
  static createMesh(name, { scene, geometry, material }) {
    return new GraphMesh({ scene, name, geometry: geometry.clone(), material: cloneMaterial(material) });
  }

  /**
   * Bar-chart bars: unit boxes, meant to be scaled per datum along Y.
   * @param {number} count
   * @param {{ scene: THREE.Scene, name: string, geometry?: THREE.BufferGeometry,
   *   material?: THREE.Material|THREE.Material[], instancingThreshold?: number }} options
   * @returns {GraphMesh[]|GraphInstancedObject}
   * @throws {TypeError} If `count` or `options.instancingThreshold` is not a positive integer.
   * @example GraphObjectFactory.createBars(100_000, { scene, name: 'bars' });
   */
  static createBars(count, options = {}) {
    return build({
      ...options,
      count,
      geometry: options.geometry ?? new THREE.BoxGeometry(1, 1, 1),
      material: options.material ?? new THREE.MeshStandardMaterial({ color: 0xffffff }),
    });
  }

  /**
   * Scatter-plot points: small spheres, real 3D objects (not `THREE.Points`
   * sprites) so each one is individually pickable/raycastable.
   * @param {number} count
   * @param {{ scene: THREE.Scene, name: string, geometry?: THREE.BufferGeometry,
   *   material?: THREE.Material|THREE.Material[], instancingThreshold?: number }} options
   * @returns {GraphMesh[]|GraphInstancedObject}
   * @throws {TypeError} If `count` or `options.instancingThreshold` is not a positive integer.
   * @example GraphObjectFactory.createPoints(1_000_000, { scene, name: 'scatter' });
   */
  static createPoints(count, options = {}) {
    return build({
      ...options,
      count,
      geometry: options.geometry ?? new THREE.SphereGeometry(0.1, 8, 6),
      material: options.material ?? new THREE.MeshStandardMaterial({ color: 0xffffff }),
    });
  }

  /**
   * Line segments: a thin unit-length box along X, meant to be positioned at
   * a segment's midpoint, rotated to its orientation, and scaled along X to
   * its length.
   * @param {number} count
   * @param {{ scene: THREE.Scene, name: string, geometry?: THREE.BufferGeometry,
   *   material?: THREE.Material|THREE.Material[], instancingThreshold?: number }} options
   * @returns {GraphMesh[]|GraphInstancedObject}
   * @throws {TypeError} If `count` or `options.instancingThreshold` is not a positive integer.
   * @example GraphObjectFactory.createLineSegments(500, { scene, name: 'edges' });
   */
  static createLineSegments(count, options = {}) {
    return build({
      ...options,
      count,
      geometry: options.geometry ?? new THREE.BoxGeometry(1, 0.02, 0.02),
      material: options.material ?? new THREE.MeshStandardMaterial({ color: 0xffffff }),
    });
  }

  /**
   * Surface-plot tiles: a unit quad, meant to be positioned/rotated per grid cell.
   * @param {number} count
   * @param {{ scene: THREE.Scene, name: string, geometry?: THREE.BufferGeometry,
   *   material?: THREE.Material|THREE.Material[], instancingThreshold?: number }} options
   * @returns {GraphMesh[]|GraphInstancedObject}
   * @throws {TypeError} If `count` or `options.instancingThreshold` is not a positive integer.
   * @example GraphObjectFactory.createSurfaceTiles(2_500, { scene, name: 'surface' });
   */
  static createSurfaceTiles(count, options = {}) {
    return build({
      ...options,
      count,
      geometry: options.geometry ?? new THREE.PlaneGeometry(1, 1),
      material: options.material ?? new THREE.MeshStandardMaterial({ color: 0xffffff }),
    });
  }

  /**
   * Node-link graph nodes: spheres, larger and more detailed by default than
   * `createPoints` since nodes are typically a chart's focal elements.
   * @param {number} count
   * @param {{ scene: THREE.Scene, name: string, geometry?: THREE.BufferGeometry,
   *   material?: THREE.Material|THREE.Material[], instancingThreshold?: number }} options
   * @returns {GraphMesh[]|GraphInstancedObject}
   * @throws {TypeError} If `count` or `options.instancingThreshold` is not a positive integer.
   * @example GraphObjectFactory.createNodes(30, { scene, name: 'node' });
   */
  static createNodes(count, options = {}) {
    return build({
      ...options,
      count,
      geometry: options.geometry ?? new THREE.SphereGeometry(0.2, 16, 12),
      material: options.material ?? new THREE.MeshStandardMaterial({ color: 0xffffff }),
    });
  }
}
