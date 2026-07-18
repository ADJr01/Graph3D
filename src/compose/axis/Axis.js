import * as THREE from 'three';
// Axis renders literal tick/spine meshes into the scene — no data-only chart
// layer exists yet to do that on its behalf. Importing GraphMesh from
// object/ (and constructing raw THREE geometry/material to hand it) mirrors
// compose/selection's identical, already-sanctioned carve-out (CLAUDE.md
// §1.4's compose/ row) for the same reason: a real 3D scene needs literal
// renderable primitives, not describable-only data.
import { GraphMesh } from '../../object/index.js';
import { bandCenter } from '../scale/index.js';
import { assertOrientation, longAxisBoxSize, pointAlong } from './orientationAxes.js';
import { label } from '../annotation/label.js';
// Real tick-label text (as opposed to the { text, position } stub above) is
// built via the shared Label primitive (material/label, improvement.md
// section (c)) rather than hand-rolling SDFText.create() + billboarding —
// Axis.js was the first of three independent copies of that sequence that
// motivated extracting it (CLAUDE.md §1.1 DRY two-strike rule). Label lives
// in material/, not compose/, so material/text/GraphHTML.js (the second
// copy) can reuse it too without an upward import — this is the same
// sanctioned compose/ -> material/ crossing Axis.js already used for
// SDFText directly. `Label` is imported directly (not the `label()`
// factory) to avoid colliding with the stub-metadata `label` import above.
import { Label } from '../../material/label/Label.js';

const DEFAULT_TICK_COUNT = 10;
const DEFAULT_TICK_SIZE = 0.2;
// Thin-box line convention shared with GraphObjectFactory.createLineSegments
// (CLAUDE.md §1.1 DRY: "a line is a thin box" is decided once, project-wide).
const AXIS_LINE_THICKNESS = 0.02;
const AXIS_COLOR = 0x333333;
const DEFAULT_LABEL_FONT_SIZE = 0.3;
const DEFAULT_LABEL_COLOR = '#e6e6e6';
// Gap between a tick mark's outer tip and where its label text begins.
const LABEL_MARGIN = 0.08;

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

function assertCamera(method, value) {
  if (!(value instanceof THREE.Camera)) {
    throw new TypeError(`Axis.${method}: options.camera must be a THREE.Camera instance, received ${JSON.stringify(value)}.`);
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
 * and one label per tick. `axis.labels` always carries `{ text, position }`
 * stub metadata (via `annotation.label`); passing `options.camera` to
 * `render()` additionally builds each label as a real, billboarded
 * `SDFText` mesh in the scene (named `${name}_ticklabel_<i>`), disposed
 * alongside the rest of the axis. Omitting `camera` keeps the original
 * metadata-only behavior — real text costs a texture-atlas load and one
 * `SDFText.create()` per tick, so it's opt-in rather than automatic.
 * @example
 * const axis = new Axis().scale(scale.linear().domain([0, 100]).range([0, 10])).orientation('x');
 * axis.render(graphScene.three, 'xAxis', { camera: graphScene.camera.three });
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
  /** @type {Label[]} */
  #labelHandles = [];
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
   * `${name}_tick_<i>`. Pass `options.camera` to also build each label as a
   * real, camera-billboarded `SDFText` mesh (`${name}_ticklabel_<i>`) — see
   * this class's own doc comment.
   * @param {THREE.Scene} scene
   * @param {string} name
   * @param {{ camera?: THREE.Camera }} [options]
   * @returns {this}
   * @throws {Error} If `.scale()` was never set, or `render()` was already
   *   called on this instance (call `dispose()` first to re-render).
   * @throws {TypeError} If `scene`/`name` are the wrong type, `options` isn't
   *   a plain object, `options.camera` isn't a `THREE.Camera`, or the
   *   scale's range doesn't resolve to finite numbers.
   * @example axis.render(graphScene.three, 'xAxis');
   * @example axis.render(graphScene.three, 'xAxis', { camera: graphScene.camera.three });
   */
  render(scene, name, options = {}) {
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
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError(`Axis.render: options must be a plain object, received ${JSON.stringify(options)}.`);
    }
    const { camera } = options;
    if (camera !== undefined) assertCamera('render', camera);
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
    const bandOffset = bandCenter(this.#scaleValue);

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

    if (camera !== undefined) {
      // Fire-and-forget: render() stays synchronous (existing call sites and
      // the tick/spine meshes above are unaffected), real text arrives a
      // frame or two later once the atlas + per-glyph geometry resolve.
      this.#renderTextLabels(scene, name, camera);
    }

    return this;
  }

  /**
   * Builds one `Label` per already-computed `#labelsValue` entry, billboarded
   * toward `camera` via the shared billboard registry. Fire-and-forget, same
   * as `render()` itself: a single glyph/atlas failure is logged (inside
   * `Label`'s own build) and skipped, so the rest of the axis (spine, ticks,
   * stub metadata, other labels) stays usable.
   * @param {THREE.Scene} scene @param {string} name @param {THREE.Camera} camera
   */
  #renderTextLabels(scene, name, camera) {
    const style = this.#labelStyleValue;
    const offsetAxis = tickOffsetAxis(this.#orientationValue);
    const tickSize = this.#tickSizeValue;

    for (let i = 0; i < this.#labelsValue.length; i++) {
      const meta = this.#labelsValue[i];
      const position = { ...meta.position };
      position[offsetAxis] -= tickSize + LABEL_MARGIN;

      const handle = new Label()
        .text(meta.text)
        .position(position)
        .font({
          fontSize: style.fontSize ?? DEFAULT_LABEL_FONT_SIZE,
          color: style.color ?? DEFAULT_LABEL_COLOR,
          align: 'center',
          outline: style.outline,
          glow: style.glow,
        })
        .anchor('center')
        .billboard(camera)
        .render(scene, `${name}_ticklabel_${i}`);
      this.#labelHandles.push(handle);
    }
  }

  /**
   * Disposes the spine, tick, and label meshes. Idempotent; safe before
   * `render()` has ever been called.
   * @example axis.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#lineMesh?.dispose();
    this.#lineMesh = null;
    for (const mesh of this.#tickMeshes) mesh.dispose();
    this.#tickMeshes = [];
    for (const handle of this.#labelHandles) handle.dispose();
    this.#labelHandles = [];
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
