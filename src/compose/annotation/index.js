import * as THREE from 'three';
// annotation renders literal callout/plane/region meshes into the scene —
// the same sanctioned carve-out compose/axis and compose/selection already
// use (CLAUDE.md §1.4's compose/ row): a real 3D scene needs literal
// renderable primitives, not describable-only data.
import { GraphMesh } from '../../object/index.js';
import { assertOrientation, longAxisBoxSize, pointAlong } from '../axis/orientationAxes.js';
import { label } from './label.js';

const LINE_THICKNESS = 0.02;
const ANNOTATION_COLOR = 0x333333;
const DEFAULT_REFERENCE_LINE_EXTENT = 10;
const DEFAULT_PLANE_SIZE = 10;
const PLANE_THICKNESS = 0.02;
const PLANE_COLOR = 0x4a90d9;
const PLANE_OPACITY = 0.2;
const REGION_COLOR = 0xffd54f;
const REGION_OPACITY = 0.15;

function assertScene(method, scene) {
  if (!(scene instanceof THREE.Scene)) {
    throw new TypeError(`annotation.${method}: expected scene to be a THREE.Scene, received ${JSON.stringify(scene)}.`);
  }
}

function assertName(method, name) {
  if (typeof name !== 'string' || name === '') {
    throw new TypeError(`annotation.${method}: expected a non-empty string name, received ${JSON.stringify(name)}.`);
  }
}

function assertPoint(method, point) {
  if (
    point === null ||
    typeof point !== 'object' ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(point.z)
  ) {
    throw new TypeError(`annotation.${method}: expected a finite { x, y, z } point, received ${JSON.stringify(point)}.`);
  }
}

function assertFiniteNumber(method, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`annotation.${method}: expected a finite number, received ${JSON.stringify(value)}.`);
  }
}

function assertPositiveNumber(method, value) {
  if (typeof value !== 'number' || !(value > 0)) {
    throw new TypeError(`annotation.${method}: expected a positive number, received ${JSON.stringify(value)}.`);
  }
}

/** Box dims `[w,h,d]` for a flat plane perpendicular to `orientation`, `size` on the other two axes. */
function planeDimensions(orientation, size, thickness) {
  assertOrientation('annotation.referencePlane', orientation);
  if (orientation === 'x') return [thickness, size, size];
  if (orientation === 'y') return [size, thickness, size];
  return [size, size, thickness];
}

/**
 * Creates a callout: a leader line from `from` to `to`, plus a stubbed text
 * label (`annotation.label`) anchored at `to`.
 * @param {{ scene: THREE.Scene, name: string, from: {x:number,y:number,z:number},
 *   to: {x:number,y:number,z:number}, text: string, style?: object }} config
 * @returns {{ type: 'callout', line: GraphMesh, label: object, dispose: () => void }}
 * @throws {TypeError} If `scene`/`name`/`from`/`to` are the wrong type, or `text` is not a string.
 * @example
 * annotation.callout({ scene, name: 'peak', from: { x: 3, y: 5, z: 0 }, to: { x: 3, y: 7, z: 0 }, text: 'Peak: 5' });
 */
function callout({ scene, name, from, to, text, style = {} } = {}) {
  assertScene('callout', scene);
  assertName('callout', name);
  assertPoint('callout', from);
  assertPoint('callout', to);

  const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const geometry = new THREE.BoxGeometry(LINE_THICKNESS, LINE_THICKNESS, length);
  const line = new GraphMesh({ scene, name, geometry, material: new THREE.MeshBasicMaterial({ color: ANNOTATION_COLOR }) });
  line.setPosition((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  if (length > 0) line.lookAt(to.x, to.y, to.z);

  return {
    type: 'callout',
    line,
    label: label({ text, position: to, style }),
    dispose() {
      line.dispose();
    },
  };
}

/**
 * Creates a reference line: a thin bar marking a constant `scale(value)`
 * along `orientation`, spanning `extent` on the perpendicular ground axis —
 * e.g. a horizontal threshold line across a bar chart.
 * @param {Function} scale A scale (callable `(value) => number`).
 * @param {*} value The domain value to mark.
 * @param {{ scene: THREE.Scene, name: string, orientation?: 'x'|'y'|'z', extent?: number }} config
 * @returns {GraphMesh}
 * @throws {TypeError} If `scale` is not a function, `scene`/`name` are the
 *   wrong type, `orientation` isn't `'x'|'y'|'z'`, `extent` isn't a positive
 *   number, or `scale(value)` isn't a finite number.
 * @example annotation.referenceLine(yScale, 100, { scene, name: 'target' });
 */
function referenceLine(scale, value, { scene, name, orientation = 'y', extent = DEFAULT_REFERENCE_LINE_EXTENT } = {}) {
  if (typeof scale !== 'function') {
    throw new TypeError(`annotation.referenceLine: expected scale to be a function, received ${JSON.stringify(scale)}.`);
  }
  assertScene('referenceLine', scene);
  assertName('referenceLine', name);
  assertOrientation('annotation.referenceLine', orientation);
  assertPositiveNumber('referenceLine', extent);

  const along = scale(value);
  assertFiniteNumber('referenceLine', along);

  const spanAxis = orientation === 'x' ? 'z' : 'x';
  const geometry = new THREE.BoxGeometry(...longAxisBoxSize(spanAxis, extent, LINE_THICKNESS));
  const mesh = new GraphMesh({ scene, name, geometry, material: new THREE.MeshBasicMaterial({ color: ANNOTATION_COLOR, transparent: true, opacity: 0.6 }) });
  const center = pointAlong(orientation, along);
  mesh.setPosition(center.x, center.y, center.z);
  return mesh;
}

/**
 * Creates a reference plane: a flat, translucent panel marking a constant
 * value along one axis, spanning `size` on the other two — e.g. a ground
 * plane at `y = 0` or a threshold wall at `x = 10`.
 * @param {'x'|'y'|'z'} axis The axis this plane is constant along.
 * @param {number} value The value to mark.
 * @param {{ scene: THREE.Scene, name: string, size?: number }} config
 * @returns {GraphMesh}
 * @throws {TypeError} If `axis` isn't `'x'|'y'|'z'`, `value` isn't a finite
 *   number, `scene`/`name` are the wrong type, or `size` isn't a positive number.
 * @example annotation.referencePlane('y', 0, { scene, name: 'ground' });
 */
function referencePlane(axis, value, { scene, name, size = DEFAULT_PLANE_SIZE } = {}) {
  assertFiniteNumber('referencePlane', value);
  assertScene('referencePlane', scene);
  assertName('referencePlane', name);
  assertPositiveNumber('referencePlane', size);

  const geometry = new THREE.BoxGeometry(...planeDimensions(axis, size, PLANE_THICKNESS));
  const material = new THREE.MeshBasicMaterial({ color: PLANE_COLOR, transparent: true, opacity: PLANE_OPACITY, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new GraphMesh({ scene, name, geometry, material });
  const center = pointAlong(axis, value);
  mesh.setPosition(center.x, center.y, center.z);
  return mesh;
}

/**
 * Creates a region highlight: a translucent box spanning `box.min`..`box.max`.
 * @param {{ min: {x:number,y:number,z:number}, max: {x:number,y:number,z:number} }} box
 * @param {{ scene: THREE.Scene, name: string }} config
 * @returns {GraphMesh}
 * @throws {TypeError} If `box.min`/`box.max` aren't finite points, `box.max`
 *   doesn't exceed `box.min` on every axis, or `scene`/`name` are the wrong type.
 * @example annotation.region({ min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 3, z: 5 } }, { scene, name: 'highlight' });
 */
function region(box, { scene, name } = {}) {
  if (box === null || typeof box !== 'object') {
    throw new TypeError(`annotation.region: expected box to be { min, max }, received ${JSON.stringify(box)}.`);
  }
  assertPoint('region', box.min);
  assertPoint('region', box.max);
  assertScene('region', scene);
  assertName('region', name);

  const size = { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z };
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
    throw new TypeError('annotation.region: box.max must exceed box.min on every axis.');
  }
  const center = { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 };

  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const material = new THREE.MeshBasicMaterial({ color: REGION_COLOR, transparent: true, opacity: REGION_OPACITY, depthWrite: false });
  const mesh = new GraphMesh({ scene, name, geometry, material });
  mesh.setPosition(center.x, center.y, center.z);
  return mesh;
}

/**
 * The `annotation` namespace (CLAUDE.md §5). `label` returns `{text, position,
 * style}` metadata by default, or a real, camera-billboarded label (via
 * `graphHTML` — experimental HTML-in-Canvas, falling back to `SDFText`) when
 * `scene`/`camera` are passed; `callout`/`referenceLine`/`referencePlane`/
 * `region` are real `GraphMesh` scene objects — dispose them (or, for
 * `callout`, call the returned `.dispose()`) like any other `GraphMesh`.
 */
export const annotation = { label, callout, referenceLine, referencePlane, region };
