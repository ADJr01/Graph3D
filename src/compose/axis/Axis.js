import * as THREE from 'three';
// Axis renders literal tick/spine meshes into the scene — no data-only chart
// layer exists yet to do that on its behalf. Importing GraphMesh from
// object/ (and constructing raw THREE geometry/material to hand it) mirrors
// compose/selection's identical, already-sanctioned carve-out (CLAUDE.md
// §1.4's compose/ row) for the same reason: a real 3D scene needs literal
// renderable primitives, not describable-only data.
import { GraphMesh } from '../../object/index.js';
import { assertOrientation, longAxisBoxSize, pointAlong } from './orientationAxes.js';
import { label } from '../annotation/label.js';

const DEFAULT_TICK_COUNT = 10;
const DEFAULT_TICK_SIZE = 0.2;
// Thin-box line convention shared with GraphObjectFactory.createLineSegments
// (CLAUDE.md §1.1 DRY: "a line is a thin box" is decided once, project-wide).
const AXIS_LINE_THICKNESS = 0.02;
const AXIS_COLOR = 0x333333;

function assertFiniteNumber(method, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Axis.${method}: expected a finite number, received ${JSON.stringify(value)}.`);
  }
}

function assertPositiveInteger(method, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`Axis.${method}: expected a positive integer, received ${JSON.stringify(value)}.`);
  }
}

function assertPositiveNumber(method, value) {
  if (typeof value !== 'number' || !(value > 0)) {
    throw new TypeError(`Axis.${method}: expected a positive number, received ${JSON.stringify(value)}.`);
  }
}

function assertFunction(method, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`Axis.${method}: expected a function, received ${JSON.stringify(value)}.`);
  }
}

/** The axis all ticks extend outward along — perpendicular to the spine's own axis. */
function tickOffsetAxis(orientation) {
  return orientation === 'y' ? 'x' : 'y';
}

function tickCenter(orientation, alongValue, tickSize) {
  const center = pointAlong(orientation, alongValue);
  center[tickOffsetAxis(orientation)] -= tickSize / 2;
  return center;
}

/**
 * Renders a scale as a real 3D scene object: a spine line spanning the
 * scale's range, one tick mark per `scale.ticks()`/`scale.domain()` entry,
 * and one label per tick. Label rendering is stubbed to metadata
 * (`{ text, position }`, via `annotation.label`) until Phase 6's SDF text
 * material exists — see `docs/concepts/compose.md`.
 * @example
 * const axis = new Axis().scale(scale.linear().domain([0, 100]).range([0, 10])).orientation('x');
 * axis.render(graphScene.three, 'xAxis');
 * axis.labels[0]; // { type: 'label', text: '0', position: { x: 0, y: -0.1, z: 0 }, style: {} }
 * axis.dispose();
 */
export class Axis {
  /** @type {Function|null} */
  #scaleValue = null;
  /** @type {'x'|'y'|'z'} */
  #orientationValue = 'x';
  /** @type {number} */
  #tickCountValue = DEFAULT_TICK_COUNT;
  /** @type {((value: *) => string)|null} */
  #tickFormatFn = null;
  /** @type {number} */
  #tickSizeValue = DEFAULT_TICK_SIZE;
  /** @type {object} */
  #labelStyleValue = {};

  /** @type {GraphMesh|null} */
  #lineMesh = null;
  /** @type {GraphMesh[]} */
  #tickMeshes = [];
  /** @type {object[]} */
  #labelsValue = [];
  /** @type {boolean} */
  #disposed = false;

  /**
   * Get (no args) or set (chainable) the scale this axis renders. Must
   * expose either `.ticks(count)` (continuous scales) or `.domain()`
   * (band/point/ordinal scales) for tick placement, and a numeric `.range()`
   * for the spine's extent.
   * @param {Function} [s]
   * @returns {Function|this}
   * @throws {TypeError} If `s` is not a function.
   * @example axis.scale(scale.linear().domain([0, 100]).range([0, 10]));
   */
  scale(s) {
    if (arguments.length === 0) return this.#scaleValue;
    this.#assertNotDisposed('scale');
    assertFunction('scale', s);
    this.#scaleValue = s;
    return this;
  }

  /**
   * Get (no args) or set (chainable) which world axis this axis spans.
   * @param {'x'|'y'|'z'} [o]
   * @returns {'x'|'y'|'z'|this}
   * @throws {TypeError} If `o` isn't `'x'`, `'y'`, or `'z'`.
   * @example axis.orientation('y');
   */
  orientation(o) {
    if (arguments.length === 0) return this.#orientationValue;
    this.#assertNotDisposed('orientation');
    assertOrientation('Axis.orientation', o);
    this.#orientationValue = o;
    return this;
  }

  /**
   * Get (no args) or set (chainable) the target tick count, passed to the
   * scale's own `.ticks(count)`/`.tickFormat(count)`. Default `10`.
   * @param {number} [n]
   * @returns {number|this}
   * @throws {TypeError} If `n` is not a positive integer.
   * @example axis.tickCount(5);
   */
  tickCount(n) {
    if (arguments.length === 0) return this.#tickCountValue;
    this.#assertNotDisposed('tickCount');
    assertPositiveInteger('tickCount', n);
    this.#tickCountValue = n;
    return this;
  }

  /**
   * Get (no args) or set (chainable) an explicit tick-label formatter,
   * overriding the scale's own `.tickFormat()`. Default: the scale's
   * `.tickFormat(tickCount)` if it has one, else `String`.
   * @param {(value: *) => string} [fn]
   * @returns {((value: *) => string)|this}
   * @throws {TypeError} If `fn` is not a function.
   * @example axis.tickFormat((v) => `${v}%`);
   */
  tickFormat(fn) {
    if (arguments.length === 0) return this.#resolveFormat();
    this.#assertNotDisposed('tickFormat');
    assertFunction('tickFormat', fn);
    this.#tickFormatFn = fn;
    return this;
  }

  /**
   * Get (no args) or set (chainable) how far each tick mark extends off the
   * spine. Default `0.2`.
   * @param {number} [n]
   * @returns {number|this}
   * @throws {TypeError} If `n` is not a positive number.
   * @example axis.tickSize(0.5);
   */
  tickSize(n) {
    if (arguments.length === 0) return this.#tickSizeValue;
    this.#assertNotDisposed('tickSize');
    assertPositiveNumber('tickSize', n);
    this.#tickSizeValue = n;
    return this;
  }

  /**
   * Get (no args) or set (chainable) the style object forwarded to each
   * tick's stubbed `annotation.label`. Default `{}`.
   * @param {object} [style]
   * @returns {object|this}
   * @throws {TypeError} If `style` is not a plain object.
   * @example axis.labelStyle({ color: 'white', size: 0.3 });
   */
  labelStyle(style) {
    if (arguments.length === 0) return this.#labelStyleValue;
    this.#assertNotDisposed('labelStyle');
    if (style === null || typeof style !== 'object' || Array.isArray(style)) {
      throw new TypeError(`Axis.labelStyle: expected a plain object, received ${JSON.stringify(style)}.`);
    }
    this.#labelStyleValue = style;
    return this;
  }

  /**
   * Every tick's stubbed label metadata from the last `render()` call —
   * `{ type: 'label', text, position: {x,y,z}, style }` per tick. Empty
   * before the first `render()`.
   * @returns {object[]}
   * @example axis.labels.map((l) => l.text); // ['0', '20', '40', ...]
   */
  get labels() {
    return this.#labelsValue.slice();
  }

  /**
   * Builds the spine line, tick marks, and stubbed label metadata as real
   * `GraphMesh` scene objects under `scene`, named `${name}_line`/
   * `${name}_tick_<i>`.
   * @param {THREE.Scene} scene
   * @param {string} name
   * @returns {this}
   * @throws {Error} If `.scale()` was never set, or `render()` was already
   *   called on this instance (call `dispose()` first to re-render).
   * @throws {TypeError} If `scene`/`name` are the wrong type, or the scale's
   *   range doesn't resolve to finite numbers.
   * @example axis.render(graphScene.three, 'xAxis');
   */
  render(scene, name) {
    this.#assertNotDisposed('render');
    if (this.#lineMesh !== null) {
      throw new Error('Axis.render: already rendered — call dispose() before rendering again.');
    }
    if (!(scene instanceof THREE.Scene)) {
      throw new TypeError(`Axis.render: expected scene to be a THREE.Scene, received ${JSON.stringify(scene)}.`);
    }
    if (typeof name !== 'string' || name === '') {
      throw new TypeError(`Axis.render: expected a non-empty string name, received ${JSON.stringify(name)}.`);
    }
    if (this.#scaleValue === null) {
      throw new Error('Axis.render: call .scale(s) before render().');
    }

    const orientation = this.#orientationValue;
    const range = this.#scaleValue.range();
    const start = Number(range[0]);
    const stop = Number(range[range.length - 1]);
    assertFiniteNumber('render', start);
    assertFiniteNumber('render', stop);

    const length = Math.abs(stop - start);
    const mid = (start + stop) / 2;
    const lineGeometry = new THREE.BoxGeometry(...longAxisBoxSize(orientation, length, AXIS_LINE_THICKNESS));
    this.#lineMesh = new GraphMesh({
      scene,
      name: `${name}_line`,
      geometry: lineGeometry,
      material: new THREE.MeshBasicMaterial({ color: AXIS_COLOR }),
    });
    const linePos = pointAlong(orientation, mid);
    this.#lineMesh.setPosition(linePos.x, linePos.y, linePos.z);

    const tickValues = this.#resolveTicks();
    const format = this.#resolveFormat();
    const tickSize = this.#tickSizeValue;
    const bandOffset = typeof this.#scaleValue.bandwidth === 'function' ? this.#scaleValue.bandwidth() / 2 : 0;

    this.#tickMeshes = tickValues.map((value, i) => {
      const along = this.#scaleValue(value) + bandOffset;
      const geometry = new THREE.BoxGeometry(...longAxisBoxSize(tickOffsetAxis(orientation), tickSize, AXIS_LINE_THICKNESS));
      const mesh = new GraphMesh({
        scene,
        name: `${name}_tick_${i}`,
        geometry,
        material: new THREE.MeshBasicMaterial({ color: AXIS_COLOR }),
      });
      const center = tickCenter(orientation, along, tickSize);
      mesh.setPosition(center.x, center.y, center.z);
      return mesh;
    });

    this.#labelsValue = tickValues.map((value) => {
      const along = this.#scaleValue(value) + bandOffset;
      return label({ text: format(value), position: pointAlong(orientation, along), style: this.#labelStyleValue });
    });

    return this;
  }

  /**
   * Disposes the spine and tick meshes. Idempotent; safe before `render()`
   * has ever been called.
   * @example axis.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#lineMesh?.dispose();
    this.#lineMesh = null;
    for (const mesh of this.#tickMeshes) mesh.dispose();
    this.#tickMeshes = [];
    this.#labelsValue = [];
  }

  /** @returns {Array} @throws {Error} If the scale exposes neither `.ticks()` nor `.domain()`. */
  #resolveTicks() {
    const s = this.#scaleValue;
    if (typeof s.ticks === 'function') return s.ticks(this.#tickCountValue);
    if (typeof s.domain === 'function') return s.domain();
    throw new Error('Axis.render: scale must expose either .ticks() or .domain().');
  }

  /** @returns {(value: *) => string} */
  #resolveFormat() {
    if (this.#tickFormatFn !== null) return this.#tickFormatFn;
    const s = this.#scaleValue;
    if (s !== null && typeof s.tickFormat === 'function') return s.tickFormat(this.#tickCountValue);
    return (value) => String(value);
  }

  /** @param {string} method @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`Axis.${method}: this Axis has been disposed.`);
    }
  }
}
