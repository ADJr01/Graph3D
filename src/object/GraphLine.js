import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { GraphObject } from './GraphObject.js';
import { disposeMaterial } from '../core/GraphDisposal.js';

const DEFAULT_LINEWIDTH = 2;
const DEFAULT_COLOR = 0xffffff;

/**
 * Wraps a Three.js `Line2` (`three/examples/jsm/lines`) — a single
 * continuous, constant-pixel-width polyline. This is the one chart primitive
 * `GraphObjectFactory` has no factory for: every primitive there is N
 * independent instances (bars, points, segments); a line chart's path
 * (`LineChart`, Prompt 133) is one continuous object instead, so it gets its
 * own thin wrapper here rather than being forced through the N-instance
 * factory dispatch.
 *
 * `setPositions()` mutates the existing GPU buffer in place when the point
 * count matches the previous call (cheap — no reallocation); it rebuilds the
 * geometry via `LineGeometry.setPositions` only when the count changes,
 * since the underlying interleaved buffer is sized to a fixed point count.
 * @example
 * const line = new GraphLine({ scene: graphScene.three, name: 'line-A', color: '#3b82f6' });
 * line.setPositions(new Float32Array([0, 0, 0, 1, 2, 0, 2, 1, 0]));
 */
export class GraphLine extends GraphObject {
  /** @type {Line2} */
  #line;

  /** @type {LineGeometry} */
  #geometry;

  /** @type {number} Point count from the last `setPositions()` call — `0` before the first. */
  #pointCount = 0;

  /** @type {boolean} */
  #disposed = false;

  /**
   * @param {{ scene: THREE.Scene, name: string, color?: (number|string), linewidth?: number }} options
   * @throws {TypeError} If `linewidth` isn't a positive number.
   * @example new GraphLine({ scene: graphScene.three, name: 'line-A', color: '#3b82f6', linewidth: 3 });
   */
  constructor({ scene, name, color = DEFAULT_COLOR, linewidth = DEFAULT_LINEWIDTH } = {}) {
    if (typeof linewidth !== 'number' || linewidth <= 0) {
      throw new TypeError(`GraphLine: linewidth must be a positive number, received ${JSON.stringify(linewidth)}.`);
    }
    const geometry = new LineGeometry();
    const material = new LineMaterial({ color, linewidth });
    // LineMaterial's linewidth is in screen pixels, resolved against this
    // uniform — without it (default (0,0)) the line doesn't render at all.
    // `object/` doesn't own DOM event lifecycles, so resize isn't wired here;
    // see setResolution().
    if (typeof window !== 'undefined') {
      material.resolution.set(window.innerWidth, window.innerHeight);
    }
    const line = new Line2(geometry, material);
    super({ scene, name, three: line });
    this.#line = line;
    this.#geometry = geometry;
  }

  /**
   * This line's material — a `LineMaterial`, not a standard `THREE.Material`
   * (`linewidth`/`resolution`/`dashed` are `LineMaterial`-specific).
   * @returns {LineMaterial}
   * @throws {Error} If called after `dispose()`.
   */
  get material() {
    this.#assertNotDisposed('material');
    return this.#line.material;
  }

  /**
   * Updates the material's pixel-space `resolution` uniform — required for
   * `linewidth` to stay a consistent pixel width after the renderer/canvas
   * is resized. Not wired to `window.resize` automatically; callers update
   * this alongside their own renderer resize handling.
   * @param {number} width
   * @param {number} height
   * @returns {this}
   * @throws {Error} If called after `dispose()`.
   * @example line.setResolution(window.innerWidth, window.innerHeight);
   */
  setResolution(width, height) {
    this.#assertNotDisposed('setResolution');
    this.#line.material.resolution.set(width, height);
    return this;
  }

  /**
   * Writes this line's full vertex position stream —
   * `[x0, y0, z0, x1, y1, z1, ...]`. Mutates the existing interleaved buffer
   * in place when the point count matches the previous call; rebuilds the
   * geometry otherwise.
   * @param {Float32Array} positions At least 2 points (6 numbers).
   * @returns {this}
   * @throws {TypeError} If `positions` isn't a `Float32Array` of at least 2 points.
   * @throws {Error} If called after `dispose()`.
   * @example line.setPositions(new Float32Array([0, 0, 0, 1, 1, 0]));
   */
  setPositions(positions) {
    this.#assertNotDisposed('setPositions');
    if (!(positions instanceof Float32Array) || positions.length < 6 || positions.length % 3 !== 0) {
      throw new TypeError(
        `GraphLine.setPositions: expected a Float32Array of at least 2 points, received ${JSON.stringify(positions)}.`,
      );
    }
    const pointCount = positions.length / 3;
    if (pointCount === this.#pointCount) {
      this.#writeInPlace(positions);
    } else {
      this.#geometry.setPositions(positions);
      this.#pointCount = pointCount;
    }
    return this;
  }

  /**
   * Writes directly into the existing `instanceStart`/`instanceEnd`
   * interleaved buffer — same point count, so the buffer's shape (segment
   * count, stride) hasn't changed and only its contents need updating.
   * Mirrors the doubling `LineGeometry.setPositions` itself applies
   * (`[x0,y0,z0, x1,y1,z1, ...]` → consecutive overlapping segment pairs),
   * since it writes into that same layout without reallocating it.
   * @param {Float32Array} positions
   */
  #writeInPlace(positions) {
    const buffer = this.#geometry.attributes.instanceStart.data;
    const array = buffer.array;
    const length = positions.length - 3;
    for (let i = 0; i < length; i += 3) {
      const o = 2 * i;
      array[o] = positions[i];
      array[o + 1] = positions[i + 1];
      array[o + 2] = positions[i + 2];
      array[o + 3] = positions[i + 3];
      array[o + 4] = positions[i + 4];
      array[o + 5] = positions[i + 5];
    }
    buffer.needsUpdate = true;
    this.#geometry.computeBoundingBox();
    this.#geometry.computeBoundingSphere();
  }

  /**
   * Disposes the geometry and material. Idempotent.
   * @example line.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#geometry.dispose();
    disposeMaterial(this.#line.material);
    super.dispose();
  }

  /** @param {string} method @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`GraphLine.${method}: object '${this.name}' has been disposed.`);
    }
  }
}
